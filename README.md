# TaskNode Enterprise API

TaskNode es una plataforma SaaS B2B de Gestión de Operaciones en Terreno (Field Service Management). Está diseñada para estructurar el flujo de información entre técnicos operativos y coordinadores de servicio, garantizando trazabilidad geográfica y operativa.

> **Estado del Proyecto (MVP):** Este sistema se encuentra en fase de desarrollo activo. Actualmente implementa una arquitectura de microservicios Multi-Tenant y una PWA con capacidades Offline-First para entornos de baja conectividad.

## Arquitectura del Sistema

* **Capa de Enrutamiento (Backend):** FastAPI (Python) asíncrono.
* **Capa de Validación:** Pydantic (Filtro estricto de esquemas y tipos de datos).
* **Capa de Persistencia (Base de Datos):** SQLAlchemy (ORM) preparado para PostgreSQL con Row-Level Security (RLS) para aislamiento Multi-Tenant. *(Actualmente configurado con SQLite para pruebas locales).*
* **Frontera de Terreno (Frontend Técnico):** PWA (Progressive Web App) construida con HTML5, TailwindCSS y JavaScript Vanilla. Integra captura de coordenadas GPS nativa.
* **Frontera de Negocio (Dashboard):** Streamlit para consumo de API REST, monitoreo en vivo y exportación a CSV.

## Estructura del Proyecto

* `app/main.py`: Controlador principal, endpoints API RESTful y schemas de validación.
* `app/models.py`: Planos arquitectónicos de la base de datos (Entidades, Relaciones y Enums).
* `app/database.py`: Motor de conexión ORM y generador de sesiones por transacción.
* `index.html`: Interfaz móvil (PWA) para registro transaccional en terreno.
* `dashboard.py`: Panel analítico de oficina para el cruce de datos.

## Instalación y Despliegue Local

1. **Crear y activar el entorno virtual:**
   ```bash
   # En Windows:
   python -m venv venv
   .\venv\Scripts\activate
   
   # En macOS/Linux:
   python3 -m venv venv
   source venv/bin/activate
   ```
2. **Instalar dependencias:**
   ```bash
   pip install fastapi uvicorn sqlalchemy pydantic pandas streamlit requests
   ```

## Ejecución del Ecosistema

**1. Levantar el Microservicio (Backend) y PWA:**  
Abre una terminal y ejecuta el servidor ASGI:
```bash
uvicorn app.main:app --reload --port 8000
```
* **Acceso PWA Técnico:** Abre el archivo `index.html` directamente en tu navegador (o mediante Live Server).
* **Documentación API (Swagger):** `http://localhost:8000/docs`

**2. Levantar el Panel Administrativo (Frontend Oficina):**  
Abre una **segunda terminal**, asegúrate de tener el entorno virtual activado, y ejecuta:
```bash
streamlit run dashboard.py
