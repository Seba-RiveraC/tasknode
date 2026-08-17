# TaskNode

TaskNode es una plataforma SaaS B2B de Gestión de Operaciones en Terreno (Field Service Management) diseñada para estructurar el flujo de información entre técnicos operativos y coordinadores de servicio.

> **Importante:** Este proyecto se encuentra en una fase preliminar y está diseñado específicamente como un mockup funcional para demostración y validación de concepto.

## Arquitectura

* Backend: FastAPI (Python)
* Base de datos: SQLite
* Frontend Técnico: HTML5 / TailwindCSS (Diseño centrado en captura rápida sin tipeo)
* Dashboard Administrativo: Streamlit

## Estructura del Proyecto

* app/main.py: Definición de endpoints API RESTful y servicio de archivos estáticos
* app/database.py: Inicialización de esquemas y gestión de conexiones SQLite
* static/index.html: Interfaz móvil para el registro de estados e incidentes en terreno
* dashboard.py: Panel analítico para monitoreo de faenas y exportación de datos

## Instalación

1. Clonar el repositorio e ingresar al directorio:
   git clone https://github.com/Seba-RiveraC/tasknode.git
   cd tasknode

2. Crear y activar el entorno virtual:
   python -m venv venv
   source venv/bin/activate  # Windows: .\venv\Scripts\Activate.ps1

3. Instalar dependencias:
   pip install -r requirements.txt

## Ejecución

1. Iniciar el Backend y la App Móvil:
   uvicorn app.main:app --reload --port 8000
   Acceso técnico: http://localhost:8000/

2. Iniciar el Dashboard Administrativo (en una segunda terminal):
   streamlit run dashboard.py
