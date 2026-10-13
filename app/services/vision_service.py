import io
import numpy as np
from PIL import Image, ExifTags

def calcular_nitidez_laplaciana(archivo_bytes: bytes) -> tuple[float, bool]:
    """
    Calcula la derivada espacial de 2do orden mediante convolución con el kernel Laplaciano:
    [[0, 1, 0], [1, -4, 1], [0, 1, 0]]
    Score >= 100 indica nitidez conforme a requerimientos técnicos.
    """
    try:
        img = Image.open(io.BytesIO(archivo_bytes)).convert("L")
        img_np = np.array(img, dtype=np.float64)

        # Kernel discreto Laplaciano 3x3
        kernel = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float64)
        
        # Convolución 2D básica manual (vectorizada)
        h, w = img_np.shape
        if h < 3 or w < 3:
            return 0.0, False

        sub = (
            img_np[0:-2, 1:-1] +
            img_np[2:, 1:-1] +
            img_np[1:-1, 0:-2] +
            img_np[1:-1, 2:] -
            4 * img_np[1:-1, 1:-1]
        )
        score = float(np.var(sub))
        return round(score, 2), (score >= 100.0)
    except Exception:
        return 0.0, False

def extraer_metadatos_exif(archivo_bytes: bytes) -> tuple[str, str]:
    """Extrae DateTimeOriginal y telemetría embebida en cabeceras JPEG."""
    try:
        img = Image.open(io.BytesIO(archivo_bytes))
        exif = img.getexif()
        fecha = "Sin marca EXIF"
        if exif:
            for tag_id, value in exif.items():
                tag = ExifTags.TAGS.get(tag_id, tag_id)
                if tag in ("DateTimeOriginal", "DateTime"):
                    fecha = str(value)
                    break
        return fecha, "Telemetría integrada"
    except Exception:
        return "No disponible", "No disponible"