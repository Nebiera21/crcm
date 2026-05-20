"""
Synchronous SNMP polling via pysnmp + async shim.
All numeric OIDs — no MIB resolution required.

pysnmp 6.x API note: getCmd/nextCmd return a single tuple
(errorIndication, errorStatus, errorIndex, varBinds) — NOT a generator.
nextCmd's varBinds is a list of varBind lists, one per table row.
"""
import asyncio
import functools

# Interface traffic OIDs (IF-MIB / IF-MIB HC counters)
OID_IF_DESCR_TABLE = "1.3.6.1.2.1.2.2.1.2"        # ifDescr — walk to find index
OID_IF_OPER_STATUS_TABLE = "1.3.6.1.2.1.2.2.1.8"  # ifOperStatus (1=up, 2=down)
OID_IF_IN_OCTETS_TABLE = "1.3.6.1.2.1.2.2.1.10"   # ifInOctets (32-bit)
OID_IF_OUT_OCTETS_TABLE = "1.3.6.1.2.1.2.2.1.16"  # ifOutOctets (32-bit)
OID_IF_HC_IN_TABLE = "1.3.6.1.2.1.31.1.1.1.6"     # ifHCInOctets (64-bit, preferred)
OID_IF_HC_OUT_TABLE = "1.3.6.1.2.1.31.1.1.1.10"   # ifHCOutOctets (64-bit)

# Standard MIB-2 OIDs
OID_SYS_DESCR = "1.3.6.1.2.1.1.1.0"
OID_SYS_UPTIME = "1.3.6.1.2.1.1.3.0"
OID_SYS_NAME = "1.3.6.1.2.1.1.5.0"
OID_IF_NUMBER = "1.3.6.1.2.1.2.1.0"

# Cisco-proprietary OIDs (OLD-CISCO-CPU-MIB / OLD-CISCO-MEMORY-MIB)
OID_CPU_5MIN = "1.3.6.1.4.1.9.2.1.56.0"   # avgBusy5 — 5-min avg CPU busy %
OID_MEM_FREE = "1.3.6.1.4.1.9.2.1.8.0"    # freeMem (bytes)
OID_MEM_USED = "1.3.6.1.4.1.9.2.1.6.0"    # bufferMemUsed (bytes)


def _ensure_event_loop() -> None:
    """
    pysnmp 6.x uses asyncio.get_event_loop() internally.
    After asyncio.run() closes a loop (e.g. between Celery task DB fetches), the
    thread has no current loop. Create a fresh one so pysnmp can proceed.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        asyncio.set_event_loop(asyncio.new_event_loop())


def snmp_poll_sync(host: str, community: str, port: int = 161) -> dict:
    """
    Poll key metrics from a Cisco IOS device via SNMPv2c.
    Returns a dict suitable for SNMPMetrics schema.
    Never raises — errors are captured in the 'error' field.
    """
    _ensure_event_loop()
    result: dict = {
        "reachable": False,
        "sys_descr": None,
        "sys_name": None,
        "uptime_seconds": None,
        "cpu_5min_percent": None,
        "mem_free_bytes": None,
        "if_number": None,
        "error": None,
    }

    try:
        from pysnmp.hlapi import (
            CommunityData,
            ContextData,
            ObjectIdentity,
            ObjectType,
            SnmpEngine,
            UdpTransportTarget,
            getCmd,
        )
    except ImportError as exc:
        result["error"] = f"pysnmp not available: {exc}"
        return result

    oid_targets = [
        ("sys_descr", OID_SYS_DESCR),
        ("sys_name", OID_SYS_NAME),
        ("sys_uptime", OID_SYS_UPTIME),
        ("cpu_5min", OID_CPU_5MIN),
        ("mem_free", OID_MEM_FREE),
        ("if_number", OID_IF_NUMBER),
    ]

    try:
        engine = SnmpEngine()
        auth = CommunityData(community, mpModel=1)  # SNMPv2c
        transport = UdpTransportTarget((host, port), timeout=5, retries=1)

        raw: dict[str, object] = {}

        for key, oid in oid_targets:
            try:
                errorIndication, errorStatus, _errorIndex, varBinds = getCmd(
                    engine,
                    auth,
                    transport,
                    ContextData(),
                    ObjectType(ObjectIdentity(oid)),
                )
                if not errorIndication and not errorStatus:
                    for varBind in varBinds:
                        raw[key] = varBind[1]
                        result["reachable"] = True
            except Exception:
                pass

    except Exception as exc:
        result["error"] = str(exc)
        return result

    # Map raw ASN.1 values to Python types
    if "sys_descr" in raw:
        result["sys_descr"] = str(raw["sys_descr"])

    if "sys_name" in raw:
        result["sys_name"] = str(raw["sys_name"])

    if "sys_uptime" in raw:
        try:
            ticks = int(raw["sys_uptime"])  # TimeTicks: hundredths of seconds
            result["uptime_seconds"] = ticks // 100
        except (TypeError, ValueError):
            pass

    if "cpu_5min" in raw:
        try:
            result["cpu_5min_percent"] = int(raw["cpu_5min"])
        except (TypeError, ValueError):
            pass

    if "mem_free" in raw:
        try:
            result["mem_free_bytes"] = int(raw["mem_free"])
        except (TypeError, ValueError):
            pass

    if "if_number" in raw:
        try:
            result["if_number"] = int(raw["if_number"])
        except (TypeError, ValueError):
            pass

    return result


async def snmp_poll(host: str, community: str, port: int = 161) -> dict:
    """Async wrapper — runs snmp_poll_sync in thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, functools.partial(snmp_poll_sync, host, community, port))


