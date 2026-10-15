from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Text, event, DDL
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
    """
    Implementa el patrón Append-Only Audit Log (Event Sourcing Snapshot).
    Persiste instantáneas inmutables de codigo_ot, operario_responsable y rut_responsable
    para garantizar No Repudio histórico bajo ISO 55001 aunque la OT maestra sea reasignada.
    """
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


# =====================================================================
# CANDADOS DE INMUTABILIDAD FORENSE (HALLAZGO 4 - ISO 55001)
# Bloquea UPDATE y DELETE a nivel de motor SQLite y capa ORM
# =====================================================================

trigger_no_delete = DDL("""
CREATE TRIGGER IF NOT EXISTS tr_bitacora_no_delete
BEFORE DELETE ON bitacora_transiciones
BEGIN
    SELECT RAISE(ABORT, 'VIOLACION ISO 55001: La bitacora criptografica es estrictamente Append-Only. Eliminacion bloqueada.');
END;
""")

trigger_no_update = DDL("""
CREATE TRIGGER IF NOT EXISTS tr_bitacora_no_update
BEFORE UPDATE OF codigo_ot, operario_responsable, rut_responsable, estado_anterior, estado_nuevo, coordenadas_gps, hash_previo, hash_cadena, timestamp
ON bitacora_transiciones
BEGIN
    SELECT RAISE(ABORT, 'VIOLACION ISO 55001: Prohibido alterar campos firmados criptograficamente en bitacora_transiciones.');
END;
""")

event.listen(BitacoraTransicion.__table__, "after_create", trigger_no_delete)
event.listen(BitacoraTransicion.__table__, "after_create", trigger_no_update)