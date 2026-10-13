document.addEventListener('DOMContentLoaded', () => {
    cargarIndicadoresConfiabilidad();
});

async function cargarIndicadoresConfiabilidad() {
    try {
        const res = await fetch(`${window.TaskNodeConfig.API_URL}/metricas/`);
        if (!res.ok) throw new Error("Fallo de red");
        const m = await res.json();

        document.getElementById('m-mttr').innerText = `${m.mttr_estimado_horas} h`;
        document.getElementById('m-mtbf').innerText = `${m.mtbf_estimado_horas} h`;
        document.getElementById('m-ao').innerText = `${m.disponibilidad_operacional_pct}%`;

        const barraIcp = document.getElementById('progreso-icp');
        const txtIcp = document.getElementById('valor-icp');
        if (barraIcp && txtIcp) {
            barraIcp.style.width = `${m.tasa_resolucion_pct}%`;
            txtIcp.innerText = `ICP REGISTRADO: ${m.tasa_resolucion_pct}%`;
        }
    } catch (err) {
        console.error("Error al obtener indicadores de mantenibilidad:", err);
    }
}