from sqlalchemy import Column, Integer, String, Boolean, DateTime, Numeric, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class Empresa(Base):
    __tablename__ = "empresas"

    id_empresa = Column(Integer, primary_key=True, index=True)
    razon_social = Column(String(150), nullable=False)
    rut = Column(String(20), unique=True, nullable=False, index=True)
    fecha_registro = Column(DateTime, default=datetime.utcnow)

    faenas = relationship("Faena", back_populates="empresa")
    usuarios = relationship("Usuario", back_populates="empresa")
    tareas = relationship("Tarea", back_populates="empresa")


class Faena(Base):
    __tablename__ = "faenas"

    id_faena = Column(Integer, primary_key=True, index=True)
    id_empresa = Column(Integer, ForeignKey("empresas.id_empresa", ondelete="RESTRICT"), nullable=False)
    nombre_faena = Column(String(150), nullable=False)
    sector_geografico = Column(String(150), nullable=False)
    estado_activa = Column(Boolean, default=True)

    empresa = relationship("Empresa", back_populates="faenas")
    tareas = relationship("Tarea", back_populates="faena")


class Usuario(Base):
    __tablename__ = "usuarios"

    id_usuario = Column(Integer, primary_key=True, index=True)
    id_empresa = Column(Integer, ForeignKey("empresas.id_empresa", ondelete="RESTRICT"), nullable=False)
    nombre_completo = Column(String(150), nullable=False)
    email = Column(String(150), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    rol = Column(String(50), nullable=False)  # Admin, Supervisor, Operario
    activo = Column(Boolean, default=True)

    empresa = relationship("Empresa", back_populates="usuarios")
    tareas_supervisadas = relationship("Tarea", foreign_keys="Tarea.id_supervisor", back_populates="supervisor")
    tareas_asignadas = relationship("Tarea", foreign_keys="Tarea.id_operario", back_populates="operario")
    historial_cambios = relationship("HistorialEstado", back_populates="usuario")


class EstadoTarea(Base):
    __tablename__ = "estados_tarea"

    id_estado = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(20), unique=True, nullable=False)  # PEND, PROG, COMP, RECH
    nombre = Column(String(50), nullable=False)

    tareas = relationship("Tarea", back_populates="estado_actual")
    historial = relationship("HistorialEstado", back_populates="estado")


class Tarea(Base):
    __tablename__ = "tareas"

    id_tarea = Column(Integer, primary_key=True, index=True)
    id_empresa = Column(Integer, ForeignKey("empresas.id_empresa", ondelete="RESTRICT"), nullable=False)
    id_faena = Column(Integer, ForeignKey("faenas.id_faena", ondelete="RESTRICT"), nullable=False)
    id_supervisor = Column(Integer, ForeignKey("usuarios.id_usuario", ondelete="RESTRICT"), nullable=False)
    id_operario = Column(Integer, ForeignKey("usuarios.id_usuario", ondelete="RESTRICT"), nullable=False)
    id_estado = Column(Integer, ForeignKey("estados_tarea.id_estado", ondelete="RESTRICT"), nullable=False)
    titulo = Column(String(200), nullable=False)
    fecha_inicio = Column(DateTime, default=datetime.utcnow)

    empresa = relationship("Empresa", back_populates="tareas")
    faena = relationship("Faena", back_populates="tareas")
    supervisor = relationship("Usuario", foreign_keys=[id_supervisor], back_populates="tareas_supervisadas")
    operario = relationship("Usuario", foreign_keys=[id_operario], back_populates="tareas_asignadas")
    estado_actual = relationship("EstadoTarea", back_populates="tareas")
    historial = relationship("HistorialEstado", back_populates="tarea", cascade="all, delete-orphan", order_by="desc(HistorialEstado.fecha_cambio)")


class HistorialEstado(Base):
    __tablename__ = "historial_estados"

    id_historial = Column(Integer, primary_key=True, index=True)
    id_tarea = Column(Integer, ForeignKey("tareas.id_tarea", ondelete="CASCADE"), nullable=False)
    id_estado = Column(Integer, ForeignKey("estados_tarea.id_estado", ondelete="RESTRICT"), nullable=False)
    id_usuario = Column(Integer, ForeignKey("usuarios.id_usuario", ondelete="RESTRICT"), nullable=False)
    fecha_cambio = Column(DateTime, default=datetime.utcnow)
    latitud = Column(Numeric(10, 7), nullable=False)
    longitud = Column(Numeric(10, 7), nullable=False)
    url_evidencia = Column(String(255), nullable=False)

    tarea = relationship("Tarea", back_populates="historial")
    estado = relationship("EstadoTarea", back_populates="historial")
    usuario = relationship("Usuario", back_populates="historial_cambios")