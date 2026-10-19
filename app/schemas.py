from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from decimal import Decimal

class Token(BaseModel):
    access_token: str
    token_type: str
    rol: str
    nombre_completo: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UsuarioOut(BaseModel):
    id_usuario: int
    nombre_completo: str
    email: str
    rol: str
    class Config:
        from_attributes = True

class TareaCreate(BaseModel):
    id_faena: int
    id_operario: int
    titulo: str

class HistorialOut(BaseModel):
    id_historial: int
    estado: str
    usuario: str
    fecha_cambio: datetime
    latitud: Decimal
    longitud: Decimal
    url_evidencia: str
    class Config:
        from_attributes = True

class TareaDetailOut(BaseModel):
    id_tarea: int
    titulo: str
    faena: str
    sector: str
    estado_actual: str
    supervisor: str
    operario: str
    fecha_inicio: datetime
    historial_eventos: List[HistorialOut] = []
    class Config:
        from_attributes = True