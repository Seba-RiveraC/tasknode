const API = window.TaskNodeConfig.API_URL;
let ordenesGlobal = [];
let ordenSeleccionada = null;
let rolVistaActual = 'SUPERVISOR';
let hitosConstructor = [];
let listaTecnicosBD = [];

const PLANTILLAS_PROTOCOLOS = {
    RF_MW: {
        descripcion: "Mantenimiento preventivo de enlace microondas: verificación de bloqueo LOTO, inspección de guía de onda y ajuste de acimut.",
        etapas: [
            { dia: "Etapa 1", titulo: "Permiso de trabajo seguro (PTS), bloqueo LOTO y ascenso acreditado" },
            { dia: "Etapa 2", titulo: "Inspección de guía de onda, conectores RF y sellado vulcanizado" },
            { dia: "Etapa 3", titulo: "Alineación de parábola MW y verificación de potencia (-48 dBm / VSWR)" },
            { dia: "Etapa 4", titulo: "Captura de evidencia óptica nítida y firma de conformidad en sitio" }
        ]
    },
    FIBRA_OTDR: {
        descripcion: "Intervención en tramo troncal de fibra óptica: preparación de manguito, fusión por arco y certificación reflectométrica OTDR.",
        etapas: [
            { dia: "Etapa 1", titulo: "Segregación de área de trabajo y apertura de cámara/mufa óptica" },
            { dia: "Etapa 2", titulo: "Sangrado de buffer, limpieza de filamentos y preparación de casete" },
            { dia: "Etapa 3", titulo: "Fusión por arco de hilos asignados con atenuación < 0.05 dB" },
            { dia: "Etapa 4", titulo: "Medición bidireccional OTDR, respaldo fotográfico y cierre de manguito" }
        ]
    },
    UPS_LOTO: {
        descripcion: "Intervención electromecánica en sistema de energía ininterrumpida (UPS) bajo protocolo de energía cero D.S. 594.",
        etapas: [
            { dia: "Etapa 1", titulo: "Seccionamiento eléctrico, bloqueo LOTO y comprobación de energía residual 0.0 V" },
            { dia: "Etapa 2", titulo: "Diagnóstico de bancos de baterías y extracción de módulo rectificador" },
            { dia: "Etapa 3", titulo: "Montaje de unidad de reemplazo y torque calibrado de bornes" },
            { dia: "Etapa 4", titulo: "Prueba de transferencia en carga real y recepción conforme" }
        ]
    },
    TORRE_EST: {
        descripcion: "Inspección estructural de torre de telecomunicaciones: control de tensión en riostras, verticalidad y estado de anclajes.",
        etapas: [
            { dia: "Etapa 1", titulo: "Verificación de arnés de altura, línea de vida y bloqueo perimetral" },
            { dia: "Etapa 2", titulo: "Medición con tensiómetro en vientos de anclaje niveles 1, 2 y 3" },
            { dia: "Etapa 3", titulo: "Reapriete de grilletes, aplicación de anticorrosivo y revisión de baliza" },
            { dia: "Etapa 4", titulo: "Registro fotográfico de verticalidad y firma de encargado de planta" }
        ]
    }
};

const FIRMA_ENCARGADO_PRECARGADA = "data:image/svg+xml;utf8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="90" viewBox="0 0 300 90">
  <path d="M 25 65 Q 45 15 70 35 T 115 50 T 150 25 T 195 65 Q 220 75 270 45" fill="none" stroke="#c2410c" stroke-width="2.8" stroke-linecap="round"/>
  <path d="M 85 45 Q 140 10 240 20" fill="none" stroke="#c2410c" stroke-width="2.2" stroke-linecap="round"/>
  <text x="30" y="82" font-family="monospace" font-size="8.5" fill="#18181b" font-weight="bold">C. VALENZUELA · 14.285.631-8 (ENCARGADO TERRENO)</text>
