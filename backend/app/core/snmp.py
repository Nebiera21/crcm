"""
Synchronous SNMP polling via pysnmp + async shim.
All numeric OIDs — no MIB resolution required.
"""
import asyncio
import functools

# Standard MIB-2 OIDs
OID_SYS_DESCR = "1.3.6.1.2.1.1.1.0"
OID_SYS_UPTIME = "1.3.6.1.2.1.1.3.0"
OID_SYS_NAME = "1.3.6.1.2.1.1.5.0"
OID_IF_NUMBER = "1.3.6.1.2.1.2.1.0"

# Cisco-proprietary OIDs (OLD-CISCO-CPU-MIB / OLD-CISCO-MEMORY-MIB)
OID_CPU_5MIN = "1.3.6.1.4.1.9.2.1.56.0"   # avgBusy5 — 5-min avg CPU busy %
OID_MEM_FREE = "1.3.6.1.4.1.9.2.1.8.0"    # freeMem (bytes)
OID_MEM_USED = "1.3.6.1.4.1.9.2.1.6.0"    # bufferMemUsed (bytes)


def snmp_poll_sync(host: str, community: str, port: int = 161) -> dict:
    """
    Poll key metrics from a Cisco IOS device via SNMPv2c.
    Returns a dict suitable for SNMPMetrics schema.
    Never raises — errors are captured in the 'error' field.
    """
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
                for errorIndication, errorStatus, _errorIndex, varBinds in getCmd(
                    engine,
                    auth,
                    transport,
                    ContextData(),
                    ObjectType(ObjectIdentity(oid)),
                ):
                    if not errorIndication and not errorStatus:
                        for varBind in varBinds:
                            raw[key] = varBind[1]
                            result["reachable"] = True
                    break  # getCmd is a one-shot generator
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
