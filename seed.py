import os
os.environ["DISABLE_SQLALCHEMY_CEXT"] = "1"

from pathlib import Path
from datetime import datetime, timedelta
import numpy as np
import cv2

from app.core.database import SessionLocal, engine, Base
from app.models.operational import (
    ActivoIndustrial,
    OrdenTrabajo,
    BitacoraTransicion,
    EvidenciaMultimedia,
)
from app.api.v1.endpoints.transitions import (
    construir_payload_canonico,
    sha256_cadena,
    GENESIS_HASH,
)
from app.services.vision_service import calcular_nitidez_laplaciana


def generar_evidencia_sintetica_local(nombre_archivo: str, codigo_ot: str, equipo: str, param_txt: str) -> tuple[str, float]:
    """Genera una imagen técnica nítida (Score Laplaciano > 100) para pruebas de infraestructura de telecomunicaciones."""
    upload_dir = Path("frontend/static/uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    ruta_destino = upload_dir / nombre_archivo

    # Lienzo técnico de campo 800x500
    img = np.full((500, 800, 3), (20, 24, 30), dtype=np.uint8)

    # Retícula de alta frecuencia espacial (garantiza varianza Laplaciana > 100)
    for x in range(0, 800, 20):
        color = (40, 48, 60) if x % 100 != 0 else (70, 85, 105)
        cv2.line(img, (x, 0), (x, 500), color, 1)
    for y in range(0, 500, 20):
        color = (40, 48, 60) if y % 100 != 0 else (70, 85, 105)
        cv2.line(img, (0, y), (800, y), color, 1)

    # Simulación visual de infraestructura de telecomunicaciones (Torre/Nodo)
    cv2.rectangle(img, (380, 120), (420, 380), (160, 175, 190), 2)
    cv2.line(img, (380, 120), (420, 380), (14, 165, 233), 1)
    cv2.line(img, (420, 120), (380, 380), (14, 165, 233), 1)
    cv2.circle(img, (400, 160), 45, (245, 158, 11), 2)
    cv2.circle(img, (400, 160), 10, (16, 185, 129), -1)

    # Encabezado técnico OSD
    cv2.rectangle(img, (20, 20), (780, 80), (12, 15, 20), -1)
    cv2.putText(img, f"SURTEL TELECOM VERIFIER | {codigo_ot}", (35, 50),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (245, 158, 11), 2)
    cv2.putText(img, f"INFRAESTRUCTURA: {equipo} | ZONA SUR", (35, 72),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 210, 225), 1)

    # Pie de datos
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
    print("-> [1/3] Regenerando base de datos e instalando triggers inmutables...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    print("-> [2/3] Creando imágenes de evidencia sintética nítida de telecomunicaciones...")
    url_ev_1001, score_1001 = generar_evidencia_sintetica_local(
        "evidencia_ot_1001.jpg",
        "OT-1001",
        "ANT-01 (Torre Celular Tenglo)",
        "ENLACE MW REAJUSTADO | POTENCIA: -48 dBm | VSWR: 1.15 OK"
    )
    url_ev_1002, score_1002 = generar_evidencia_sintetica_local(
        "evidencia_ot_1002.jpg",
        "OT-1002",
        "NOD-02 (Nodo FO Coihuin)",
        "FUSION DE FIBRA HILO 04 EN PROCESO | ATENUACION: 0.02 dB"
    )

    db = SessionLocal()
    try:
        print("-> [3/3] Registrando infraestructura de SurTel Redes y órdenes de trabajo...")
        
        # 1. Catálogo de Nodos e Infraestructura de Telecomunicaciones (Zona Sur: Puerto Montt / Chiloé)
        torre_tenglo = ActivoIndustrial(
            codigo_activo="ANT-01",
            nombre="Torre Celular y Enlace MW Tenglo",
            ubicacion_tecnica="Isla Tenglo · Sector Antenas · Puerto Montt",
            criticidad="ALTA",
            latitud_referencia=-41.4870,
            longitud_referencia=-72.9550
        )
        nodo_coihuin = ActivoIndustrial(
            codigo_activo="NOD-02",
            nombre="Nodo Repetidor FO Coihuín",
            ubicacion_tecnica="Carretera Austral Km 7 · Puerto Montt",
            criticidad="MEDIA",
            latitud_referencia=-41.4812,
            longitud_referencia=-72.8715
        )
        datacenter_alerce = ActivoIndustrial(
            codigo_activo="DAT-03",
            nombre="Centro de Distribución y Servidores Alerce",
            ubicacion_tecnica="Av. Norte-Sur · Alerce Norte · Puerto Montt",
            criticidad="ALTA",
            latitud_referencia=-41.3920,
            longitud_referencia=-72.9150
        )
        db.add_all([torre_tenglo, nodo_coihuin, datacenter_alerce])
        db.flush()

        ahora = datetime.utcnow().replace(microsecond=0)

        # 2. Órdenes de Trabajo del Departamento de Instalación y Mantenimiento de Telecomunicaciones
        # CASO 1: OT COMPLETADA (Técnico de Terreno: Carlos Valenzuela M.)
        ot_completada = OrdenTrabajo(
            codigo_ot="OT-1001",
            activo_id=torre_tenglo.id,
            tipo_mantenimiento="PREVENTIVO",
            prioridad="ALTA",
            estado_actual="OT COMPLETADA",
            operario_responsable="Carlos Valenzuela M.",
            rut_responsable="14.285.631-8",
            descripcion="Mantenimiento preventivo post-temporal: reajuste de parábola de enlace microondas, inspección de cable de bajada RF y sello contra humedad.",
            created_at=ahora - timedelta(hours=3)
        )

        # CASO 2: OT EN EJECUCIÓN (Especialista en Fibra Óptica: Rodrigo Fuentes A.)
        ot_ejecucion = OrdenTrabajo(
            codigo_ot="OT-1002",
            activo_id=nodo_coihuin.id,
            tipo_mantenimiento="CORRECTIVO",
            prioridad="MEDIA",
            estado_actual="EN EJECUCIÓN",
            operario_responsable="Rodrigo Fuentes A.",
            rut_responsable="15.902.438-2",
            descripcion="Reparación de manguito de empalme e inspección OTDR por atenuación en tramo de fibra óptica Carretera Austral.",
            created_at=ahora - timedelta(hours=1)
        )

        # CASO 3: OT DETENIDA POR ANOMALÍA (Técnico Electrónico: Marcelo Soto P.)
        ot_detenida = OrdenTrabajo(
            codigo_ot="OT-1003",
            activo_id=datacenter_alerce.id,
            tipo_mantenimiento="CORRECTIVO",
            prioridad="ALTA",
            estado_actual="DETENIDA POR ANOMALÍA",
            operario_responsable="Marcelo Soto P.",
            rut_responsable="16.892.110-3",
            descripcion="Revisión de banco de baterías de respaldo (UPS). Faena pausada a la espera de módulo rectificador desde bodega central.",
            created_at=ahora - timedelta(minutes=45)
        )

        # CASO 4: OT EMITIDA (Inspectora de Redes: Camila Morales T. - Lista para ejecutar en vivo)
        ot_emitida = OrdenTrabajo(
            codigo_ot="OT-1004",
            activo_id=torre_tenglo.id,
            tipo_mantenimiento="INSPECCION",
            prioridad="ALTA",
            estado_actual="EMITIDA",
            operario_responsable="Camila Morales T.",
            rut_responsable="17.341.890-5",
            descripcion="Inspección de rutina post-viento: verificación de tensión de riostras (vientos de anclaje) y estado de gabinete de intemperie.",
            created_at=ahora - timedelta(minutes=15)
        )

        db.add_all([ot_completada, ot_ejecucion, ot_detenida, ot_emitida])
        db.flush()

        # 3. Trazabilidad Criptográfica SHA-256
        bloques = [
            # Historial de OT-1001 (Carlos Valenzuela M.)
            {
                "orden": ot_completada,
                "anterior": "EMITIDA",
                "nuevo": "EN EJECUCIÓN",
                "gps": "-41.4870, -72.9550",
                "ts": ahora - timedelta(hours=2, minutes=30),
                "obs": "Arribo a sitio de torre Tenglo. Protocolo de trabajo en altura y EPP verificado.",
                "evidencia_url": None,
                "laplacian": None,
            },
            {
                "orden": ot_completada,
                "anterior": "EN EJECUCIÓN",
                "nuevo": "EN VALIDACIÓN",
                "gps": "-41.4870, -72.9550",
                "ts": ahora - timedelta(hours=1, minutes=15),
                "obs": "Ajuste de acimut realizado. Potencia de enlace estabilizada en -48 dBm. Adjunto captura de analizador de espectro.",
                "evidencia_url": url_ev_1001,
                "laplacian": score_1001,
            },
            {
                "orden": ot_completada,
                "anterior": "EN VALIDACIÓN",
                "nuevo": "OT COMPLETADA",
                "gps": "-41.4870, -72.9550",
                "ts": ahora - timedelta(minutes=50),
                "obs": "Recepción conforme por Jefe de Redes. Cierre de sitio e inmutabilidad garantizada.",
                "evidencia_url": url_ev_1001,
                "laplacian": score_1001,
            },
            # Historial de OT-1002 (Rodrigo Fuentes A.)
            {
                "orden": ot_ejecucion,
                "anterior": "EMITIDA",
                "nuevo": "EN EJECUCIÓN",
                "gps": "-41.4812, -72.8715",
                "ts": ahora - timedelta(minutes=40),
                "obs": "Instalación de fusión de fibra óptica iniciada en cámara subterránea Coihuín.",
                "evidencia_url": url_ev_1002,
                "laplacian": score_1002,
            },
            # Historial de OT-1003 (Marcelo Soto P.)
            {
                "orden": ot_detenida,
                "anterior": "EMITIDA",
                "nuevo": "EN EJECUCIÓN",
                "gps": "-41.3920, -72.9150",
                "ts": ahora - timedelta(minutes=30),
                "obs": "Diagnóstico de UPS en Datacenter Alerce iniciado.",
                "evidencia_url": None,
                "laplacian": None,
            },
            {
                "orden": ot_detenida,
                "anterior": "EN EJECUCIÓN",
                "nuevo": "DETENIDA POR ANOMALÍA",
                "gps": "-41.3920, -72.9150",
                "ts": ahora - timedelta(minutes=15),
                "obs": "Falla interna en módulo rectificador 2. Trabajo en pausa hasta arribo de repuesto desde bodega central.",
                "evidencia_url": None,
                "laplacian": None,
            },
        ]

        hash_previo = GENESIS_HASH
        for item in bloques:
            ot_obj = item["orden"]
            ts_iso = item["ts"].isoformat()
            payload = construir_payload_canonico(
                hash_previo=hash_previo,
                codigo_ot=ot_obj.codigo_ot,
                estado_anterior=item["anterior"],
                estado_nuevo=item["nuevo"],
                rut_responsable=ot_obj.rut_responsable,
                coordenadas_gps=item["gps"],
                timestamp_iso=ts_iso,
            )
            hash_actual = sha256_cadena(payload)

            transicion = BitacoraTransicion(
                orden_id=ot_obj.id,
                codigo_ot=ot_obj.codigo_ot,
                operario_responsable=ot_obj.operario_responsable,
                rut_responsable=ot_obj.rut_responsable,
                estado_anterior=item["anterior"],
                estado_nuevo=item["nuevo"],
                coordenadas_gps=item["gps"],
                observacion=item["obs"],
                hash_previo=hash_previo,
                hash_cadena=hash_actual,
                timestamp=item["ts"],
                evidencia_url=item["evidencia_url"],
                laplacian_score=item["laplacian"],
            )
            db.add(transicion)
            db.flush()

            if item["evidencia_url"]:
                evidencia = EvidenciaMultimedia(
                    transicion_id=transicion.id,
                    url_almacenamiento=item["evidencia_url"],
                    laplacian_score=item["laplacian"],
                    aprobado_nitidez=True,
                    created_at=item["ts"],
                )
                db.add(evidencia)

            hash_previo = hash_actual

        db.commit()
        print("=========================================================================")
        print("[OK] Base de datos poblada con éxito para la empresa SurTel Redes Telecom.")
        print(f"     - 3 Nodos/Torres registrados (Tenglo, Coihuín, Alerce Datacenter)")
        print(f"     - 4 Órdenes de Mantenimiento e Instalación de Telecomunicaciones")
        print(f"     - Técnicos asignados: Carlos, Rodrigo, Marcelo y Camila")
        print(f"     - Cadena SHA-256 inicializada con {len(bloques)} transacciones inmutables")
        print("=========================================================================")
    except Exception as e:
        db.rollback()
        print(f"[ERROR EN SEED]: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    poblar_sistema()