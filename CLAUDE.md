# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Cisco Router Configuration Manager (CRCM) — web platform managing 70 Cisco 800-series (IOS) routers via SSH. Supports config deployment, Jinja2 templates, monitoring (show commands + SNMP), config versioning, rollback, audit logging, and continuous network monitoring (ping + SNMP traffic).

---

## Commands

### Start everything
```bash
docker compose up -d
```

### Backend (FastAPI on :8000)
```bash
# From backend/
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# No test suite exists yet — backend/tests/ is empty
# Lint
ruff check app/
```

### Database migrations (Alembic)
```bash
# From backend/
alembic upgrade head
alembic revision --autogenerate -m "description"
alembic downgrade -1
```

### Frontend (React on :3000 via nginx, :5173 in dev)
```bash
# From frontend/
npm install
npm run dev        # dev server (proxies /api → localhost:8000)
npm run build      # production build
npm run lint       # ESLint
npm run type-check # tsc --noEmit
```

### Celery worker + beat
```bash
# From backend/
celery -A app.tasks.celery_tasks worker --loglevel=info --concurrency=10
celery -A app.tasks.celery_tasks beat --loglevel=info   # separate process for scheduled tasks
```

---

## Architecture

### Request flow for config deployment
1. User selects template + routers → frontend renders preview via `POST /api/v1/templates/{id}/preview`
2. User confirms → `POST /api/v1/deploy` creates Celery task, returns `job_id`
3. Frontend polls `GET /api/v1/tasks/{job_id}` until status is terminal
4. Celery worker opens Netmiko SSH sessions (max 10 concurrent), sends rendered config, saves result to `config_history`

### SSH credentials
Each router can have a specific named credential set via `routers.credential_id` (nullable FK → `ssh_credentials`). When null, the router falls back to the single-row `global_credentials` table (id always = 1). Both models have the same duck-typed interface (`username`, `password_encrypted`, `enable_password_encrypted`) so `build_device_dict()` in `core/ssh.py` accepts either. Passwords encrypted with **AES-256 Fernet** using `ENCRYPTION_KEY` from env — never returned via API. `core/security.py` owns encrypt/decrypt.

### Async boundary
FastAPI routes are `async`. Netmiko (synchronous) runs either:
- In a thread pool via `asyncio.get_event_loop().run_in_executor()` — for single-router operations (test connection, show commands)
- In Celery worker threads via `ThreadPoolExecutor(max_workers=10)` — for bulk operations

Do not call Netmiko directly from FastAPI coroutines. Same rule applies to `snmp_poll_sync`, `snmp_traffic_sync`, and `ping_host_sync`.

### Celery DB access
Celery workers use `asyncio.run()` to run async SQLAlchemy queries inside sync task functions (workers have no running event loop). See `tasks/celery_tasks.py::_fetch_deploy_data`.

**NullPool pattern** — Celery tasks must NOT reuse the global `engine` (which uses connection pooling). After `asyncio.run()` exits and closes the event loop, pooled connections have stale asyncio futures tied to the dead loop; reusing them raises `Future attached to a different loop`. The `_celery_session()` context manager creates a **fresh `NullPool` engine per task** (no connection caching), executes the query via `asyncio.run()`, then disposes immediately. This is the only safe pattern for async SQLAlchemy in Celery workers.

### Celery Beat — scheduled monitoring
`tasks/celery_tasks.py` defines `beat_schedule` with two recurring tasks:
- `crcm.poll_all_monitoring` — every 30 seconds: pings all active routers (LAN + WAN) and polls SNMP traffic counters
- `crcm.cleanup_monitoring_data` — every hour: deletes rows older than `monitoring_settings.retention_days`

Beat tasks are implemented in `tasks/monitoring_tasks.py`, which is imported at the bottom of `celery_tasks.py` to register the tasks. This is a controlled circular import: `celery_app` and `_celery_session` are defined before the import so Python can resolve them. A separate `celery-beat` Docker service runs the scheduler; the `celery` worker service handles execution.

