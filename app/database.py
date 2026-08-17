import sqlite3

DB_PATH = "tasknode.db"

def get_connection():
    return sqlite3.connect(DB_PATH)

def init_db():
    with get_connection() as conn:
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS reportes
                     (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT, faena TEXT, estado TEXT, motivo TEXT)''')
        c.execute("SELECT COUNT(*) FROM reportes")
        if c.fetchone()[0] == 0:
            c.execute("INSERT INTO reportes (fecha, faena, estado, motivo) VALUES (?, ?, ?, ?)", ("2026-08-17 08:30", "Edificio Central", "VERDE", ""))
            c.execute("INSERT INTO reportes (fecha, faena, estado, motivo) VALUES (?, ?, ?, ?)", ("2026-08-17 09:15", "Planta Solar Norte", "ROJO", "Faltan materiales"))
            conn.commit()