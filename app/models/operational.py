from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Text, event, DDL
from sqlalchemy.orm import relationship
from app.core.database import Base


class EmpresaMandante(Base):
    __tablename__ = "empresa_mandante"

    id = Column(Integer, primary_key=True, index=True)
    rut_empresa = Column(String(20), unique=True, index=True, nullable=False)
    razon_social = Column(String(120), unique=True, nullable=False)
    contacto_email = Column(String(100), nullable=True)
    sla_objetivo_pct = Column(Float, default=98.0, nullable=False)
    activa = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    usuarios = relationship("Usuario", back_populates="empresa")
    activos = relationship("ActivoIndustrial", back_populates="empresa")
    ordenes = relationship("OrdenTrabajo", back_populates="empresa")


class Usuario(Base):
    __tablename__ = "usuario"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresa_mandante.id"), nullable=True)
    nombre_completo = Column(String(100), nullable=False)
    rut = Column(String(20), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    password_hash = Column(String(128), nullable=False)
    rol = Column(String(20), default="TRABAJADOR", nullable=False)  # SUPERVISOR, CLIENTE, TRABAJADOR
    cargo = Column(String(80), default="Técnico de Terreno", nullable=False)
    activo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    empresa = relationship("EmpresaMandante", back_populates="usuarios")
    ordenes_asignadas = relationship("OrdenTrabajo", back_populates="operario")
    transiciones = relationship("BitacoraTransicion", back_populates="usuario")


class ActivoIndustrial(Base):
    __tablename__ = "activo_industrial"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresa_mandante.id"), nullable=False)
    codigo_activo = Column(String(50), unique=True, index=True, nullable=False)
    nombre = Column(String(120), nullable=False)
    ubicacion_tecnica = Column(String(150), nullable=False)
    criticidad = Column(String(20), default="MEDIA", nullable=False)
    latitud_referencia = Column(Float, nullable=False, default=-41.4870)
    longitud_referencia = Column(Float, nullable=False, default=-72.9550)

    empresa = relationship("EmpresaMandante", back_populates="activos")
    ordenes = relationship("OrdenTrabajo", back_populates="activo")


class OrdenTrabajo(Base):
    __tablename__ = "orden_trabajo"

    id = Column(Integer, primary_key=True, index=True)
    codigo_ot = Column(String(60), unique=True, index=True, nullable=False)

    # 3FN Estricta: Referencias por Llave Foránea sin duplicar textos de cliente ni operario
    empresa_id = Column(Integer, ForeignKey("empresa_mandante.id"), nullable=False)
    activo_id = Column(Integer, ForeignKey("activo_industrial.id"), nullable=False)
    operario_id = Column(Integer, ForeignKey("usuario.id"), nullable=False)

    tipo_mantenimiento = Column(String(30), nullable=False)
    prioridad = Column(String(20), default="MEDIA", nullable=False)
    estado_actual = Column(String(30), default="EMITIDA", nullable=False)
    descripcion = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    fecha_limite = Column(DateTime, nullable=True)

    empresa = relationship("EmpresaMandante", back_populates="ordenes")
    activo = relationship("ActivoIndustrial", back_populates="ordenes")
    operario = relationship("Usuario", back_populates="ordenes_asignadas")
    hitos = relationship(
        "HitoOrden",
        back_populates="orden",
        cascade="all, delete-orphan",
        order_by="HitoOrden.orden_secuencia.asc()"
    )
    transiciones = relationship(
        "BitacoraTransicion",
        back_populates="orden",
        order_by="BitacoraTransicion.id.asc()"
    )


class HitoOrden(Base):
    __tablename__ = "hito_orden"

    id = Column(Integer, primary_key=True, index=True)
    orden_id = Column(Integer, ForeignKey("orden_trabajo.id", ondelete="CASCADE"), nullable=False)
    orden_secuencia = Column(Integer, nullable=False, default=1)
    dia = Column(String(40), nullable=False)
    titulo = Column(String(255), nullable=False)
    completado = Column(Boolean, default=False, nullable=False)

    orden = relationship("OrdenTrabajo", back_populates="hitos")


class BitacoraTransicion(Base):
    __tablename__ = "bitacora_transicion"

    id = Column(Integer, primary_key=True, index=True)
    # 3FN Estricta: Vinculado a orden_trabajo y usuario por FK sin repetir codigo_ot ni nombre_operario
    orden_id = Column(Integer, ForeignKey("orden_trabajo.id"), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuario.id"), nullable=False)

    estado_anterior = Column(String(30), nullable=False)
    estado_nuevo = Column(String(30), nullable=False)
    coordenadas_gps = Column(String(50), nullable=False)
    observacion = Column(Text, nullable=True)
    hash_previo = Column(String(64), nullable=False)
    hash_cadena = Column(String(64), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)

    encargado_nombre = Column(String(100), nullable=True)
    encargado_rut = Column(String(20), nullable=True)
    firma_data = Column(Text, nullable=True)

    orden = relationship("OrdenTrabajo", back_populates="transiciones")
    usuario = relationship("Usuario", back_populates="transiciones")
    evidencias = relationship(
        "EvidenciaMultimedia",
        back_populates="transicion",
        order_by="EvidenciaMultimedia.id.asc()"
    )
    registro_terreno = relationship("RegistroTerreno", uselist=False)


class EvidenciaMultimedia(Base):
    __tablename__ = "evidencia_multimedia"

    id = Column(Integer, primary_key=True, index=True)
    transicion_id = Column(Integer, ForeignKey("bitacora_transicion.id", ondelete="CASCADE"), nullable=False)
    url_almacenamiento = Column(String(255), nullable=False)
    laplacian_score = Column(Float, nullable=True)
    aprobado_nitidez = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    transicion = relationship("BitacoraTransicion", back_populates="evidencias")


class RegistroTerreno(Base):
    __tablename__ = "registro_terreno"

    id = Column(String(36), primary_key=True)
    transicion_id = Column(Integer, ForeignKey("bitacora_transicion.id"), nullable=False, unique=True)
    tipo = Column(String(30), nullable=False)
    fecha_dispositivo = Column(String(40), nullable=False)


class PruebaSinGeocerca(Base):
    __tablename__ = "prueba_sin_geocerca"

    transicion_id = Column(Integer, ForeignKey("bitacora_transicion.id"), primary_key=True)


class SesionPanel(Base):
    __tablename__ = "sesion_panel"

    token_hash = Column(String(64), primary_key=True)
    usuario_id = Column(Integer, ForeignKey("usuario.id"), nullable=False)
    expira_en = Column(DateTime, nullable=False)


# =====================================================================
# CANDADOS DE INMUTABILIDAD MULTI-MOTOR SOBRE `bitacora_transicion`
# =====================================================================

sqlite_no_delete = DDL("""
CREATE TRIGGER IF NOT EXISTS tr_bitacora_no_delete
BEFORE DELETE ON bitacora_transicion
BEGIN
    SELECT RAISE(ABORT, 'VIOLACION ISO 55001: Bitacora Append-Only. Eliminacion bloqueada.');
END;
""").execute_if(dialect="sqlite")

sqlite_no_update = DDL("""
CREATE TRIGGER IF NOT EXISTS tr_bitacora_no_update
BEFORE UPDATE OF orden_id, usuario_id, estado_anterior, estado_nuevo, coordenadas_gps, hash_previo, hash_cadena, timestamp
ON bitacora_transicion
BEGIN
    SELECT RAISE(ABORT, 'VIOLACION ISO 55001: Prohibido alterar campos firmados en bitacora_transicion.');
END;
""").execute_if(dialect="sqlite")

pg_func_inmutable = DDL("""
CREATE OR REPLACE FUNCTION fn_proteger_bitacora_iso55001()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'VIOLACION ISO 55001: La bitacora criptografica es estrictamente Append-Only.';
END;
$$ LANGUAGE plpgsql;
""").execute_if(dialect="postgresql")

pg_tr_no_delete = DDL("""
DROP TRIGGER IF EXISTS tr_bitacora_no_delete ON bitacora_transicion;
CREATE TRIGGER tr_bitacora_no_delete
BEFORE DELETE ON bitacora_transicion
FOR EACH ROW EXECUTE FUNCTION fn_proteger_bitacora_iso55001();
""").execute_if(dialect="postgresql")

pg_tr_no_update = DDL("""
DROP TRIGGER IF EXISTS tr_bitacora_no_update ON bitacora_transicion;
CREATE TRIGGER tr_bitacora_no_update
BEFORE UPDATE OF orden_id, usuario_id, estado_anterior, estado_nuevo, coordenadas_gps, hash_previo, hash_cadena, timestamp
ON bitacora_transicion
FOR EACH ROW EXECUTE FUNCTION fn_proteger_bitacora_iso55001();
""").execute_if(dialect="postgresql")

event.listen(BitacoraTransicion.__table__, "after_create", sqlite_no_delete)
event.listen(BitacoraTransicion.__table__, "after_create", sqlite_no_update)
event.listen(BitacoraTransicion.__table__, "after_create", pg_func_inmutable)
event.listen(BitacoraTransicion.__table__, "after_create", pg_tr_no_delete)
event.listen(BitacoraTransicion.__table__, "after_create", pg_tr_no_update)