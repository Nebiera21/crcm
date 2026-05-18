# CRCM — Cisco Router Configuration Manager

Web platform for centrally managing 70 Cisco 800-series (IOS) routers via SSH. Supports configuration deployment with Jinja2 templates, real-time monitoring via show commands and SNMP, configuration history with rollback, and a full audit log.

---

## Features

- **Inventory** — router CRUD, bulk import from Excel/CSV, SSH connection test
- **Templates** — Jinja2 config templates with variable management and live preview
- **Deploy** — single or bulk config push to multiple routers in parallel (up to 10 concurrent SSH sessions); pre-deploy snapshot captured automatically
- **History & Rollback** — full config history per router; one-click rollback to any previous snapshot
- **Monitor** — run any `show` command on one or multiple routers; SNMP polling (CPU, memory, uptime, interfaces)
- **Audit Log** — every mutating action logged with user, timestamp, IP, and detail payload; CSV export
- **RBAC** — three roles: `admin`, `operator`, `readonly`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI 0.111, Python 3.11, SQLAlchemy 2.0 (asyncpg), Alembic |
| Task queue | Celery 5.4 + Redis 7 |
| SSH | Netmiko 4.3 (Cisco IOS) |
| SNMP | pysnmp 6.1 (SNMPv2c) |
| Database | PostgreSQL 15 |
| Frontend | React 18, TypeScript 5, Vite, Tailwind CSS, Zustand, Axios |
| Infra | Docker Compose |

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- `git clone` this repo

### 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```bash
# Generate a secure key:
python -c "import secrets; print(secrets.token_hex(32))"
# → paste result as SECRET_KEY

# Generate a Fernet key:
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# → paste result as ENCRYPTION_KEY
```

### 2. Start all services

```bash
docker compose up -d
```

### 3. Run database migrations

```bash
docker compose exec backend alembic upgrade head
docker compose restart backend celery
```

### 4. Open the app

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

Default login: `admin` / password from `FIRST_ADMIN_PASSWORD` in `.env`

---

## Architecture

```
Browser
  └── nginx :3000
        └── /api/* → FastAPI :8000
                        ├── SQLAlchemy async → PostgreSQL
                        ├── Celery task → Redis → Celery worker
                        │                             └── Netmiko SSH → Routers
                        └── run_in_executor → SNMP / single SSH
```

- **Deploy flow**: frontend sends `POST /api/v1/deploy` → FastAPI creates `config_history` records → dispatches Celery task → worker opens up to 10 parallel SSH sessions → saves results back to DB → frontend polls `GET /api/v1/tasks/{job_id}`
- **Credentials**: one global SSH credential set (AES-256 Fernet encrypted at rest), never returned via API
- **Async boundary**: Netmiko and pysnmp are synchronous — always called via `run_in_executor` from FastAPI, or in Celery worker threads

---

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── api/v1/          # Route handlers (auth, inventory, templates, deploy, …)
│   │   ├── core/            # SSH, SNMP, security, Jinja2 helpers
│   │   ├── models/          # SQLAlchemy ORM models
│   │   ├── schemas/         # Pydantic request/response schemas
│   │   └── tasks/           # Celery tasks (bulk deploy)
│   ├── alembic/             # DB migrations
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/           # One file per route
│       ├── components/      # Layout, ProtectedRoute
│       ├── services/        # Axios API wrappers
│       ├── store/           # Zustand auth store
│       └── types/           # TypeScript interfaces
└── docker-compose.yml
```

---

## Role Permissions

| Feature | admin | operator | readonly |
|---|:---:|:---:|:---:|
| View routers / status | ✅ | ✅ | ✅ |
| Test SSH / run show commands | ✅ | ✅ | ✅ |
| SNMP poll | ✅ | ✅ | ✅ |
| View history / audit log | ✅ | ✅ | ✅ |
| Export audit log CSV | ✅ | ✅ | ✅ |
| Create / edit templates | ✅ | ✅ | ❌ |
| Deploy / rollback config | ✅ | ✅ | ❌ |
| Bulk show commands | ✅ | ✅ | ❌ |
| Add / edit / delete routers | ✅ | ❌ | ❌ |
| Manage users | ✅ | ❌ | ❌ |
| Edit global SSH credentials | ✅ | ❌ | ❌ |

---

## Development

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Migrations
alembic upgrade head
alembic revision --autogenerate -m "description"

# Lint
ruff check app/
```

### Frontend

```bash
cd frontend
npm install
npm run dev        # Vite dev server on :5173 (proxies /api → :8000)
npm run type-check
npm run lint
```

### Celery worker (outside Docker)

```bash
cd backend
celery -A app.tasks.celery_tasks worker --loglevel=info --concurrency=10
```
