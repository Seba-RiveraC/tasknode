import os
os.environ["DISABLE_SQLALCHEMY_CEXT"] = "1"

from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "TaskNode Core CMMS"
    API_V1_STR: str = "/api/v1"
    
    # Base de Datos con fallback local
    DATABASE_URL: str = "sqlite:///./tasknode_local.db"
    
    # Azure Blob Storage
    AZURE_STORAGE_CONNECTION_STRING: Optional[str] = None
    AZURE_CONTAINER_NAME: str = "evidencias-tasknode"
    
    # Tolerancia geodésica para frentes de trabajo (metros)
    GEOCERCA_RADIO_METROS: float = 150.0

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()