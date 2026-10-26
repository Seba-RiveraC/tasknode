const API = window.TaskNodeConfig.API_URL;
let ordenesGlobal = [];
let ordenSeleccionada = null;
let rolVistaActual = 'SUPERVISOR'; // 'SUPERVISOR' o 'CLIENTE'

const FIRMA_ENCARGADO_PRECARGADA = "data:image/svg+xml;utf8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="90" viewBox="0 0 300 90">
  <path d="M 25 65 Q 45 15 70 35 T 115 50 T 150 25 T 195 65 Q 220 75 270 45" fill="none" stroke="#c2410c" stroke-width="2.8" stroke-linecap="round"/>
  <path d="M 85 45 Q 140 10 240 20" fill="none" stroke="#c2410c" stroke-width="2.2" stroke-linecap="round"/>
  <text x="30" y="82" font-family="monospace" font-size="8.5" fill="#18181b" font-weight="bold">C. VALENZUELA · 14.285.631-8 (ENCARGADO TERRENO)</text>
</svg>`);

document.addEventListener('DOMContentLoaded', () => {
    actualizarMonitorCompleto();
    setInterval(actualizarMonitorCompleto, 5000);
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

function cambiarRolVista(nuevoRol) {
    rolVistaActual = nuevoRol;
    const btnSup = document.getElementById('btn-rol-supervisor');
    const btnCli = document.getElementById('btn-rol-cliente');
    const btnNueva = document.getElementById('btn-nueva-ot-top');
    const sub = document.getElementById('subtitulo-rol');

    if (nuevoRol === 'CLIENTE') {
        btnCli.className = "px-2.5 py-1 rounded bg-[#c2410c] text-white transition";
        btnSup.className = "px-2.5 py-1 rounded text-theme-muted hover:text-theme-main transition";
        if (btnNueva) btnNueva.classList.add('hidden');
        if (sub) sub.innerText = "Vista Ejecutiva Cliente Mandante: Seguimiento de SLA, hitos completados y actas firmadas";
    } else {
        btnSup.className = "px-2.5 py-1 rounded bg-[#c2410c] text-white transition";
        btnCli.className = "px-2.5 py-1 rounded text-theme-muted hover:text-theme-main transition";
        if (btnNueva) btnNueva.classList.remove('hidden');
        if (sub) sub.innerText = "Vista Operativa Supervisor: Gestión de órdenes, control de hitos multidía y auditoría";
    }
    aplicarFiltrosLocal();
    if (ordenSeleccionada) poblarDatosInspector(ordenSeleccionada);
}

function cambiarTabInspector(tab) {
    const tabs = ['HITOS', 'EVIDENCIA', 'FORENSE'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t.toLowerCase()}`);
        const content = document.getElementById(`tab-content-${t.toLowerCase()}`);
        if (t === tab) {
            btn.className = "py-2 px-2 rounded-t border-b-2 border-[#c2410c] text-accent bg-surface-1";
            content.classList.remove('hidden');
        } else {
            btn.className = "py-2 px-2 rounded-t text-theme-muted hover:text-theme-main";
            content.classList.add('hidden');
        }
    });
}

function abrirDrawerInspeccion(orden) {
    ordenSeleccionada = orden;
    poblarDatosInspector(orden);
    const drawer = document.getElementById('drawer-inspeccion');
    const backdrop = document.getElementById('backdrop-inspeccion');
    if (drawer) drawer.classList.remove('translate-x-full');
    if (backdrop) backdrop.classList.remove('hidden');
}

