import os
import uuid
from pathlib import Path
import cv2
import numpy as np
from fastapi import HTTPException
from dotenv import load_dotenv

load_dotenv()

AZURE_CONN_STR = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "").strip()
AZURE_CONTAINER = os.getenv("AZURE_CONTAINER_NAME", "evidencias").strip()

# Límite duro de protección de cuota: 5 MB máximo por subida
MAX_UPLOAD_BYTES = 5 * 1024 * 1024

UPLOAD_DIR = Path("frontend/static/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def optimizar_imagen_para_nube(contenido_bytes: bytes) -> bytes:
    """
    Decodifica la imagen, limita su resolución máxima a 1280px y la comprime en JPEG (80%).
    Reduce el peso en un ~90% para proteger los créditos de Azure Blob Storage
    y elimina metadatos EXIF ocultos (Privacidad por Diseño - Ley 21.719).
    """
    try:
        arr = np.frombuffer(contenido_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return contenido_bytes

        alto, ancho = img.shape[:2]
        max_dim = 1280
        if max(alto, ancho) > max_dim:
            escala = max_dim / float(max(alto, ancho))
            nuevo_ancho = int(ancho * escala)
            nuevo_alto = int(alto * escala)
            img = cv2.resize(img, (nuevo_ancho, nuevo_alto), interpolation=cv2.INTER_AREA)

        exito, buffer = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
        if exito:
            return buffer.tobytes()
        return contenido_bytes
    except Exception:
        return contenido_bytes


def almacenar_evidencia(nombre_original: str, contenido_bytes: bytes) -> str:
    """
    Valida cuota de seguridad, optimiza el binario y lo sube a Azure Blob Storage.
    Si no hay credenciales o conexión a internet, guarda en disco local como fallback.
    """
    if len(contenido_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Archivo excede el límite de seguridad de cuota Cloud (Máximo 5 MB)."
        )

    bytes_optimizados = optimizar_imagen_para_nube(contenido_bytes)
    nombre_unico = f"evidencia_{uuid.uuid4().hex[:12]}.jpg"

    # 1. Subida a Microsoft Azure Blob Storage si existe cadena de conexión en .env
    if AZURE_CONN_STR:
        try:
            from azure.storage.blob import BlobServiceClient, ContentSettings

            blob_service_client = BlobServiceClient.from_connection_string(AZURE_CONN_STR)
            blob_client = blob_service_client.get_blob_client(
                container=AZURE_CONTAINER,
                blob=nombre_unico
            )

            blob_client.upload_blob(
                bytes_optimizados,
                overwrite=True,
                content_settings=ContentSettings(
                    content_type="image/jpeg",
                    cache_control="public, max-age=86400"
                )
            )
            return blob_client.url
        except Exception as e:
            print(f"[ADVERTENCIA AZURE BLOB] Fallo en subida Cloud, activando respaldo local: {e}")

    # 2. Fallback Local automático (para operar sin red o sin .env configurado)
    ruta_destino = UPLOAD_DIR / nombre_unico
    with open(ruta_destino, "wb") as f:
        f.write(bytes_optimizados)

    return f"/static/uploads/{nombre_unico}"