# Tablas de SQLAlchemy

from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.sql import func

from app.database import Base


class HistorialEstado(Base):
    __tablename__ = "historial_estados"

    id = Column(Integer, primary_key=True, index=True)
    tarea_id = Column(Integer, index=True)
    operario_id = Column(Integer, index=True)
    estado = Column(String, index=True)  # Ej: "En progreso", "Detenida"
    coordenadas_gps = Column(String)
    observacion = Column(String, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