</svg>`);

document.addEventListener('DOMContentLoaded', () => {
    configurarSesionSegunUsuario();
    actualizarMonitorCompleto();
    cargarCatalogosRelacionalesModal();
    setInterval(actualizarMonitorCompleto, 5000);
});

function configurarSesionSegunUsuario() {
    const user = window.obtenerUsuarioActual ? window.obtenerUsuarioActual() : null;
    if (!user) return;

    if (user.rol === 'TRABAJADOR') {
        window.location.href = 'terminal.html';
        return;
    }

    const sideTag = document.getElementById('sidebar-rol-tag');
    const sideName = document.getElementById('sidebar-user-name');
    const switchCont = document.getElementById('contenedor-switch-rol');
    const navAudit = document.getElementById('nav-link-auditoria');
    const sub = document.getElementById('subtitulo-rol');

    if (sideName) sideName.innerText = user.nombre_completo;

    if (user.rol === 'CLIENTE') {
        cambiarRolVista('CLIENTE');
        if (switchCont) switchCont.classList.add('hidden');
        if (navAudit) navAudit.classList.add('hidden');
        if (sideTag) sideTag.innerText = 'PORTAL MANDANTE';
        if (sub) sub.innerText = `Empresa Mandante: ${user.empresa_nombre || user.nombre_completo} · Monitoreo de SLA y Actas`;
    } else {
        cambiarRolVista('SUPERVISOR');
        if (sideTag) sideTag.innerText = 'SUPERVISIÓN CMMS';
        if (sub) sub.innerText = `${user.nombre_completo} · ${user.cargo}`;
    }
}

function mostrarToastScada(mensaje, esError = false) {
    const toast = document.getElementById('hud-toast');
    const msg = document.getElementById('toast-msg');
    const led = document.getElementById('toast-led');
    if (!toast || !msg) return;

    msg.innerText = mensaje;
    if (led) {
        led.className = esError ? 'w-2 h-2 rounded-full bg-red-500' : 'w-2 h-2 rounded-full bg-emerald-500';
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
        if (btnCli) btnCli.className = "px-2.5 py-1 rounded bg-[#c2410c] text-white transition";
        if (btnSup) btnSup.className = "px-2.5 py-1 rounded text-theme-muted hover:text-theme-main transition";
        if (btnNueva) btnNueva.classList.add('hidden');
        if (sub) sub.innerText = "Vista Cliente Mandante: Seguimiento de cumplimiento SLA, etapas verificadas y recepción";
    } else {
        if (btnSup) btnSup.className = "px-2.5 py-1 rounded bg-[#c2410c] text-white transition";
        if (btnCli) btnCli.className = "px-2.5 py-1 rounded text-theme-muted hover:text-theme-main transition";
        if (btnNueva) btnNueva.classList.remove('hidden');
        if (sub) sub.innerText = "Supervisión Operativa: Gestión de órdenes de trabajo, protocolos de terreno y cierre";
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
    await cargarTablaBitacora();
}

function actualizarKPIsDesdeLista(lista) {
    const total = lista.length;
    const detenidas = lista.filter(o => o.estado_actual === "DETENIDA POR ANOMALÍA").length;
    const completadas = lista.filter(o => o.estado_actual === "OT COMPLETADA").length;
    const sumaAvance = lista.reduce((acc, o) => acc + (o.avance_pct || 0), 0);

    const promAvance = total > 0 ? Math.round(sumaAvance / total) : 0;
    const tasaRes = total > 0 ? ((completadas / total) * 100).toFixed(1) : "0.0";

    const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };

    setTxt('kpi-volumen', total);
    setTxt('kpi-avance-hitos', `${promAvance}%`);
    setTxt('kpi-detenciones', detenidas);
    setTxt('kpi-resolucion', `${tasaRes}%`);
}

async function cargarTablaBitacora() {
    try {
        const res = await fetch(`${API}/ordenes/`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let todas = await res.json();

        const userLog = window.obtenerUsuarioActual ? window.obtenerUsuarioActual() : null;
        if (userLog && userLog.rol === 'CLIENTE') {
            todas = todas.filter(o =>
                (userLog.empresa_id && o.empresa_id === userLog.empresa_id) ||
                (userLog.empresa_nombre && o.cliente_mandante === userLog.empresa_nombre)
            );
        }

        ordenesGlobal = todas;
        actualizarKPIsDesdeLista(ordenesGlobal);

        const selectCli = document.getElementById('filtro-cliente');
        if (selectCli) {
            const valorActual = selectCli.value;
            const clientesUnicos = [...new Set(ordenesGlobal.map(o => o.cliente_mandante || 'Austral Conectividad SpA'))];
            selectCli.innerHTML = `<option value="TODOS">Todas las Empresas Mandantes (${clientesUnicos.length})</option>` +
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
    if (cont) cont.innerText = `${filtradas.length} de ${ordenesGlobal.length} órdenes`;

    tbody.innerHTML = '';
    if (filtradas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-theme-dim">Sin registros coincidentes.</td></tr>`;
        return;
    }

    filtradas.forEach((r) => {
        const estado = r.estado_actual || 'EMITIDA';
        const info = obtenerInfoEstado(estado, r.avance_pct);
        const nombreEquipo = (r.activo && r.activo.nombre) ? r.activo.nombre : `Activo #${r.activo_id}`;
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
                <span class="font-bold text-theme-main">${r.cliente_mandante || 'Austral Conectividad SpA'}</span>
                <span class="block text-[10px] font-mono text-theme-dim">${r.tipo_mantenimiento} · Prioridad ${r.prioridad}</span>
            </td>
            <td class="px-4 py-3">
                <div class="font-semibold text-theme-main">${r.operario_responsable}</div>
                <div class="text-[10px] font-mono text-theme-dim">${ofuscarRUTLey21719(r.rut_responsable)}</div>
            </td>
            <td class="px-4 py-3 w-48">
                <div class="flex justify-between text-[10px] font-mono mb-1">
                    <span class="text-theme-muted">${compHitos}/${hitos.length} etapas</span>
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
                    Inspeccionar
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
    setTxt('inspect-cliente-mandante', `Empresa Mandante: ${orden.cliente_mandante || 'Austral Conectividad SpA'}`);
    setTxt('inspect-asset-tag', orden.activo ? `${orden.activo.codigo_activo} · ${orden.activo.nombre}` : `Activo #${orden.activo_id}`);
    setTxt('inspect-ot-crew', `Especialista: ${orden.operario_responsable} (${ofuscarRUTLey21719(orden.rut_responsable)})`);
    setTxt('inspect-ot-desc', orden.descripcion || 'Sin descripción.');
    setTxt('inspect-progress-txt', `${info.pct}% completado`);

    const bar = document.getElementById('inspect-progress-bar');
    if (bar) {
        bar.className = `h-full transition-all duration-300 ${info.colorBarra}`;
        bar.style.width = `${info.pct}%`;
    }

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

    setTxt('inspect-laplacian-score', orden.laplacian_score ? `Nitidez Verificada (Score: ${orden.laplacian_score})` : 'Sin captura óptica');
    setTxt('inspect-gps-val', `${lat}, ${lon} (Radio <= 500m OK)`);
    setTxt('inspect-hash-val', orden.hash_cadena || 'Pendiente de primera transición');

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

    if (elEncargadoNom) elEncargadoNom.innerText = `Receptor: ${nomEncargado}`;
    if (elEncargadoRut) elEncargadoRut.innerText = `RUT: ${rutEncargado}`;

    if (!datoFirma && !tokenQR && orden.codigo_ot === 'OT-1001') {
        datoFirma = FIRMA_ENCARGADO_PRECARGADA;
    }

    if (sigImg && sigPlaceholder && sigStatus) {
        if (datoFirma && datoFirma.startsWith('data:image')) {
            sigImg.src = datoFirma;
            sigImg.classList.remove('hidden');
            sigPlaceholder.classList.add('hidden');
            sigStatus.innerText = "RÚBRICA ACREDITADA";
            sigStatus.className = "code-pill text-[9px] px-2 py-0.5 rounded text-emerald-500 border-emerald-600 font-mono font-bold";
        } else if (tokenQR) {
            sigImg.classList.add('hidden');
            sigPlaceholder.classList.remove('hidden');
            sigPlaceholder.innerHTML = `<span class="text-emerald-500 font-bold font-mono text-[10px]">TOKEN QR VERIFICADO<br><span class="text-theme-dim text-[9px]">${tokenQR}</span></span>`;
            sigStatus.innerText = "TOKEN QR OK";
            sigStatus.className = "code-pill text-[9px] px-2 py-0.5 rounded text-emerald-500 border-emerald-600 font-mono font-bold";
        } else {
            sigImg.classList.add('hidden');
            sigPlaceholder.classList.remove('hidden');
            sigPlaceholder.innerHTML = `<span>Pendiente de firma en terreno</span>`;
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
            const yaCerrada = (estado === 'OT COMPLETADA');
            btnAprobar.disabled = yaCerrada;
            btnAprobar.innerText = yaCerrada
                ? 'Orden Cerrada y Auditada'
                : 'Visar Protocolo y Cerrar Orden';
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
        if (!res.ok) throw new Error("Error al guardar etapa");
        const actualizada = await res.json();
        ordenSeleccionada = actualizada;
        poblarDatosInspector(actualizada);
        await actualizarMonitorCompleto();
        mostrarToastScada(`Etapa #${idx + 1} actualizada en ${actualizada.codigo_ot}`);
    } catch (e) {
        mostrarToastScada("No se pudo actualizar la etapa", true);
    }
}

async function auditarOrdenActiva(accion) {
    if (!ordenSeleccionada) return;
    const nuevoEstado = (accion === 'COMPLETAR') ? 'OT COMPLETADA' : 'EN EJECUCIÓN';
    const obs = 'Protocolo de etapas verificado y visado conforme por Supervisión. Orden cerrada.';

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
            mostrarToastScada(data.detail || 'No se pudo cerrar la orden', true);
            return;
        }
        mostrarToastScada(`Orden ${ordenSeleccionada.codigo_ot} visada y cerrada.`);
        await actualizarMonitorCompleto();
    } catch (e) {
        mostrarToastScada(`Error de red: ${e.message}`, true);
    }
}

