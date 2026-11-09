# Guía local de TaskNode

TaskNode permite coordinar órdenes de mantenimiento, activos y trabajo en
terreno. Esta guía describe cómo ejecutar y probar el proyecto localmente, y
documenta las opciones de demostración disponibles.

## Requisitos

- Python 3.11 para ejecutar directamente o correr las pruebas.
- Docker Desktop con Docker Compose si se prefiere usar PostgreSQL en un
  contenedor.
- Los puertos `8000` y `5432` disponibles para la ejecución con Compose.

## Ejecutar con Docker Compose

Desde la raíz del proyecto:

```powershell
docker compose up --build -d
docker compose ps
Invoke-RestMethod http://localhost:8000/health
```

Abre la aplicación desde el mismo origen `http://localhost:8000`:

- Inicio de sesión: `http://localhost:8000/app/login.html`
- Panel: `http://localhost:8000/app/monitor.html`
- Terminal de terreno: `http://localhost:8000/app/terminal.html`
- Documentación interactiva de la API: `http://localhost:8000/docs`

No abras las páginas como archivos locales ni con Live Server. `localhost` y
`127.0.0.1` tienen sesiones separadas en el navegador.

Para detener los contenedores conservando la base de datos:

```powershell
docker compose down
```

`docker compose down -v` elimina también el volumen y los datos de PostgreSQL.
Las credenciales incluidas en Compose son solo valores de desarrollo local.

## Ejecutar con Python

Por defecto, la aplicación usa SQLite y crea `tasknode_local.db` en el
directorio de trabajo.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Luego abre `http://localhost:8000/app/login.html`.

## Pruebas

Con las dependencias instaladas, ejecuta desde la raíz:

```powershell
python -m pytest
```

También se pueden ejecutar dentro del contenedor:

```powershell
docker compose exec -T web python -m pytest
```

## Estructura principal

```text
app/
  api/v1/endpoints/   Rutas de autenticación, activos, órdenes, estados y métricas
  core/               Configuración, base de datos y seguridad
  models/             Modelos SQLAlchemy
  schemas/            Esquemas Pydantic
  services/           Flujo de estados, evidencia y procesamiento de imágenes
frontend/             Páginas y recursos estáticos
tests/                Pruebas automatizadas
seed.py               Carga destructiva de datos de demostración
```

## Configuración

La configuración se lee desde variables de entorno. Para la ejecución local
también se admite un archivo `.env`, que no debe agregarse al repositorio.

| Variable | Propósito |
| --- | --- |
| `DATABASE_URL` | Conexión a la base de datos. Por defecto usa SQLite; Compose configura PostgreSQL. |
| `AZURE_STORAGE_CONNECTION_STRING` | Opcional: habilita Azure Blob Storage para evidencias. |
| `AZURE_CONTAINER_NAME` | Nombre del contenedor de evidencias en Azure. |
| `GEOCERCA_RADIO_METROS` | Radio de geocerca en metros (predeterminado: `1000`). |
| `PERMITIR_PRUEBA_SIN_GPS` | Permite pruebas de terreno sin ubicación; desactivado por defecto. |
| `PERMITIR_PRUEBA_SIN_GEOCERCA` | Omite la geocerca en pruebas; desactivado por defecto. |
| `TERMINAL_TRABAJADOR_PRUEBA_EMAIL` | Selecciona un trabajador provisional para la terminal de prueba. |
| `PERMITIR_AUTOCOMPLETADO_DEMO` | Habilita el autocompletado de credenciales de demostración; desactivado por defecto. |
| `DEMO_CREDENCIALES_JSON` | Credenciales usadas por el autocompletado de demostración. |

Sin Azure configurado, las evidencias se guardan localmente en
`frontend/static/uploads/`. Las fotografías admiten hasta 5 MB; la validación
de nitidez usa la varianza del Laplaciano con umbral orientativo de 25. El radio
predeterminado de la geocerca es de 1.000 metros.

## Datos de demostración

Al arrancar, la aplicación crea las tablas que falten, pero no carga ni borra
datos automáticamente. Si no existen usuarios u órdenes, la aplicación queda
disponible con la base vacía.

Para cargar datos de ejemplo, solo en una base desechable:

```powershell
docker compose build web
docker compose up -d
docker compose exec -T web python seed.py
```

**Advertencia:** `seed.py` elimina y vuelve a crear el esquema de PostgreSQL,
incluidas órdenes, usuarios y bitácora. También sobrescribe evidencias de
demostración. No lo ejecutes sobre una base cuyos datos deban conservarse.

Los indicadores muestran cantidades según el estado actual de las órdenes y
las etapas completadas. No calculan MTTR, MTBF, disponibilidad ni cumplimiento
de SLA.

### Autocompletado local del panel

Esta función está desactivada por defecto. Solo para una demostración local,
configura las contraseñas de cuentas existentes y reinicia el servicio:

```powershell
$clave = Read-Host "Contraseña de la cuenta de supervisión"
$env:DEMO_CREDENCIALES_JSON = @{ "supervisor@tasknode.cl" = $clave } | ConvertTo-Json -Compress
$env:PERMITIR_AUTOCOMPLETADO_DEMO = "true"
docker compose up -d web
Remove-Variable clave
```

Se pueden incluir varias cuentas de supervisión o cliente en el objeto JSON.
La función entrega contraseñas a quien acceda al servicio; no la habilites en
redes no confiables. Para desactivarla:

