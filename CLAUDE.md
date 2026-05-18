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
All routers share **one global credential set** stored in `global_credentials` (single-row table, `id` always = 1). Passwords encrypted with **AES-256 Fernet** using `ENCRYPTION_KEY` from env — decrypted in memory at SSH time, never returned via API. `core/security.py` owns encrypt/decrypt. `core/ssh.py` owns `build_device_dict()` which takes a `GlobalCredentials` row and returns a Netmiko-ready dict.

### Async boundary
FastAPI routes are `async`. Netmiko (synchronous) runs either:
- In a thread pool via `asyncio.get_event_loop().run_in_executor()` — for single-router operations (test connection, show commands)
- In Celery worker threads via `ThreadPoolExecutor(max_workers=10)` — for bulk operations

Do not call Netmiko directly from FastAPI coroutines. Same rule applies to `snmp_poll_sync`.

### Celery DB access
Celery workers use `asyncio.run()` to run async SQLAlchemy queries inside sync task functions (workers have no running event loop). See `tasks/celery_tasks.py::_fetch_deploy_data`.

### Auth
JWT tokens via `python-jose`. Three roles: `admin`, `operator`, `readonly`. Role is embedded in the JWT claim and checked per-endpoint with a FastAPI dependency. See permissions table below.

### SNMP polling
`core/snmp.py` wraps pysnmp SNMPv2c GET calls in a synchronous function (`snmp_poll_sync`) with a 5-second timeout. Async shim via `run_in_executor`. OIDs polled: sysDescr, sysUpTime, sysName, Cisco avgBusy5 (CPU), Cisco freeMem, ifNumber. Requires `snmp_community` on the router row.

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
| SNMP poll | ✅ | ✅ | ✅ |

---

## Netmiko Connection Pattern

```python
from app.core.ssh import build_device_dict
from app.models.global_credentials import GlobalCredentials

# creds: GlobalCredentials row fetched from DB
device = build_device_dict(router.ip_address, creds)
# device = {device_type: "cisco_ios", host, username, password (decrypted),
#           secret (decrypted enable), timeout: 30, session_timeout: 60}
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

# Credentials
GET    /api/v1/credentials/
PUT    /api/v1/credentials/

# Monitor
GET    /api/v1/monitor/commands/available
POST   /api/v1/monitor/commands
POST   /api/v1/monitor/commands/bulk
POST   /api/v1/monitor/snmp/poll

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

## Dependency Gotchas

- **`bcrypt` is pinned to `3.2.2`** — `passlib 1.7.4` is incompatible with `bcrypt ≥ 4.0` because `detect_wrap_bug()` uses a >72-byte secret that newer bcrypt rejects with `ValueError`. Do not upgrade bcrypt without also replacing passlib.
- **Alembic enum creation** — PostgreSQL does not support `CREATE TYPE IF NOT EXISTS`. Migration `0001` uses `op.execute(sa.text("CREATE TYPE ..."))` followed by `postgresql.ENUM(create_type=False)` in column definitions to prevent double-creation by SQLAlchemy's `before_create` event. Never use `sa.Enum` (without `create_type=False`) in a migration where you're also manually creating the type.
- **Frontend `npm install` not `npm ci`** — there is no `package-lock.json`, so the Dockerfile uses `RUN npm install`.

---

## Development Phases

- [x] Phase 1 — Foundation (Docker Compose, FastAPI skeleton, Alembic migrations, JWT auth, User management API)
- [x] Phase 2 — Router Inventory (Router CRUD, global credentials API, Excel/CSV import, Inventory page)
- [x] Phase 3 — SSH Core (Netmiko wrapper, test connection, show commands, Celery bulk runner, Monitor page)
- [x] Phase 4 — Templates (Template CRUD, Jinja2 renderer with preview, template editor)
- [x] Phase 5 — Deploy & History (Config deployment single+bulk, snapshots, rollback, history UI)
- [x] Phase 6 — Monitoring & SNMP (SNMP poller, dashboard enhancements)
- [x] Phase 7 — Polish (mobile responsive layout, audit log with CSV export, dashboard statistics)
