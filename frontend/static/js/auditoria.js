document.addEventListener('DOMContentLoaded', () => {
    cargarBitacoraAuditoria();
    vincularBotonVerificacion();
});

function escaparHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function vincularBotonVerificacion() {
    const botones = document.querySelectorAll('button');
    botones.forEach(btn => {
        if (btn.innerText.includes('Verificar Ledger')) {
            btn.onclick = () => ejecutarAuditoriaCriptografica();
        }
    });
}

async function cargarBitacoraAuditoria(mapaDiscrepancias = {}) {
    const tbody = document.getElementById('tabla-auditoria');
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

        transiciones.forEach((t, idx) => {
            const anterior = escaparHTML(t.estado_anterior || 'INICIO');
            const nuevo = escaparHTML(t.estado_nuevo || t.estado || 'REGISTRADO');
            const codigoOT = escaparHTML(t.codigo_ot);
            const operario = escaparHTML(t.operario_responsable);
            const rut = escaparHTML(t.rut_responsable || 'RUT N/D');
            const hashCadena = escaparHTML(t.hash_cadena);

            // Verificación de eslabón en cliente (orden descendente: t[idx].hash_previo === t[idx+1].hash_cadena)
            let eslabonClienteOk = true;
            if (idx < transiciones.length - 1) {
                eslabonClienteOk = (t.hash_previo === transiciones[idx + 1].hash_cadena);
            }

            const falloBackend = mapaDiscrepancias[t.id];
            const bloqueCorrupto = !eslabonClienteOk || Boolean(falloBackend);

            let badgeColor = "text-slate-300 border-theme-dim bg-surface-base";
            if (nuevo === "EN EJECUCIÓN") badgeColor = "text-emerald-400 border-emerald-900 bg-emerald-950/40";
            if (nuevo === "DETENIDA POR ANOMALÍA") badgeColor = "text-red-400 border-red-900 bg-red-950/40";
            if (nuevo === "OT COMPLETADA") badgeColor = "text-amber-400 border-amber-900 bg-amber-950/40";
            if (nuevo === "EN VALIDACIÓN") badgeColor = "text-sky-400 border-sky-900 bg-sky-950/40";

            let fechaDisplay = escaparHTML(t.timestamp);
            try {
                fechaDisplay = new Date(t.timestamp).toLocaleString('es-CL', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                });
            } catch (e) {}

            const indicadorIntegridad = bloqueCorrupto
                ? `<span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 font-bold ml-1.5">✗ ADULTERADO</span>`
                : `<span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-900/60 ml-1.5">✓ SHA-256 OK</span>`;

            const tr = document.createElement('tr');
            tr.className = bloqueCorrupto
                ? "bg-red-950/30 border-b border-red-800 transition"
                : "hover:bg-surface-2 transition border-b border-theme-dim";

            tr.innerHTML = `
                <td class="px-4 py-2.5 font-bold text-slate-200 whitespace-nowrap">
                    #${t.id} · <span class="text-amber-400">${codigoOT}</span>
                    ${indicadorIntegridad}
                </td>
                <td class="px-4 py-2.5 text-slate-300 font-sans text-xs">
                    <span class="block font-medium text-slate-200">${operario}</span>
                    <span class="text-[10px] text-slate-500 font-mono">${rut}</span>
                </td>
                <td class="px-4 py-2.5 whitespace-nowrap">
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono border ${badgeColor}">
                        ${anterior} &rarr; ${nuevo}
                    </span>
                </td>
                <td class="px-4 py-2.5">
                    <div class="flex items-center gap-2">
                        <span class="${bloqueCorrupto ? 'text-red-400 border-red-800' : 'text-amber-400 border-theme-dim'} bg-surface-base p-1 rounded border text-[10px] block truncate max-w-xs font-mono" title="Actual: ${hashCadena} | Previo: ${escaparHTML(t.hash_previo)}">
                            ${hashCadena}
                        </span>
                        <button onclick="copiarHash('${hashCadena}')" class="text-slate-400 hover:text-white text-[9px] border border-theme-dim bg-surface-base hover:bg-surface-2 px-1.5 py-0.5 rounded transition tactile-btn">
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

async function ejecutarAuditoriaCriptografica() {
    const badgeEstado = document.getElementById('estado-cadena-audit');
    if (badgeEstado) {
        badgeEstado.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span> <span class="text-amber-400">RECALCULANDO HASHES SHA-256 DESDE BLOQUE GÉNESIS...</span>`;
    }

    try {
        const res = await fetch(`${window.TaskNodeConfig.API_URL}/estados/verificar`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const reporte = await res.json();

        const mapaDiscrepancias = {};
        if (reporte.detalle_discrepancias) {
            reporte.detalle_discrepancias.forEach(d => {
                mapaDiscrepancias[d.bloque_id] = d;
            });
        }

        await cargarBitacoraAuditoria(mapaDiscrepancias);

        if (badgeEstado) {
            if (reporte.integro) {
                badgeEstado.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> <span class="text-emerald-400 font-bold">AUDITORÍA SUPERADA: ${reporte.total_bloques_auditados} BLOQUES RECALCULADOS · 0 CORRUPCIONES</span>`;
            } else {
                badgeEstado.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-500 animate-ping"></span> <span class="text-red-400 font-bold">ALERTA FORENSE: ${reporte.discrepancias_detectadas} BLOQUE(S) ADULTERADO(S) DETECTADO(S)</span>`;
            }
        }
    } catch (e) {
        console.error("Error verificando integridad:", e);
    }
}

function copiarHash(hash) {
    navigator.clipboard.writeText(hash).then(() => {
        const estado = document.getElementById('estado-cadena-audit');
        if (estado) {
            estado.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500"></span> <span class="text-amber-300">Hash SHA-256 copiado al portapapeles.</span>`;
            setTimeout(() => ejecutarAuditoriaCriptografica(), 2000);
        }
    });
}