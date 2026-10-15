const API = window.TaskNodeConfig.API_URL;
let ordenesGlobal = [];
let ordenSeleccionada = null;

document.addEventListener('DOMContentLoaded', () => {
    iniciarRelojScada();
    cargarTodoDashboard();
    setInterval(cargarTodoDashboard, 8000);
});

function iniciarRelojScada() {
    const el = document.getElementById('reloj-scada');
    if (!el) return;
    const tick = () => {
        const ahora = new Date();
        const fecha = ahora.toISOString().slice(0, 10);
        const hora = ahora.toLocaleTimeString('es-CL');
        el.innerText = `${fecha} · ${hora}`;
    };
    tick();
    setInterval(tick, 1000);
}

/**
 * Enmascara parcialmente el RUT en vistas generales de monitoreo (Ley 21.719 - Privacy by Design).
 * Ejemplo: "18.421.903-K" -> "18.421.***-K"
 */
function ofuscarRUTLey21719(rut) {
    if (!rut || typeof rut !== 'string') return 'RUT RESERVADO';
    const limpio = rut.trim();
    const partes = limpio.split('-');
    if (partes.length !== 2 || partes[0].length < 4) return limpio;
    return `${partes[0].slice(0, -3)}***-${partes[1]}`;
}

function resolverUrlEvidencia(url) {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url; // URL directa desde Azure Blob Storage
    }
    const baseServer = API.replace('/api/v1', '');
    return `${baseServer}${url.startsWith('/') ? '' : '/'}${url}`;
}

async function cargarTodoDashboard() {
    await Promise.all([
        cargarKPIs(),
        cargarTablaBitacora(),
        cargarActivosEnSelectorModal()
    ]);
}

async function cargarKPIs() {
    try {
        const res = await fetch(`${API}/metricas/`);
        if (!res.ok) return;
        const m = await res.json();

        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        setTxt('kpi-total', m.volumen_total);
        setTxt('kpi-ejecucion', m.ejecucion_normal);
        setTxt('kpi-alertas', m.detenciones_alertas);
        setTxt('kpi-tasa', `${m.tasa_resolucion_pct}%`);
        setTxt('kpi-ao', `${m.disponibilidad_operacional_pct}%`);
    } catch (e) {
        console.error("Error cargando KPIs:", e);
    }
}

