import os
os.environ["DISABLE_SQLALCHEMY_CEXT"] = "1"

from pathlib import Path
from datetime import datetime, timedelta
from urllib.parse import quote
import numpy as np
import cv2
from sqlalchemy import text

from app.core.database import SessionLocal, engine, Base
from app.models.operational import (
    EmpresaMandante,
    Usuario,
    ActivoIndustrial,
    OrdenTrabajo,
    HitoOrden,
    BitacoraTransicion,
    EvidenciaMultimedia,
)
from app.api.v1.endpoints.transitions import (
    construir_payload_canonico,
    sha256_cadena,
    GENESIS_HASH,
)
from app.api.v1.endpoints.auth import hashear_password
from app.services.vision_service import calcular_nitidez_laplaciana

FIRMA_SVG_PRECARGADA = "data:image/svg+xml;utf8," + quote("""<svg xmlns="http://www.w3.org/2000/svg" width="300" height="90" viewBox="0 0 300 90">
  <path d="M 25 65 Q 45 15 70 35 T 115 50 T 150 25 T 195 65 Q 220 75 270 45" fill="none" stroke="#c2410c" stroke-width="2.8" stroke-linecap="round"/>
  <path d="M 85 45 Q 140 10 240 20" fill="none" stroke="#c2410c" stroke-width="2.2" stroke-linecap="round"/>
  <text x="30" y="82" font-family="monospace" font-size="8.5" fill="#18181b" font-weight="bold">C. VALENZUELA · 14.285.631-8 (ENCARGADO TERRENO)</text>
</svg>""")


def generar_evidencia_sintetica_local(nombre_archivo: str, codigo_ot: str, equipo: str, param_txt: str) -> tuple[str, float]:
    upload_dir = Path("frontend/static/uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    ruta_destino = upload_dir / nombre_archivo

    img = np.full((500, 800, 3), (20, 24, 30), dtype=np.uint8)
    for x in range(0, 800, 20):
        color = (40, 48, 60) if x % 100 != 0 else (70, 85, 105)
        cv2.line(img, (x, 0), (x, 500), color, 1)
    for y in range(0, 500, 20):
        color = (40, 48, 60) if y % 100 != 0 else (70, 85, 105)
        cv2.line(img, (0, y), (800, y), color, 1)

    cv2.rectangle(img, (380, 120), (420, 380), (160, 175, 190), 2)
    cv2.line(img, (380, 120), (420, 380), (14, 165, 233), 1)
    cv2.line(img, (420, 120), (380, 380), (14, 165, 233), 1)
    cv2.circle(img, (400, 160), 45, (245, 158, 11), 2)
    cv2.circle(img, (400, 160), 10, (16, 185, 129), -1)

    cv2.rectangle(img, (20, 20), (780, 80), (12, 15, 20), -1)
    cv2.putText(img, f"TASKNODE TELECOM VERIFIER | {codigo_ot}", (35, 50),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (245, 158, 11), 2)
    cv2.putText(img, f"INFRAESTRUCTURA: {equipo} | ZONA SUR", (35, 72),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 210, 225), 1)

    cv2.rectangle(img, (20, 420), (780, 475), (12, 15, 20), -1)
    cv2.putText(img, param_txt, (35, 448),
                cv2.FONT_HERSHEY_SIMPLEX, 0.48, (16, 185, 129), 1)

    exito, buffer = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    contenido_bytes = buffer.tobytes()
    with open(ruta_destino, "wb") as f:
        f.write(contenido_bytes)

    score, _ = calcular_nitidez_laplaciana(contenido_bytes)
    return f"/static/uploads/{nombre_archivo}", score


