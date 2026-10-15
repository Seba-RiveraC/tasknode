from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse

from app.core.database import engine, Base
from app.api.v1.router import api_router

# Garantiza que las tablas y Triggers ISO 55001 existan al iniciar
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="TaskNode CMMS & FSM Core",
    description="Plataforma Industrial de Confiabilidad, Auditoría SHA-256 y Cumplimiento Normativo (ISO 55000 / EN 13306 / D.S. 594 / Ley 21.719).",
    version="2.5.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enrutador principal de la API v1
app.include_router(api_router, prefix="/api/v1")

# Asegurar directorios estáticos
Path("frontend/static/uploads").mkdir(parents=True, exist_ok=True)

# Montar archivos estáticos y vistas de aplicación
app.mount("/static", StaticFiles(directory="frontend/static"), name="static")
app.mount("/app", StaticFiles(directory="frontend", html=True), name="frontend")


@app.get("/", include_in_schema=False)
def redireccion_raiz():
    return RedirectResponse(url="/app/monitor.html")


@app.get("/health", tags=["Telemetría"])
def health_check():
    return {
        "status": "ONLINE",
        "engine": "TaskNode FSM Core v2.5",
        "normativa": ["ISO 55000", "UNE-EN 13306", "UNE-EN 15341", "D.S. 594", "Ley 21.719"]
    }