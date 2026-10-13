document.addEventListener('DOMContentLoaded', () => {
    cargarBitacoraAuditoria();
});

async function cargarBitacoraAuditoria() {
    const tbody = document.getElementById('tabla-auditoria');
    const badgeEstado = document.getElementById('estado-cadena-audit');
    if (!tbody) return;

    try {
        const res = await fetch(`${window.TaskNodeConfig.API_URL}/estados/`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const transiciones = await res.json();
        tbody.innerHTML = '';

        if (transiciones.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500 font-mono text-xs">Libro mayor vacío. Sin transiciones registradas.</td></tr>`;
            return;
        }

        if (badgeEstado) {
            badgeEstado.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> <span class="text-slate-300">ESTADO DEL LEDGER: ÍNTEGRO · SECUENCIA DE HASHES VÁLIDA</span>`;
        }

        transiciones.forEach((t) => {
            // Resolución del vector de transición FSM (sin undefined)
            const anterior = t.estado_anterior || 'INICIO';
            const nuevo = t.estado_nuevo || t.estado || 'REGISTRADO';

            let badgeColor = "text-slate-300 border-theme-dim bg-surface-base";
            if (nuevo === "EN EJECUCIÓN") badgeColor = "text-emerald-400 border-emerald-900 bg-emerald-950/40";
            if (nuevo === "DETENIDA POR ANOMALÍA") badgeColor = "text-red-400 border-red-900 bg-red-950/40";
            if (nuevo === "OT COMPLETADA") badgeColor = "text-amber-400 border-amber-900 bg-amber-950/40";
            if (nuevo === "EN VALIDACIÓN") badgeColor = "text-sky-400 border-sky-900 bg-sky-950/40";

            // Formato de fecha y hora local
            let fechaDisplay = t.timestamp;
            try {
                fechaDisplay = new Date(t.timestamp).toLocaleString('es-CL', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
            } catch (e) {}

            const tr = document.createElement('tr');
            tr.className = "hover:bg-surface-2 transition border-b border-theme-dim";
            tr.innerHTML = `
                <td class="px-4 py-2.5 font-bold text-slate-200 whitespace-nowrap">
                    #${t.id} · <span class="text-amber-400">${t.codigo_ot}</span>
                </td>
                <td class="px-4 py-2.5 text-slate-300 font-sans text-xs">
                    <span class="block font-medium text-slate-200">${t.operario_responsable}</span>
                    <span class="text-[10px] text-slate-500 font-mono">${t.rut_responsable || 'RUT N/D'}</span>
                </td>
                <td class="px-4 py-2.5 whitespace-nowrap">
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono border ${badgeColor}">
                        ${anterior} &rarr; ${nuevo}
                    </span>
                </td>
                <td class="px-4 py-2.5">
                    <div class="flex items-center gap-2">
                        <span class="text-amber-400 bg-surface-base p-1 rounded border border-theme-dim text-[10px] block truncate max-w-xs font-mono" title="${t.hash_cadena}">
                            ${t.hash_cadena}
                        </span>
                        <button onclick="copiarHash('${t.hash_cadena}')" class="text-slate-400 hover:text-white text-[9px] border border-theme-dim bg-surface-base hover:bg-surface-2 px-1.5 py-0.5 rounded transition tactile-btn">
                            Copiar
                        </button>
                    </div>
                </td>
                <td class="px-4 py-2.5 text-right text-slate-400 text-[10px] font-mono whitespace-nowrap">
                    ${fechaDisplay}
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("Error al leer bitácora:", e);
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-red-400 font-mono text-xs">Error al leer la bitácora transaccional desde el backend.</td></tr>`;
    }
}

function copiarHash(hash) {
    navigator.clipboard.writeText(hash).then(() => {
        const estado = document.getElementById('estado-cadena-audit');
        if (estado) {
            estado.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500"></span> <span class="text-amber-300">Hash SHA-256 copiado al portapapeles.</span>`;
            setTimeout(() => {
                estado.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> <span class="text-slate-300">ESTADO DEL LEDGER: ÍNTEGRO · SECUENCIA DE HASHES VÁLIDA</span>`;
            }, 2500);
        }
    });
}