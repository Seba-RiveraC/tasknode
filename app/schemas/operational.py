from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime

class ActivoBase(BaseModel):
    codigo_activo: str
    nombre: str
    ubicacion_tecnica: Optional[str] = None
    criticidad: Optional[str] = "MEDIA"
    latitud_referencia: Optional[float] = -41.4693
    longitud_referencia: Optional[float] = -72.9424

class ActivoCreate(ActivoBase):
    pass

class ActivoOut(ActivoBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

Activo = ActivoOut
ActivoResponse = ActivoOut

class OrdenTrabajoBase(BaseModel):
    codigo_ot: str
    activo_id: int
    tipo_mantenimiento: str
    prioridad: str = "MEDIA"
    operario_responsable: str
    rut_responsable: str
    descripcion: str

class OrdenTrabajoCreate(OrdenTrabajoBase):
    pass

class OrdenTrabajoOut(OrdenTrabajoBase):
    id: int
    estado_actual: str = "EMITIDA"
    created_at: Optional[datetime] = None
    activo: Optional[ActivoOut] = None
    # Campos inyectados desde la última transición para el Visor Forense (Hallazgo 1)
    hash_cadena: Optional[str] = None
    evidencia_url: Optional[str] = None
    laplacian_score: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)

OrdenTrabajoResponse = OrdenTrabajoOut
OrdenTrabajo = OrdenTrabajoOut

class TransicionCreate(BaseModel):
    codigo_ot: str
    operario_id: int
    estado_nuevo: str
    coordenadas_gps: str
    observacion: Optional[str] = None

class TransicionOut(BaseModel):
    id: int
    orden_id: int
    codigo_ot: str
    operario_responsable: str
    rut_responsable: str
    estado_anterior: str
    estado_nuevo: str
    coordenadas_gps: str
    observacion: Optional[str] = None
    hash_previo: str
    hash_cadena: str
    timestamp: datetime
    evidencia_url: Optional[str] = None
    laplacian_score: Optional[float] = None
    model_config = ConfigDict(from_attributes=True)

BitacoraTransicionOut = TransicionOut
BitacoraOut = TransicionOut
TransicionResponse = TransicionOut
BitacoraResponse = TransicionOut

class MetricasOut(BaseModel):
    volumen_total: int
    ejecucion_normal: int
    detenciones_alertas: int
    completadas: int
    tasa_resolucion_pct: float
    mttr_estimado_horas: float
    mtbf_estimado_horas: float
    disponibilidad_operacional_pct: float
    model_config = ConfigDict(from_attributes=True)

MetricasResponse = MetricasOut
Metricas = MetricasOut