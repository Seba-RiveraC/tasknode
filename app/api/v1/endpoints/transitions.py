import hashlib
import inspect
import threading
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import operational as models
from app.schemas import operational as schemas
from app.services import fsm_service, storage_service, vision_service

router = APIRouter()

# Cerrojo de exclusión mutua para serializar la creación de bloques SHA-256 (Hallazgo 5: Anti-Forking)
_ledger_lock = threading.Lock()
GENESIS_HASH = "GENESIS_HASH_TASKNODE_0000000000000000000000000000000000000000"

def sha256_cadena(texto: str) -> str:
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()

def construir_payload_canonico(
    hash_previo: str,
    codigo_ot: str,
    estado_anterior: str,
    estado_nuevo: str,
    rut_responsable: str,
    coordenadas_gps: str,
    timestamp_iso: str
) -> str:
    """
    Construye el vector canónico determinista empleando exclusivamente atributos
    persistidos en la tupla forense para permitir recálculo verificable (ISO 55001).
    """
    return f"{hash_previo}|{codigo_ot}|{estado_anterior}|{estado_nuevo}|{rut_responsable}|{coordenadas_gps}|{timestamp_iso}"

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

@router.get("/verificar")
def verificar_integridad_ledger(db: Session = Depends(get_db)):
    """
    Recalcula criptográficamente la cadena completa desde el bloque Génesis (ID ascendente)
    para detectar manipulaciones directas en base de datos (Hallazgo 6).
    """
    bloques = db.query(models.BitacoraTransicion).order_by(models.BitacoraTransicion.id.asc()).all()
    hash_esperado_previo = GENESIS_HASH
    discrepancias = []

    for b in bloques:
        # 1. Verificar eslabón con el bloque anterior
        eslabon_valido = (b.hash_previo == hash_esperado_previo)

        # 2. Recalcular el hash SHA-256 a partir de los datos de la fila
        ts_iso = b.timestamp.isoformat() if b.timestamp else ""
        payload = construir_payload_canonico(
            hash_previo=b.hash_previo,
            codigo_ot=b.codigo_ot,
            estado_anterior=b.estado_anterior,
            estado_nuevo=b.estado_nuevo,
            rut_responsable=b.rut_responsable,
            coordenadas_gps=b.coordenadas_gps,
            timestamp_iso=ts_iso
        )
        hash_recalculado = sha256_cadena(payload)
        firma_valida = (hash_recalculado == b.hash_cadena)

        if not eslabon_valido or not firma_valida:
            discrepancias.append({
                "bloque_id": b.id,
                "codigo_ot": b.codigo_ot,
                "eslabon_valido": eslabon_valido,
                "firma_valida": firma_valida,
                "hash_almacenado": b.hash_cadena,
                "hash_recalculado": hash_recalculado
            })

        hash_esperado_previo = b.hash_cadena

    return {
        "integro": len(discrepancias) == 0,
        "total_bloques_auditados": len(bloques),
        "discrepancias_detectadas": len(discrepancias),
        "detalle_discrepancias": discrepancias
    }

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
    coordenadas_gps = coordenadas_gps.strip()

    # 1. Compuerta Óptica de Visión Computacional pre-lock (Hallazgo 3)
    contenido_foto = None
    score_laplacian = None
    es_nitida = False

    if foto and getattr(foto, "filename", None):
        contenido_foto = await foto.read()
        if contenido_foto:
            score_laplacian, es_nitida = vision_service.calcular_nitidez_laplaciana(contenido_foto)
            if not es_nitida:
                raise HTTPException(
                    status_code=422,
                    detail=f"Evidencia rechazada por baja nitidez: Score Laplaciano ({score_laplacian}) inferior al mínimo normativo (100.0)."
                )

    # 2. Sección Crítica Serializada: Previene condiciones de carrera y Forking en el Ledger (Hallazgo 5)
    with _ledger_lock:
        orden = (
            db.query(models.OrdenTrabajo)
            .filter(models.OrdenTrabajo.codigo_ot == codigo_ot)
            .with_for_update()
            .first()
        )
        if not orden:
            raise HTTPException(status_code=404, detail=f"Orden de trabajo '{codigo_ot}' no encontrada.")

        # 3. Compuerta Determinista FSM (UNE-EN 13306)
        estado_anterior = orden.estado_actual
        fsm_service.validar_transicion(estado_anterior, estado_nuevo)

        # 4. Compuerta Geoespacial Haversine (WGS84 ST_DWithin)
        if orden.activo:
            fsm_service.validar_geocerca_wgs84(
                coordenadas_gps,
                orden.activo.latitud_referencia,
                orden.activo.longitud_referencia
            )

        # 5. Actualizar estado en la Orden de Trabajo
        orden.estado_actual = estado_nuevo
        db.add(orden)

        # 6. Obtener último bloque y calcular SHA-256 canónico
        ultima_transicion = (
            db.query(models.BitacoraTransicion)
            .order_by(models.BitacoraTransicion.id.desc())
            .with_for_update()
            .first()
        )
        hash_previo = (
            ultima_transicion.hash_cadena
            if (ultima_transicion and ultima_transicion.hash_cadena)
            else GENESIS_HASH
        )

        timestamp_actual = datetime.utcnow()
        operario_nom = orden.operario_responsable or "S. Rivera"
        operario_rut = orden.rut_responsable or "18.421.903-K"

        payload_firma = construir_payload_canonico(
            hash_previo=hash_previo,
            codigo_ot=codigo_ot,
            estado_anterior=estado_anterior,
            estado_nuevo=estado_nuevo,
            rut_responsable=operario_rut,
            coordenadas_gps=coordenadas_gps,
            timestamp_iso=timestamp_actual.isoformat()
        )
        hash_cadena = sha256_cadena(payload_firma)

        # 7. Insertar Snapshot Forense en Bitácora
        nueva_transicion = models.BitacoraTransicion(
            orden_id=orden.id,
            codigo_ot=codigo_ot,
            operario_responsable=operario_nom,
            rut_responsable=operario_rut,
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

        # 8. Guardar evidencia multimedia si fue adjuntada
        if contenido_foto and foto.filename:
            try:
                if inspect.iscoroutinefunction(storage_service.almacenar_evidencia):
                    url_archivo = await storage_service.almacenar_evidencia(foto.filename, contenido_foto)
                else:
                    url_archivo = storage_service.almacenar_evidencia(foto.filename, contenido_foto)

                evidencia = models.EvidenciaMultimedia(
                    transicion_id=nueva_transicion.id,
                    url_almacenamiento=url_archivo,
                    laplacian_score=score_laplacian,
                    aprobado_nitidez=es_nitida
                )
                db.add(evidencia)
                nueva_transicion.evidencia_url = url_archivo
                nueva_transicion.laplacian_score = score_laplacian
            except Exception as err_storage:
                print(f"[ADVERTENCIA] Error al guardar evidencia: {err_storage}")

        db.commit()
        db.refresh(nueva_transicion)
        return nueva_transicion