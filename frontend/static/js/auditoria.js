document.addEventListener('DOMContentLoaded', () => {
    ejecutarAuditoriaCriptografica();
});

function escaparHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function obtenerClaseBadgeAudit(estado) {
    if (estado === "EN EJECUCIÓN") return "badge-ejecucion";
    if (estado === "DETENIDA POR ANOMALÍA") return "badge-detenida";
    if (estado === "OT COMPLETADA") return "badge-completada";
    if (estado === "EN VALIDACIÓN") return "badge-validacion";
    return "badge-emitida";
}

async function cargarBitacoraAuditoria(mapaDiscrepancias = {}) {
    const tbody = document.getElementById('tabla-auditoria');
    const conteo = document.getElementById('conteo-bloques-audit');
    if (!tbody) return;

    try {
        const res = await fetch(`${window.TaskNodeConfig.API_URL}/estados/`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const transiciones = await res.json();
        tbody.innerHTML = '';

        if (conteo) {
            conteo.innerText = `${transiciones.length} eventos firmados`;
        }

        if (transiciones.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-theme-dim">Sin registros en la bitácora.</td></tr>`;
            return;
        }

        transiciones.forEach((t, idx) => {
            const anterior = escaparHTML(t.estado_anterior || 'INICIO');
            const nuevo = escaparHTML(t.estado_nuevo || 'REGISTRADO');
            const codigoOT = escaparHTML(t.codigo_ot);
            const operario = escaparHTML(t.operario_responsable);
            const rut = escaparHTML(t.rut_responsable || '');
            const hashActual = escaparHTML(t.hash_cadena);
            const hashPrevio = escaparHTML(t.hash_previo);

            // Comprobación de enlace entre bloques consecutivos (orden descendente)
            let eslabonOk = true;
            if (idx < transiciones.length - 1) {
                eslabonOk = (t.hash_previo === transiciones[idx + 1].hash_cadena);
            }
            const bloqueCorrupto = !eslabonOk || Boolean(mapaDiscrepancias[t.id]);

            let fechaDisplay = escaparHTML(t.timestamp);
            try {
                fechaDisplay = new Date(t.timestamp).toLocaleString('es-CL');
            } catch (e) {}

            const badgeEstado = obtenerClaseBadgeAudit(t.estado_nuevo);
            const etiquetaVerif = bloqueCorrupto
                ? `<span class="px-2 py-0.5 rounded badge-detenida text-[10px] font-bold ml-1.5">✗ ADULTERADO</span>`
                : `<span class="px-2 py-0.5 rounded badge-completada text-[10px] font-bold ml-1.5">✓ SHA-256 OK</span>`;

            const tr = document.createElement('tr');
            tr.className = "border-b border-theme-dim";

            tr.innerHTML = `
                <td class="px-4 py-3 whitespace-nowrap">
                    <div class="font-mono font-bold text-theme-main">
                        Bloque #${t.id} ${etiquetaVerif}
                    </div>
                    <div class="font-mono text-[11px] text-accent font-semibold mt-0.5">${codigoOT}</div>
                </td>
                <td class="px-4 py-3">
                    <div class="font-semibold text-theme-main">${operario}</div>
                    <div class="text-[10px] font-mono text-theme-dim">${rut}</div>
                </td>
                <td class="px-4 py-3 whitespace-nowrap">
                    <span class="px-2.5 py-1 rounded text-[10px] font-mono font-bold ${badgeEstado}">
                        ${anterior} &rarr; ${nuevo}
                    </span>
                    <div class="text-[11px] text-theme-muted mt-1 max-w-xs truncate" title="${escaparHTML(t.observacion || '')}">
                        ${escaparHTML(t.observacion || 'Sin observación')}
                    </div>
                </td>
                <td class="px-4 py-3 font-mono text-[10px]">
                    <div class="space-y-1">
                        <div class="flex items-center gap-1.5">
                            <span class="text-theme-dim w-12 shrink-0">Previo:</span>
                            <span class="text-theme-muted truncate max-w-[210px]" title="${hashPrevio}">${hashPrevio}</span>
                        </div>
                        <div class="flex items-center gap-1.5">
                            <span class="text-theme-main font-bold w-12 shrink-0">Actual:</span>
                            <span class="code-pill px-1.5 py-0.5 rounded font-bold truncate max-w-[210px]" title="${hashActual}">${hashActual}</span>
                            <button onclick="copiarHashAudit('${hashActual}')" class="px-1.5 py-0.5 rounded border border-theme-dim bg-surface-2 hover:bg-surface-3 text-theme-main text-[9.5px] font-sans font-semibold">
                                Copiar
                            </button>
                        </div>
                    </div>
                </td>
                <td class="px-4 py-3 text-right font-mono text-[11px] text-theme-muted whitespace-nowrap">
                    <div>${fechaDisplay}</div>
                    <div class="text-[10px] text-theme-dim">${escaparHTML(t.coordenadas_gps)}</div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-red-600 font-semibold">Error de conexión con el motor de auditoría.</td></tr>`;
    }
}

async function ejecutarAuditoriaCriptografica() {
    const badgeEstado = document.getElementById('estado-cadena-audit');
    if (badgeEstado) {
        badgeEstado.innerHTML = `<span class="w-3 h-3 rounded-full bg-amber-500 animate-ping"></span> <span class="text-theme-main font-bold text-xs">Recalculando firmas SHA-256 desde el Bloque Génesis...</span>`;
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
                badgeEstado.innerHTML = `
                    <span class="w-3 h-3 rounded-full bg-emerald-500"></span>
                    <span class="text-emerald-600 font-bold text-xs">
                        ✓ AUDITORÍA SUPERADA: ${reporte.total_bloques_auditados} ESLABONES RECALCULADOS DESDE GÉNESIS · 0 ADULTERACIONES
                    </span>
                `;
            } else {
                badgeEstado.innerHTML = `
                    <span class="w-3 h-3 rounded-full bg-red-600 animate-ping"></span>
                    <span class="text-red-600 font-bold text-xs">
                        ⚠ ALERTA DE SEGURIDAD: ${reporte.discrepancias_detectadas} REGISTRO(S) ADULTERADO(S) EN BASE DE DATOS
                    </span>
                `;
            }
        }
    } catch (e) {
        await cargarBitacoraAuditoria({});
    }
}

function copiarHashAudit(hash) {
    navigator.clipboard.writeText(hash).then(() => {
        const estado = document.getElementById('estado-cadena-audit');
        if (estado) {
            estado.innerHTML = `<span class="w-3 h-3 rounded-full bg-amber-500"></span> <span class="text-accent font-bold text-xs">Firma SHA-256 copiada al portapapeles: ${hash.slice(0, 24)}...</span>`;
            setTimeout(() => ejecutarAuditoriaCriptografica(), 2200);
        }
    });
}