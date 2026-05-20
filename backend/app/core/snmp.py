"""
Synchronous SNMP polling via pysnmp 6.x + async shims.
All numeric OIDs — no MIB resolution required.

pysnmp 6.x API notes:
- getCmd/nextCmd return a single tuple (errInd, errStat, errIdx, varBinds), NOT a generator.
- nextCmd's varBinds is [[row1_vb, ...], [row2_vb, ...], ...].
- Sync API calls asyncio.get_event_loop() internally — call _ensure_event_loop() before use
  when running after asyncio.run() (e.g. inside Celery tasks).

SNMP config dict passed to all functions:
  {
    "version": "v2c",        # "v1", "v2c", or "v3"
    "community": "public",   # v1/v2c
    "v3_username": None,     # v3
    "v3_auth_protocol": None,  # "MD5", "SHA", "SHA256", etc.
    "v3_auth_password": None,  # plaintext, decrypted by caller
    "v3_priv_protocol": None,  # "DES", "AES", "AES192", "AES256"
    "v3_priv_password": None,  # plaintext
    "v3_security_level": None, # "noAuthNoPriv", "authNoPriv", "authPriv"
  }
"""
import asyncio
import functools

# Interface traffic OIDs (IF-MIB / IF-MIB HC counters)
OID_IF_DESCR_TABLE = "1.3.6.1.2.1.2.2.1.2"
OID_IF_OPER_STATUS_TABLE = "1.3.6.1.2.1.2.2.1.8"
OID_IF_IN_OCTETS_TABLE = "1.3.6.1.2.1.2.2.1.10"
OID_IF_OUT_OCTETS_TABLE = "1.3.6.1.2.1.2.2.1.16"
OID_IF_HC_IN_TABLE = "1.3.6.1.2.1.31.1.1.1.6"    # ifHCInOctets (64-bit, preferred)
OID_IF_HC_OUT_TABLE = "1.3.6.1.2.1.31.1.1.1.10"  # ifHCOutOctets

# Standard MIB-2 OIDs
OID_SYS_DESCR = "1.3.6.1.2.1.1.1.0"
OID_SYS_UPTIME = "1.3.6.1.2.1.1.3.0"
OID_SYS_NAME = "1.3.6.1.2.1.1.5.0"
OID_IF_NUMBER = "1.3.6.1.2.1.2.1.0"

# Cisco-proprietary OIDs
OID_CPU_5MIN = "1.3.6.1.4.1.9.2.1.56.0"
OID_MEM_FREE = "1.3.6.1.4.1.9.2.1.8.0"


