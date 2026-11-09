from pathlib import Path
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from sqlalchemy import inspect, text

from app.core.database import engine, Base, SessionLocal
from app.models.operational import OrdenTrabajo, Usuario
from app.api.v1.router import api_router

logger = logging.getLogger(__name__)


def asegurar_esquema_y_datos():
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        if "fecha_limite" not in {col["name"] for col in inspect(conn).get_columns("orden_trabajo")}:
            if engine.dialect.name == "postgresql":
                conn.execute(text("ALTER TABLE orden_trabajo ADD COLUMN IF NOT EXISTS fecha_limite TIMESTAMP"))
            elif engine.dialect.name == "sqlite":
                conn.execute(text("ALTER TABLE orden_trabajo ADD COLUMN fecha_limite DATETIME"))
            else:
                raise RuntimeError(f"Migración de fecha_limite no soportada para {engine.dialect.name}")
    with SessionLocal() as db:
        sin_usuarios = db.query(Usuario.id).first() is None
        sin_ordenes = db.query(OrdenTrabajo.id).first() is None
    if sin_usuarios or sin_ordenes:
        logger.warning(
            "La base no tiene usuarios o no tiene órdenes. No se cargarán datos "
            "automáticamente; consulte readme.md para preparar una demo."
        )


asegurar_esquema_y_datos()

app = FastAPI(
    title="TaskNode Cloud SaaS | CMMS & FSM Core",
    description="Plataforma Relacional en 3FN de Confiabilidad, Hitos y Auditoría SHA-256.",
    version="3.5.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

Path("frontend/static/uploads").mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory="frontend/static"), name="static")
app.mount("/app", StaticFiles(directory="frontend", html=True), name="frontend")


@app.get("/", include_in_schema=False)
def redireccion_login():
    return RedirectResponse(url="/app/login.html")


@app.get("/health", tags=["Telemetría"])
def health_check():
    return {
        "status": "ONLINE",
        "engine": "TaskNode 3NF Relational Core v3.5",
        "database_dialect": engine.dialect.name
    }