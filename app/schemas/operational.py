from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime


class LoginRequest(BaseModel):
    identificador: str
    password: str


class EmpresaMandanteOut(BaseModel):
    id: int
    rut_empresa: str
    razon_social: str
    sla_objetivo_pct: float
    model_config = ConfigDict(from_attributes=True)


class UsuarioOut(BaseModel):
    id: int
    empresa_id: Optional[int] = None
    empresa_nombre: Optional[str] = None
    nombre_completo: str
    rut: str
    email: str
    rol: str
    cargo: str
    activo: bool
    model_config = ConfigDict(from_attributes=True)


class LoginResponse(BaseModel):
    token: str
    redirect_url: str
    usuario: UsuarioOut


class HitoSchema(BaseModel):
    id: int
    dia: str
    titulo: str
    completado: bool = False


class HitosUpdatePayload(BaseModel):
    hitos: List[HitoSchema]


class ActivoBase(BaseModel):
    codigo_activo: str
    nombre: str
    ubicacion_tecnica: Optional[str] = None
    criticidad: Optional[str] = "MEDIA"
    latitud_referencia: Optional[float] = -41.4870
    longitud_referencia: Optional[float] = -72.9550


class ActivoCreate(ActivoBase):
    empresa_id: Optional[int] = None


class ActivoOut(ActivoBase):
    id: int
    empresa_id: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)


Activo = ActivoOut
ActivoResponse = ActivoOut


class OrdenTrabajoBase(BaseModel):
    codigo_ot: str
    cliente_mandante: Optional[str] = "Austral Conectividad SpA"
    activo_id: int
    tipo_mantenimiento: str
    prioridad: str = "MEDIA"
    operario_responsable: str
    rut_responsable: str
    descripcion: str


class OrdenTrabajoCreate(OrdenTrabajoBase):
    empresa_id: Optional[int] = None
    operario_id: Optional[int] = None
    hitos: Optional[List[HitoSchema]] = None


class OrdenTrabajoOut(OrdenTrabajoBase):
    id: int
    empresa_id: Optional[int] = None
    operario_id: Optional[int] = None
    estado_actual: str = "EMITIDA"
    avance_pct: int = 0
    hitos: List[HitoSchema] = []
    created_at: Optional[datetime] = None
    activo: Optional[ActivoOut] = None

    hash_cadena: Optional[str] = None
    evidencia_url: Optional[str] = None
    laplacian_score: Optional[float] = None
    encargado_nombre: Optional[str] = None
    encargado_rut: Optional[str] = None
    firma_data: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


OrdenTrabajoResponse = OrdenTrabajoOut
OrdenTrabajo = OrdenTrabajoOut


class TransicionOut(BaseModel):
    id: int
    orden_id: int
    usuario_id: Optional[int] = None
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
    encargado_nombre: Optional[str] = None
    encargado_rut: Optional[str] = None
    firma_data: Optional[str] = None
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
    avance_global_hitos_pct: float
    mttr_estimado_horas: float
    mtbf_estimado_horas: float
    disponibilidad_operacional_pct: float
    resumen_clientes: List[Dict[str, Any]] = []
    cuellos_botella_hitos: List[Dict[str, Any]] = []
    model_config = ConfigDict(from_attributes=True)


MetricasResponse = MetricasOut
Metricas = MetricasOut