def _ensure_event_loop() -> None:
    """
    pysnmp 6.x calls asyncio.get_event_loop() internally.
    After asyncio.run() closes a loop (e.g. between Celery task DB calls),
    the thread has no current loop. Create a fresh one so pysnmp can proceed.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        asyncio.set_event_loop(asyncio.new_event_loop())


def _build_snmp_auth(snmp_config: dict):
    """Return pysnmp auth object (CommunityData or UsmUserData) from snmp_config dict."""
    from pysnmp.hlapi import (
        CommunityData,
        UsmUserData,
        usmHMACMD5AuthProtocol,
        usmHMACSHAAuthProtocol,
        usmHMAC128SHA224AuthProtocol,
        usmHMAC192SHA256AuthProtocol,
        usmHMAC256SHA384AuthProtocol,
        usmHMAC384SHA512AuthProtocol,
        usmNoAuthProtocol,
        usmDESPrivProtocol,
        usmAesCfb128Protocol,
        usmAesCfb192Protocol,
        usmAesCfb256Protocol,
        usmNoPrivProtocol,
    )

    version = snmp_config.get("version", "v2c") or "v2c"

    if version == "v1":
        return CommunityData(snmp_config.get("community", "public"), mpModel=0)

    if version == "v3":
        _auth_map = {
            "MD5": usmHMACMD5AuthProtocol,
            "SHA": usmHMACSHAAuthProtocol,
            "SHA224": usmHMAC128SHA224AuthProtocol,
            "SHA256": usmHMAC192SHA256AuthProtocol,
            "SHA384": usmHMAC256SHA384AuthProtocol,
            "SHA512": usmHMAC384SHA512AuthProtocol,
        }
        _priv_map = {
            "DES": usmDESPrivProtocol,
            "AES": usmAesCfb128Protocol,
            "AES128": usmAesCfb128Protocol,
            "AES192": usmAesCfb192Protocol,
            "AES256": usmAesCfb256Protocol,
        }
        username = snmp_config.get("v3_username") or ""
        auth_key = snmp_config.get("v3_auth_password") or None
        priv_key = snmp_config.get("v3_priv_password") or None
        auth_proto = _auth_map.get(snmp_config.get("v3_auth_protocol") or "", usmNoAuthProtocol)
        priv_proto = _priv_map.get(snmp_config.get("v3_priv_protocol") or "", usmNoPrivProtocol)
        return UsmUserData(
            username,
            authKey=auth_key,
            privKey=priv_key,
            authProtocol=auth_proto,
            privProtocol=priv_proto,
        )

    # default: v2c
    return CommunityData(snmp_config.get("community", "public"), mpModel=1)


def snmp_is_configured(snmp_config: dict) -> bool:
    """Return True when snmp_config has enough data to attempt a poll."""
    version = snmp_config.get("version", "v2c") or "v2c"
    if version == "v3":
        return bool(snmp_config.get("v3_username"))
    return bool(snmp_config.get("community"))


def router_snmp_config(router) -> dict:
    """
    Build snmp_config dict from a Router ORM object (or any duck-typed equivalent).
    Decrypts v3 passwords via Fernet. Works on detached ORM instances.
    """
    from app.core.security import decrypt_secret

    config: dict = {
        "version": getattr(router, "snmp_version", None) or "v2c",
        "community": getattr(router, "snmp_community", None),
        "v3_username": getattr(router, "snmp_v3_username", None),
        "v3_auth_protocol": getattr(router, "snmp_v3_auth_protocol", None),
        "v3_auth_password": None,
        "v3_priv_protocol": getattr(router, "snmp_v3_priv_protocol", None),
        "v3_priv_password": None,
        "v3_security_level": getattr(router, "snmp_v3_security_level", None),
    }
    enc_auth = getattr(router, "snmp_v3_auth_password_encrypted", None)
    if enc_auth:
        try:
            config["v3_auth_password"] = decrypt_secret(enc_auth)
        except Exception:
            pass
    enc_priv = getattr(router, "snmp_v3_priv_password_encrypted", None)
    if enc_priv:
        try:
            config["v3_priv_password"] = decrypt_secret(enc_priv)
        except Exception:
            pass
    return config


def snmp_poll_sync(host: str, snmp_config: dict, port: int = 161) -> dict:
    """
    Poll key metrics from a Cisco IOS device via SNMPv1/v2c/v3.
    Returns a dict suitable for SNMPMetrics schema. Never raises.
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
        auth = _build_snmp_auth(snmp_config)
        transport = UdpTransportTarget((host, port), timeout=5, retries=1)
        raw: dict[str, object] = {}

        for key, oid in oid_targets:
            try:
                errorIndication, errorStatus, _errorIndex, varBinds = getCmd(
                    engine, auth, transport, ContextData(),
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

    if "sys_descr" in raw:
        result["sys_descr"] = str(raw["sys_descr"])
    if "sys_name" in raw:
        result["sys_name"] = str(raw["sys_name"])
    if "sys_uptime" in raw:
        try:
            result["uptime_seconds"] = int(raw["sys_uptime"]) // 100
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


async def snmp_poll(host: str, snmp_config: dict, port: int = 161) -> dict:
    """Async wrapper — runs snmp_poll_sync in thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, functools.partial(snmp_poll_sync, host, snmp_config, port))


def snmp_traffic_sync(host: str, snmp_config: dict, interface_name: str, port: int = 161) -> dict:
    """
    Poll WAN interface traffic counters via SNMPv1/v2c/v3.
    Returns {reachable, if_index, if_status, bytes_in, bytes_out, error}.
    bytes_in/bytes_out are raw octet counters — caller computes rate from delta.
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
            ContextData,
            ObjectIdentity,
            ObjectType,
            SnmpEngine,
            UdpTransportTarget,
            bulkCmd,
            getCmd,
        )
    except ImportError as exc:
        result["error"] = f"pysnmp not available: {exc}"
        return result

    try:
        engine = SnmpEngine()
        auth = _build_snmp_auth(snmp_config)
        transport = UdpTransportTarget((host, port), timeout=5, retries=1)

        # Walk ifDescr table to resolve interface name → ifIndex.
        # pysnmp 6.x nextCmd returns only 1 PDU worth of rows (first GETNEXT response).
        # Use bulkCmd in a loop instead: each call returns up to BULK_REPS rows;
        # loop until the interface is found or OID leaves the ifDescr subtree.
        BULK_REPS = 50
        if_index: int | None = None
        current_oid = OID_IF_DESCR_TABLE
        target = interface_name.strip()

        for _ in range(20):  # safety cap: 20 * 50 = 1000 interfaces max
            errInd, errStat, _, batch = bulkCmd(
                engine, auth, transport, ContextData(),
                0, BULK_REPS,
                ObjectType(ObjectIdentity(current_oid)),
                lexicographicMode=False,
            )
            if errInd or errStat or not batch:
                break
            last_oid = None
            for varBinds in batch:
                for varBind in varBinds:
                    oid_str = str(varBind[0])
                    desc = str(varBind[1]).strip()
                    last_oid = oid_str
                    if desc == target:
                        try:
                            if_index = int(oid_str.split(".")[-1])
                        except (ValueError, IndexError):
                            pass
                        break
                if if_index is not None:
                    break
            if if_index is not None or len(batch) < BULK_REPS:
                break
            # Advance to next OID for the next bulk request
            if last_oid:
                current_oid = last_oid
            else:
                break

        if if_index is None:
            result["error"] = f"Interface {interface_name!r} not found via SNMP walk"
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


async def snmp_traffic(host: str, snmp_config: dict, interface_name: str, port: int = 161) -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, functools.partial(snmp_traffic_sync, host, snmp_config, interface_name, port)
    )