def poblar_sistema():
    print(f"-> [1/4] Recreando esquema 3FN en singular sobre motor: {engine.dialect.name.upper()}...")
    if engine.dialect.name == "postgresql":
        with engine.begin() as conn:
            conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    else:
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    print("-> [2/4] Generando evidencias ópticas de respaldo...")
    url_ev_1001, score_1001 = generar_evidencia_sintetica_local(
        "evidencia_ot_1001.jpg", "OT-1001", "ANT-01 (Torre Tenglo)", "ENLACE MW REAJUSTADO | POTENCIA: -48 dBm | VSWR: 1.15 OK"
    )
    url_ev_1002, score_1002 = generar_evidencia_sintetica_local(
        "evidencia_ot_1002.jpg", "OT-1002", "NOD-02 (Nodo FO Coihuin)", "FUSION DE FIBRA HILO 04 EN PROCESO | ATENUACION: 0.02 dB"
    )

    db = SessionLocal()
    try:
        print("-> [3/4] Poblando entidad `empresa_mandante` y `usuario` en 3FN...")
        emp_austral = EmpresaMandante(rut_empresa="76.580.120-7", razon_social="Austral Conectividad SpA", contacto_email="operaciones@australconectividad.cl", sla_objetivo_pct=99.0)
        emp_patagonia = EmpresaMandante(rut_empresa="77.120.450-K", razon_social="Patagonia Redes Ltda.", contacto_email="soporte@patagoniaredes.cl", sla_objetivo_pct=98.5)
        emp_frigorifico = EmpresaMandante(rut_empresa="79.840.110-3", razon_social="Frigorífico Los Lagos (Planta)", contacto_email="mantencion@frigorificoloslagos.cl", sla_objetivo_pct=98.0)
        db.add_all([emp_austral, emp_patagonia, emp_frigorifico])
        db.flush()

        u_supervisor = Usuario(
            nombre_completo="Javier Méndez R.",
            rut="13.450.220-K",
            email="supervisor@tasknode.cl",
            password_hash=hashear_password("super123"),
            rol="SUPERVISOR",
            cargo="Coordinador de Operaciones y Terreno"
        )
        u_cli_austral = Usuario(
            empresa_id=emp_austral.id,
            nombre_completo="Andrea Lagos (Austral Conectividad)",
            rut="15.110.820-4",
            email="cliente@australconectividad.cl",
            password_hash=hashear_password("cliente123"),
            rol="CLIENTE",
            cargo="Jefa de Operaciones Zona Sur"
        )
        u_cli_patagonia = Usuario(
            empresa_id=emp_patagonia.id,
            nombre_completo="Roberto Díaz (Patagonia Redes)",
            rut="14.990.312-1",
            email="operaciones@patagoniaredes.cl",
            password_hash=hashear_password("cliente123"),
            rol="CLIENTE",
            cargo="Supervisor de Contratos"
        )
        u_trab_carlos = Usuario(
            nombre_completo="Carlos Valenzuela M.",
            rut="14.285.631-8",
            email="carlos@tasknode.cl",
            password_hash=hashear_password("terreno123"),
            rol="TRABAJADOR",
            cargo="Jefe de Cuadrilla RF & Microondas"
        )
        u_trab_rodrigo = Usuario(
            nombre_completo="Rodrigo Fuentes A.",
            rut="15.902.438-2",
            email="rodrigo@tasknode.cl",
            password_hash=hashear_password("terreno123"),
            rol="TRABAJADOR",
            cargo="Especialista en Fusión Fibra Óptica"
        )
        u_trab_marcelo = Usuario(
            nombre_completo="Marcelo Soto P.",
            rut="16.892.110-3",
            email="marcelo@tasknode.cl",
            password_hash=hashear_password("terreno123"),
            rol="TRABAJADOR",
            cargo="Técnico Electromecánico de Respaldo UPS"
        )
        db.add_all([u_supervisor, u_cli_austral, u_cli_patagonia, u_trab_carlos, u_trab_rodrigo, u_trab_marcelo])
        db.flush()

        print("-> [4/4] Poblando `activo_industrial`, `orden_trabajo`, `hito_orden` y `bitacora_transicion`...")
        torre_tenglo = ActivoIndustrial(
            empresa_id=emp_austral.id,
            codigo_activo="ANT-01",
            nombre="Torre Celular y Enlace MW Tenglo",
            ubicacion_tecnica="Isla Tenglo · Sector Antenas · Puerto Montt",
            criticidad="ALTA",
            latitud_referencia=-41.4870,
            longitud_referencia=-72.9550
        )
        nodo_coihuin = ActivoIndustrial(
            empresa_id=emp_patagonia.id,
            codigo_activo="NOD-02",
            nombre="Nodo Repetidor FO Coihuín",
            ubicacion_tecnica="Carretera Austral Km 7 · Puerto Montt",
            criticidad="MEDIA",
            latitud_referencia=-41.4812,
            longitud_referencia=-72.8715
        )
        datacenter_alerce = ActivoIndustrial(
            empresa_id=emp_frigorifico.id,
            codigo_activo="DAT-03",
            nombre="Sala de Servidores y Respaldo Alerce",
            ubicacion_tecnica="Av. Norte-Sur · Alerce Norte · Puerto Montt",
            criticidad="ALTA",
            latitud_referencia=-41.3920,
            longitud_referencia=-72.9150
        )
        db.add_all([torre_tenglo, nodo_coihuin, datacenter_alerce])
        db.flush()

        ahora = datetime.utcnow().replace(microsecond=0)

        ot_completada = OrdenTrabajo(
            codigo_ot="OT-1001",
            empresa_id=emp_austral.id,
            activo_id=torre_tenglo.id,
            operario_id=u_trab_carlos.id,
            tipo_mantenimiento="PREVENTIVO",
            prioridad="ALTA",
            estado_actual="OT COMPLETADA",
            descripcion="Mantenimiento preventivo post-temporal: reajuste de parábola de enlace microondas, inspección de cable de bajada RF y sello contra humedad.",
            created_at=ahora - timedelta(days=2)
        )
        ot_ejecucion = OrdenTrabajo(
            codigo_ot="OT-1002",
            empresa_id=emp_patagonia.id,
            activo_id=nodo_coihuin.id,
            operario_id=u_trab_rodrigo.id,
            tipo_mantenimiento="CORRECTIVO",
            prioridad="MEDIA",
            estado_actual="EN EJECUCIÓN",
            descripcion="Reparación de manguito de empalme e inspección OTDR por atenuación en tramo troncal de fibra óptica Carretera Austral.",
            created_at=ahora - timedelta(days=1)
        )
        ot_detenida = OrdenTrabajo(
            codigo_ot="OT-1003",
            empresa_id=emp_frigorifico.id,
            activo_id=datacenter_alerce.id,
            operario_id=u_trab_marcelo.id,
            tipo_mantenimiento="CORRECTIVO",
            prioridad="ALTA",
            estado_actual="DETENIDA POR ANOMALÍA",
            descripcion="Revisión de banco de baterías de respaldo (UPS). Faena pausada en Etapa 2 a la espera de módulo rectificador desde bodega.",
            created_at=ahora - timedelta(hours=18)
        )
        ot_emitida = OrdenTrabajo(
            codigo_ot="OT-1004",
            empresa_id=emp_austral.id,
            activo_id=torre_tenglo.id,
            operario_id=u_trab_rodrigo.id,
            tipo_mantenimiento="INSPECCION",
            prioridad="ALTA",
            estado_actual="EMITIDA",
            descripcion="Inspección ágil post-viento para Austral Conectividad: verificación de tensión de riostras y estado de gabinete.",
            created_at=ahora - timedelta(hours=2)
        )
        db.add_all([ot_completada, ot_ejecucion, ot_detenida, ot_emitida])
        db.flush()

        hitos_por_ot = [
            (ot_completada, [
                ("Etapa 1", "Acreditación de cuadrilla, bloqueo LOTO y ascenso a Torre Tenglo", True),
                ("Etapa 2", "Inspección de guía de onda, conectores RF y sello vulcanizado", True),
                ("Etapa 3", "Reajuste de acimut en parábola MW hasta lograr -48 dBm", True),
                ("Etapa 4", "Prueba de tráfico, fotografía nítida y firma de recepción", True),
            ]),
            (ot_ejecucion, [
                ("Etapa 1", "Señalización vial en Carretera Austral Km 7 y apertura de cámara", True),
                ("Etapa 2", "Preparación de manguito y sangrado de fibra óptica de 48 hilos", True),
                ("Etapa 3", "Fusión por arco de hilos 01 al 12 y sellado termocontraíble", False),
                ("Etapa 4", "Certificación bidireccional con OTDR (< 0.05 dB) y cierre", False),
            ]),
            (ot_detenida, [
                ("Etapa 1", "Aislamiento eléctrico de gabinete UPS y verificación 0.0 V (LOTO)", True),
                ("Etapa 2", "Extracción de módulo rectificador dañado y diagnóstico de bancos", False),
                ("Etapa 3", "Instalación de nuevo módulo rectificador desde bodega central", False),
                ("Etapa 4", "Prueba de transferencia en carga y firma de conformidad", False),
            ]),
            (ot_emitida, [
                ("Etapa 1", "Charla de seguridad en altura, revisión de arnés y bloqueo LOTO", False),
                ("Etapa 2", "Medición con tensiómetro en riostras nivel 1, 2 y 3 post-temporal", False),
                ("Etapa 3", "Reapriete de grilletes, engrase anticorrosivo y sellado de gabinete", False),
                ("Etapa 4", "Evidencia óptica de verticalidad y recepción por Encargado", False),
            ]),
        ]

        for ot_obj, etapas in hitos_por_ot:
            for idx, (dia, titulo, comp) in enumerate(etapas, start=1):
                db.add(HitoOrden(
                    orden_id=ot_obj.id,
                    orden_secuencia=idx,
                    dia=dia,
                    titulo=titulo,
                    completado=comp
                ))
        db.flush()

        bloques = [
            {"orden": ot_completada, "usr": u_trab_carlos, "anterior": "EMITIDA", "nuevo": "EN EJECUCIÓN", "gps": "-41.4870, -72.9550", "ts": ahora - timedelta(hours=28), "obs": "Arribo a sitio de torre Tenglo. Etapas 1 y 2 completadas.", "evidencia_url": None, "laplacian": None, "firma": FIRMA_SVG_PRECARGADA},
            {"orden": ot_completada, "usr": u_trab_carlos, "anterior": "EN EJECUCIÓN", "nuevo": "EN VALIDACIÓN", "gps": "-41.4870, -72.9550", "ts": ahora - timedelta(hours=5), "obs": "Ajuste de acimut realizado. Potencia en -48 dBm. Etapas 3 y 4 completadas.", "evidencia_url": url_ev_1001, "laplacian": score_1001, "firma": FIRMA_SVG_PRECARGADA},
            {"orden": ot_completada, "usr": u_supervisor, "anterior": "EN VALIDACIÓN", "nuevo": "OT COMPLETADA", "gps": "-41.4870, -72.9550", "ts": ahora - timedelta(hours=2), "obs": "Recepción conforme para Austral Conectividad SpA. Cierre de sitio.", "evidencia_url": url_ev_1001, "laplacian": score_1001, "firma": FIRMA_SVG_PRECARGADA},
            {"orden": ot_ejecucion, "usr": u_trab_rodrigo, "anterior": "EMITIDA", "nuevo": "EN EJECUCIÓN", "gps": "-41.4812, -72.8715", "ts": ahora - timedelta(hours=14), "obs": "Etapas 1 y 2 completadas. En preparación para fusión de fibra.", "evidencia_url": url_ev_1002, "laplacian": score_1002, "firma": None},
            {"orden": ot_detenida, "usr": u_trab_marcelo, "anterior": "EMITIDA", "nuevo": "EN EJECUCIÓN", "gps": "-41.3920, -72.9150", "ts": ahora - timedelta(hours=10), "obs": "Etapa 1 completada: Aislamiento LOTO en Sala de Servidores Alerce.", "evidencia_url": None, "laplacian": None, "firma": None},
            {"orden": ot_detenida, "usr": u_trab_marcelo, "anterior": "EN EJECUCIÓN", "nuevo": "DETENIDA POR ANOMALÍA", "gps": "-41.3920, -72.9150", "ts": ahora - timedelta(hours=6), "obs": "Pausa en Etapa 2: Falla interna en módulo rectificador 2. En espera de repuesto.", "evidencia_url": None, "laplacian": None, "firma": None},
        ]

        hash_previo = GENESIS_HASH
        for item in bloques:
            ot_obj = item["orden"]
            usr_obj = item["usr"]
            ts_iso = item["ts"].isoformat()
            payload = construir_payload_canonico(
                hash_previo=hash_previo,
                codigo_ot=ot_obj.codigo_ot,
                estado_anterior=item["anterior"],
                estado_nuevo=item["nuevo"],
                rut_responsable=usr_obj.rut,
                coordenadas_gps=item["gps"],
                timestamp_iso=ts_iso,
            )
            hash_actual = sha256_cadena(payload)

            transicion = BitacoraTransicion(
                orden_id=ot_obj.id,
                usuario_id=usr_obj.id,
                estado_anterior=item["anterior"],
                estado_nuevo=item["nuevo"],
                coordenadas_gps=item["gps"],
                observacion=item["obs"],
                hash_previo=hash_previo,
                hash_cadena=hash_actual,
                timestamp=item["ts"],
                encargado_nombre="Carlos Valenzuela M.",
                encargado_rut="14.285.631-8",
                firma_data=item["firma"]
            )
            db.add(transicion)
            db.flush()

            if item["evidencia_url"]:
                db.add(EvidenciaMultimedia(
                    transicion_id=transicion.id,
                    url_almacenamiento=item["evidencia_url"],
                    laplacian_score=item["laplacian"],
                    aprobado_nitidez=True,
                    created_at=item["ts"],
                ))
            hash_previo = hash_actual

        db.commit()
        print("[OK] Base de datos en 3FN estricta (tablas en singular) poblada con éxito.")
    except Exception as e:
        db.rollback()
        print(f"[ERROR EN SEED]: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    poblar_sistema()