### Auth
JWT tokens via `python-jose`. Three roles: `admin`, `operator`, `readonly`. Role is embedded in the JWT claim and checked per-endpoint with a FastAPI dependency. See permissions table below.

**Frontend HTTP client** (`frontend/src/lib/apiClient.ts`): Axios instance with `/api/v1` baseURL. A `refreshPromise` singleton prevents a thundering herd of refresh calls when multiple in-flight requests get 401 simultaneously — the first 401 triggers one refresh and all others wait on the same promise. On refresh failure, tokens are cleared and the user is redirected to `/login`. TypeScript types for API responses live in `frontend/src/types/` (one file per domain, manually mirrored from Pydantic schemas — not auto-generated).

### Command presets (Monitor)
Show commands are stored in `command_presets` (DB table, not hardcoded). Migration `0003` seeds 10 defaults. Admin CRUD via `GET/POST/DELETE /monitor/presets`. All roles can read; only admin can add/delete. The old `SHOW_COMMANDS` list in `core/ssh.py` is kept as a reference but is no longer used by the API.

### Monitor — single vs bulk SSH routing
`POST /monitor/commands` (single router, all roles) runs synchronously via `run_in_executor`. `POST /monitor/commands/bulk` (operator+) dispatches a Celery task and returns a `job_id` for polling. The frontend picks the path based on how many routers are selected: 1 → direct, 2+ → Celery. Both paths normalize to the same `RouterRunResult[]` shape on the frontend.

### SNMP polling (Monitor page — on-demand)
`core/snmp.py` wraps pysnmp SNMPv1/v2c/v3 GET calls in synchronous functions with a 5-second timeout. Async shim via `run_in_executor`. OIDs polled: sysDescr, sysUpTime, sysName, Cisco avgBusy5 (CPU), Cisco freeMem, ifNumber. All SNMP functions accept a `snmp_config` dict (not a bare community string) — use `router_snmp_config(router_orm)` to build it; v3 passwords are decrypted from Fernet-encrypted DB fields. `snmp_is_configured(snmp_config)` checks whether community (v1/v2c) or username (v3) is set. Bulk SNMP uses the `bulk_snmp_poll` Celery task — unconfigured routers return an error row.

**SNMPv3 per-router config**: `snmp_version` (v1/v2c/v3), `snmp_v3_username`, `snmp_v3_auth_protocol` (MD5/SHA/SHA256/etc.), `snmp_v3_auth_password_encrypted`, `snmp_v3_priv_protocol` (DES/AES/AES192/AES256), `snmp_v3_priv_password_encrypted`, `snmp_v3_security_level` (noAuthNoPriv/authNoPriv/authPriv). Plaintext passwords accepted via API (`snmp_v3_auth_password`, `snmp_v3_priv_password`) and encrypted with Fernet in the inventory endpoint — never returned in responses.

### Network Monitor — continuous ping + traffic (Phase 11)
Separate from the on-demand Monitor page. Celery Beat polls every 30s automatically.

**Ping** (`core/ping.py`): subprocess `/bin/ping` (iputils-ping installed in Dockerfile). Results stored in `ping_results` table (router_id, target=lan/wan, latency_ms, packet_loss, is_up).

**SNMP Traffic** (`core/snmp.py::snmp_traffic_sync`): walks `ifDescr` table to resolve `router.wan_interface` name → ifIndex, then polls `ifHCInOctets`/`ifHCOutOctets` (64-bit) with fallback to 32-bit `ifInOctets`/`ifOutOctets`. Raw byte counters stored per poll; **rate computation** (bits/sec) is done in the Celery task by comparing current vs previous counters stored in Redis with key `nm:traffic:prev:{router_id}` (TTL 120s). Only intervals between 5–120 seconds are accepted to avoid bad rates after restarts. Results stored in `snmp_traffic_metrics`.

