from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app import models, database
from app.database import get_db

# 1. Crear las tablas en la base de datos automáticamente
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="TaskNode API", version="1.0.0")

# 2. Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Esquema Pydantic alineado con el modelo Multi-Tenant
class ReporteCreate(BaseModel):
    empresa_id: int
    tecnico_id: int
    faena_nombre: str
    estado: str
    motivo_bloqueo: Optional[str] = None
    notas: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None

# 4. Endpoints de la API
@app.post("/api/reportes", status_code=201)
def crear_reporte(reporte: ReporteCreate, db: Session = Depends(get_db)):
    """Crea un nuevo reporte en terreno usando ReporteTerreno"""
    try:
        nuevo_reporte = models.ReporteTerreno(
            empresa_id=reporte.empresa_id,
            tecnico_id=reporte.tecnico_id,
            faena_nombre=reporte.faena_nombre,
            estado=reporte.estado,
            motivo_bloqueo=reporte.motivo_bloqueo,
            notas=reporte.notas,
            latitud=reporte.latitud,
            longitud=reporte.longitud,
            is_synced=1
        )
        db.add(nuevo_reporte)
        db.commit()
        db.refresh(nuevo_reporte)
        return {"mensaje": "Reporte guardado exitosamente", "id": nuevo_reporte.id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/reportes")
def obtener_reportes(db: Session = Depends(get_db)):
    """Obtiene todos los reportes de terreno para el Dashboard"""
    reportes = db.query(models.ReporteTerreno).all()
    return reportes