/* ==========================================================================
   MODAL EMISIÓN Y CONSTRUCTOR HÍBRIDO DE HITOS (PLANTILLA + FILAS DINÁMICAS)
   ========================================================================== */

async function cargarCatalogosRelacionalesModal() {
    try {
        const [resAct, resUsr, resEmp] = await Promise.all([
            fetch(`${API}/activos/`),
            fetch(`${API}/auth/usuarios?rol=TRABAJADOR`),
            fetch(`${API}/auth/empresas`)
        ]);

        if (resAct.ok) {
            const activos = await resAct.json();
            const selAct = document.getElementById('form-activo');
            if (selAct) {
                selAct.innerHTML = activos.map(a => `<option value="${a.id}">${a.codigo_activo} — ${a.nombre}</option>`).join('');
            }
        }

        if (resUsr.ok) {
            listaTecnicosBD = await resUsr.json();
            const selTec = document.getElementById('selector-tecnico-bd');
            if (selTec) {
                selTec.innerHTML = `<option value="">Seleccionar del personal registrado (${listaTecnicosBD.length})...</option>` +
                    listaTecnicosBD.map(u => `<option value="${u.id}">${u.nombre_completo} · ${u.cargo}</option>`).join('');
            }
        }

        if (resEmp.ok) {
            const empresas = await resEmp.json();
            const dlEmp = document.getElementById('lista-empresas-mandantes');
            if (dlEmp) {
                dlEmp.innerHTML = empresas.map(e => `<option value="${e.razon_social}">`).join('');
            }
        }
    } catch (e) {}
}