async function cargarTablaBitacora() {
    const tbody = document.getElementById('tabla-bitacora');
    if (!tbody) return;

    try {
        const res = await fetch(`${API}/ordenes/`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        ordenesGlobal = await res.json();
        tbody.innerHTML = '';

        if (ordenesGlobal.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500 font-mono text-xs">Sin órdenes activas registradas.</td></tr>`;
            return;
        }

        ordenesGlobal.forEach((r) => {
            const estado = r.estado_actual || r.estado || 'EMITIDA';
            let badgeClass = "text-amber-300 border-amber-800/80 bg-amber-950/40";
            if (estado === "EN EJECUCIÓN") badgeClass = "text-emerald-400 border-emerald-800/80 bg-emerald-950/40";
            if (estado === "DETENIDA POR ANOMALÍA") badgeClass = "text-red-400 border-red-800/80 bg-red-950/50 animate-pulse";
            if (estado === "OT COMPLETADA") badgeClass = "text-slate-300 border-slate-700 bg-slate-800/60";
            if (estado === "EN VALIDACIÓN") badgeClass = "text-sky-400 border-sky-800 bg-sky-950/40";

            const lat = (r.activo && r.activo.latitud_referencia) ? r.activo.latitud_referencia.toFixed(4) : '-41.4693';
            const lon = (r.activo && r.activo.longitud_referencia) ? r.activo.longitud_referencia.toFixed(4) : '-72.9424';
            const coords = `${lat}, ${lon}`;

            let horaStr = "--:--";
            if (r.created_at) {
                try {
                    horaStr = new Date(r.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
                } catch (e) {}
            }

            const tieneFotoBadge = r.evidencia_url
                ? `<span class="ml-1.5 px-1 py-0.2 text-[8px] font-mono bg-sky-950 text-sky-400 border border-sky-800 rounded" title="Evidencia en Azure Blob">BLOB</span>`
                : '';

            const tr = document.createElement('tr');
            const isSelected = ordenSeleccionada && ordenSeleccionada.codigo_ot === r.codigo_ot;
            tr.className = `cursor-pointer transition border-b border-theme-dim ${isSelected ? 'bg-amber-500/10' : 'hover:bg-surface-2'}`;
            tr.onclick = () => {
                seleccionarFilaInspeccion(r);
                if (window.innerWidth < 1280) abrirInspector();
            };

            tr.innerHTML = `
                <td class="px-3.5 py-2.5 font-mono text-xs font-bold text-amber-400 whitespace-nowrap">
                    ${r.codigo_ot}${tieneFotoBadge}
                </td>
                <td class="px-3.5 py-2.5">
                    <div class="text-xs font-medium text-slate-200 leading-tight">${r.operario_responsable}</div>
                    <div class="text-[10px] font-mono text-slate-500" title="RUT Protegido por Ley 21.719 (Minimización de PII)">${ofuscarRUTLey21719(r.rut_responsable)}</div>
                </td>
                <td class="px-3.5 py-2.5 whitespace-nowrap">
                    <span class="px-2 py-0.5 text-[10px] font-mono font-semibold rounded border ${badgeClass}">
                        ${estado}
                    </span>
                </td>
                <td class="px-3.5 py-2.5 font-mono text-[11px] text-slate-400 hidden sm:table-cell whitespace-nowrap">
                    ${coords}
                </td>
                <td class="px-3.5 py-2.5 text-right font-mono text-[11px] text-slate-400 whitespace-nowrap">
                    ${horaStr}
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (ordenSeleccionada) {
            const actualizada = ordenesGlobal.find(o => o.codigo_ot === ordenSeleccionada.codigo_ot);
            if (actualizada) seleccionarFilaInspeccion(actualizada);
        } else if (ordenesGlobal.length > 0) {
            seleccionarFilaInspeccion(ordenesGlobal[0]);
        }
    } catch (e) {
        console.error("Error cargando tabla de órdenes:", e);
    }
}

function seleccionarFilaInspeccion(orden) {
    ordenSeleccionada = orden;
    const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };

    const estado = orden.estado_actual || orden.estado || 'EMITIDA';
    setTxt('inspeccion-codigo', orden.codigo_ot);
    setTxt('inspeccion-estado-badge', estado);
    setTxt('inspeccion-operario', `${orden.operario_responsable} (${ofuscarRUTLey21719(orden.rut_responsable)})`);
    setTxt('inspeccion-activo', orden.activo ? `${orden.activo.codigo_activo} · ${orden.activo.nombre}` : `Activo ID #${orden.activo_id}`);
    setTxt('inspeccion-desc', orden.descripcion || 'Sin descripción técnica.');
    setTxt('inspeccion-hash', orden.hash_cadena || 'GENESIS_PENDING_TRANSITION_SHA256');

    const cajaFoto = document.getElementById('inspeccion-foto');
    if (cajaFoto) {
        const urlFinal = resolverUrlEvidencia(orden.evidencia_url);
        if (urlFinal) {
            const esAzure = urlFinal.includes('blob.core.windows.net');
            const origenTag = esAzure ? '☁ AZURE BLOB STORAGE' : '✓ ALMACENAMIENTO LOCAL';
            const scoreVal = orden.laplacian_score ? `Laplace: ${orden.laplacian_score}` : 'Nitidez Verificada';

            cajaFoto.innerHTML = `
                <div class="relative w-full h-40 rounded overflow-hidden border border-amber-500/40 bg-black group">
                    <img src="${urlFinal}" alt="Evidencia de Terreno" class="w-full h-full object-cover" />
                    <div class="absolute top-1.5 right-1.5 bg-black/80 border border-slate-700 px-1.5 py-0.5 rounded text-[8px] font-mono text-sky-400">
                        ${origenTag}
                    </div>
                    <div class="absolute bottom-0 inset-x-0 bg-black/85 px-2.5 py-1 flex justify-between items-center text-[9px] font-mono border-t border-slate-800">
                        <span class="text-emerald-400 font-bold">✓ ÓPTICA APROBADA</span>
                        <span class="text-amber-400 font-bold">${scoreVal}</span>
                    </div>
                </div>
            `;
        } else {
            cajaFoto.innerHTML = `
                <div class="text-center py-6 px-3">
                    <span class="text-[11px] font-mono text-slate-500 block">Sin captura fotográfica adjunta</span>
                    <span class="text-[9px] font-mono text-slate-600 block mt-0.5">Suba una foto desde el Terminal de Terreno para verla desde Azure Blob</span>
                </div>
            `;
        }
    }
}

function abrirInspector() {
    const panel = document.getElementById('panel-inspeccion');
    if (panel) panel.classList.remove('translate-x-full');
}

function cerrarInspector() {
    const panel = document.getElementById('panel-inspeccion');
    if (panel) panel.classList.add('translate-x-full');
}

async function transicionarOrdenDesdeConsola(nuevoEstado) {
    if (!ordenSeleccionada) return;
    const fd = new FormData();
    fd.append('codigo_ot', ordenSeleccionada.codigo_ot);
    fd.append('operario_id', '1');
    fd.append('estado_nuevo', nuevoEstado);
    const lat = (ordenSeleccionada.activo && ordenSeleccionada.activo.latitud_referencia) ? ordenSeleccionada.activo.latitud_referencia : -41.4693;
    const lon = (ordenSeleccionada.activo && ordenSeleccionada.activo.longitud_referencia) ? ordenSeleccionada.activo.longitud_referencia : -72.9424;
    fd.append('coordenadas_gps', `${lat}, ${lon}`);
    fd.append('observacion', `Cambio de estado ejecutado por Supervisión Central hacia ${nuevoEstado}.`);

    try {
        const res = await fetch(`${API}/estados/`, { method: 'POST', body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert(`Rechazo Normativo: ${data.detail || 'Transición no autorizada'}`);
            return;
        }
        await cargarTodoDashboard();
    } catch (e) {
        alert(`Error de red al transicionar orden: ${e.message}`);
    }
}

async function cargarActivosEnSelectorModal() {
    const select = document.getElementById('ot-activo-id');
    if (!select || select.options.length > 1) return;
    try {
        const res = await fetch(`${API}/activos/`);
        if (!res.ok) return;
        const activos = await res.json();
        select.innerHTML = activos.map(a => `<option value="${a.id}">${a.codigo_activo} — ${a.nombre}</option>`).join('');
    } catch (e) {}
}

function abrirModalNuevaOT() {
    const modal = document.getElementById('modal-nueva-ot');
    if (!modal) return;
    const rand = Math.floor(1000 + Math.random() * 9000);
    const inputCod = document.getElementById('ot-codigo');
    if (inputCod) inputCod.value = `OT-2610-PMT-PRV-${rand}`;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function cerrarModalNuevaOT() {
    const modal = document.getElementById('modal-nueva-ot');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function emitirNuevaOT(e) {
    e.preventDefault();
    const payload = {
        codigo_ot: document.getElementById('ot-codigo').value.trim(),
        activo_id: parseInt(document.getElementById('ot-activo-id').value, 10),
        tipo_mantenimiento: document.getElementById('ot-tipo').value,
        prioridad: document.getElementById('ot-prioridad').value,
        operario_responsable: document.getElementById('ot-operario').value.trim(),
        rut_responsable: document.getElementById('ot-rut').value.trim(),
        descripcion: document.getElementById('ot-descripcion').value.trim()
    };

    try {
        const res = await fetch(`${API}/ordenes/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert(`Error al emitir OT: ${data.detail || 'Verifique los campos'}`);
            return;
        }
        cerrarModalNuevaOT();
        await cargarTodoDashboard();
    } catch (err) {
        alert(`Fallo de red: ${err.message}`);
    }
}

function generarDossierOficial() {
    if (!ordenSeleccionada) {
        alert("Seleccione primero una Orden de Trabajo en la tabla.");
        return;
    }
    const o = ordenSeleccionada;
    const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };

    setTxt('dossier-folio', o.codigo_ot);
    setTxt('dossier-fecha', new Date().toLocaleString('es-CL'));
    setTxt('dossier-estado', o.estado_actual || o.estado || 'EMITIDA');
    setTxt('dossier-tipo', `${o.tipo_mantenimiento} (Prioridad ${o.prioridad || 'MEDIA'})`);
    setTxt('dossier-activo', o.activo ? `${o.activo.codigo_activo} - ${o.activo.nombre}` : `ID #${o.activo_id}`);
    setTxt('dossier-ubicacion', o.activo ? o.activo.ubicacion_tecnica : 'Planta Industrial');
    // En el Dossier Legal se revela el RUT completo por obligación normativa D.S. 594
    setTxt('dossier-operario', `${o.operario_responsable} — RUT: ${o.rut_responsable} (Acceso Autorizado Ley 21.719)`);
    setTxt('dossier-descripcion', o.descripcion);
    setTxt('dossier-hash', o.hash_cadena || 'GENESIS_HASH_TASKNODE_0000000000000000000000000000000000000000');

    // Inyectar imagen de Azure Blob y leyenda de Ley 21.719 dinámicamente en el acta
    let contenedorExtra = document.getElementById('dossier-bloque-cloud-ley');
    if (!contenedorExtra) {
        const hashElem = document.getElementById('dossier-hash');
        if (hashElem && hashElem.parentElement) {
            contenedorExtra = document.createElement('div');
            contenedorExtra.id = 'dossier-bloque-cloud-ley';
            contenedorExtra.className = 'mt-3 pt-3 border-t border-slate-300';
            hashElem.parentElement.appendChild(contenedorExtra);
        }
    }

    if (contenedorExtra) {
        const urlEvidencia = resolverUrlEvidencia(o.evidencia_url);
        const htmlImagen = urlEvidencia
            ? `<div class="mb-2 p-2 border border-slate-300 bg-white text-center">
                   <p class="text-[9px] font-mono font-bold uppercase text-slate-700 mb-1">
                       Evidencia Fotográfica Certificada (Varianza Laplaciana: ${o.laplacian_score || 'Aprobada'}) · Origen: ${urlEvidencia}
                   </p>
                   <img src="${urlEvidencia}" alt="Evidencia Dossier" class="max-h-40 mx-auto object-contain border border-slate-200" />
               </div>`
            : `<p class="text-[9px] font-mono text-slate-600 mb-2">EVIDENCIA MULTIMEDIA: Sin archivo fotográfico adjunto en la última transición.</p>`;

        contenedorExtra.innerHTML = `
            ${htmlImagen}
            <div class="bg-slate-100 p-2 border border-slate-300 text-[8.5px] font-mono text-slate-700 leading-relaxed">
                <strong>CLÁUSULA DE PRIVACIDAD Y PROTECCIÓN DE DATOS (LEY N° 21.719 CHILE):</strong>
                Los datos personales identificatorios (RUT) y la georreferenciación puntual (WGS84) contenidos en este expediente técnico han sido recolectados bajo los principios de licitud, finalidad y proporcionalidad, sin rastreo continuo en segundo plano, con el único propósito de acreditar cumplimiento de seguridad industrial (D.S. 594 Art. 53) y trazabilidad de activos (ISO 55001). Los metadatos EXIF secundarios de captura han sido purgados en tránsito.
            </div>
        `;
    }

    const modal = document.getElementById('modal-dossier');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function cerrarDossierOficial() {
    const modal = document.getElementById('modal-dossier');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}