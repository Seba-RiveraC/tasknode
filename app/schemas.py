# modelos de pydantic (validacion)

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# Lo que la API exige recibir del celular del operario
class HistorialCreate(BaseModel):
    tarea_id: int
    operario_id: int
    estado: str
    coordenadas_gps: str
    observacion: Optional[str] = None


# Lo que la API responde después de guardar
class HistorialResponse(HistorialCreate):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True
