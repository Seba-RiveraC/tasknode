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

        setTxt('m-mttr', `${m.mttr_estimado_horas} horas`);
        setTxt('m-mtbf', `${m.mtbf_estimado_horas} horas`);
        setTxt('m-ao', `${m.disponibilidad_operacional_pct}%`);

        // 1. Renderizar Tabla BI de Clientes Mandantes
        const tbodyCli = document.getElementById('tabla-bi-clientes');
        if (tbodyCli && m.resumen_clientes) {
            tbodyCli.innerHTML = m.resumen_clientes.map(c => {
                let badge = "badge-ejecucion";
                if (c.estado_sla.includes("RIESGO")) badge = "badge-detenida";
                if (c.estado_sla.includes("ÓPTIMO")) badge = "badge-completada";

                return `
                    <tr class="border-b border-theme-dim">
                        <td class="px-4 py-3 font-bold text-theme-main">${c.cliente}</td>
                        <td class="px-4 py-3 text-center font-mono font-bold">${c.completadas}/${c.total_ots}</td>
                        <td class="px-4 py-3 w-40">
                            <div class="flex items-center gap-2">
                                <div class="flex-1 h-2 bg-surface-base rounded-sm overflow-hidden border border-theme-dim">
                                    <div class="h-full bg-amber-600" style="width: ${c.avance_promedio_pct}%"></div>
                                </div>
                                <span class="font-mono text-[10px] font-bold">${c.avance_promedio_pct}%</span>
                            </div>
                        </td>
                        <td class="px-4 py-3 text-right">
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${badge}">${c.estado_sla}</span>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        // 2. Renderizar Minería de Cuellos de Botella por Hitos
        const contHitos = document.getElementById('contenedor-bi-hitos');
        if (contHitos && m.cuellos_botella_hitos) {
            contHitos.innerHTML = m.cuellos_botella_hitos.map(h => {
                const esCuello = h.pendientes > 0 && h.tasa_avance_pct < 60;
                return `
                    <div class="space-y-1">
                        <div class="flex justify-between text-xs">
                            <span class="font-bold text-theme-main">${h.etapa}</span>
                            <span class="font-mono text-[11px] ${esCuello ? 'text-red-500 font-bold' : 'text-theme-muted'}">
                                ${h.completados}/${h.total} completados (${h.tasa_avance_pct}%)
                                ${esCuello ? ' · ⚠ CUELLO DE BOTELLA' : ''}
                            </span>
                        </div>
                        <div class="w-full h-2.5 bg-surface-2 rounded-sm overflow-hidden border border-theme-dim">
                            <div class="h-full ${esCuello ? 'bg-red-600' : 'bg-emerald-600'}" style="width: ${h.tasa_avance_pct}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (err) {
        console.error("Error al obtener indicadores BI:", err);
    }
}