function seleccionarTecnicoDesdeBD(idStr) {
    if (!idStr) return;
    const u = listaTecnicosBD.find(x => String(x.id) === String(idStr));
    if (u) {
        document.getElementById('form-operario').value = u.nombre_completo;
        document.getElementById('form-rut').value = u.rut;
    }
}

function aplicarPlantillaProtocolo(clave) {
    let key = clave;
    if (clave === 'PREVENTIVO') key = 'RF_MW';
    if (clave === 'CORRECTIVO') key = 'FIBRA_OTDR';
    if (clave === 'INSPECCION') key = 'TORRE_EST';

    const p = PLANTILLAS_PROTOCOLOS[key] || PLANTILLAS_PROTOCOLOS.RF_MW;
    const descInput = document.getElementById('form-descripcion');
    if (descInput) descInput.value = p.descripcion;

    hitosConstructor = p.etapas.map(e => ({ dia: e.dia, titulo: e.titulo }));
    renderizarFilasConstructorHitos();
}

function renderizarFilasConstructorHitos() {
    const cont = document.getElementById('constructor-hitos-filas');
    if (!cont) return;

    cont.innerHTML = hitosConstructor.map((h, idx) => `
        <div class="flex items-center gap-2">
            <input type="text" value="${h.dia}" oninput="actualizarDatoHitoConstructor(${idx}, 'dia', this.value)"
                class="w-24 border rounded px-2 py-1.5 text-[11px] font-mono font-bold shrink-0" placeholder="Etapa">
            <input type="text" value="${h.titulo}" oninput="actualizarDatoHitoConstructor(${idx}, 'titulo', this.value)"
                class="flex-1 border rounded px-2.5 py-1.5 text-xs" placeholder="Descripción verificable de la etapa..." required>
            <button type="button" onclick="eliminarFilaHitoConstructor(${idx})"
                class="px-2 py-1 rounded border border-theme-dim hover:border-red-500 text-theme-dim hover:text-red-500 font-bold text-xs shrink-0" title="Eliminar etapa">
                ×
            </button>
        </div>
    `).join('');
}

