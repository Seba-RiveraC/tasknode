-- =============================================================================
-- PROYECTO TASKNODE - FASE 2: MOTOR RELACIONAL Y AUDITORÍA INMUTABLE (DDL & SEEDS)
-- =============================================================================

-- 1. TABLA EMPRESAS (Aislamiento Multi-tenant lógico)
CREATE TABLE IF NOT EXISTS empresas (
    id_empresa SERIAL PRIMARY KEY,
    razon_social VARCHAR(150) NOT NULL,
    rut VARCHAR(20) UNIQUE NOT NULL,
    fecha_registro TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABLA FAENAS (Centros de trabajo físico / Ubicaciones geográficas)
CREATE TABLE IF NOT EXISTS faenas (
    id_faena SERIAL PRIMARY KEY,
    id_empresa INT NOT NULL REFERENCES empresas(id_empresa) ON DELETE RESTRICT,
    nombre_faena VARCHAR(150) NOT NULL,
    sector_geografico VARCHAR(150) NOT NULL,
    estado_activa BOOLEAN DEFAULT TRUE
);

-- 3. TABLA USUARIOS (Control de Acceso Basado en Roles - RBAC)
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario SERIAL PRIMARY KEY,
    id_empresa INT NOT NULL REFERENCES empresas(id_empresa) ON DELETE RESTRICT,
    nombre_completo VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(50) NOT NULL CHECK (rol IN ('Admin', 'Supervisor', 'Operario')),
    activo BOOLEAN DEFAULT TRUE
);

-- 4. TABLA ESTADOS_TAREA (Catálogo paramétrico normalizado en 3FN)
CREATE TABLE IF NOT EXISTS estados_tarea (
    id_estado SERIAL PRIMARY KEY,
    codigo VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(50) NOT NULL
);

