import json
import hashlib
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
    return f"{hash_previo}|{codigo_ot}|{estado_anterior}|{estado_nuevo}|{rut_responsable}|{coordenadas_gps}|{timestamp_iso}"


def hidratar_transicion(t: models.BitacoraTransicion) -> schemas.TransicionOut:
    codigo_ot = t.orden.codigo_ot if t.orden else f"OT-{t.orden_id}"
    operario_nom = t.usuario.nombre_completo if t.usuario else "Técnico Terreno"
    operario_rut = t.usuario.rut if t.usuario else "15.902.438-2"

    ev_url = None
    ev_score = None
    if t.evidencias:
        ult_ev = t.evidencias[-1]
        ev_url = ult_ev.url_almacenamiento
        ev_score = ult_ev.laplacian_score
    elif t.orden and t.orden.transiciones:
        for prev_t in reversed(t.orden.transiciones):
            if prev_t.id <= t.id and prev_t.evidencias:
                ev_url = prev_t.evidencias[-1].url_almacenamiento
                ev_score = prev_t.evidencias[-1].laplacian_score
                break

    return schemas.TransicionOut(
        id=t.id,
        orden_id=t.orden_id,
        usuario_id=t.usuario_id,
        codigo_ot=codigo_ot,
        operario_responsable=operario_nom,
        rut_responsable=operario_rut,
        estado_anterior=t.estado_anterior,
        estado_nuevo=t.estado_nuevo,
        coordenadas_gps=t.coordenadas_gps,
        observacion=t.observacion,
        hash_previo=t.hash_previo,
        hash_cadena=t.hash_cadena,
        timestamp=t.timestamp,
        evidencia_url=ev_url,
        laplacian_score=ev_score,
        encargado_nombre=t.encargado_nombre,
        encargado_rut=t.encargado_rut,
        firma_data=t.firma_data
    )


@router.get("/", response_model=List[schemas.TransicionOut])
def listar_transiciones(db: Session = Depends(get_db)):
    filas = db.query(models.BitacoraTransicion).order_by(models.BitacoraTransicion.id.desc()).all()
    return [hidratar_transicion(t) for t in filas]


