import hashlib

SALT_SISTEMA = "TASKNODE_RELATIONAL_AUTH_2026"
GENESIS_HASH = "GENESIS_HASH_TASKNODE_0000000000000000000000000000000000000000"


def calcular_hash_sha256(cadena: str) -> str:
    """Calcula el hash SHA-256 inmutable para encadenamiento de auditoría (ISO 55001)."""
    return sha256_cadena(cadena)


def hashear_password(password_plano: str) -> str:
    texto = f"{SALT_SISTEMA}:{password_plano.strip()}"
    return sha256_cadena(texto)


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