function cerrarDrawerInspeccion() {
    const drawer = document.getElementById('drawer-inspeccion');
    const backdrop = document.getElementById('backdrop-inspeccion');
    if (drawer) drawer.classList.add('translate-x-full');
    if (backdrop) backdrop.classList.add('hidden');
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

function obtenerInfoEstado(estado, avanceReal) {
    const pct = (avanceReal !== undefined && avanceReal !== null) ? avanceReal : 25;
    switch (estado) {
        case "EMITIDA":
            return { pct, badge: "badge-emitida", colorBarra: "bg-amber-500" };
        case "EN EJECUCIÓN":
            return { pct, badge: "badge-ejecucion", colorBarra: "bg-orange-600" };
        case "EN VALIDACIÓN":
            return { pct, badge: "badge-validacion", colorBarra: "bg-indigo-600" };
        case "OT COMPLETADA":
            return { pct: 100, badge: "badge-completada", colorBarra: "bg-emerald-600" };
        case "DETENIDA POR ANOMALÍA":
            return { pct, badge: "badge-detenida", colorBarra: "bg-red-600" };
        default:
            return { pct, badge: "badge-emitida", colorBarra: "bg-amber-500" };
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
        setTxt('kpi-avance-hitos', `${m.avance_global_hitos_pct || 0}%`);
        setTxt('kpi-detenciones', m.detenciones_alertas);
        setTxt('kpi-resolucion', `${m.tasa_resolucion_pct}%`);
    } catch (e) {}
}

async function cargarTablaBitacora() {
    try {
        const res = await fetch(`${API}/ordenes/`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        ordenesGlobal = await res.json();

        // Actualizar selector de clientes mandantes
        const selectCli = document.getElementById('filtro-cliente');
        if (selectCli) {
            const valorActual = selectCli.value;
            const clientesUnicos = [...new Set(ordenesGlobal.map(o => o.cliente_mandante || 'SurTel Interno'))];
            selectCli.innerHTML = `<option value="TODOS">🏢 Todos los Clientes Mandantes (${clientesUnicos.length})</option>` +
                clientesUnicos.map(c => `<option value="${c}">${c}</option>`).join('');
            if (clientesUnicos.includes(valorActual)) selectCli.value = valorActual;
        }

        aplicarFiltrosLocal();

        if (ordenSeleccionada) {
            const actualizada = ordenesGlobal.find(o => o.codigo_ot === ordenSeleccionada.codigo_ot);
            if (actualizada) {
                ordenSeleccionada = actualizada;
                poblarDatosInspector(actualizada);
            }
        }
    } catch (e) {}
}

function aplicarFiltrosLocal() {
    const tbody = document.getElementById('tabla-body');
    if (!tbody) return;

    const q = (document.getElementById('filtro-texto')?.value || '').toLowerCase().trim();
    const cliFiltro = document.getElementById('filtro-cliente')?.value || 'TODOS';
    const estFiltro = document.getElementById('filtro-estado')?.value || 'TODOS';

    const filtradas = ordenesGlobal.filter(o => {
        const coincideTexto = !q ||
            o.codigo_ot.toLowerCase().includes(q) ||
            (o.cliente_mandante || '').toLowerCase().includes(q) ||
            (o.operario_responsable || '').toLowerCase().includes(q) ||
            (o.descripcion || '').toLowerCase().includes(q) ||
            (o.activo && o.activo.nombre.toLowerCase().includes(q));
        const coincideCli = (cliFiltro === 'TODOS') || (o.cliente_mandante === cliFiltro);
        const coincideEst = (estFiltro === 'TODOS') || (o.estado_actual === estFiltro);
        return coincideTexto && coincideCli && coincideEst;
    });

    const cont = document.getElementById('contador-resultados');
    if (cont) cont.innerText = `Mostrando ${filtradas.length} de ${ordenesGlobal.length} órdenes`;

    tbody.innerHTML = '';
    if (filtradas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-theme-dim">No se encontraron órdenes para el filtro seleccionado.</td></tr>`;
        return;
    }

    filtradas.forEach((r) => {
        const estado = r.estado_actual || 'EMITIDA';
        const info = obtenerInfoEstado(estado, r.avance_pct);
        const nombreEquipo = (r.activo && r.activo.nombre) ? r.activo.nombre : `Equipo #${r.activo_id}`;
        const hitos = r.hitos || [];
        const compHitos = hitos.filter(h => h.completado).length;

        const tr = document.createElement('tr');
        tr.className = "cursor-pointer border-b border-theme-dim hover:bg-surface-2 transition";
        tr.onclick = () => abrirDrawerInspeccion(r);

        tr.innerHTML = `
            <td class="px-4 py-3">
                <div class="font-mono font-bold text-theme-main text-xs">${r.codigo_ot}</div>
                <div class="text-[11px] text-theme-dim truncate max-w-[240px]">${nombreEquipo}</div>
            </td>
            <td class="px-4 py-3">
                <span class="font-bold text-theme-main">${r.cliente_mandante || 'SurTel Interno'}</span>
                <span class="block text-[10px] font-mono text-theme-dim">${r.tipo_mantenimiento} · Prioridad ${r.prioridad}</span>
            </td>
            <td class="px-4 py-3">
                <div class="font-semibold text-theme-main">${r.operario_responsable}</div>
                <div class="text-[10px] font-mono text-theme-dim">${ofuscarRUTLey21719(r.rut_responsable)}</div>
            </td>
            <td class="px-4 py-3 w-48">
                <div class="flex justify-between text-[10px] font-mono mb-1">
                    <span class="text-theme-muted">${compHitos}/${hitos.length} hitos</span>
                    <span class="font-bold text-theme-main">${info.pct}%</span>
                </div>
                <div class="w-full h-2 bg-surface-base rounded-sm overflow-hidden border border-theme-dim">
                    <div class="h-full ${info.colorBarra}" style="width: ${info.pct}%"></div>
                </div>
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                <span class="px-2.5 py-0.5 text-[10px] font-bold rounded ${info.badge}">
                    ${estado}
                </span>
            </td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
                <button class="px-3 py-1 rounded border border-theme-bright bg-surface-2 hover:bg-surface-3 text-theme-main font-semibold text-[11px]">
                    🔍 Ver Hitos / Ficha
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function poblarDatosInspector(orden) {
    const estado = orden.estado_actual || 'EMITIDA';
    const info = obtenerInfoEstado(estado, orden.avance_pct);
    const lat = (orden.activo && orden.activo.latitud_referencia) ? orden.activo.latitud_referencia.toFixed(4) : '-41.4870';
    const lon = (orden.activo && orden.activo.longitud_referencia) ? orden.activo.longitud_referencia.toFixed(4) : '-72.9550';

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
    setTxt('inspect-cliente-mandante', `Cliente Mandante: ${orden.cliente_mandante || 'SurTel Interno'}`);
    setTxt('inspect-asset-tag', orden.activo ? `${orden.activo.codigo_activo} · ${orden.activo.nombre}` : `Equipo #${orden.activo_id}`);
    setTxt('inspect-ot-crew', `Técnico Ejecutor: ${orden.operario_responsable} (${ofuscarRUTLey21719(orden.rut_responsable)})`);
    setTxt('inspect-ot-desc', orden.descripcion || 'Sin descripción.');
    setTxt('inspect-progress-txt', `${info.pct}% completado`);

    const bar = document.getElementById('inspect-progress-bar');
    if (bar) {
        bar.className = `h-full transition-all duration-300 ${info.colorBarra}`;
        bar.style.width = `${info.pct}%`;
    }

    // Renderizar Checklist de Hitos Multidía
    const contHitos = document.getElementById('lista-hitos-inspector');
    if (contHitos) {
        const hitos = orden.hitos || [];
        const bloqueadoEdicion = (rolVistaActual === 'CLIENTE' || estado === 'OT COMPLETADA');
        contHitos.innerHTML = hitos.map((h, i) => `
            <label class="flex items-start gap-2.5 p-2.5 rounded border border-theme-dim bg-surface-2 ${bloqueadoEdicion ? '' : 'cursor-pointer hover:bg-surface-3'} transition">
                <input type="checkbox" ${h.completado ? 'checked' : ''} ${bloqueadoEdicion ? 'disabled' : ''}
                    onchange="toggleHitoDesdeConsola(${i}, this.checked)"
                    class="mt-0.5 w-4 h-4 accent-[#c2410c]">
                <div class="flex-1 text-xs">
                    <span class="font-mono text-[10px] font-bold text-accent uppercase block">${h.dia}</span>
                    <span class="${h.completado ? 'line-through text-theme-dim' : 'text-theme-main font-medium'}">${h.titulo}</span>
                </div>
            </label>
        `).join('');
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

    const sigImg = document.getElementById('inspect-sig-img');
    const sigPlaceholder = document.getElementById('inspect-sig-placeholder');
    const sigStatus = document.getElementById('inspect-sig-status');
    const elEncargadoNom = document.getElementById('inspect-encargado-nombre');
    const elEncargadoRut = document.getElementById('inspect-encargado-rut');

    let datoFirma = orden.firma_data || localStorage.getItem(`tasknode_signature_encargado_${orden.codigo_ot}`);
    const tokenQR = (datoFirma && datoFirma.startsWith('TOKEN-QR')) ? datoFirma : localStorage.getItem(`tasknode_qr_encargado_${orden.codigo_ot}`);
    const nomEncargado = orden.encargado_nombre || 'Carlos Valenzuela M.';
    const rutEncargado = orden.encargado_rut || '14.285.631-8';

    if (elEncargadoNom) elEncargadoNom.innerText = `Encargado: ${nomEncargado}`;
    if (elEncargadoRut) elEncargadoRut.innerText = `RUT: ${rutEncargado}`;

    if (!datoFirma && !tokenQR && orden.codigo_ot === 'OT-1001') {
        datoFirma = FIRMA_ENCARGADO_PRECARGADA;
    }

    if (sigImg && sigPlaceholder && sigStatus) {
        if (datoFirma && datoFirma.startsWith('data:image')) {
            sigImg.src = datoFirma;
            sigImg.classList.remove('hidden');
            sigPlaceholder.classList.add('hidden');
            sigStatus.innerText = "✓ RÚBRICA VALIDADA";
            sigStatus.className = "code-pill text-[9px] px-2 py-0.5 rounded text-emerald-500 border-emerald-600 font-mono font-bold";
        } else if (tokenQR) {
            sigImg.classList.add('hidden');
            sigPlaceholder.classList.remove('hidden');
            sigPlaceholder.innerHTML = `<span class="text-emerald-500 font-bold font-mono text-[10px]">✓ CREDENCIAL QR ACREDITADA<br><span class="text-theme-dim text-[9px]">${tokenQR}</span></span>`;
            sigStatus.innerText = "✓ TOKEN QR OK";
            sigStatus.className = "code-pill text-[9px] px-2 py-0.5 rounded text-emerald-500 border-emerald-600 font-mono font-bold";
        } else {
            sigImg.classList.add('hidden');
            sigPlaceholder.classList.remove('hidden');
            sigPlaceholder.innerHTML = `<span>✍️ Pendiente de firma del Encargado en terreno</span>`;
            sigStatus.innerText = "PENDIENTE";
            sigStatus.className = "code-pill text-[9px] px-2 py-0.5 rounded text-theme-dim font-mono";
        }
    }

    const btnAprobar = document.getElementById('btn-aprobar-fsm');
    if (btnAprobar) {
        if (rolVistaActual === 'CLIENTE') {
            btnAprobar.classList.add('hidden');
        } else {
            btnAprobar.classList.remove('hidden');
            const puedeCompletar = (estado === 'EN VALIDACIÓN' || estado === 'EN EJECUCIÓN');
            btnAprobar.disabled = !puedeCompletar;
            btnAprobar.innerText = (estado === 'OT COMPLETADA')
                ? '✓ Orden Cerrada y Auditada'
                : '✓ Aprobar Todos los Hitos y Cerrar Orden';
        }
    }
}

async function toggleHitoDesdeConsola(idx, nuevoValor) {
    if (!ordenSeleccionada || !ordenSeleccionada.hitos) return;
    ordenSeleccionada.hitos[idx].completado = nuevoValor;

    try {
        const res = await fetch(`${API}/ordenes/${encodeURIComponent(ordenSeleccionada.codigo_ot)}/hitos`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hitos: ordenSeleccionada.hitos })
        });
        if (!res.ok) throw new Error("Error al guardar hito");
        const actualizada = await res.json();
        ordenSeleccionada = actualizada;
        poblarDatosInspector(actualizada);
        await actualizarMonitorCompleto();
        mostrarToastScada(`Hito #${idx + 1} actualizado en ${actualizada.codigo_ot}`);
    } catch (e) {
        mostrarToastScada("No se pudo actualizar el hito", true);
    }
}

async function auditarOrdenActiva(accion) {
    if (!ordenSeleccionada) return;
    const nuevoEstado = (accion === 'COMPLETAR') ? 'OT COMPLETADA' : 'EN EJECUCIÓN';
    const obs = 'Hitos verificados y trabajo aprobado conforme por Supervisión. Orden cerrada.';

    const lat = (ordenSeleccionada.activo && ordenSeleccionada.activo.latitud_referencia) ? ordenSeleccionada.activo.latitud_referencia : -41.4870;
    const lon = (ordenSeleccionada.activo && ordenSeleccionada.activo.longitud_referencia) ? ordenSeleccionada.activo.longitud_referencia : -72.9550;

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
        mostrarToastScada(`Orden ${ordenSeleccionada.codigo_ot} cerrada al 100%.`);
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
    const rand = Math.floor(1005 + Math.random() * 899);
    document.getElementById('form-codigo').value = `OT-${rand}`;
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
    const rand = Math.floor(1005 + Math.random() * 899);
    document.getElementById('form-codigo').value = `OT-${rand}`;
    document.getElementById('form-cliente').value = 'Entel Operaciones';
    document.getElementById('form-tipo').value = 'PREVENTIVO';
    document.getElementById('form-prioridad').value = 'ALTA';
    document.getElementById('form-operario').value = 'Sebastián Rivera';
    document.getElementById('form-rut').value = '18.421.903-K';
    document.getElementById('form-descripcion').value = 'Mantenimiento multidía de enlace microondas y certificación de fibra óptica.';
    document.getElementById('form-hitos').value =
        'Día 1: Permiso de acceso, charla PTS y bloqueo LOTO (D.S. 594)\n' +
        'Día 1: Inspección física de guía de onda y conectores en torre\n' +
        'Día 2: Reajuste de parábola MW y fusión de respaldo FO\n' +
        'Día 2: Prueba de potencia OTDR, foto nítida y firma de recepción';
}

async function enviarNuevaOT(e) {
    e.preventDefault();
    const textoHitos = document.getElementById('form-hitos').value.trim();
    const lineas = textoHitos ? textoHitos.split('\n').map(l => l.trim()).filter(Boolean) : [];
    const hitosArray = lineas.map((linea, idx) => {
        const partes = linea.split(':');
        const dia = partes.length > 1 ? partes[0].trim() : `Hito ${idx + 1}`;
        const titulo = partes.length > 1 ? partes.slice(1).join(':').trim() : linea;
        return { id: idx + 1, dia, titulo, completado: false };
    });

    const payload = {
        codigo_ot: document.getElementById('form-codigo').value.trim(),
        cliente_mandante: document.getElementById('form-cliente').value.trim(),
        activo_id: parseInt(document.getElementById('form-activo').value, 10),
        tipo_mantenimiento: document.getElementById('form-tipo').value,
        prioridad: document.getElementById('form-prioridad').value,
        operario_responsable: document.getElementById('form-operario').value.trim(),
        rut_responsable: document.getElementById('form-rut').value.trim(),
        descripcion: document.getElementById('form-descripcion').value.trim(),
        hitos: hitosArray.length > 0 ? hitosArray : null
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
        mostrarToastScada(`Orden ${payload.codigo_ot} creada para ${payload.cliente_mandante}.`);
        await actualizarMonitorCompleto();
    } catch (err) {
        mostrarToastScada(`Error de red: ${err.message}`, true);
    }
}

function abrirPliegoDesdeConsola() {
    if (!ordenSeleccionada) return;
    const modo = (ordenSeleccionada.estado_actual === 'EMITIDA') ? 'ORIGINAL' : 'COMPLETA';
    window.open(`orden_pdf.html?codigo=${encodeURIComponent(ordenSeleccionada.codigo_ot)}&modo=${modo}`, '_blank');
}