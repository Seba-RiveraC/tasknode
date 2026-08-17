from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from datetime import datetime
from app.database import init_db, get_connection

app = FastAPI(title="TaskNode API", version="0.1.0-prealpha")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Servir archivos estáticos (CSS, JS, imágenes)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.on_event("startup")
def startup_event():
    init_db()

# Ruta raíz que entrega directamente la webapp del técnico
@app.get("/")
def read_root():
    return FileResponse("static/index.html")

class ReporteIn(BaseModel):
    faena: str
    estado: str
    motivo: str = ""

@app.post("/api/reportar")
def recibir_reporte(reporte: ReporteIn):
    with get_connection() as conn:
        c = conn.cursor()
        fecha_actual = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        c.execute("INSERT INTO reportes (fecha, faena, estado, motivo) VALUES (?, ?, ?, ?)",
                  (fecha_actual, reporte.faena, reporte.estado, reporte.motivo))
        conn.commit()
    return {"status": "ok", "message": "Reporte registrado"}