**Rate counter wrap**: difference is allowed to go negative (32-bit wrap); corrected by adding `2**32`. HC (64-bit) counters effectively never wrap.

**Settings** (`monitoring_settings` table, always id=1): `retention_days` (1–90, default 7), `ping_enabled`, `snmp_traffic_enabled`. Admin-only write via `PUT /network-monitor/settings`.

**Frontend** (`/network-monitor`): 30s auto-refresh with countdown. Three tabs — Overview (card grid), Traffic (aggregate area chart + per-router expandable rows), Ping (table + expandable latency history). Uses Recharts (`recharts` v3).

**Aggregate traffic filter**: The Traffic tab filter bar lets users scope the aggregate chart to: all routers (default), a specific location, or a custom selection of individual routers. The `AggregateChart` component passes `router_ids` as repeated query params (`URLSearchParams.append()`). The backend `GET /traffic/aggregate` endpoint accepts the optional `router_ids: list[uuid.UUID]` query param and applies `AND router_id = ANY(:ids)` when provided. Filter state lives in the page component: `aggFilter` (string: `'all'` | location name | `'custom'`), `customRouterIds` (Set<string>), `effectiveRouterIds` (computed — undefined → all, ID array → filtered).

### WAN IP fallback
Each router has: `wan_ip_address`, `wan_ssh_port` (default 22), `use_wan_ip` (bool), `wan_interface` (string, default `FastEthernet4`). When `use_wan_ip=True` and the internal SSH attempt times out (10s), the deploy task and test-connection endpoint automatically retry via the WAN IP with `timeout=30`. On WAN success, `config_history.connected_via` is set to `"wan"` and output is prefixed with `"Connected via WAN IP (x.x.x.x:port)\n"`. Monitor SSH commands and SNMP do **not** use WAN fallback. Migration `0004` adds the four new columns (`wan_ip_address`, `wan_ssh_port`, `use_wan_ip` on `routers`; `connected_via` on `config_history`). Migration `0005` adds `wan_interface`. Import (Excel/CSV) supports WAN fields.

### Audit logging
Every mutating action writes to `audit_logs` via `db.add(AuditLog(...))`. Pattern: `action = "<resource>.<verb>"` (e.g. `user.create`, `deploy.rollback`). The `detail` JSONB column stores relevant context. All roles can view and export audit logs via `GET /api/v1/audit/`.

---

## Key Conventions

- All API routes: `/api/v1/`
- All timestamps: UTC (naive — see Dependency Gotchas)
- All PKs: UUID (except `global_credentials.id` and `monitoring_settings.id` which are INT, always 1 row)
- bcrypt cost factor 12 for user passwords
- Celery max concurrency: 10 (SSH connection limit); monitoring task uses up to 20 threads (ping is lightweight)
- Destructive actions (deploy, rollback, delete router) require an explicit confirmation step in the UI before the API call is made
- Frontend: Zustand for state, Axios for HTTP, Tailwind dark theme, toast notifications for all async ops, Recharts for graphs
- **Static API paths must be registered before `/{id}` path-param routes** — FastAPI matches in registration order; a UUID-typed path param returns 422 (not 404) when given a non-UUID string, preventing fallthrough. Applies to `/stats`, `/import`, `/export`, `/test-connection`, `/preview`, and **`/traffic/aggregate`** (must come before `/traffic/{router_id}`)
- Mobile layout: sidebar hidden on `< md`, replaced by hamburger + slide-out drawer; `useEffect` on `location.pathname` closes drawer on navigate

---

## Role Permissions

