import hashlib
from datetime import datetime, timedelta
from app.core.database import SessionLocal, engine, Base
from app.models.operational import ActivoIndustrial, OrdenTrabajo, BitacoraTransicion

def hash_sha256(texto: str) -> str:
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()

def poblar_sistema():
    print("-> Regenerando esquema relacional...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # 1. Catálogo de Activos Físicos (ISO 55000)
        bomba = ActivoIndustrial(
            codigo_activo="PMP-ISO-2610-01",
            nombre="Bomba Centrífuga Multietapa de Alimentación",
            ubicacion_tecnica="Sala de Máquinas - Circuito Secundario",
            criticidad="ALTA",
            latitud_referencia=-41.4693,
            longitud_referencia=-72.9424
        )
        compresor = ActivoIndustrial(
            codigo_activo="CMP-ISO-2610-04",
            nombre="Compresor de Aire Tornillo 75kW",
            ubicacion_tecnica="Maestranza Central - Módulo B",
            criticidad="MEDIA",
            latitud_referencia=-41.4710,
            longitud_referencia=-72.9510
        )
        db.add_all([bomba, compresor])
        db.flush()

        # 2. Órdenes de Trabajo Formales (EN 13306)
        ahora = datetime.utcnow()

        ot_completada = OrdenTrabajo(
            codigo_ot="OT-2610-PMT-PRV-0001",
            activo_id=bomba.id,
            tipo_mantenimiento="PREVENTIVO",
            prioridad="MEDIA",
            estado_actual="OT COMPLETADA",
            operario_responsable="S. Rivera",
            rut_responsable="18.421.903-K",
            descripcion="Lubricación de rodamientos SKF y medición de temperatura de carcasa.",
            created_at=ahora - timedelta(hours=4)
        )
        ot_emitida = OrdenTrabajo(
            codigo_ot="OT-2610-PMT-PRV-0045",
            activo_id=bomba.id,
            tipo_mantenimiento="PREVENTIVO",
            prioridad="ALTA",
            estado_actual="EMITIDA",
            operario_responsable="S. Rivera",
            rut_responsable="18.421.903-K",
            descripcion="Inspección programada de 500h: reemplazo de sello mecánico doble.",
            created_at=ahora - timedelta(hours=2)
        )
        ot_ejecucion = OrdenTrabajo(
            codigo_ot="OT-2610-PMT-PRV-0042",
            activo_id=bomba.id,
            tipo_mantenimiento="PREVENTIVO",
            prioridad="ALTA",
            estado_actual="EN EJECUCIÓN",
            operario_responsable="S. Rivera",
            rut_responsable="18.421.903-K",
            descripcion="Alineación láser de acople motor-bomba y balanceo dinámico.",
            created_at=ahora - timedelta(hours=1)
        )
        ot_detenida = OrdenTrabajo(
            codigo_ot="OT-2610-SUR-COR-0015",
            activo_id=compresor.id,
            tipo_mantenimiento="CORRECTIVO",
            prioridad="ALTA",
            estado_actual="DETENIDA POR ANOMALÍA",
            operario_responsable="M. Soto",
            rut_responsable="16.892.110-3",
            descripcion="Atención por disparo térmico. Fuga en circuito de refrigeración.",
            created_at=ahora - timedelta(minutes=30)
        )

        db.add_all([ot_completada, ot_emitida, ot_ejecucion, ot_detenida])
        db.flush()

        # 3. Bitácora de Transiciones con Encadenamiento SHA-256
        h0 = "GENESIS_HASH_TASKNODE_0000000000000000000000000000000000000000"

        t1_time = ahora - timedelta(hours=3)
        h1 = hash_sha256(f"{h0}|{ot_completada.codigo_ot}|OT COMPLETADA|45|{t1_time.isoformat()}")
        t1 = BitacoraTransicion(
            orden_id=ot_completada.id,
            codigo_ot=ot_completada.codigo_ot,
            operario_responsable=ot_completada.operario_responsable,
            rut_responsable=ot_completada.rut_responsable,
            estado_anterior="EN VALIDACIÓN",
            estado_nuevo="OT COMPLETADA",
            coordenadas_gps="-41.4693, -72.9424",
            observacion="Intervención finalizada y auditada conforme a norma.",
            hash_previo=h0,
            hash_cadena=h1,
            timestamp=t1_time
        )

        t2_time = ahora - timedelta(minutes=45)
        h2 = hash_sha256(f"{h1}|{ot_ejecucion.codigo_ot}|EN EJECUCIÓN|45|{t2_time.isoformat()}")
        t2 = BitacoraTransicion(
            orden_id=ot_ejecucion.id,
            codigo_ot=ot_ejecucion.codigo_ot,
            operario_responsable=ot_ejecucion.operario_responsable,
            rut_responsable=ot_ejecucion.rut_responsable,
            estado_anterior="EMITIDA",
            estado_nuevo="EN EJECUCIÓN",
            coordenadas_gps="-41.4693, -72.9424",
            observacion="Despliegue inicial de cuadrilla con EPP verificado.",
            hash_previo=h1,
            hash_cadena=h2,
            timestamp=t2_time
        )

        t3_time = ahora - timedelta(minutes=20)
        h3 = hash_sha256(f"{h2}|{ot_detenida.codigo_ot}|DETENIDA POR ANOMALÍA|46|{t3_time.isoformat()}")
        t3 = BitacoraTransicion(
            orden_id=ot_detenida.id,
            codigo_ot=ot_detenida.codigo_ot,
            operario_responsable=ot_detenida.operario_responsable,
            rut_responsable=ot_detenida.rut_responsable,
            estado_anterior="EN EJECUCIÓN",
            estado_nuevo="DETENIDA POR ANOMALÍA",
            coordenadas_gps="-41.4710, -72.9510",
            observacion="Detención por riesgo técnico bajo D.S. 594. Fuga activa detectada.",
            hash_previo=h2,
            hash_cadena=h3,
            timestamp=t3_time
        )

        db.add_all([t1, t2, t3])
        db.commit()

        total_act = db.query(ActivoIndustrial).count()
        total_ots = db.query(OrdenTrabajo).count()
        total_trs = db.query(BitacoraTransicion).count()
        print(f"[OK] Datos cargados con éxito: {total_act} Activos | {total_ots} Órdenes de Trabajo | {total_trs} Registros en Bitácora.")

    except Exception as e:
        db.rollback()
        print(f"[ERROR]: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    poblar_sistema()