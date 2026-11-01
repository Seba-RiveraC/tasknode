from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.core.database import get_db
from app.models import operational as models
from app.schemas import operational as schemas
from app.api.v1.endpoints.auth import hashear_password

router = APIRouter()


def generar_hitos_telecom_por_defecto(tipo: str) -> list:
    return [
        {"id": 1, "dia": "Etapa 1", "titulo": "Permiso de acceso a sitio, charla PTS y bloqueo LOTO (D.S. 594)", "completado": False},
        {"id": 2, "dia": "Etapa 2", "titulo": f"Inspección física de infraestructura y tendido/desmontaje ({tipo})", "completado": False},
        {"id": 3, "dia": "Etapa 3", "titulo": "Empalme / alineación de enlace y calibración de parámetros RF/FO", "completado": False},
        {"id": 4, "dia": "Etapa 4", "titulo": "Pruebas de potencia (OTDR/VSWR), foto nítida y firma de recepción", "completado": False},
    ]


def calcular_porcentaje_hitos(lista_hitos: list, estado_actual: str) -> int:
    if estado_actual == "OT COMPLETADA":
        return 100
    if not lista_hitos:
        return 25 if estado_actual == "EMITIDA" else 50
    completados = sum(1 for h in lista_hitos if h.get("completado"))
    return int(round((completados / len(lista_hitos)) * 100))


def hidratar_orden(o: models.OrdenTrabajo) -> schemas.OrdenTrabajoOut:
    lista_hitos = [
        {
            "id": h.orden_secuencia,
            "dia": h.dia,
            "titulo": h.titulo,
            "completado": True if o.estado_actual == "OT COMPLETADA" else h.completado
        }
        for h in o.hitos
    ]
    avance_pct = calcular_porcentaje_hitos(lista_hitos, o.estado_actual)

    cliente_nombre = o.empresa.razon_social if o.empresa else "Austral Conectividad SpA"
    operario_nombre = o.operario.nombre_completo if o.operario else "Rodrigo Fuentes A."
    operario_rut = o.operario.rut if o.operario else "15.902.438-2"

    hash_cadena = None
    evidencia_url = None
    laplacian_score = None
    firma_data = None
    encargado_nombre = None
    encargado_rut = None

    if o.transiciones:
        ultima = max(o.transiciones, key=lambda t: t.id)
        hash_cadena = ultima.hash_cadena

        for t in reversed(o.transiciones):
            if not evidencia_url and t.evidencias:
                ult_ev = t.evidencias[-1]
                evidencia_url = ult_ev.url_almacenamiento
                laplacian_score = ult_ev.laplacian_score
            if not firma_data and t.firma_data:
                firma_data = t.firma_data
                encargado_nombre = t.encargado_nombre
                encargado_rut = t.encargado_rut

    return schemas.OrdenTrabajoOut(
        id=o.id,
        codigo_ot=o.codigo_ot,
        empresa_id=o.empresa_id,
        operario_id=o.operario_id,
        cliente_mandante=cliente_nombre,
        activo_id=o.activo_id,
        tipo_mantenimiento=o.tipo_mantenimiento,
        prioridad=o.prioridad,
        operario_responsable=operario_nombre,
        rut_responsable=operario_rut,
        descripcion=o.descripcion,
        estado_actual=o.estado_actual,
        avance_pct=avance_pct,
        hitos=lista_hitos,
        created_at=o.created_at,
        activo=o.activo,
        hash_cadena=hash_cadena,
        evidencia_url=evidencia_url,
        laplacian_score=laplacian_score,
        encargado_nombre=encargado_nombre,
        encargado_rut=encargado_rut,
        firma_data=firma_data
    )


@router.get("/", response_model=List[schemas.OrdenTrabajoOut])
def listar_ordenes(empresa_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.OrdenTrabajo)
    if empresa_id:
        q = q.filter(models.OrdenTrabajo.empresa_id == empresa_id)
    ordenes = q.order_by(models.OrdenTrabajo.id.desc()).all()
    return [hidratar_orden(o) for o in ordenes]


