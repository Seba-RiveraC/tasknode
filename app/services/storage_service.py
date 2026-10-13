import os
import uuid
from app.core.config import settings

class StorageService:
    def __init__(self):
        self.conn_str = settings.AZURE_STORAGE_CONNECTION_STRING
        self.container_name = settings.AZURE_CONTAINER_NAME
        self.local_upload_dir = "uploads"
        
        os.makedirs(self.local_upload_dir, exist_ok=True)
        self.azure_client = None

        if self.conn_str:
            try:
                from azure.storage.blob import BlobServiceClient
                self.azure_client = BlobServiceClient.from_connection_string(self.conn_str)
            except Exception as e:
                print(f"[StorageService] Advertencia: Conexión Azure Blob fallida: {e}. Usando disco local.")

    def guardar_archivo(self, archivo_bytes: bytes, filename: str) -> tuple[str, str]:
        """
        Retorna: (url_o_path_accesible, tipo_almacenamiento)
        """
        extension = os.path.splitext(filename)[1] or ".jpg"
        nombre_unico = f"{uuid.uuid4()}{extension}"

        # 1. Intentar Azure Blob Storage
        if self.azure_client:
            try:
                container = self.azure_client.get_container_client(self.container_name)
                if not container.exists():
                    container.create_container(public_access="blob")
                blob = container.get_blob_client(nombre_unico)
                blob.upload_blob(archivo_bytes, overwrite=True)
                return blob.url, "AZURE_BLOB"
            except Exception as e:
                print(f"[StorageService] Error subiendo a Azure: {e}. Fallback a disco local.")

        # 2. Fallback a almacenamiento local
        ruta_local = os.path.join(self.local_upload_dir, nombre_unico)
        with open(ruta_local, "wb") as f:
            f.write(archivo_bytes)
        
        # Devuelve ruta pública relativa servida por FastAPI
        return f"/uploads/{nombre_unico}", "LOCAL_DISK"

storage_service = StorageService()