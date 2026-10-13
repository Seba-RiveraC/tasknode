import hashlib
import inspect
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import operational as models
from app.schemas import operational as schemas
from app.services import fsm_service, storage_service, vision_service
from app.core import security

router = APIRouter()

def sha256_cadena(texto: str) -> str:
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()

@router.get("/", response_model=List[schemas.TransicionOut])
def listar_transiciones(db: Session = Depends(get_db)):
    registros = db.query(models.BitacoraTransicion).order_by(models.BitacoraTransicion.id.desc()).all()
    for r in registros:
        if not getattr(r, "codigo_ot", None) and getattr(r, "orden", None):
            r.codigo_ot = r.orden.codigo_ot
        if not getattr(r, "operario_responsable", None) and getattr(r, "orden", None):
            r.operario_responsable = r.orden.operario_responsable
        if not getattr(r, "rut_responsable", None) and getattr(r, "orden", None):
            r.rut_responsable = r.orden.rut_responsable
    return registros

@router.post("/", response_model=schemas.TransicionOut)
async def registrar_transicion(
    codigo_ot: str = Form(...),
    operario_id: int = Form(...),
    estado_nuevo: str = Form(...),
    coordenadas_gps: str = Form(...),
    observacion: Optional[str] = Form(None),
    foto: Optional[UploadFile] = File(default=None),
    db: Session = Depends(get_db)
):
    codigo_ot = codigo_ot.strip()
    estado_nuevo = estado_nuevo.strip()

    # 1. Localizar la Orden de Trabajo
    orden = db.query(models.OrdenTrabajo).filter(models.OrdenTrabajo.codigo_ot == codigo_ot).first()
    if not orden:
        raise HTTPException(status_code=404, detail=f"Orden de trabajo '{codigo_ot}' no encontrada.")

    # 2. Validar transición mediante FSM (EN 13306)
    estado_anterior = orden.estado_actual
    fsm_service.validar_transicion(estado_anterior, estado_nuevo)

    # 3. Actualizar la orden en la base de datos
    orden.estado_actual = estado_nuevo
    db.add(orden)

    # 4. Calcular encadenamiento SHA-256
    ultima_transicion = db.query(models.BitacoraTransicion).order_by(models.BitacoraTransicion.id.desc()).first()
    hash_previo = ultima_transicion.hash_cadena if (ultima_transicion and ultima_transicion.hash_cadena) else "GENESIS_HASH_TASKNODE_0000000000000000000000000000000000000000"
    
    timestamp_actual = datetime.utcnow()
    payload_firma = f"{hash_previo}|{codigo_ot}|{estado_nuevo}|{operario_id}|{timestamp_actual.isoformat()}"
    hash_cadena = sha256_cadena(payload_firma)

    # 5. Insertar en bitácora inmutable
    nueva_transicion = models.BitacoraTransicion(
        orden_id=orden.id,
        codigo_ot=codigo_ot,
        operario_responsable=orden.operario_responsable or "S. Rivera",
        rut_responsable=orden.rut_responsable or "18.421.903-K",
        estado_anterior=estado_anterior,
        estado_nuevo=estado_nuevo,
        coordenadas_gps=coordenadas_gps,
        observacion=observacion,
        hash_previo=hash_previo,
        hash_cadena=hash_cadena,
        timestamp=timestamp_actual
    )
    db.add(nueva_transicion)
    db.flush()

    # 6. Procesar evidencia fotográfica si fue adjuntada
    if foto and getattr(foto, "filename", None):
        try:
            contenido = await foto.read()
            if contenido:
                score_laplacian, es_nitida = vision_service.calcular_nitidez_laplaciana(contenido)
                
                if inspect.iscoroutinefunction(storage_service.almacenar_evidencia):
                    url_archivo = await storage_service.almacenar_evidencia(foto.filename, contenido)
                else:
                    url_archivo = storage_service.almacenar_evidencia(foto.filename, contenido)

                evidencia = models.EvidenciaMultimedia(
                    transicion_id=nueva_transicion.id,
                    url_almacenamiento=url_archivo,
                    laplacian_score=score_laplacian,
                    aprobado_nitidez=es_nitida
                )
                db.add(evidencia)
                nueva_transicion.evidencia_url = url_archivo
                nueva_transicion.laplacian_score = score_laplacian
        except Exception as err_img:
            print(f"[ADVERTENCIA] Error no fatal procesando evidencia: {err_img}")

    db.commit()
    db.refresh(nueva_transicion)
    return nueva_transicion