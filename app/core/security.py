import hashlib

def calcular_hash_sha256(cadena: str) -> str:
    """Calcula el hash SHA-256 inmutable para encadenamiento de auditoría (ISO 55001)."""
    return hashlib.sha256(cadena.encode("utf-8")).hexdigest()