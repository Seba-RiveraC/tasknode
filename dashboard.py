import streamlit as st
import pandas as pd
import requests

st.set_page_config(page_title="TaskNode - Oficina", layout="wide")
st.title("Panel de Supervisión TaskNode")

API_URL = "http://localhost:8000/api/reportes"

# Botón para refrescar
if st.button("🔄 Actualizar Datos"):
    st.rerun()

try:
    # Consumo de la API REST
    response = requests.get(API_URL)
    
    if response.status_code == 200:
        datos = response.json()
        
        if datos:
            df = pd.DataFrame(datos)
            
            # Vista previa interactiva
            st.dataframe(df, use_container_width=True)
            
            # Exportación
            csv = df.to_csv(index=False).encode("utf-8")
            st.download_button(
                label="📥 Exportar a CSV",
                data=csv,
                file_name="reportes_faena.csv",
                mime="text/csv"
            )
        else:
            st.info("No hay reportes registrados en el sistema.")
    else:
        st.error(f"Error en el servidor: {response.status_code}")

except requests.exceptions.ConnectionError:
    st.error("No se pudo conectar al Backend. Asegúrate de que Uvicorn esté corriendo en el puerto 8000.")