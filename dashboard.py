import streamlit as st
import pandas as pd
from app.database import get_connection

st.set_page_config(page_title="TaskNode | Admin", layout="wide")
st.title(" TaskNode — Control de Operaciones")

def cargar_datos():
    with get_connection() as conn:
        return pd.read_sql_query("SELECT * FROM reportes ORDER BY id DESC", conn)

df = cargar_datos()

if not df.empty:
    col1, col2, col3 = st.columns(3)
    col1.metric("Total Reportes", len(df))
    col2.metric("Bloqueos 🔴", len(df[df['estado'] == 'ROJO']))
    col3.metric("Retrasos 🟡", len(df[df['estado'] == 'AMARILLO']))
    
    st.markdown("---")
    st.dataframe(df, use_container_width=True)
    st.download_button("📥 Exportar CSV", df.to_csv(index=False).encode('utf-8'), "tasknode_export.csv", "text/csv")