from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime


class LoginRequest(BaseModel):
    identificador: str
    password: str


class DemoCuentaRequest(BaseModel):
    email: str


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


class ConstanciaTecnico(BaseModel):
    usuario_id: int
    nombre: str
    fecha_dispositivo: str
    fecha_recepcion: datetime


class OrdenTrabajoOut(OrdenTrabajoBase):
    id: int
    empresa_id: Optional[int] = None
    operario_id: Optional[int] = None
    estado_actual: str = "EMITIDA"
    avance_pct: int = 0
    hitos: List[HitoSchema] = []
    created_at: Optional[datetime] = None
    fecha_limite: datetime
    activo: Optional[ActivoOut] = None

    hash_cadena: Optional[str] = None
    evidencia_url: Optional[str] = None
    laplacian_score: Optional[float] = None
    encargado_nombre: Optional[str] = None
    encargado_rut: Optional[str] = None
    firma_data: Optional[str] = None
    constancia_tecnico: Optional[ConstanciaTecnico] = None

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
    tipo_registro: Optional[str] = None
    fecha_dispositivo: Optional[str] = None
    prueba_sin_geocerca: bool = False
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


class ResumenClienteMetricas(BaseModel):
    cliente: str
    total_ots: int
    completadas: int
    detenidas: int
    total_etapas: int
    etapas_completadas: int


class MetricasOut(BaseModel):
    volumen_total: int
    ejecucion_normal: int
    detenciones_alertas: int
    completadas: int
    tasa_resolucion_pct: float
    avance_global_hitos_pct: float
    total_etapas: int
    etapas_completadas: int
    resumen_clientes: List[ResumenClienteMetricas]
    model_config = ConfigDict(from_attributes=True)


MetricasResponse = MetricasOut
Metricas = MetricasOut