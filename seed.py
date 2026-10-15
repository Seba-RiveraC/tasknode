from datetime import datetime, timedelta
from app.core.database import SessionLocal, engine, Base
from app.models.operational import ActivoIndustrial, OrdenTrabajo, BitacoraTransicion
from app.api.v1.endpoints.transitions import construir_payload_canonico, sha256_cadena, GENESIS_HASH

def poblar_sistema():
    print("-> Regenerando esquema relacional e instalando Triggers ISO 55001 Append-Only...")
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

        # 3. Bitácora con Vector Canónico Verificable
        t1_time = ahora - timedelta(hours=3)
        gps_1 = "-41.4693, -72.9424"
        h1 = sha256_cadena(construir_payload_canonico(
            GENESIS_HASH, ot_completada.codigo_ot, "EN VALIDACIÓN", "OT COMPLETADA",
            ot_completada.rut_responsable, gps_1, t1_time.isoformat()
        ))
        t1 = BitacoraTransicion(
            orden_id=ot_completada.id,
            codigo_ot=ot_completada.codigo_ot,
            operario_responsable=ot_completada.operario_responsable,
            rut_responsable=ot_completada.rut_responsable,
            estado_anterior="EN VALIDACIÓN",
            estado_nuevo="OT COMPLETADA",
            coordenadas_gps=gps_1,
            observacion="Intervención finalizada y auditada conforme a norma.",
            hash_previo=GENESIS_HASH,
            hash_cadena=h1,
            timestamp=t1_time
        )

        t2_time = ahora - timedelta(minutes=45)
        gps_2 = "-41.4693, -72.9424"
        h2 = sha256_cadena(construir_payload_canonico(
            h1, ot_ejecucion.codigo_ot, "EMITIDA", "EN EJECUCIÓN",
            ot_ejecucion.rut_responsable, gps_2, t2_time.isoformat()
        ))
        t2 = BitacoraTransicion(
            orden_id=ot_ejecucion.id,
            codigo_ot=ot_ejecucion.codigo_ot,
            operario_responsable=ot_ejecucion.operario_responsable,
            rut_responsable=ot_ejecucion.rut_responsable,
            estado_anterior="EMITIDA",
            estado_nuevo="EN EJECUCIÓN",
            coordenadas_gps=gps_2,
            observacion="Despliegue inicial de cuadrilla con EPP verificado.",
            hash_previo=h1,
            hash_cadena=h2,
            timestamp=t2_time
        )

        t3_time = ahora - timedelta(minutes=20)
        gps_3 = "-41.4710, -72.9510"
        h3 = sha256_cadena(construir_payload_canonico(
            h2, ot_detenida.codigo_ot, "EN EJECUCIÓN", "DETENIDA POR ANOMALÍA",
            ot_detenida.rut_responsable, gps_3, t3_time.isoformat()
        ))
        t3 = BitacoraTransicion(
            orden_id=ot_detenida.id,
            codigo_ot=ot_detenida.codigo_ot,
            operario_responsable=ot_detenida.operario_responsable,
            rut_responsable=ot_detenida.rut_responsable,
            estado_anterior="EN EJECUCIÓN",
            estado_nuevo="DETENIDA POR ANOMALÍA",
            coordenadas_gps=gps_3,
            observacion="Detención por riesgo técnico bajo D.S. 594. Fuga activa detectada.",
            hash_previo=h2,
            hash_cadena=h3,
            timestamp=t3_time
        )

        db.add_all([t1, t2, t3])
        db.commit()
        print("[OK] Base de datos regenerada con Triggers Append-Only y Cadena Criptográfica Canónica.")
    except Exception as e:
        db.rollback()
        print(f"[ERROR]: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    poblar_sistema()