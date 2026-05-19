"""
ICMP ping via subprocess (uses system /bin/ping — iputils-ping must be installed).
No raw socket privileges required; the system ping binary has SUID/capabilities.
"""
import asyncio
import functools
import re
import subprocess


def ping_host_sync(ip: str, count: int = 3, timeout_sec: int = 2) -> dict:
    """
    Ping an IP. Returns dict: {is_up, latency_ms, packet_loss, error?}.
    Never raises.
    """
    result: dict = {"is_up": False, "latency_ms": None, "packet_loss": 100.0}
    try:
        proc = subprocess.run(
            ["ping", "-c", str(count), "-W", str(timeout_sec), "-q", ip],
            capture_output=True,
            text=True,
            timeout=count * timeout_sec + 5,
        )
        output = proc.stdout + proc.stderr

        # "3 packets transmitted, 2 received, 33% packet loss"
        loss_match = re.search(r"(\d+)% packet loss", output)
        if loss_match:
            result["packet_loss"] = float(loss_match.group(1))
            if result["packet_loss"] < 100:
                result["is_up"] = True

        # "rtt min/avg/max/mdev = 1.234/2.345/3.456/0.789 ms"
        rtt_match = re.search(r"rtt min/avg/max/mdev = [\d.]+/([\d.]+)/", output)
        if rtt_match:
            result["latency_ms"] = round(float(rtt_match.group(1)), 2)

    except subprocess.TimeoutExpired:
        result["packet_loss"] = 100.0
        result["error"] = "Ping timed out"
    except FileNotFoundError:
        result["error"] = "ping binary not found — install iputils-ping"
    except Exception as exc:
        result["error"] = str(exc)

    return result


async def ping_host(ip: str, count: int = 3, timeout_sec: int = 2) -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, functools.partial(ping_host_sync, ip, count, timeout_sec))