function actualizarDatoHitoConstructor(idx, campo, valor) {
    if (hitosConstructor[idx]) {
        hitosConstructor[idx][campo] = valor;
    }
}

function agregarFilaHitoConstructor() {
    const num = hitosConstructor.length + 1;
    hitosConstructor.push({
        dia: `Etapa ${num}`,
        titulo: ""
    });
    renderizarFilasConstructorHitos();
}

function eliminarFilaHitoConstructor(idx) {
    if (hitosConstructor.length <= 1) return;
    hitosConstructor.splice(idx, 1);
    renderizarFilasConstructorHitos();
}

function abrirModalOT() {
    const modal = document.getElementById('modal-ot');
    if (!modal) return;

    const siguienteNum = 1001 + ordenesGlobal.length;
    document.getElementById('form-codigo').value = `OT-${siguienteNum}`;
    document.getElementById('form-cliente').value = 'Austral Conectividad SpA';

    if (listaTecnicosBD.length > 0) {
        document.getElementById('selector-tecnico-bd').value = String(listaTecnicosBD[0].id);
        seleccionarTecnicoDesdeBD(listaTecnicosBD[0].id);
    } else {
        document.getElementById('form-operario').value = 'Rodrigo Fuentes A.';
        document.getElementById('form-rut').value = '15.902.438-2';
    }

    aplicarPlantillaProtocolo('RF_MW');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function cerrarModalOT() {
    const modal = document.getElementById('modal-ot');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function enviarNuevaOT(e) {
    e.preventDefault();
    const hitosLimpios = hitosConstructor
        .filter(h => h.titulo && h.titulo.trim().length > 0)
        .map((h, idx) => ({
            id: idx + 1,
            dia: (h.dia || `Etapa ${idx + 1}`).trim(),
            titulo: h.titulo.trim(),
            completado: false
        }));

    const payload = {
        codigo_ot: document.getElementById('form-codigo').value.trim(),
        cliente_mandante: document.getElementById('form-cliente').value.trim(),
        activo_id: parseInt(document.getElementById('form-activo').value, 10),
        tipo_mantenimiento: document.getElementById('form-tipo').value,
        prioridad: document.getElementById('form-prioridad').value,
        operario_responsable: document.getElementById('form-operario').value.trim(),
        rut_responsable: document.getElementById('form-rut').value.trim(),
        descripcion: document.getElementById('form-descripcion').value.trim(),
        hitos: hitosLimpios.length > 0 ? hitosLimpios : null
    };

    try {
        const res = await fetch(`${API}/ordenes/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            mostrarToastScada(data.detail || 'Error al emitir la orden', true);
            return;
        }
        cerrarModalOT();
        mostrarToastScada(`Orden ${payload.codigo_ot} asignada a ${payload.operario_responsable}.`);
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