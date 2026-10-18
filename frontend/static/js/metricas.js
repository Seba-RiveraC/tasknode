document.addEventListener('DOMContentLoaded', () => {
    cargarIndicadoresConfiabilidad();
});

async function cargarIndicadoresConfiabilidad() {
    try {
        const res = await fetch(`${window.TaskNodeConfig.API_URL}/metricas/`);
        if (!res.ok) throw new Error("Fallo de red");
        const m = await res.json();

        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        setTxt('m-mttr', `${m.mttr_estimado_horas} h`);
        setTxt('m-mtbf', `${m.mtbf_estimado_horas} h`);
        setTxt('m-ao', `${m.disponibilidad_operacional_pct}%`);

        const barraIcp = document.getElementById('progreso-icp');
        const txtIcp = document.getElementById('valor-icp');
        if (barraIcp && txtIcp) {
            barraIcp.style.width = `${m.tasa_resolucion_pct}%`;
            txtIcp.innerText = `${m.completadas} de ${m.volumen_total} OTs Completadas (${m.tasa_resolucion_pct}%)`;
        }
    } catch (err) {
        console.error("Error al obtener indicadores:", err);
    }
}