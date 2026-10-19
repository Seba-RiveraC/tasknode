import os
import shutil
from decimal import Decimal
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas, security

UPLOAD_DIR = "/app/storage/evidencias"
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(
    title="TaskNode Core API",
    description="Backend transaccional para trazabilidad operativa en terreno con GPS inmutable y evidencia fotográfica.",
    version="1.0.0-MVP (Fase 2 Capstone)"
)

# Servir estáticos de evidencia para visualización inmediata
app.mount("/storage/evidencias", StaticFiles(directory=UPLOAD_DIR), name="evidencias")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/", tags=["Root"])
def root():
    return {
        "proyecto": "TaskNode",
        "fase": "Fase 2 (Core MVP Operacional)",
        "estado": "Online",
        "swagger_docs": "/docs"
    }

@app.post("/api/v1/auth/login", response_model=schemas.Token, tags=["Autenticación"])
def login(login_data: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.Usuario).filter(models.Usuario.email == login_data.email).first()
    if not user or not security.verify_password(login_data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Credenciales incorrectas")

    token = security.create_access_token(data={"sub": user.email, "rol": user.rol, "id_empresa": user.id_empresa})
    return {
        "access_token": token,
        "token_type": "bearer",
        "rol": user.rol,
        "nombre_completo": user.nombre_completo
    }

@app.get("/api/v1/tareas", tags=["Operaciones"])
def listar_tareas(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(security.get_current_user)
):
    """Retorna las tareas aisladas por el multi-tenancy de la empresa del usuario autenticado."""
    tareas = (
        db.query(models.Tarea)
        .filter(models.Tarea.id_empresa == current_user.id_empresa)
        .all()
    )

    resultado = []
    for t in tareas:
        eventos = [
            schemas.HistorialOut(
                id_historial=h.id_historial,
                estado=h.estado.nombre,
                usuario=h.usuario.nombre_completo,
                fecha_cambio=h.fecha_cambio,
                latitud=h.latitud,
                longitud=h.longitud,
                url_evidencia=h.url_evidencia
            )
            for h in t.historial
        ]
        resultado.append(schemas.TareaDetailOut(
            id_tarea=t.id_tarea,
            titulo=t.titulo,
            faena=t.faena.nombre_faena,
            sector=t.faena.sector_geografico,
            estado_actual=t.estado_actual.nombre,
            supervisor=t.supervisor.nombre_completo,
            operario=t.operario.nombre_completo,
            fecha_inicio=t.fecha_inicio,
            historial_eventos=eventos
        ))
    return resultado

@app.post("/api/v1/tareas/{id_tarea}/transicion", tags=["Operaciones en Terreno (Android/Web)"])
async def registrar_transicion_estado(
    id_tarea: int,
    id_nuevo_estado: int = Form(...),
    latitud: float = Form(..., description="Latitud GPS capturada por hardware móvil"),
    longitud: float = Form(..., description="Longitud GPS capturada por hardware móvil"),
    evidencia: UploadFile = File(..., description="Fotografía obligatoria capturada en la faena"),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(security.get_current_user)
):
    """
    CORE TASKNODE: Cambia el estado de una tarea exigiendo coordenadas GPS y evidencia fotográfica.
    Registra el evento en historial_estados de manera inmutable.
    """
    tarea = db.query(models.Tarea).filter(
        models.Tarea.id_tarea == id_tarea,
        models.Tarea.id_empresa == current_user.id_empresa
    ).first()

    if not tarea:
        raise HTTPException(status_code=404, detail="Tarea no encontrada o no pertenece a su empresa")

    estado_destino = db.query(models.EstadoTarea).filter(models.EstadoTarea.id_estado == id_nuevo_estado).first()
    if not estado_destino:
        raise HTTPException(status_code=400, detail="El estado indicado no existe en el catálogo")

    # Guardar archivo de imagen en el volumen
    file_ext = os.path.splitext(evidencia.filename)[1] or ".jpg"
    safe_filename = f"evidencia_t{id_tarea}_e{id_nuevo_estado}_{int(os.times().system*1000)}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(evidencia.file, buffer)

    url_relativa = f"/storage/evidencias/{safe_filename}"

    # 1. Registro inmutable en historial_estados
    nuevo_historial = models.HistorialEstado(
        id_tarea=tarea.id_tarea,
        id_estado=id_nuevo_estado,
        id_usuario=current_user.id_usuario,
        latitud=Decimal(str(latitud)),
        longitud=Decimal(str(longitud)),
        url_evidencia=url_relativa
    )
    db.add(nuevo_historial)

    # 2. Actualizar estado puntero de la tarea
    tarea.id_estado = id_nuevo_estado
    db.commit()
    db.refresh(nuevo_historial)

    return {
        "mensaje": f"Estado actualizado exitosamente a '{estado_destino.nombre}'",
        "id_tarea": tarea.id_tarea,
        "nuevo_estado": estado_destino.nombre,
        "coordenadas_registradas": {"latitud": latitud, "longitud": longitud},
        "url_evidencia": url_relativa,
        "auditor": current_user.nombre_completo,
        "fecha_evento": nuevo_historial.fecha_cambio
    }