| Feature | admin | operator | readonly |
|---------|:-----:|:--------:|:--------:|
| View routers/status | ✅ | ✅ | ✅ |
| Test SSH connection | ✅ | ✅ | ✅ |
| Run show commands | ✅ | ✅ | ✅ |
| Add/edit/delete routers | ✅ | ❌ | ❌ |
| Create/edit templates | ✅ | ✅ | ❌ |
| Deploy / rollback config | ✅ | ✅ | ❌ |
| Bulk show commands | ✅ | ✅ | ❌ |
| View history / audit log | ✅ | ✅ | ✅ |
| Export audit log (CSV) | ✅ | ✅ | ✅ |
| Manage users | ✅ | ❌ | ❌ |
| Edit global credentials | ✅ | ❌ | ❌ |
| SNMP poll (single + bulk) | ✅ | ✅ | ✅ |
| Add/delete command presets | ✅ | ❌ | ❌ |
| View Network Monitor | ✅ | ✅ | ✅ |
| Edit Network Monitor settings | ✅ | ❌ | ❌ |

---

## Netmiko Connection Pattern

```python
from app.core.ssh import build_device_dict, _is_timeout

# creds: GlobalCredentials or SshCredential row fetched from DB
device = build_device_dict(router.ip_address, creds)                         # timeout=10 (default)
wan_device = build_device_dict(wan_ip, creds, port=wan_port, timeout=30)     # WAN fallback

# device = {device_type: "cisco_ios", host, port, username, password (decrypted),
#           secret (decrypted enable), timeout, session_timeout: 60}

success, output = deploy_config_sync(device, config_lines)
if not success and _is_timeout(output) and wan_device:
    success, output = deploy_config_sync(wan_device, config_lines)
```

Always call `net_connect.enable()` before sending config commands. Capture full output on failure and persist to `config_history.status = "failed"`.

---

## SNMP Connection Pattern

```python
from app.core.snmp import router_snmp_config, snmp_is_configured, snmp_poll_sync, snmp_traffic_sync

# Build snmp_config from a Router ORM object (decrypts v3 passwords automatically)
snmp_cfg = router_snmp_config(router)

# Check if router has SNMP configured before polling
if snmp_is_configured(snmp_cfg):
    # On-demand metrics poll (sysDescr, CPU, memory, …)
    metrics = snmp_poll_sync(router.ip_address, snmp_cfg)

    # Traffic poll — bytes_in/bytes_out are raw octet counters; caller computes delta
    traffic = snmp_traffic_sync(router.ip_address, snmp_cfg, router.wan_interface)

# snmp_config dict shape (built by router_snmp_config or assembled manually):
# {
#   "version": "v2c",          # "v1", "v2c", or "v3"
#   "community": "public",     # v1/v2c — None for v3
#   "v3_username": None,       # v3 only
#   "v3_auth_protocol": None,  # "MD5", "SHA", "SHA256", "SHA384", "SHA512"
#   "v3_auth_password": None,  # plaintext, decrypted by router_snmp_config()
#   "v3_priv_protocol": None,  # "DES", "AES", "AES128", "AES192", "AES256"
#   "v3_priv_password": None,
#   "v3_security_level": None, # "noAuthNoPriv", "authNoPriv", "authPriv"
# }
```

Both sync functions call `_ensure_event_loop()` internally — safe to call from Celery task threads after `asyncio.run()` has closed the loop. Never call them directly from FastAPI `async` routes; use the async shims `snmp_poll()` / `snmp_traffic()` which run them via `run_in_executor`.

---

## Template System

Templates are Jinja2 stored in the `templates` table. The `variables` column (JSONB) defines each variable's name, type, required flag, and default. Render flow: load template → render with user values → return preview string → user confirms → send to router via SSH.

---

## Full API Surface

