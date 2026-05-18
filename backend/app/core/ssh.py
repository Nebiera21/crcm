"""
Synchronous Netmiko wrapper + async shims.

All sync functions block and must be called via run_in_executor from async routes,
or directly from Celery worker threads.
"""
import asyncio
import functools
import time
from typing import TYPE_CHECKING

import paramiko
from netmiko import ConnectHandler
from netmiko.exceptions import (
    NetmikoAuthenticationException,
    NetmikoTimeoutException,
)

# Cisco IOS SSH-1.x only advertises ssh-rsa host keys and SHA-1 KEX algorithms.
# Paramiko 3.x moved these to the back of the preference list; ensure they are
# included so legacy Cisco devices can negotiate a common algorithm set.
_LEGACY_KEYS = ("ssh-rsa",)
paramiko.Transport._preferred_keys = paramiko.Transport._preferred_keys + tuple(
    k for k in _LEGACY_KEYS if k not in paramiko.Transport._preferred_keys
)

if TYPE_CHECKING:
    from app.models.global_credentials import GlobalCredentials

SHOW_COMMANDS: list[str] = [
    "show version",
    "show interfaces",
    "show ip interface brief",
    "show ip route",
    "show running-config",
    "show logging",
    "show processes cpu",
    "show processes memory",
    "show cdp neighbors",
    "show arp",
]


def build_device_dict(host: str, creds: "GlobalCredentials") -> dict:
    from app.core.security import decrypt_secret

    return {
        "device_type": "cisco_ios",
        "host": host,
        "username": creds.username,
        "password": decrypt_secret(creds.password_encrypted),
        "secret": decrypt_secret(creds.enable_password_encrypted) if creds.enable_password_encrypted else "",
        "timeout": 30,
        "session_timeout": 60,
        "fast_cli": False,
    }


# ── Synchronous primitives ────────────────────────────────────────────────────

def test_connection_sync(device: dict) -> tuple[bool, str, int | None]:
    """Returns (success, message, latency_ms)."""
    start = time.monotonic()
    try:
        conn = ConnectHandler(**device)
        conn.enable()
        conn.disconnect()
        ms = int((time.monotonic() - start) * 1000)
        return True, "Connection successful", ms
    except NetmikoTimeoutException:
        return False, "Connection timed out (30s)", None
    except NetmikoAuthenticationException:
        return False, "Authentication failed — check username/password", None
    except Exception as exc:
        return False, f"Connection error: {exc}", None


def run_commands_sync(device: dict, commands: list[str]) -> dict[str, str]:
    """Returns mapping of command → output (or error string)."""
    results: dict[str, str] = {}
    try:
        conn = ConnectHandler(**device)
        conn.enable()
        for cmd in commands:
            try:
                results[cmd] = conn.send_command(cmd, read_timeout=60)
            except Exception as exc:
                results[cmd] = f"ERROR: {exc}"
        conn.disconnect()
    except NetmikoTimeoutException:
        for cmd in commands:
            results.setdefault(cmd, "ERROR: Connection timed out")
    except NetmikoAuthenticationException:
        for cmd in commands:
            results.setdefault(cmd, "ERROR: Authentication failed")
    except Exception as exc:
        for cmd in commands:
            results.setdefault(cmd, f"ERROR: {exc}")
    return results


# ── Async shims (run sync code in thread pool) ────────────────────────────────

async def test_connection(device: dict) -> tuple[bool, str, int | None]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, functools.partial(test_connection_sync, device))


async def run_commands(device: dict, commands: list[str]) -> dict[str, str]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, functools.partial(run_commands_sync, device, commands))


def deploy_config_sync(device: dict, config_lines: list[str]) -> tuple[bool, str]:
    """Push config lines to a Cisco IOS device. Returns (success, full_output)."""
    try:
        conn = ConnectHandler(**device)
        conn.enable()
        output = conn.send_config_set(config_lines)
        conn.save_config()
        conn.disconnect()
        return True, output
    except NetmikoTimeoutException:
        return False, "Connection timed out (30s)"
    except NetmikoAuthenticationException:
        return False, "Authentication failed — check username/password"
    except Exception as exc:
        return False, f"Deploy error: {exc}"
