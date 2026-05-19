# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Cisco Router Configuration Manager (CRCM) — web platform managing 70 Cisco 800-series (IOS) routers via SSH. Supports config deployment, Jinja2 templates, monitoring (show commands + SNMP), config versioning, rollback, and audit logging.

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

# Run all tests
pytest

# Run a single test file
pytest tests/test_ssh.py -v

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

### Celery worker
```bash
# From backend/
celery -A app.tasks.celery_tasks worker --loglevel=info --concurrency=10
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

Do not call Netmiko directly from FastAPI coroutines. Same rule applies to `snmp_poll_sync`.

### Celery DB access
Celery workers use `asyncio.run()` to run async SQLAlchemy queries inside sync task functions (workers have no running event loop). See `tasks/celery_tasks.py::_fetch_deploy_data`.

### Auth
JWT tokens via `python-jose`. Three roles: `admin`, `operator`, `readonly`. Role is embedded in the JWT claim and checked per-endpoint with a FastAPI dependency. See permissions table below.

### Command presets (Monitor)
Show commands are stored in `command_presets` (DB table, not hardcoded). Migration `0003` seeds 10 defaults. Admin CRUD via `GET/POST/DELETE /monitor/presets`. All roles can read; only admin can add/delete. The old `SHOW_COMMANDS` list in `core/ssh.py` is kept as a reference but is no longer used by the API.

### Monitor — single vs bulk SSH routing
`POST /monitor/commands` (single router, all roles) runs synchronously via `run_in_executor`. `POST /monitor/commands/bulk` (operator+) dispatches a Celery task and returns a `job_id` for polling. The frontend picks the path based on how many routers are selected: 1 → direct, 2+ → Celery. Both paths normalize to the same `RouterRunResult[]` shape on the frontend.

### SNMP polling
`core/snmp.py` wraps pysnmp SNMPv2c GET calls in a synchronous function (`snmp_poll_sync`) with a 5-second timeout. Async shim via `run_in_executor`. OIDs polled: sysDescr, sysUpTime, sysName, Cisco avgBusy5 (CPU), Cisco freeMem, ifNumber. Requires `snmp_community` on the router row. Bulk SNMP (`POST /monitor/snmp/bulk`) uses the `bulk_snmp_poll` Celery task — routers without `snmp_community` return an error row rather than failing the whole job.

### WAN IP fallback
Each router has three optional fields: `wan_ip_address`, `wan_ssh_port` (default 22), `use_wan_ip` (bool). When `use_wan_ip=True` and the internal SSH attempt times out (10s), the deploy task and test-connection endpoint automatically retry via the WAN IP with `timeout=30`. On WAN success, `config_history.connected_via` is set to `"wan"` and output is prefixed with `"Connected via WAN IP (x.x.x.x:port)\n"`. Monitor SSH commands and SNMP do **not** use WAN fallback. Migration `0004` adds the four new columns (`wan_ip_address`, `wan_ssh_port`, `use_wan_ip` on `routers`; `connected_via` on `config_history`). Import (Excel/CSV) supports these three columns. `_is_timeout(text)` in `core/ssh.py` detects timeout failures using `_TIMEOUT_MARKER`; use it before branching to WAN.

### Audit logging
Every mutating action writes to `audit_logs` via `db.add(AuditLog(...))`. Pattern: `action = "<resource>.<verb>"` (e.g. `user.create`, `deploy.rollback`). The `detail` JSONB column stores relevant context. All roles can view and export audit logs via `GET /api/v1/audit/`.

---

## Key Conventions

- All API routes: `/api/v1/`
- All timestamps: UTC
- All PKs: UUID (except `global_credentials.id` which is INT, always 1 row)
- bcrypt cost factor 12 for user passwords
- Celery max concurrency: 10 (SSH connection limit)
- Destructive actions (deploy, rollback, delete router) require an explicit confirmation step in the UI before the API call is made
- Frontend: Zustand for state, Axios for HTTP, Tailwind dark theme, toast notifications for all async ops
- Static API paths (`/stats`, `/import`, `/export`, `/test-connection`, `/preview`) **must be registered before** `/{id}` path-param routes to avoid UUID parse conflicts
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

# Monitor — SNMP
POST   /api/v1/monitor/snmp/poll
POST   /api/v1/monitor/snmp/bulk

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

Docker Compose services: `postgres` (5432), `redis` (6379), `backend` (8000), `celery` (worker), `frontend` (3000 via nginx).

---

## First-Run Setup

After `docker compose up -d`, run migrations before the backend will start successfully:

```bash
docker compose exec backend alembic upgrade head
docker compose restart backend celery
```

The backend startup calls `create_first_admin` which seeds the DB. Default credentials come from `.env` (`FIRST_ADMIN_USERNAME`, `FIRST_ADMIN_PASSWORD`).

---

## Deploying Code Changes to Docker

When you change backend Python code or add a migration, and the app runs in Docker:

```bash
# 1. Run new migrations (never skip this after model changes)
docker compose exec backend alembic upgrade head

# 2. Restart backend + celery to pick up code changes
docker compose restart backend celery
```

When you change frontend code (React/TypeScript), the nginx container serves a compiled build — you must rebuild the image:

```bash
# Rebuild and restart frontend only
docker compose build frontend && docker compose up -d frontend
```

Then do a **hard refresh** in the browser (`Cmd+Shift+R`) to clear the cached JS bundle.

> Missing migrations cause 500 errors on every endpoint that touches the affected table. Frontend code changes are invisible until the image is rebuilt — the browser will serve the old bundle even after a normal refresh.

---

## Dependency Gotchas

- **`bcrypt` is pinned to `3.2.2`** — `passlib 1.7.4` is incompatible with `bcrypt >= 4.0` because `detect_wrap_bug()` uses a >72-byte secret that newer bcrypt rejects with `ValueError`. Do not upgrade bcrypt without also replacing passlib.
- **Alembic enum creation** — PostgreSQL does not support `CREATE TYPE IF NOT EXISTS`. Migration `0001` uses `op.execute(sa.text("CREATE TYPE ..."))` followed by `postgresql.ENUM(create_type=False)` in column definitions to prevent double-creation by SQLAlchemy's `before_create` event. Never use `sa.Enum` (without `create_type=False`) in a migration where you're also manually creating the type.
- **Frontend `npm install` not `npm ci`** — there is no `package-lock.json`, so the Dockerfile uses `RUN npm install`.
- **DB timestamps are naive UTC** — PostgreSQL columns use `TIMESTAMP WITHOUT TIME ZONE` (via `server_default=func.now()`). Always compare with `datetime.now()` (naive), never `datetime.now(timezone.utc)` (aware). Mixing them raises `asyncpg.DataError: can't subtract offset-naive and offset-aware datetimes`. This already bit `stats.py` once.
- **`get_db()` auto-commits** — The `get_db()` dependency in `database.py` calls `await session.commit()` on successful yield exit. Do **not** add explicit `await db.commit()` calls inside route handlers — it is redundant. Do add it inside Celery tasks (which use `_celery_session()`, not `get_db()`).
- **ENCRYPTION_KEY is validated at startup** — `config.py` runs `Fernet(key.encode())` via a `field_validator` on load. If the key is missing or invalid, the app refuses to start with a clear error message. Always set `ENCRYPTION_KEY` in `.env` before first run.

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