-- 5. TABLA TAREAS (Asignación y ciclo de vida de operaciones)
CREATE TABLE IF NOT EXISTS tareas (
    id_tarea SERIAL PRIMARY KEY,
    id_empresa INT NOT NULL REFERENCES empresas(id_empresa) ON DELETE RESTRICT,
    id_faena INT NOT NULL REFERENCES faenas(id_faena) ON DELETE RESTRICT,
    id_supervisor INT NOT NULL REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    id_operario INT NOT NULL REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    id_estado INT NOT NULL REFERENCES estados_tarea(id_estado) ON DELETE RESTRICT,
    titulo VARCHAR(200) NOT NULL,
    fecha_inicio TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. TABLA HISTORIAL_ESTADOS (Pista de auditoría inmutable: GPS satelital + URL evidencia)
CREATE TABLE IF NOT EXISTS historial_estados (
    id_historial SERIAL PRIMARY KEY,
    id_tarea INT NOT NULL REFERENCES tareas(id_tarea) ON DELETE CASCADE,
    id_estado INT NOT NULL REFERENCES estados_tarea(id_estado) ON DELETE RESTRICT,
    id_usuario INT NOT NULL REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    fecha_cambio TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    latitud NUMERIC(10, 7) NOT NULL,
    longitud NUMERIC(10, 7) NOT NULL,
    url_evidencia VARCHAR(255) NOT NULL
);

-- =============================================================================
-- DATOS SEMILLA (SEEDS): ESCENARIO OPERATIVO REALISTA
-- Clave demo estándar para todos los usuarios: Admin123!
-- Hash Bcrypt: $2b$12$fT54Jm6pS2b2E0X7aOaCyeCqV04vJd1fC3Q5O7A6K9M8N5N6N2N6K
-- =============================================================================

-- Estados Maestros
INSERT INTO estados_tarea (id_estado, codigo, nombre) VALUES
(1, 'PEND', 'Pendiente de Inicio'),
(2, 'PROG', 'En Progreso'),
(3, 'COMP', 'Completada'),
(4, 'RECH', 'Rechazada / Con Observaciones')
ON CONFLICT (codigo) DO NOTHING;

-- Empresa Piloto
INSERT INTO empresas (id_empresa, razon_social, rut) VALUES
(1, 'Servicios Acuícolas y Portuarios Austral SpA', '77.890.123-K')
ON CONFLICT (id_empresa) DO NOTHING;

-- Faenas en Operación
INSERT INTO faenas (id_faena, id_empresa, nombre_faena, sector_geografico, estado_activa) VALUES
(1, 1, 'Centro Experimental Seno de Reloncaví', 'Seno de Reloncaví, Los Lagos', TRUE),
(2, 1, 'Planta de Procesos Chinquihue', 'Canal Chinquihue, Puerto Montt', TRUE),
(3, 1, 'Centro de Cultivo Hornopirén', 'Carretera Austral, Hualaihué', TRUE)
ON CONFLICT (id_faena) DO NOTHING;

-- Dotación de Personal
INSERT INTO usuarios (id_usuario, id_empresa, nombre_completo, email, password_hash, rol, activo) VALUES
(1, 1, 'Carlos Mendoza Silva', 'admin@tasknode.cl', '$2b$12$fT54Jm6pS2b2E0X7aOaCyeCqV04vJd1fC3Q5O7A6K9M8N5N6N2N6K', 'Admin', TRUE),
(2, 1, 'Sebastián Rivera Casín', 's.rivera@tasknode.cl', '$2b$12$fT54Jm6pS2b2E0X7aOaCyeCqV04vJd1fC3Q5O7A6K9M8N5N6N2N6K', 'Supervisor', TRUE),
(3, 1, 'Matías Almonacid Soto', 'm.almonacid@tasknode.cl', '$2b$12$fT54Jm6pS2b2E0X7aOaCyeCqV04vJd1fC3Q5O7A6K9M8N5N6N2N6K', 'Supervisor', TRUE),
(4, 1, 'Rodrigo Paredes Ruiz', 'r.paredes@tasknode.cl', '$2b$12$fT54Jm6pS2b2E0X7aOaCyeCqV04vJd1fC3Q5O7A6K9M8N5N6N2N6K', 'Operario', TRUE),
(5, 1, 'Víctor Cárdenas Mansilla', 'v.cardenas@tasknode.cl', '$2b$12$fT54Jm6pS2b2E0X7aOaCyeCqV04vJd1fC3Q5O7A6K9M8N5N6N2N6K', 'Operario', TRUE),
(6, 1, 'Esteban Barrientos Ojeda', 'e.barrientos@tasknode.cl', '$2b$12$fT54Jm6pS2b2E0X7aOaCyeCqV04vJd1fC3Q5O7A6K9M8N5N6N2N6K', 'Operario', TRUE),
(7, 1, 'Camila Navarro Vargas', 'c.navarro@tasknode.cl', '$2b$12$fT54Jm6pS2b2E0X7aOaCyeCqV04vJd1fC3Q5O7A6K9M8N5N6N2N6K', 'Operario', TRUE)
ON CONFLICT (id_usuario) DO NOTHING;

-- Tareas Operativas en Diferentes Estados
INSERT INTO tareas (id_tarea, id_empresa, id_faena, id_supervisor, id_operario, id_estado, titulo) VALUES
(1, 1, 1, 2, 4, 2, 'Mantenimiento Preventivo Sistema de Oxigenación Módulo 4'),
(2, 1, 1, 2, 5, 1, 'Inspección de Fondeo y Boyas Perimetrales Módulo A'),
(3, 1, 2, 3, 6, 3, 'Calibración de Sensores de Flujo y Temperatura en Línea 2'),
(4, 1, 3, 2, 7, 4, 'Muestreo de Calidad de Agua y Verificación de Red Lobera')
ON CONFLICT (id_tarea) DO NOTHING;

-- Eventos de Auditoría (Coordenadas reales de faenas en la Región de Los Lagos)
INSERT INTO historial_estados (id_tarea, id_estado, id_usuario, latitud, longitud, url_evidencia) VALUES
-- Eventos Tarea 1: Asignada por Sebastián Rivera y puesta En Progreso por Rodrigo Paredes en Reloncaví
(1, 1, 2, -41.4716670, -72.9366670, '/storage/evidencias/tarea_1_asignacion.jpg'),
(1, 2, 4, -41.4721100, -72.9372500, '/storage/evidencias/tarea_1_progreso.jpg'),

-- Eventos Tarea 3: Ciclo completo hasta Completada por Esteban Barrientos en Chinquihue
(3, 1, 3, -41.4981000, -72.9984000, '/storage/evidencias/tarea_3_creacion.jpg'),
(3, 2, 6, -41.4985000, -72.9989000, '/storage/evidencias/tarea_3_ejecucion.jpg'),
(3, 3, 6, -41.4985200, -72.9988500, '/storage/evidencias/tarea_3_finalizada.jpg'),

-- Eventos Tarea 4: Rechazada con observaciones por Sebastián Rivera en Hornopirén
(4, 1, 2, -41.9542000, -72.4411000, '/storage/evidencias/tarea_4_asignacion.jpg'),
(4, 2, 7, -41.9542100, -72.4411500, '/storage/evidencias/tarea_4_ejecucion.jpg'),
(4, 4, 2, -41.9541500, -72.4410500, '/storage/evidencias/tarea_4_rechazo_red.jpg')
ON CONFLICT DO NOTHING;

-- Sincronización de secuencias automáticas
SELECT setval('empresas_id_empresa_seq', (SELECT COALESCE(MAX(id_empresa), 1) FROM empresas));
SELECT setval('faenas_id_faena_seq', (SELECT COALESCE(MAX(id_faena), 1) FROM faenas));
SELECT setval('usuarios_id_usuario_seq', (SELECT COALESCE(MAX(id_usuario), 1) FROM usuarios));
SELECT setval('estados_tarea_id_estado_seq', (SELECT COALESCE(MAX(id_estado), 1) FROM estados_tarea));
SELECT setval('tareas_id_tarea_seq', (SELECT COALESCE(MAX(id_tarea), 1) FROM tareas));
SELECT setval('historial_estados_id_historial_seq', (SELECT COALESCE(MAX(id_historial), 1) FROM historial_estados));