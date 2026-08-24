from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum
from sqlalchemy.orm import declarative_base, relationship
import enum

Base = declarative_base()

# 1. Definición de Roles y Estados
class RolUsuario(str, enum.Enum):
    ADMIN = "ADMIN"
    TECNICO = "TECNICO"

class EstadoAvance(str, enum.Enum):
    VERDE = "VERDE"
    AMARILLO = "AMARILLO"
    ROJO = "ROJO"

# 2. Tabla Empresa (El núcleo del Multi-Tenant)
class Empresa(Base):
    __tablename__ = "empresas"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    rut = Column(String, unique=True, index=True, nullable=False)
    fecha_creacion = Column(DateTime, default=datetime.utcnow)

    # Relaciones
    usuarios = relationship("Usuario", back_populates="empresa", cascade="all, delete-orphan")
    reportes = relationship("ReporteTerreno", back_populates="empresa", cascade="all, delete-orphan")

# 3. Tabla Usuarios (Técnicos y Coordinadores)
class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True) # Clave Multi-Tenant
    nombre = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    rol = Column(Enum(RolUsuario), default=RolUsuario.TECNICO, nullable=False)

    # Relaciones
    empresa = relationship("Empresa", back_populates="usuarios")
    reportes = relationship("ReporteTerreno", back_populates="tecnico")

# 4. Tabla Reportes (La recolección de datos en terreno)
class ReporteTerreno(Base):
    __tablename__ = "reportes_terreno"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True) # Clave Multi-Tenant
    tecnico_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    
    faena_nombre = Column(String, nullable=False)
    estado = Column(Enum(EstadoAvance), nullable=False)
    motivo_bloqueo = Column(String, nullable=True)
    notas = Column(String, nullable=True)
    
    # Geolocalización 
    latitud = Column(Float, nullable=True)
    longitud = Column(Float, nullable=True)
    
    # Evidencia
    foto_url = Column(String, nullable=True) # Aquí guardaremos la ruta del Azure Blob Storage
    
    fecha_reporte = Column(DateTime, default=datetime.utcnow)
    
    # Sincronización Offline (Para la PWA)
    is_synced = Column(Integer, default=1) # 1 = Sincronizado, 0 = Pendiente (Guardado en IndexedDB localmente)

    # Relaciones
    empresa = relationship("Empresa", back_populates="reportes")
    tecnico = relationship("Usuario", back_populates="reportes")