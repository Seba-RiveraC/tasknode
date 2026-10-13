from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.orm import relationship
from app.core.database import Base

class ActivoIndustrial(Base):
    __tablename__ = "activos_industriales"

    id = Column(Integer, primary_key=True, index=True)
    codigo_activo = Column(String(50), unique=True, index=True, nullable=False)
    nombre = Column(String(120), nullable=False)
    ubicacion_tecnica = Column(String(150), nullable=False)
    criticidad = Column(String(20), default="MEDIA", nullable=False)
    latitud_referencia = Column(Float, nullable=False, default=-41.4693)
    longitud_referencia = Column(Float, nullable=False, default=-72.9424)

    ordenes = relationship("OrdenTrabajo", back_populates="activo")


class OrdenTrabajo(Base):
    __tablename__ = "ordenes_trabajo"

    id = Column(Integer, primary_key=True, index=True)
    codigo_ot = Column(String(60), unique=True, index=True, nullable=False)
    activo_id = Column(Integer, ForeignKey("activos_industriales.id"), nullable=False)
    tipo_mantenimiento = Column(String(30), nullable=False)
    prioridad = Column(String(20), default="MEDIA", nullable=False)
    estado_actual = Column(String(30), default="EMITIDA", nullable=False)
    operario_responsable = Column(String(100), nullable=False)
    rut_responsable = Column(String(20), nullable=False)
    descripcion = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    activo = relationship("ActivoIndustrial", back_populates="ordenes")
    transiciones = relationship("BitacoraTransicion", back_populates="orden")


class BitacoraTransicion(Base):
    __tablename__ = "bitacora_transiciones"

    id = Column(Integer, primary_key=True, index=True)
    orden_id = Column(Integer, ForeignKey("ordenes_trabajo.id"), nullable=False)
    codigo_ot = Column(String(60), index=True, nullable=False)
    operario_responsable = Column(String(100), nullable=False)
    rut_responsable = Column(String(20), nullable=False)
    estado_anterior = Column(String(30), nullable=False)
    estado_nuevo = Column(String(30), nullable=False)
    coordenadas_gps = Column(String(50), nullable=False)
    observacion = Column(Text, nullable=True)
    hash_previo = Column(String(64), nullable=False)
    hash_cadena = Column(String(64), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    evidencia_url = Column(String(255), nullable=True)
    laplacian_score = Column(Float, nullable=True)

    orden = relationship("OrdenTrabajo", back_populates="transiciones")
    evidencias = relationship("EvidenciaMultimedia", back_populates="transicion")


class EvidenciaMultimedia(Base):
    __tablename__ = "evidencias_multimedia"

    id = Column(Integer, primary_key=True, index=True)
    transicion_id = Column(Integer, ForeignKey("bitacora_transiciones.id"), nullable=False)
    url_almacenamiento = Column(String(255), nullable=False)
    laplacian_score = Column(Float, nullable=True)
    aprobado_nitidez = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    transicion = relationship("BitacoraTransicion", back_populates="evidencias")