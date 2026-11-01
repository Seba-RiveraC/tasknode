from pathlib import Path
from sqlalchemy import inspect
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse

from app.core.database import engine, Base, SessionLocal
from app.models.operational import OrdenTrabajo, Usuario
from app.api.v1.router import api_router

Base.metadata.create_all(bind=engine)


def asegurar_esquema_y_datos():
    inspector = inspect(engine)
    tablas = inspector.get_table_names()
    requiere_seed = False

    tablas_3fn = {"empresa_mandante", "usuario", "activo_industrial", "orden_trabajo", "hito_orden", "bitacora_transicion", "evidencia_multimedia"}
    if not tablas_3fn.issubset(set(tablas)):
        requiere_seed = True
    else:
        db = SessionLocal()
        try:
            if db.query(OrdenTrabajo).count() == 0 or db.query(Usuario).count() == 0:
                requiere_seed = True
        except Exception:
            requiere_seed = True
        finally:
            db.close()

    if requiere_seed:
        import seed
        seed.poblar_sistema()


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