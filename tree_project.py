import os

# Directorios o archivos que quieres ignorar (puedes agregar más)
EXCLUDE_DIRS = {'.git', '__pycache__', 'venv', 'env', '.vscode', 'node_modules', 'dist', 'build'}

def generar_arbol(ruta_raiz, prefijo=""):
    try:
        # Obtener los elementos de la carpeta, ordenando carpetas primero y luego archivos
        elementos = sorted(os.listdir(ruta_raiz))
        elementos = [e for e in elementos if e not in EXCLUDE_DIRS]
    except PermissionError:
        return

    # Filtrar elementos ocultos si lo deseas (opcional, aquí dejamos los que no están en la lista de exclusión)
    punteros = [("├── " if i < len(elementos) - 1 else "└── ") for i in range(len(elementos))]

    for puntero, elemento in zip(punteros, elementos):
        ruta_elemento = os.path.join(ruta_raiz, elemento)
        print(prefijo + puntero + elemento)

        if os.path.isdir(ruta_elemento):
            ext = "│   " if puntero == "├── " else "    "
            generar_arbol(ruta_elemento, prefijo + ext)

if __name__ == "__main__":
    directorio_actual = os.getcwd()
    print(f"Estructura del proyecto: {os.path.basename(directorio_actual)}")
    print("----------------------------------------")
    generar_arbol(directorio_actual)