def snmp_traffic_sync(host: str, community: str, interface_name: str, port: int = 161) -> dict:
    """
    Poll WAN interface traffic counters via SNMPv2c.
    Returns {reachable, if_index, if_status, bytes_in, bytes_out, error}.
    bytes_in/bytes_out are raw octet counters — caller computes rate by comparing with previous reading.
    Never raises.
    """
    _ensure_event_loop()
    result: dict = {
        "reachable": False,
        "if_index": None,
        "if_status": None,
        "bytes_in": None,
        "bytes_out": None,
        "error": None,
    }

    try:
        from pysnmp.hlapi import (
            CommunityData,
            ContextData,
            ObjectIdentity,
            ObjectType,
            SnmpEngine,
            UdpTransportTarget,
            getCmd,
            nextCmd,
        )
    except ImportError as exc:
        result["error"] = f"pysnmp not available: {exc}"
        return result

    try:
        engine = SnmpEngine()
        auth = CommunityData(community, mpModel=1)
        transport = UdpTransportTarget((host, port), timeout=5, retries=1)

        # Walk ifDescr table to find ifIndex for the given interface name.
        # nextCmd in pysnmp 6.x returns a single tuple:
        # (errorIndication, errorStatus, errorIndex, [[varBind, ...], [varBind, ...], ...])
        if_index: int | None = None
        errorIndication, errorStatus, _, all_varBinds = nextCmd(
            engine, auth, transport, ContextData(),
            ObjectType(ObjectIdentity(OID_IF_DESCR_TABLE)),
            lexicographicMode=False,
        )
        if not errorIndication and not errorStatus:
            for varBinds in all_varBinds:
                for varBind in varBinds:
                    oid_str = str(varBind[0])
                    desc = str(varBind[1]).strip()
                    if desc == interface_name.strip():
                        try:
                            if_index = int(oid_str.split(".")[-1])
                        except (ValueError, IndexError):
                            pass
                        break
                if if_index is not None:
                    break

        if if_index is None:
            result["error"] = f"Interface {interface_name!r} not found via SNMP"
            return result

        result["if_index"] = if_index
        result["reachable"] = True

        def _get(oid: str) -> int | None:
            try:
                errInd, errStat, _, vbs = getCmd(
                    engine, auth, transport, ContextData(),
                    ObjectType(ObjectIdentity(oid)),
                )
                if not errInd and not errStat:
                    for vb in vbs:
                        return int(vb[1])
            except Exception:
                pass
            return None

        # ifOperStatus
        status_val = _get(f"{OID_IF_OPER_STATUS_TABLE}.{if_index}")
        if status_val is not None:
            result["if_status"] = "up" if status_val == 1 else "down"

        # Try 64-bit HC counters first, fall back to 32-bit
        bytes_in = _get(f"{OID_IF_HC_IN_TABLE}.{if_index}")
        bytes_out = _get(f"{OID_IF_HC_OUT_TABLE}.{if_index}")

        if bytes_in is None:
            bytes_in = _get(f"{OID_IF_IN_OCTETS_TABLE}.{if_index}")
        if bytes_out is None:
            bytes_out = _get(f"{OID_IF_OUT_OCTETS_TABLE}.{if_index}")

        result["bytes_in"] = bytes_in
        result["bytes_out"] = bytes_out

    except Exception as exc:
        result["error"] = str(exc)

    return result


async def snmp_traffic(host: str, community: str, interface_name: str, port: int = 161) -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, functools.partial(snmp_traffic_sync, host, community, interface_name, port)
    )
