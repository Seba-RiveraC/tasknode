import os

carpetas_excluidas = ['fase 1', 'fase 2', '.git', 'node_modules', '.vscode']
ext_excluidas = ('.docx', '.doc', '.xlsx', '.pptx')

with open('proyecto_unificado.txt', 'w', encoding='utf-8') as salida:
    for raiz, dirs, archivos in os.walk('.'):
        dirs[:] = [d for d in dirs if d.lower() not in carpetas_excluidas]
        for archivo in archivos:
            if archivo.lower().endswith(ext_excluidas) or 'unificado' in archivo.lower() or archivo == 'unir.py':
                continue
            ruta = os.path.join(raiz, archivo)
            salida.write(f"\n=== {ruta} ===\n")
            try:
                with open(ruta, 'r', encoding='utf-8', errors='ignore') as f:
                    salida.write(f.read())
            except Exception:
                pass

print("¡Listo! Se creó el archivo 'proyecto_unificado.txt'")