```
# Auth
POST   /api/v1/auth/token
POST   /api/v1/auth/refresh

# Users
GET    /api/v1/users/me
PUT    /api/v1/users/me/password
GET    /api/v1/users/
POST   /api/v1/users/
GET    /api/v1/users/{id}
PUT    /api/v1/users/{id}
DELETE /api/v1/users/{id}

# Inventory
GET    /api/v1/inventory/routers/stats
GET    /api/v1/inventory/routers/
POST   /api/v1/inventory/routers/import
POST   /api/v1/inventory/routers/
GET    /api/v1/inventory/routers/{id}
PUT    /api/v1/inventory/routers/{id}
DELETE /api/v1/inventory/routers/{id}
POST   /api/v1/inventory/routers/{id}/test-connection

# Credentials (global fallback)
GET    /api/v1/credentials/
PUT    /api/v1/credentials/

# Named SSH credentials (per-router)
GET    /api/v1/credentials/ssh
POST   /api/v1/credentials/ssh
GET    /api/v1/credentials/ssh/{id}
PUT    /api/v1/credentials/ssh/{id}
DELETE /api/v1/credentials/ssh/{id}

# Monitor — command presets
GET    /api/v1/monitor/presets
POST   /api/v1/monitor/presets
DELETE /api/v1/monitor/presets/{id}

# Monitor — SSH commands
POST   /api/v1/monitor/commands
POST   /api/v1/monitor/commands/bulk

# Monitor — SNMP (on-demand)
POST   /api/v1/monitor/snmp/poll
POST   /api/v1/monitor/snmp/bulk

# Network Monitor — continuous monitoring (ping + traffic)
GET    /api/v1/network-monitor/settings
PUT    /api/v1/network-monitor/settings          (admin)
GET    /api/v1/network-monitor/status            (latest ping + traffic for all routers)
GET    /api/v1/network-monitor/ping/{router_id}  ?hours=1|6|24
GET    /api/v1/network-monitor/traffic/aggregate ?hours=1|6|24&router_ids=<uuid>&router_ids=<uuid>  ← must be before /{router_id}
GET    /api/v1/network-monitor/traffic/{router_id} ?hours=1|6|24

# Tasks
GET    /api/v1/tasks/{job_id}

# Templates
POST   /api/v1/templates/preview
GET    /api/v1/templates/
POST   /api/v1/templates/
GET    /api/v1/templates/{id}
PUT    /api/v1/templates/{id}
DELETE /api/v1/templates/{id}
POST   /api/v1/templates/{id}/preview

# Deploy
POST   /api/v1/deploy/

# History
GET    /api/v1/history/
GET    /api/v1/history/{id}
POST   /api/v1/history/{id}/rollback

# Stats
GET    /api/v1/stats/dashboard

# Audit
GET    /api/v1/audit/export
GET    /api/v1/audit/
```

---

## Environment Variables

Copy `.env.example` to `.env`. Required values that must be generated:
- `SECRET_KEY` — 32-char random string (JWT signing)
- `ENCRYPTION_KEY` — valid Fernet key: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`

Docker Compose services: `postgres` (5432), `redis` (6379), `backend` (8000), `celery` (worker), `celery-beat` (scheduler), `frontend` (3000 via nginx).

---

## First-Run Setup

After `docker compose up -d`, run migrations before the backend will start successfully:

```bash
docker compose exec backend alembic upgrade head
docker compose restart backend celery celery-beat
```

The backend startup calls `create_first_admin` which seeds the DB. Default credentials come from `.env` (`FIRST_ADMIN_USERNAME`, `FIRST_ADMIN_PASSWORD`).

---

## Deploying Code Changes to Docker

When you change backend Python code or add a migration, and the app runs in Docker:

```bash
# 1. Run new migrations (never skip this after model changes)
docker compose exec backend alembic upgrade head

