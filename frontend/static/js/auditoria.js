let cacheTransicionesAudit = [];

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
    if (estado === "OT COMPLETADA" || estado === "ORDEN FINALIZADA") return "badge-completada";
    if (estado === "EN VALIDACIÓN") return "badge-validacion";
    return "badge-emitida";
}

function describirUbicacionAudit(coordenadas, pruebaSinGeocerca = false) {
    if (coordenadas === 'APROBACION_PANEL') return 'Aprobación desde el panel · ubicación no registrada';
    if (pruebaSinGeocerca) return `${coordenadas} · PRUEBA SIN GEOCERCA · Presencia en el activo no verificada`;
    return coordenadas === 'PRUEBA_SIN_GPS'
        ? 'PRUEBA SIN GPS · Presencia no verificada'
        : (coordenadas || 'No disponible');
}

function formatearFechaAudit(valor, utcPorDefecto = false) {
    if (!valor) return '';
    const texto = String(valor);
    const fecha = new Date(utcPorDefecto && !/(Z|[+-]\d{2}:\d{2})$/i.test(texto) ? `${texto}Z` : texto);
    return Number.isNaN(fecha.getTime()) ? texto : fecha.toLocaleString('es-CL');
}

async function cargarBitacoraAuditoria(mapaDiscrepancias = {}) {
    const tbody = document.getElementById('tabla-auditoria');
    const conteo = document.getElementById('conteo-bloques-audit');
    if (!tbody) return;

    try {
        const res = await fetch(`${window.TaskNodeConfig.API_URL}/estados/`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        cacheTransicionesAudit = await res.json();
        tbody.innerHTML = '';

        if (conteo) {
            conteo.innerText = `${cacheTransicionesAudit.length} eventos registrados`;
        }

        if (cacheTransicionesAudit.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-theme-dim">Sin registros en el historial.</td></tr>`;
            return;
        }

        cacheTransicionesAudit.forEach((t, idx) => {
            const anterior = escaparHTML(t.estado_anterior || 'INICIO');
            const nuevo = escaparHTML(t.estado_nuevo || 'REGISTRADO');
            const tipos = { LLEGADA: 'Llegada · en terreno', REANUDACION: 'Reanudación · en terreno', ANOMALIA: 'Anomalía', FIN_JORNADA: 'Fin de jornada · fuera de turno', CIERRE: 'Cierre de orden' };
            const tipoRegistro = tipos[t.tipo_registro] || '';
            const codigoOT = escaparHTML(t.codigo_ot);
            const operario = escaparHTML(t.operario_responsable);
            const rut = escaparHTML(t.rut_responsable || '');

            let eslabonOk = true;
            if (idx < cacheTransicionesAudit.length - 1) {
                eslabonOk = (t.hash_previo === cacheTransicionesAudit[idx + 1].hash_cadena);
            }
            const bloqueCorrupto = !eslabonOk || Boolean(mapaDiscrepancias[t.id]);

            const fechaDisplay = escaparHTML(formatearFechaAudit(t.timestamp, true));

            const badgeEstado = obtenerClaseBadgeAudit(t.estado_nuevo);
            const etiquetaVerif = bloqueCorrupto
                ? `<span class="px-2 py-0.5 rounded badge-detenida text-[10px] font-bold ml-1.5">✗ ADULTERADO</span>`
                : `<span class="px-2 py-0.5 rounded badge-completada text-[10px] font-bold ml-1.5">✓ ÍNTEGRO</span>`;

            const tr = document.createElement('tr');
            tr.className = "border-b border-theme-dim hover:bg-surface-2 transition";

            tr.innerHTML = `
                <td class="px-4 py-3 whitespace-nowrap">
                    <div class="font-mono font-bold text-theme-main">
                        Registro #${t.id} ${etiquetaVerif}
                    </div>
                    <div class="font-mono text-[11px] text-accent font-semibold mt-0.5">${codigoOT}</div>
                </td>
                <td class="px-4 py-3">
                    <div class="font-semibold text-theme-main">${operario}</div>
                    <div class="text-[10px] font-mono text-theme-dim">${rut}</div>
                </td>
                <td class="px-4 py-3">
                    <span class="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold ${badgeEstado}">
                        ${anterior} &rarr; ${nuevo}
                    </span>
                    <div class="text-[11px] text-theme-muted mt-1 max-w-md truncate" title="${escaparHTML(t.observacion || '')}">
                        ${escaparHTML(t.observacion || 'Sin observación')}
                    </div>
                    ${tipoRegistro ? `<div class="text-xs font-semibold text-theme-main">${escaparHTML(tipoRegistro)}</div>` : ''}
                </td>
                <td class="px-4 py-3 font-mono text-[11px] text-theme-muted whitespace-nowrap">
                    <div>Servidor: ${fechaDisplay}</div>
                    ${t.fecha_dispositivo ? `<div class="text-[10px] text-theme-dim">Dispositivo: ${escaparHTML(formatearFechaAudit(t.fecha_dispositivo))}</div>` : ''}
                    <div class="text-[10px] text-theme-dim">GPS: ${escaparHTML(describirUbicacionAudit(t.coordenadas_gps, t.prueba_sin_geocerca))}</div>
                </td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                    <button onclick="abrirModalHash(${t.id})" class="px-3 py-1.5 rounded border border-theme-bright bg-surface-2 hover:bg-surface-3 text-theme-main font-semibold text-[11px] transition">
                        - Ver información de auditoría
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-red-600 font-semibold">Error de conexión con el historial.</td></tr>`;
    }
}

function abrirModalHash(idBloque) {
    const t = cacheTransicionesAudit.find(x => x.id === idBloque);
    if (!t) return;

    document.getElementById('modal-hash-titulo').innerText = `Auditoría del Registro #${t.id} (${t.codigo_ot})`;
    document.getElementById('modal-hash-operario').innerText = `${t.operario_responsable} (${t.rut_responsable})`;
    document.getElementById('modal-hash-gps').innerText = describirUbicacionAudit(t.coordenadas_gps, t.prueba_sin_geocerca);
    document.getElementById('modal-hash-previo').innerText = t.hash_previo;
    document.getElementById('modal-hash-actual').innerText = t.hash_cadena;

    const btnCopiar = document.getElementById('btn-copiar-modal');
    btnCopiar.innerText = "📋 Copiar Hash";
    btnCopiar.onclick = () => {
        navigator.clipboard.writeText(t.hash_cadena);
        btnCopiar.innerText = "✓ ¡Copiado!";
    };

    const modal = document.getElementById('modal-detalle-hash');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function cerrarModalHash() {
    const modal = document.getElementById('modal-detalle-hash');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function ejecutarAuditoriaCriptografica() {
    const badgeEstado = document.getElementById('estado-cadena-audit');
    if (badgeEstado) {
        badgeEstado.innerHTML = `<span class="w-3 h-3 rounded-full bg-amber-500 animate-ping"></span> <span class="text-theme-main font-bold text-xs">Verificando integridad de los registros...</span>`;
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
                        ✓ AUDITORÍA SUPERADA: ${reporte.total_bloques_auditados} REGISTROS VERIFICADOS · 0 ALTERACIONES
                    </span>
                `;
            } else {
                badgeEstado.innerHTML = `
                    <span class="w-3 h-3 rounded-full bg-red-600 animate-ping"></span>
                    <span class="text-red-600 font-bold text-xs">
                        ⚠ ALERTA: ${reporte.discrepancias_detectadas} REGISTRO(S) ADULTERADO(S) EN BASE DE DATOS
                    </span>
                `;
            }
        }
    } catch (e) {
        await cargarBitacoraAuditoria({});
    }
}