document.addEventListener('DOMContentLoaded', cargarIndicadores);

function escaparTextoMetrica(valor) {
    return String(valor).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function cargarIndicadores() {
    const error = document.getElementById('metricas-error');
    const tabla = document.getElementById('tabla-bi-clientes');
    const etapas = document.getElementById('contenedor-bi-hitos');
    try {
        const res = await fetch(`${window.TaskNodeConfig.API_URL}/metricas/`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const m = await res.json();

        document.getElementById('m-completadas').textContent = m.completadas;
        document.getElementById('m-ejecucion').textContent = m.ejecucion_normal;
        document.getElementById('m-detenidas').textContent = m.detenciones_alertas;
        tabla.innerHTML = m.resumen_clientes.length ? m.resumen_clientes.map(c => {
            const avance = c.total_etapas
                ? `${c.etapas_completadas}/${c.total_etapas} (${(100 * c.etapas_completadas / c.total_etapas).toFixed(1)}%)`
                : 'Sin etapas';
            return `<tr class="border-b border-theme-dim">
                <td class="px-4 py-3 font-bold text-theme-main">${escaparTextoMetrica(c.cliente)}</td>
                <td class="px-4 py-3 text-center font-mono">${c.completadas}/${c.total_ots}</td>
                <td class="px-4 py-3">${avance}</td>
                <td class="px-4 py-3 text-right font-mono">${c.detenidas}</td>
            </tr>`;
        }).join('') : '<tr><td colspan="4" class="px-4 py-6 text-center text-theme-dim">No hay órdenes registradas.</td></tr>';

        if (m.total_etapas) {
            const porcentaje = 100 * m.etapas_completadas / m.total_etapas;
            etapas.innerHTML = `<p class="text-sm text-theme-main"><strong>${m.etapas_completadas} de ${m.total_etapas}</strong> etapas completas (${porcentaje.toFixed(1)}%).</p>
                <div class="w-full h-2.5 bg-surface-2 rounded-sm overflow-hidden border border-theme-dim">
                    <div class="h-full bg-[#4f46e5]" style="width: ${porcentaje}%"></div>
                </div>
                <p class="text-xs text-theme-dim">${m.total_etapas - m.etapas_completadas} pendientes.</p>`;
        } else {
            etapas.textContent = 'No hay etapas registradas.';
        }
        error.classList.add('hidden');
    } catch (err) {
        console.error('Error al obtener indicadores:', err);
        for (const id of ['m-completadas', 'm-ejecucion', 'm-detenidas']) {
            document.getElementById(id).textContent = '--';
        }
        tabla.innerHTML = '<tr><td colspan="4" class="px-4 py-6 text-center text-theme-dim">No se pudieron cargar los datos.</td></tr>';
        etapas.textContent = 'No se pudieron cargar los datos.';
        error.textContent = 'No se pudieron actualizar los indicadores. Revisa la conexión e inténtalo nuevamente.';
        error.classList.remove('hidden');
    }
}