# 2. Rebuild image then force-recreate containers (restart alone keeps the OLD image)
docker compose build backend
docker compose up -d --force-recreate backend celery celery-beat
```

When you change frontend code (React/TypeScript), the nginx container serves a compiled build — you must rebuild the image:

```bash
docker compose build frontend && docker compose up -d --force-recreate frontend
```

Then do a **hard refresh** in the browser (`Cmd+Shift+R`) to clear the cached JS bundle.

> **`restart` vs `--force-recreate`**: `docker compose restart` only restarts the process inside the existing container — it does NOT pick up a newly built image. After `docker compose build`, always use `--force-recreate` to replace containers with fresh ones from the new image. This caused silent failures where code changes appeared to deploy but the old image kept running.

> Missing migrations cause 500 errors on every endpoint that touches the affected table. Frontend code changes are invisible until the image is rebuilt — the browser will serve the old bundle even after a normal refresh.

---

## Dependency Gotchas

- **`bcrypt` is pinned to `3.2.2`** — `passlib 1.7.4` is incompatible with `bcrypt >= 4.0` because `detect_wrap_bug()` uses a >72-byte secret that newer bcrypt rejects with `ValueError`. Do not upgrade bcrypt without also replacing passlib.
- **Alembic enum creation** — PostgreSQL does not support `CREATE TYPE IF NOT EXISTS`. Migration `0001` uses `op.execute(sa.text("CREATE TYPE ..."))` followed by `postgresql.ENUM(create_type=False)` in column definitions to prevent double-creation by SQLAlchemy's `before_create` event. Never use `sa.Enum` (without `create_type=False`) in a migration where you're also manually creating the type.
- **Frontend has `package-lock.json`** — committed since Phase 11. The frontend Dockerfile still uses `RUN npm install` (not `npm ci`) because it was written before the lockfile existed; consider switching to `npm ci` for reproducible builds.
- **DB timestamps are naive UTC** — PostgreSQL columns use `TIMESTAMP WITHOUT TIME ZONE` (via `server_default=func.now()`). Always compare with `datetime.now()` (naive), never `datetime.now(timezone.utc)` (aware). Mixing them raises `asyncpg.DataError: can't subtract offset-naive and offset-aware datetimes`. This already bit `stats.py` once.
- **`get_db()` auto-commits** — The `get_db()` dependency in `database.py` calls `await session.commit()` on successful yield exit. Do **not** add explicit `await db.commit()` calls inside route handlers — it is redundant. Do add it inside Celery tasks (which use `_celery_session()`, not `get_db()`).
- **ENCRYPTION_KEY is validated at startup** — `config.py` runs `Fernet(key.encode())` via a `field_validator` on load. If the key is missing or invalid, the app refuses to start with a clear error message. Always set `ENCRYPTION_KEY` in `.env` before first run.
- **`iputils-ping` required in backend image** — `core/ping.py` uses subprocess `/bin/ping`. The backend Dockerfile installs `iputils-ping` via apt. If it's missing, ping monitoring silently returns `error: ping binary not found`.
- **SNMP traffic first reading has no rate** — On first poll after restart, `bits_in_per_sec` and `bits_out_per_sec` will be `null` because there's no previous counter in Redis. The second poll (30s later) produces the first rate value. The frontend shows `—` for null rates.
- **Celery Beat vs Worker are separate services** — Beat only schedules; the Worker executes. Both must be running for monitoring to work. If only Worker runs, scheduled tasks never fire. `docker compose restart celery celery-beat` is the correct restart command.
- **`pyasn1` pinned to `0.4.8`** — pysnmp 6.1.3 imports `pyasn1.compat.octets`, which was removed in pyasn1 0.5+. Do not upgrade pyasn1 without verifying pysnmp compatibility.
- **pysnmp 6.x API change** — `getCmd`/`nextCmd` from `pysnmp.hlapi` now return a **single tuple** `(errInd, errStat, errIdx, varBinds)` directly, not a generator. Old `for ... in getCmd(...)` silently fails inside try/except. **`nextCmd` returns only 1 PDU of rows (one GETNEXT response), not a full walk** — use `bulkCmd` in a loop instead for table walks. See `snmp_traffic_sync` in `core/snmp.py` for the pattern.
- **pysnmp event loop requirement** — pysnmp 6.x calls `asyncio.get_event_loop()` internally. After `asyncio.run()` closes the loop (e.g. between Celery task DB helpers), subsequent pysnmp calls fail with "no current event loop". `_ensure_event_loop()` in `core/snmp.py` creates a fresh one if needed. Call it at the start of any sync SNMP function that runs after `asyncio.run()`.
- **DB timestamps naive UTC, browser parses as local** — PostgreSQL stores `TIMESTAMP WITHOUT TIME ZONE` and FastAPI/Pydantic v2 serializes as ISO without 'Z'. `new Date("2026-05-20T06:00:00")` in Chrome treats this as **local** time, not UTC. Always append 'Z' on the frontend before `new Date(iso + 'Z')` for correct UTC interpretation. See `toUTC()` in `NetworkMonitorPage.tsx`.

