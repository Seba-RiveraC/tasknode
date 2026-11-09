# TaskNode

TaskNode es una aplicación web para organizar órdenes de trabajo de
mantenimiento en terreno. Conecta el inventario de activos, la asignación de
tareas y su seguimiento en un panel de supervisión y una terminal para
trabajadores.

El backend está construido con FastAPI y SQLAlchemy; la interfaz usa HTML,
CSS y JavaScript. La información se almacena en una base relacional, y el
sistema registra los cambios de estado y las evidencias fotográficas de cada
trabajo. Incluye seguimiento de etapas, ubicación y una bitácora verificable.

El proyecto está pensado por ahora para uso local y demostraciones; no hay un
despliegue externo previsto. La guía de ejecución, configuración, pruebas y
funciones de demostración está en [docs/GUIA_LOCAL.md](docs/GUIA_LOCAL.md).
