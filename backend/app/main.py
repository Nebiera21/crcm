from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, AsyncSessionLocal
from app.core.init_admin import create_first_admin
from app.api.v1 import router as v1_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with AsyncSessionLocal() as db:
        await create_first_admin(db)
    yield
    await engine.dispose()


app = FastAPI(
    title="Cisco Router Configuration Manager",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router, prefix="/api/v1")


@app.get("/healthz", tags=["health"])
async def health():
    return {"status": "ok"}
