from pathlib import Path
from sqlalchemy import text, inspect
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse

from app.core.database import engine, Base, SessionLocal
from app.models.operational import OrdenTrabajo
from app.api.v1.router import api_router

Base.metadata.create_all(bind=engine)

def asegurar_esquema_y_datos():
    """Compatible tanto con SQLite como con PostgreSQL en Docker."""
    inspector = inspect(engine)
    if "ordenes_trabajo" in inspector.get_table_names():
        columnas_ot = [c["name"] for c in inspector.get_columns("ordenes_trabajo")]
        with engine.begin() as conn:
            if "cliente_mandante" not in columnas_ot:
                conn.execute(text("ALTER TABLE ordenes_trabajo ADD COLUMN cliente_mandante VARCHAR(100) DEFAULT 'SurTel Redes' NOT NULL;"))
            if "hitos_json" not in columnas_ot:
                conn.execute(text("ALTER TABLE ordenes_trabajo ADD COLUMN hitos_json TEXT DEFAULT '[]' NOT NULL;"))
            if "avance_pct" not in columnas_ot:
                conn.execute(text("ALTER TABLE ordenes_trabajo ADD COLUMN avance_pct INTEGER DEFAULT 0 NOT NULL;"))

    if "bitacora_transiciones" in inspector.get_table_names():
        columnas_bit = [c["name"] for c in inspector.get_columns("bitacora_transiciones")]
        with engine.begin() as conn:
            if "encargado_nombre" not in columnas_bit:
                conn.execute(text("ALTER TABLE bitacora_transiciones ADD COLUMN encargado_nombre VARCHAR(100);"))
            if "encargado_rut" not in columnas_bit:
                conn.execute(text("ALTER TABLE bitacora_transiciones ADD COLUMN encargado_rut VARCHAR(20);"))
            if "firma_data" not in columnas_bit:
                conn.execute(text("ALTER TABLE bitacora_transiciones ADD COLUMN firma_data TEXT;"))

    db = SessionLocal()
    try:
        if db.query(OrdenTrabajo).count() == 0:
            db.close()
            import seed
            seed.poblar_sistema()
    except Exception as e:
        print(f"[AVISO INICIALIZACIÓN]: {e}")
    finally:
        db.close()

asegurar_esquema_y_datos()

app = FastAPI(
    title="TaskNode Cloud SaaS | CMMS & FSM Core",
    description="Plataforma Empresarial de Confiabilidad, Auditoría SHA-256 y Cumplimiento Normativo.",
    version="3.2.0-SAAS"
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
def redireccion_portal_saas():
    return RedirectResponse(url="/app/index.html")

@app.get("/health", tags=["Telemetría"])
def health_check():
    return {
        "status": "ONLINE",
        "engine": "TaskNode Cloud SaaS v3.2",
        "database_dialect": engine.dialect.name
    }