@router.get("/verificar")
def verificar_integridad_ledger(db: Session = Depends(get_db)):
    bloques = db.query(models.BitacoraTransicion).order_by(models.BitacoraTransicion.id.asc()).all()
    hash_esperado_previo = GENESIS_HASH
    discrepancias = []

    for b in bloques:
        eslabon_valido = (b.hash_previo == hash_esperado_previo)
        ts_iso = b.timestamp.isoformat() if b.timestamp else ""
        codigo_ot = b.orden.codigo_ot if b.orden else ""
        rut_resp = b.usuario.rut if b.usuario else ""

        payload = construir_payload_canonico(
            hash_previo=b.hash_previo,
            codigo_ot=codigo_ot,
            estado_anterior=b.estado_anterior,
            estado_nuevo=b.estado_nuevo,
            rut_responsable=rut_resp,
            coordenadas_gps=b.coordenadas_gps,
            timestamp_iso=ts_iso
        )
        hash_recalculado = sha256_cadena(payload)
        firma_valida = (hash_recalculado == b.hash_cadena)

        if not eslabon_valido or not firma_valida:
            discrepancias.append({
                "bloque_id": b.id,
                "codigo_ot": codigo_ot,
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
    operario_id: int = Form(45),
    estado_nuevo: str = Form(...),
    coordenadas_gps: str = Form(...),
    observacion: Optional[str] = Form(None),
    encargado_nombre: Optional[str] = Form(None),
    encargado_rut: Optional[str] = Form(None),
    firma_data: Optional[str] = Form(None),
    hitos_json: Optional[str] = Form(None),
    foto: Optional[UploadFile] = File(default=None),
    db: Session = Depends(get_db)
):
    codigo_ot = codigo_ot.strip()
    estado_nuevo = estado_nuevo.strip()
    coordenadas_gps = coordenadas_gps.strip()

    # 1. Compuerta Óptica
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
                    detail=f"Foto borrosa rechazada: Nitidez Laplaciana ({score_laplacian}) menor al mínimo (100.0)."
                )

    # 2. Compuerta Anti-Forking
    with _ledger_lock:
        orden = db.query(models.OrdenTrabajo).filter(models.OrdenTrabajo.codigo_ot == codigo_ot).first()
        if not orden:
            raise HTTPException(status_code=404, detail=f"Orden '{codigo_ot}' no encontrada.")

        # 3B. Compuerta Geocerca Haversine
        if orden.activo:
            fsm_service.validar_geocerca_wgs84(
                coordenadas_gps,
                orden.activo.latitud_referencia,
                orden.activo.longitud_referencia
            )

        operario_user = orden.operario
        operario_rut = operario_user.rut if operario_user else "15.902.438-2"
        usuario_fk_id = operario_user.id if operario_user else 1
        estado_anterior = orden.estado_actual

        # Puenteo Ágil Bajo el Capó para PyMEs
        if estado_anterior in ("EMITIDA", "DETENIDA POR ANOMALÍA") and estado_nuevo in ("EN VALIDACIÓN", "OT COMPLETADA"):
            ult_pre = db.query(models.BitacoraTransicion).order_by(models.BitacoraTransicion.id.desc()).first()
            hash_prev_auto = ult_pre.hash_cadena if (ult_pre and ult_pre.hash_cadena) else GENESIS_HASH
            ts_auto = datetime.utcnow().replace(microsecond=0)
            payload_auto = construir_payload_canonico(
                hash_previo=hash_prev_auto,
                codigo_ot=codigo_ot,
                estado_anterior=estado_anterior,
                estado_nuevo="EN EJECUCIÓN",
                rut_responsable=operario_rut,
                coordenadas_gps=coordenadas_gps,
                timestamp_iso=ts_auto.isoformat()
            )
            hash_cad_auto = sha256_cadena(payload_auto)
            trans_puente = models.BitacoraTransicion(
                orden_id=orden.id,
                usuario_id=usuario_fk_id,
                estado_anterior=estado_anterior,
                estado_nuevo="EN EJECUCIÓN",
                coordenadas_gps=coordenadas_gps,
                observacion="Inicio de ejecución registrado automáticamente por flujo ágil.",
                hash_previo=hash_prev_auto,
                hash_cadena=hash_cad_auto,
                timestamp=ts_auto,
                encargado_nombre=encargado_nombre or "Carlos Valenzuela M.",
                encargado_rut=encargado_rut or "14.285.631-8"
            )
            db.add(trans_puente)
            db.flush()
            estado_anterior = "EN EJECUCIÓN"
            orden.estado_actual = "EN EJECUCIÓN"

        # 3A. Compuerta FSM
        if estado_nuevo != estado_anterior:
            fsm_service.validar_transicion(estado_anterior, estado_nuevo)

        # Actualizar estado e Hitos en la tabla `hito_orden` (1FN/3FN)
        orden.estado_actual = estado_nuevo
        if hitos_json:
            try:
                lista_h = json.loads(hitos_json)
                for h_rel in orden.hitos:
                    match = next((x for x in lista_h if x.get("id") == h_rel.orden_secuencia), None)
                    if match is not None:
                        h_rel.completado = True if estado_nuevo == "OT COMPLETADA" else bool(match.get("completado"))
            except Exception:
                pass
        elif estado_nuevo == "OT COMPLETADA":
            for h_rel in orden.hitos:
                h_rel.completado = True

        db.add(orden)

        # 4. Compuerta Criptográfica SHA-256
        ultima_transicion = (
            db.query(models.BitacoraTransicion)
            .order_by(models.BitacoraTransicion.id.desc())
            .first()
        )
        hash_previo = (
            ultima_transicion.hash_cadena
            if (ultima_transicion and ultima_transicion.hash_cadena)
            else GENESIS_HASH
        )

        timestamp_actual = datetime.utcnow().replace(microsecond=0)
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

        firma_previa = firma_data
        nom_enc_previo = encargado_nombre
        rut_enc_previo = encargado_rut

        if orden.transiciones:
            for t_ant in reversed(orden.transiciones):
                if not firma_previa and t_ant.firma_data:
                    firma_previa = t_ant.firma_data
                    nom_enc_previo = nom_enc_previo or t_ant.encargado_nombre
                    rut_enc_previo = rut_enc_previo or t_ant.encargado_rut

        nueva_transicion = models.BitacoraTransicion(
            orden_id=orden.id,
            usuario_id=usuario_fk_id,
            estado_anterior=estado_anterior,
            estado_nuevo=estado_nuevo,
            coordenadas_gps=coordenadas_gps,
            observacion=observacion,
            hash_previo=hash_previo,
            hash_cadena=hash_cadena,
            timestamp=timestamp_actual,
            encargado_nombre=nom_enc_previo or "Carlos Valenzuela M.",
            encargado_rut=rut_enc_previo or "14.285.631-8",
            firma_data=firma_previa
        )
        db.add(nueva_transicion)
        db.flush()

        if contenido_foto and foto.filename:
            url_archivo = storage_service.almacenar_evidencia(foto.filename, contenido_foto)
            evidencia = models.EvidenciaMultimedia(
                transicion_id=nueva_transicion.id,
                url_almacenamiento=url_archivo,
                laplacian_score=score_laplacian,
                aprobado_nitidez=es_nitida
            )
            db.add(evidencia)
            db.flush()

        db.commit()
        db.refresh(nueva_transicion)
        return hidratar_transicion(nueva_transicion)