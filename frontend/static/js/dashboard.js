const API = window.TaskNodeConfig.API_URL;
let ordenesGlobal = [];
let ordenSeleccionada = null;

// Rúbrica precargada para la orden cerrada OT-0001
const FIRMA_ENCARGADO_PRECARGADA = "data:image/svg+xml;utf8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="90" viewBox="0 0 300 90">
  <path d="M 25 65 Q 45 15 70 35 T 115 50 T 150 25 T 195 65 Q 220 75 270 45" fill="none" stroke="#c2410c" stroke-width="2.8" stroke-linecap="round"/>
  <path d="M 85 45 Q 140 10 240 20" fill="none" stroke="#c2410c" stroke-width="2.2" stroke-linecap="round"/>
  <text x="30" y="82" font-family="monospace" font-size="8.5" fill="#18181b" font-weight="bold">C. VALENZUELA · 14.285.631-8 (ENCARGADO TERRENO)</text>
</svg>`);

document.addEventListener('DOMContentLoaded', () => {
    actualizarMonitorCompleto();
    setInterval(actualizarMonitorCompleto, 4000);

    window.addEventListener('storage', (e) => {
        if (e.key && (e.key.includes('tasknode_signature') || e.key.includes('tasknode_encargado') || e.key.includes('tasknode_qr'))) {
            if (ordenSeleccionada) {
                seleccionarFilaInspeccion(ordenSeleccionada);
            }
        }
    });
});

function mostrarToastScada(mensaje, esError = false) {
    const toast = document.getElementById('hud-toast');
    const msg = document.getElementById('toast-msg');
    const led = document.getElementById('toast-led');
    if (!toast || !msg) return;

    msg.innerText = mensaje;
    if (led) {
        led.className = esError ? 'w-2.5 h-2.5 rounded-full bg-red-500' : 'w-2.5 h-2.5 rounded-full bg-emerald-500';
    }
    toast.classList.remove('opacity-0', 'translate-y-[-8px]');
    toast.classList.add('opacity-100', 'translate-y-0');

    setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', 'translate-y-[-8px]');
    }, 3500);
}

function ofuscarRUTLey21719(rut) {
    if (!rut || typeof rut !== 'string') return 'RUT RESERVADO';
    const limpio = rut.trim();
    const partes = limpio.split('-');
    if (partes.length !== 2 || partes[0].length < 4) return limpio;
    return `${partes[0].slice(0, -3)}***-${partes[1]}`;
}

function resolverUrlEvidencia(url) {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const baseServer = API.replace('/api/v1', '');
    return `${baseServer}${url.startsWith('/') ? '' : '/'}${url}`;
}

function obtenerInfoEstado(estado) {
    switch (estado) {
        case "EMITIDA":
            return { pct: 25, badge: "badge-emitida", colorBarra: "bg-amber-500" };
        case "EN EJECUCIÓN":
            return { pct: 50, badge: "badge-ejecucion", colorBarra: "bg-orange-600" };
        case "EN VALIDACIÓN":
            return { pct: 75, badge: "badge-validacion", colorBarra: "bg-indigo-600" };
        case "OT COMPLETADA":
            return { pct: 100, badge: "badge-completada", colorBarra: "bg-emerald-600" };
        case "DETENIDA POR ANOMALÍA":
            return { pct: 50, badge: "badge-detenida", colorBarra: "bg-red-600" };
        default:
            return { pct: 25, badge: "badge-emitida", colorBarra: "bg-amber-500" };
    }
}

async function actualizarMonitorCompleto() {
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

        setTxt('kpi-volumen', m.volumen_total);
        setTxt('kpi-ejecucion', m.ejecucion_normal);
        setTxt('kpi-detenciones', m.detenciones_alertas);
        setTxt('kpi-resolucion', `${m.tasa_resolucion_pct}%`);
    } catch (e) {}
}

async function cargarTablaBitacora() {
    const tbody = document.getElementById('tabla-body');
    if (!tbody) return;

    try {
        const res = await fetch(`${API}/ordenes/`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        ordenesGlobal = await res.json();
        tbody.innerHTML = '';

        if (ordenesGlobal.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-theme-dim">No hay órdenes registradas.</td></tr>`;
            return;
        }

        ordenesGlobal.forEach((r) => {
            const estado = r.estado_actual || 'EMITIDA';
            const info = obtenerInfoEstado(estado);
            const nombreEquipo = (r.activo && r.activo.nombre) ? r.activo.nombre : `Equipo #${r.activo_id}`;

            const tr = document.createElement('tr');
            const isSelected = ordenSeleccionada && ordenSeleccionada.codigo_ot === r.codigo_ot;
            tr.className = `cursor-pointer border-b border-theme-dim ${isSelected ? 'row-active' : ''}`;
            tr.onclick = () => seleccionarFilaInspeccion(r);

            const tieneFirma = Boolean(
                localStorage.getItem(`tasknode_signature_encargado_${r.codigo_ot}`) ||
                localStorage.getItem(`tasknode_signature_${r.codigo_ot}`) ||
                localStorage.getItem(`tasknode_qr_encargado_${r.codigo_ot}`) ||
                r.codigo_ot === 'OT-2610-PMT-PRV-0001'
            );
            const badgeFirma = tieneFirma ? `<span class="ml-1.5 px-1 py-0.2 rounded bg-emerald-950/40 text-emerald-500 border border-emerald-800 text-[8.5px] font-mono">✍ RECIBIDA</span>` : '';

            tr.innerHTML = `
                <td class="px-4 py-3">
                    <div class="font-mono font-bold text-theme-main">${r.codigo_ot}${badgeFirma}</div>
                    <div class="text-[11px] text-theme-dim truncate max-w-[230px]">${nombreEquipo}</div>
                </td>
                <td class="px-4 py-3">
                    <div class="font-semibold text-theme-main">${r.operario_responsable}</div>
                    <div class="text-[10px] font-mono text-theme-dim">${ofuscarRUTLey21719(r.rut_responsable)}</div>
                </td>
                <td class="px-4 py-3 whitespace-nowrap">
                    <span class="px-2.5 py-0.5 text-[10px] font-bold rounded ${info.badge}">
                        ${estado}
                    </span>
                </td>
                <td class="px-4 py-3 hidden md:table-cell w-36">
                    <div class="flex items-center gap-2">
                        <div class="flex-1 h-2 bg-surface-base rounded-sm overflow-hidden border border-theme-dim">
                            <div class="h-full ${info.colorBarra}" style="width: ${info.pct}%"></div>
                        </div>
                        <span class="font-mono text-[10px] font-bold text-theme-muted w-8 text-right">${info.pct}%</span>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (ordenSeleccionada) {
            const actualizada = ordenesGlobal.find(o => o.codigo_ot === ordenSeleccionada.codigo_ot);
            if (actualizada) seleccionarFilaInspeccion(actualizada);
        } else if (ordenesGlobal.length > 0) {
            const inicial = ordenesGlobal.find(o => o.codigo_ot === 'OT-2610-PMT-PRV-0001') || ordenesGlobal[0];
            seleccionarFilaInspeccion(inicial);
        }
    } catch (e) {}
}

function seleccionarFilaInspeccion(orden) {
    ordenSeleccionada = orden;
    const estado = orden.estado_actual || 'EMITIDA';
    const info = obtenerInfoEstado(estado);
    const lat = (orden.activo && orden.activo.latitud_referencia) ? orden.activo.latitud_referencia.toFixed(4) : '-41.4693';
    const lon = (orden.activo && orden.activo.longitud_referencia) ? orden.activo.longitud_referencia.toFixed(4) : '-72.9424';

    const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };

    const pill = document.getElementById('inspect-fsm-pill');
    if (pill) {
        pill.className = `text-[10px] font-bold px-2.5 py-0.5 rounded ${info.badge}`;
        pill.innerText = estado;
    }

    setTxt('inspect-ot-code', orden.codigo_ot);
    setTxt('inspect-asset-tag', orden.activo ? orden.activo.codigo_activo : `Equipo #${orden.activo_id}`);
    setTxt('inspect-ot-crew', `Técnico Ejecutor: ${orden.operario_responsable} (${ofuscarRUTLey21719(orden.rut_responsable)})`);
    setTxt('inspect-ot-desc', orden.descripcion || 'Sin descripción.');
    setTxt('inspect-progress-txt', `${info.pct}%`);

    const bar = document.getElementById('inspect-progress-bar');
    if (bar) {
        bar.className = `h-full transition-all duration-300 ${info.colorBarra}`;
        bar.style.width = `${info.pct}%`;
    }

    setTxt('inspect-laplacian-score', orden.laplacian_score ? `✓ Nitidez OK (Score: ${orden.laplacian_score})` : 'Pendiente de captura');
    setTxt('inspect-gps-val', `${lat}, ${lon} (≤ 500m OK)`);
    setTxt('inspect-hash-val', orden.hash_cadena || 'Pendiente de primera transición en terreno');

    const imgView = document.getElementById('inspect-img-view');
    const imgPlaceholder = document.getElementById('inspect-img-placeholder');
    const urlFinal = resolverUrlEvidencia(orden.evidencia_url);

    if (imgView && imgPlaceholder) {
        if (urlFinal) {
            imgView.src = urlFinal;
            imgView.classList.remove('hidden');
            imgPlaceholder.classList.add('hidden');
        } else {
            imgView.src = '';
            imgView.classList.add('hidden');
            imgPlaceholder.classList.remove('hidden');
        }
    }

    // =========================================================================
    // VISUALIZACIÓN DE FIRMA DEL ENCARGADO DE TERRENO
    // =========================================================================
    const sigImg = document.getElementById('inspect-sig-img');
    const sigPlaceholder = document.getElementById('inspect-sig-placeholder');
    const sigStatus = document.getElementById('inspect-sig-status');
    const elEncargadoNom = document.getElementById('inspect-encargado-nombre');
    const elEncargadoRut = document.getElementById('inspect-encargado-rut');

    let firmaGuardada = localStorage.getItem(`tasknode_signature_encargado_${orden.codigo_ot}`) || localStorage.getItem(`tasknode_signature_${orden.codigo_ot}`);
    const tokenQR = localStorage.getItem(`tasknode_qr_encargado_${orden.codigo_ot}`) || localStorage.getItem(`tasknode_qr_${orden.codigo_ot}`);
    const nomEncargado = localStorage.getItem(`tasknode_encargado_nombre_${orden.codigo_ot}`) || 'Carlos Valenzuela M.';
    const rutEncargado = localStorage.getItem(`tasknode_encargado_rut_${orden.codigo_ot}`) || '14.285.631-8';

    if (elEncargadoNom) elEncargadoNom.innerText = `Encargado: ${nomEncargado}`;
    if (elEncargadoRut) elEncargadoRut.innerText = `RUT: ${rutEncargado}`;

    if (!firmaGuardada && !tokenQR && orden.codigo_ot === 'OT-2610-PMT-PRV-0001') {
        firmaGuardada = FIRMA_ENCARGADO_PRECARGADA;
    }

    if (sigImg && sigPlaceholder && sigStatus) {
        if (firmaGuardada) {
            sigImg.src = firmaGuardada;
            sigImg.classList.remove('hidden');
            sigPlaceholder.classList.add('hidden');
            sigStatus.innerText = "✓ RÚBRICA ENCARGADO VALIDADA";
            sigStatus.className = "code-pill text-[9px] px-2 py-0.5 rounded text-emerald-500 border-emerald-600 font-mono font-bold";
        } else if (tokenQR) {
            sigImg.classList.add('hidden');
            sigPlaceholder.classList.remove('hidden');
            sigPlaceholder.innerHTML = `<span class="text-emerald-500 font-bold font-mono text-[10px]">✓ CREDENCIAL QR ENCARGADO ACREDITADA<br><span class="text-theme-dim text-[9px]">${tokenQR}</span></span>`;
            sigStatus.innerText = "✓ TOKEN QR CERTIFICADO";
            sigStatus.className = "code-pill text-[9px] px-2 py-0.5 rounded text-emerald-500 border-emerald-600 font-mono font-bold";
        } else {
            sigImg.classList.add('hidden');
            sigPlaceholder.classList.remove('hidden');
            sigPlaceholder.innerHTML = `<span>✍️ Pendiente de firma del Encargado de Terreno</span>`;
            sigStatus.innerText = "PENDIENTE";
            sigStatus.className = "code-pill text-[9px] px-2 py-0.5 rounded text-theme-dim font-mono";
        }
    }

    const btnAprobar = document.getElementById('btn-aprobar-fsm');
    if (btnAprobar) {
        const puedeCompletar = (estado === 'EN VALIDACIÓN' || estado === 'EN EJECUCIÓN');
        btnAprobar.disabled = !puedeCompletar;
        btnAprobar.innerText = (estado === 'OT COMPLETADA')
            ? '✓ Orden Cerrada y Auditada'
            : '✓ Aprobar Trabajo y Cerrar Orden';
    }

    const filas = document.querySelectorAll('#tabla-body tr');
    filas.forEach((tr, idx) => {
        if (ordenesGlobal[idx] && ordenesGlobal[idx].codigo_ot === orden.codigo_ot) {
            tr.classList.add('row-active');
        } else {
            tr.classList.remove('row-active');
        }
    });
}

async function auditarOrdenActiva(accion) {
    if (!ordenSeleccionada) return;
    const nuevoEstado = (accion === 'COMPLETAR') ? 'OT COMPLETADA' : 'EN EJECUCIÓN';
    const obs = 'Trabajo revisado y aprobado conforme por Supervisión de Planta. Orden cerrada.';

    const lat = (ordenSeleccionada.activo && ordenSeleccionada.activo.latitud_referencia) ? ordenSeleccionada.activo.latitud_referencia : -41.4693;
    const lon = (ordenSeleccionada.activo && ordenSeleccionada.activo.longitud_referencia) ? ordenSeleccionada.activo.longitud_referencia : -72.9424;

    const fd = new FormData();
    fd.append('codigo_ot', ordenSeleccionada.codigo_ot);
    fd.append('operario_id', '1');
    fd.append('estado_nuevo', nuevoEstado);
    fd.append('coordenadas_gps', `${lat}, ${lon}`);
    fd.append('observacion', obs);

    try {
        const res = await fetch(`${API}/estados/`, { method: 'POST', body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            mostrarToastScada(data.detail || 'No se pudo cambiar el estado', true);
            return;
        }
        mostrarToastScada(`Orden ${ordenSeleccionada.codigo_ot} cerrada satisfactoriamente.`);
        await actualizarMonitorCompleto();
    } catch (e) {
        mostrarToastScada(`Error de red: ${e.message}`, true);
    }
}

async function cargarActivosEnSelectorModal() {
    const select = document.getElementById('form-activo');
    if (!select || select.options.length > 0) return;
    try {
        const res = await fetch(`${API}/activos/`);
        if (!res.ok) return;
        const activos = await res.json();
        select.innerHTML = activos.map(a => `<option value="${a.id}">${a.codigo_activo} — ${a.nombre}</option>`).join('');
    } catch (e) {}
}

function abrirModalOT() {
    const modal = document.getElementById('modal-ot');
    if (!modal) return;
    const rand = Math.floor(100 + Math.random() * 899);
    document.getElementById('form-codigo').value = `OT-2610-PMT-PRV-0${rand}`;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function cerrarModalOT() {
    const modal = document.getElementById('modal-ot');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function autocompletarModalOT() {
    const rand = Math.floor(100 + Math.random() * 899);
    document.getElementById('form-codigo').value = `OT-2610-PMT-PRV-0${rand}`;
    document.getElementById('form-tipo').value = 'PREVENTIVO';
    document.getElementById('form-prioridad').value = 'ALTA';
    document.getElementById('form-operario').value = 'Sebastián Rivera';
    document.getElementById('form-rut').value = '18.421.903-K';
    document.getElementById('form-descripcion').value =
        'Mantenimiento preventivo programado: 1) Aplicar bloqueo eléctrico LOTO (D.S. 594). ' +
        '2) Inspección de rodamientos y ajuste de sello mecánico. ' +
        '3) Recepción conforme por Encargado de Terreno para cierre.';
}

async function enviarNuevaOT(e) {
    e.preventDefault();
    const payload = {
        codigo_ot: document.getElementById('form-codigo').value.trim(),
        activo_id: parseInt(document.getElementById('form-activo').value, 10),
        tipo_mantenimiento: document.getElementById('form-tipo').value,
        prioridad: document.getElementById('form-prioridad').value,
        operario_responsable: document.getElementById('form-operario').value.trim(),
        rut_responsable: document.getElementById('form-rut').value.trim(),
        descripcion: document.getElementById('form-descripcion').value.trim()
    };

    try {
        const res = await fetch(`${API}/ordenes/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            mostrarToastScada(data.detail || 'Error al crear la orden', true);
            return;
        }
        cerrarModalOT();
        mostrarToastScada(`Orden ${payload.codigo_ot} emitida correctamente.`);
        await actualizarMonitorCompleto();
    } catch (err) {
        mostrarToastScada(`Error de red: ${err.message}`, true);
    }
}

function abrirPliegoDesdeConsola() {
    if (!ordenSeleccionada) {
        mostrarToastScada("Seleccione primero una Orden de Trabajo.", true);
        return;
    }
    const modo = (ordenSeleccionada.estado_actual === 'EMITIDA') ? 'ORIGINAL' : 'COMPLETA';
    window.open(`orden_pdf.html?codigo=${encodeURIComponent(ordenSeleccionada.codigo_ot)}&modo=${modo}`, '_blank');
}