```powershell
$env:PERMITIR_AUTOCOMPLETADO_DEMO = "false"
Remove-Item Env:\DEMO_CREDENCIALES_JSON
docker compose up -d web
Remove-Item Env:\PERMITIR_AUTOCOMPLETADO_DEMO
```

El panel usa correo y contraseña. El acceso móvil mediante passkey aún no está
implementado. La aprobación final verifica una sesión vigente de supervisor
(máximo ocho horas), pero las demás operaciones de la API no están protegidas
por esa sesión. La terminal tampoco autentica de forma segura al trabajador.
Estas limitaciones hacen que la aplicación sea solo para uso local o demos en
un entorno aislado.

### Terminal de terreno

En una orden emitida, adjunta una foto para registrar la llegada. Para detener
la orden, adjunta una foto e indica el motivo. La reanudación no exige foto.
Para terminar la jornada, marca las etapas realizadas, adjunta una foto y
escribe una observación; la orden pasa a validación. Al completar las etapas y
adjuntar una foto, queda como `OT COMPLETADA`, visible como pendiente de firma.
La firma final se registra con el usuario supervisor y no se puede deshacer.

La vista imprimible se habilita después de la firma. El registro de cierre
incluye el trabajador de prueba y la fecha del dispositivo; la fecha de
recepción del servidor se conserva por separado. Esta constancia no es una
firma manuscrita y la identidad del trabajador no está autenticada. El
documento se imprime o guarda desde el navegador y no se almacena
automáticamente en el servidor.

La ubicación real requiere HTTPS o `localhost`. Por defecto, el servidor exige
coordenadas y aplica la geocerca.

### Trabajador provisional de prueba

La terminal no tiene todavía autenticación móvil segura. Para una prueba local,
se puede seleccionar un trabajador existente y activo:

```powershell
$env:TERMINAL_TRABAJADOR_PRUEBA_EMAIL = "carlos@tasknode.cl"
docker compose up -d web
```

La terminal filtra las órdenes de ese trabajador. Este filtro es visual, no
protege la API ni autentica a la persona. Para desactivarlo:

```powershell
$env:TERMINAL_TRABAJADOR_PRUEBA_EMAIL = ""
docker compose up -d web
Remove-Item Env:\TERMINAL_TRABAJADOR_PRUEBA_EMAIL
```

### Pruebas de terreno sin GPS o fuera de geocerca

Las opciones siguientes están desactivadas por defecto y deben usarse solo con
datos de prueba en una instancia local.

Para permitir registros sin GPS:

```powershell
$env:PERMITIR_PRUEBA_SIN_GPS = "true"
docker compose up -d web
```

La terminal pide confirmación y marca estos registros como pruebas; no
acreditan presencia. También permite continuar si falla la lectura de
ubicación. Si se desactiva la opción antes de sincronizar los registros,
quedarán pendientes de aceptación.

Para probar fuera de la geocerca:

```powershell
$env:PERMITIR_PRUEBA_SIN_GEOCERCA = "true"
docker compose up -d web
```

La excepción de la API conserva las coordenadas e indica en la auditoría que
no se validó la geocerca. La foto y las demás validaciones siguen activas. Los
registros modifican las órdenes de la base configurada; los pendientes no se
aceptarán si se desactiva la opción antes de sincronizarlos.

Para desactivar ambas excepciones:

```powershell
$env:PERMITIR_PRUEBA_SIN_GPS = "false"
$env:PERMITIR_PRUEBA_SIN_GEOCERCA = "false"
docker compose up -d web
Remove-Item Env:\PERMITIR_PRUEBA_SIN_GPS
Remove-Item Env:\PERMITIR_PRUEBA_SIN_GEOCERCA
```

Si la terminal pierde conexión después de abrirse, puede guardar la foto y el
registro en el navegador y sincronizarlos al recuperar señal. Sincroniza o
descarta los pendientes antes de continuar con esa orden y no borres los datos
del navegador antes de sincronizarlos. La aplicación no garantiza que pueda
abrirse por primera vez sin conexión. La fecha del dispositivo puede estar
desajustada.

### Extensión puntual de plazos

Antes de ejecutar este procedimiento, respalda la base con una herramienta
adecuada (por ejemplo, `pg_dump` para PostgreSQL) y verifica el respaldo.
Prueba el procedimiento en una copia antes de modificar datos reales.

El arranque agrega si falta la columna nullable
`orden_trabajo.fecha_limite`, sin cambiar las fechas de emisión. Si no hay un
plazo guardado, se calcula uno según prioridad: ALTA 24 h, MEDIA 72 h, BAJA
168 h y 72 h para otras prioridades.

Con `DATABASE_URL` apuntando a una copia, revisa primero las órdenes elegibles:

```powershell
python -m app.extender_plazos --dias 14
```

Para aplicar, agrega `--aplicar`; revisa la lista y confirma escribiendo
`APLICAR`. Se puede limitar a órdenes previamente autorizadas con
`--codigo OT-...` por cada orden. Si alguna no es elegible, no se guardan
cambios. Se excluyen `OT COMPLETADA`, `ORDEN FINALIZADA`,
`OT-2026-PRUEBA-DUOC` y las órdenes que ya tengan plazo explícito. Repetir el
comando no vuelve a extender las órdenes ya modificadas. El plazo guardado es
una fecha local sin zona horaria; no se modifican `created_at` ni la bitácora.