@router.post("/", response_model=schemas.OrdenTrabajoOut, status_code=status.HTTP_201_CREATED)
def crear_orden(payload: schemas.OrdenTrabajoCreate, db: Session = Depends(get_db)):
    existente = db.query(models.OrdenTrabajo).filter(
        models.OrdenTrabajo.codigo_ot == payload.codigo_ot.strip()
    ).first()
    if existente:
        raise HTTPException(status_code=400, detail=f"El folio '{payload.codigo_ot}' ya existe.")

    activo = db.query(models.ActivoIndustrial).filter(models.ActivoIndustrial.id == payload.activo_id).first()
    if not activo:
        raise HTTPException(status_code=404, detail="El equipo especificado no existe en el catálogo.")

    # 1. Resolver o crear Empresa Mandante en 3FN
    nombre_cli = (payload.cliente_mandante or "Austral Conectividad SpA").strip()
    empresa = db.query(models.EmpresaMandante).filter(
        models.EmpresaMandante.razon_social.ilike(nombre_cli)
    ).first()
    if not empresa:
        empresa = models.EmpresaMandante(
            rut_empresa=f"76.{int(datetime.utcnow().timestamp()) % 899 + 100}.100-K",
            razon_social=nombre_cli,
            sla_objetivo_pct=98.5
        )
        db.add(empresa)
        db.flush()

    # 2. Resolver o crear Operario en tabla Usuario en 3FN
    rut_op = payload.rut_responsable.strip()
    operario = db.query(models.Usuario).filter(models.Usuario.rut == rut_op).first()
    if not operario:
        email_gen = f"{payload.operario_responsable.strip().split()[0].lower()}.{int(datetime.utcnow().timestamp()) % 999}@tasknode.cl"
        operario = models.Usuario(
            nombre_completo=payload.operario_responsable.strip(),
            rut=rut_op,
            email=email_gen,
            password_hash=hashear_password("terreno123"),
            rol="TRABAJADOR",
            cargo="Técnico de Operaciones"
        )
        db.add(operario)
        db.flush()

    hitos_iniciales = (
        [h.model_dump() for h in payload.hitos]
        if payload.hitos
        else generar_hitos_telecom_por_defecto(payload.tipo_mantenimiento)
    )

    nueva_ot = models.OrdenTrabajo(
        codigo_ot=payload.codigo_ot.strip(),
        empresa_id=empresa.id,
        activo_id=activo.id,
        operario_id=operario.id,
        tipo_mantenimiento=payload.tipo_mantenimiento,
        prioridad=payload.prioridad,
        estado_actual="EMITIDA",
        descripcion=payload.descripcion.strip(),
        created_at=datetime.utcnow()
    )
    db.add(nueva_ot)
    db.flush()

    for idx, h in enumerate(hitos_iniciales, start=1):
        db.add(models.HitoOrden(
            orden_id=nueva_ot.id,
            orden_secuencia=idx,
            dia=h["dia"],
            titulo=h["titulo"],
            completado=bool(h.get("completado", False))
        ))

    db.commit()
    db.refresh(nueva_ot)
    return hidratar_orden(nueva_ot)


@router.put("/{codigo_ot}/hitos", response_model=schemas.OrdenTrabajoOut)
def actualizar_hitos_orden(codigo_ot: str, payload: schemas.HitosUpdatePayload, db: Session = Depends(get_db)):
    orden = db.query(models.OrdenTrabajo).filter(models.OrdenTrabajo.codigo_ot == codigo_ot.strip()).first()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada.")

    lista_hitos = [h.model_dump() for h in payload.hitos]
    db.query(models.HitoOrden).filter(models.HitoOrden.orden_id == orden.id).delete()
    for idx, h in enumerate(lista_hitos, start=1):
        db.add(models.HitoOrden(
            orden_id=orden.id,
            orden_secuencia=idx,
            dia=h["dia"],
            titulo=h["titulo"],
            completado=bool(h.get("completado", False))
        ))

    db.commit()
    db.refresh(orden)
    return hidratar_orden(orden)