---

## Development Phases

- [x] Phase 1 — Foundation (Docker Compose, FastAPI skeleton, Alembic migrations, JWT auth, User management API)
- [x] Phase 2 — Router Inventory (Router CRUD, global credentials API, Excel/CSV import, Inventory page)
- [x] Phase 3 — SSH Core (Netmiko wrapper, test connection, show commands, Celery bulk runner, Monitor page)
- [x] Phase 4 — Templates (Template CRUD, Jinja2 renderer with preview, template editor)
- [x] Phase 5 — Deploy & History (Config deployment single+bulk, snapshots, rollback, history UI)
- [x] Phase 6 — Monitoring & SNMP (SNMP poller, dashboard enhancements)
- [x] Phase 7 — Polish (mobile responsive layout, audit log with CSV export, dashboard statistics)
- [x] Phase 8 — Multi-credential support + pre-prod hardening (named SSH credential sets per router with global fallback; dashboard 30s auto-refresh; startup ENCRYPTION_KEY validation; deploy polling error handling; apiClient token refresh race fix)
- [x] Phase 9 — Monitor module redesign (command presets in DB; multi-device SSH with Celery; multi-device SNMP bulk poll; compare modal with line-diff; CSV export; router selector with location/model filters)
- [x] Phase 10 — WAN IP fallback (wan_ip_address + wan_ssh_port + use_wan_ip per router; 10s internal timeout then WAN retry for deploy + test-connection; connected_via recorded in config_history; WAN column in Inventory table; import CSV/Excel support for WAN fields; migration 0004)
- [x] Phase 11 — Network Monitor page (continuous ping + SNMP traffic; Celery Beat 30s scheduler; ping_results + snmp_traffic_metrics tables; ifHC 64-bit counters with Redis rate calculation; wan_interface per router; Recharts area/line charts; Overview/Traffic/Ping tabs; admin retention settings; migration 0005)
- [x] Phase 12 — SNMPv3 multi-version support + Network Monitor hardening (SNMPv1/v2c/v3 per-router config with auth/priv protocol + encrypted passwords; snmp_config dict API in core/snmp.py; Inventory form: SNMP version selector + v3 parameter fields + wan_interface field; Network Monitor: UTC timestamp fix via toUTC(), X-axis smart interval, SNMP version badge on router cards; pysnmp 6.x event-loop guard (_ensure_event_loop); migration 0006)
- [x] Phase 13 — Aggregate traffic filter (Traffic tab filter bar: All / per-location / Custom router picker; backend router_ids repeated query param on /traffic/aggregate; frontend URLSearchParams.append() for multi-ID params)
- [x] Phase 14 — SNMPv3 bug fixes (three silent data-loss bugs): (1) Inventory edit form wiped encrypted v3 passwords on every save — fix: omit password fields from PUT payload when empty (`undefined` vs `null`); (2) `snmp_traffic_sync` used `nextCmd` which returns only 1 PDU row in pysnmp 6.x — interface never found unless at ifIndex=1 — fix: replaced with `bulkCmd` loop (50 rows/call, up to 1000 interfaces); (3) Monitor page SNMP badge only checked `snmp_community`, showing "no SNMP" for v3 routers — fix: badge and `noSnmpCount` now also check `snmp_v3_username`
