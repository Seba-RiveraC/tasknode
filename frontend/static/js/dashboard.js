const API = window.TaskNodeConfig.API_URL;
let ordenesGlobal = [];
let ordenSeleccionada = null;
let rolVistaActual = 'SUPERVISOR';
let hitosConstructor = [];
let listaTecnicosBD = [];
let plantillaAplicada = null;
let contenidoPlantillaAplicada = null;
let mostrarHistorial = false;

// Índice temporal para el arrastre Drag & Drop
let dragSrcIndex = null;

// Plantillas de cronograma
const PLANTILLAS_PROTOCOLOS = {
    ENLACE_RF: {
        descripcion: "Mantenimiento preventivo de enlace microondas: inspección de guía de onda y conectores RF, alineación de parábola y verificación de potencia de recepción.",
        etapas: [
            { dia: "Etapa 1", titulo: "Acceso al sitio, charla de seguridad y ascenso acreditado a la torre" },
            { dia: "Etapa 2", titulo: "Inspección de guía de onda, conectores RF y sellado contra humedad" },
            { dia: "Etapa 3", titulo: "Alineación de parábola y verificación de potencia (-48 dBm / VSWR)" },
            { dia: "Etapa 4", titulo: "Evidencia fotográfica nítida y firma de recepción en sitio" }
        ]
    },
    FIBRA_OTDR: {
        descripcion: "Empalme y certificación de fibra óptica en tramo troncal: preparación de manguito, fusión por arco y medición reflectométrica OTDR bidireccional.",
        etapas: [
            { dia: "Etapa 1", titulo: "Señalización del área de trabajo y apertura de cámara o mufa óptica" },
            { dia: "Etapa 2", titulo: "Preparación de buffer, limpieza de filamentos y armado de casete" },
            { dia: "Etapa 3", titulo: "Fusión por arco de hilos asignados con atenuación < 0.05 dB" },
            { dia: "Etapa 4", titulo: "Medición OTDR bidireccional, respaldo fotográfico y cierre de manguito" }
        ]
    },
    ENERGIA_UPS: {
        descripcion: "Respaldo de energía en nodo: revisión de banco de baterías, rectificadores y prueba de transferencia de la UPS bajo carga real.",
        etapas: [
            { dia: "Etapa 1", titulo: "Verificación de alimentación DC y aislamiento seguro del banco de baterías" },
            { dia: "Etapa 2", titulo: "Diagnóstico de baterías y revisión o reemplazo de módulos rectificadores" },
            { dia: "Etapa 3", titulo: "Montaje de unidad de reemplazo y reapriete de bornes con torque calibrado" },
            { dia: "Etapa 4", titulo: "Prueba de transferencia en carga real y recepción conforme" }
        ]
    },
    DUOC: {
        descripcion: "Revisión de equipos y registro de actividades en Duoc UC Puerto Montt.",
        etapas: [
            { dia: "Etapa 1", titulo: "Revisar el área de trabajo" },
            { dia: "Etapa 2", titulo: "Inspeccionar el equipo" },
            { dia: "Etapa 3", titulo: "Registrar el resultado y la evidencia" }
        ]
    }
};

const PLANTILLA_SUGERIDA_POR_TIPO = {
    PREVENTIVO: 'ENLACE_RF',
    CORRECTIVO: 'FIBRA_OTDR',
    INSPECCION: 'ENERGIA_UPS'
};

const PREFIJO_FOLIO = 'OT-2026-TL-';

document.addEventListener('DOMContentLoaded', () => {
    configurarSesionSegunUsuario();
    actualizarMonitorCompleto();
    cargarCatalogosRelacionalesModal();
    setInterval(actualizarMonitorCompleto, 5000);

    document.addEventListener('click', (e) => {
        const popover = document.getElementById('popover-calendario-ot');
        if (popover && !popover.contains(e.target) && !e.target.closest('.btn-trigger-calendario')) {
            cerrarPopoverCalendario();
        }
    });
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
    const navAudit = document.getElementById('nav-link-auditoria');
    const sub = document.getElementById('subtitulo-rol');
    const btnNueva = document.getElementById('btn-nueva-ot-top');

    if (sideName) sideName.innerText = user.nombre_completo;

    if (user.rol === 'CLIENTE') {
        rolVistaActual = 'CLIENTE';
        if (btnNueva) btnNueva.classList.add('hidden');
        if (navAudit) navAudit.classList.add('hidden');
        if (sideTag) sideTag.innerText = 'Portal mandante';
        if (sub) sub.innerText = `${user.empresa_nombre || user.nombre_completo} · Seguimiento de órdenes y actas`;
    } else {
        rolVistaActual = 'SUPERVISOR';
        if (sideTag) sideTag.innerText = 'Supervisión';
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

function abrirDrawerInspeccion(orden) {
    ordenSeleccionada = orden;
    poblarDatosInspector(orden);
    const drawer = document.getElementById('drawer-inspeccion');
    const backdrop = document.getElementById('backdrop-inspeccion');
    if (drawer) drawer.classList.remove('translate-x-full');
    if (backdrop) backdrop.classList.remove('hidden');
}

function abrirDrawerInspeccionPorCodigo(codigoOt) {
    const orden = ordenesGlobal.find(o => o.codigo_ot === codigoOt);
    if (orden) {
        abrirDrawerInspeccion(orden);
    }
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
    const pct = (avanceReal !== undefined && avanceReal !== null) ? avanceReal : 0;
    switch (estado) {
        case "EMITIDA":
            return { pct, badge: "badge-emitida", colorBarra: "bg-slate-400" };
        case "EN EJECUCIÓN":
            return { pct, badge: "badge-ejecucion", colorBarra: "bg-cyan-600" };
        case "EN VALIDACIÓN":
            return { pct, badge: "badge-validacion", colorBarra: "bg-indigo-600" };
        case "OT COMPLETADA":
        case "ORDEN FINALIZADA":
            return { pct: 100, badge: "badge-completada", colorBarra: "bg-emerald-600" };
        case "DETENIDA POR ANOMALÍA":
            return { pct, badge: "badge-detenida", colorBarra: "bg-red-600" };
        default:
            return { pct, badge: "badge-emitida", colorBarra: "bg-slate-400" };
    }
}

function etiquetaEstado(estado) {
    return estado === 'OT COMPLETADA' ? 'Pendiente de firma' : estado;
}

// =========================================================================
// MINI CARTA GANTT Y CÁLCULO DINÁMICO DE HITOS
// =========================================================================

function calcularAvanceHitosDinamico(hitos, estadoActual) {
    if (["OT COMPLETADA", "ORDEN FINALIZADA"].includes(estadoActual)) return 100;
    if (!hitos || hitos.length === 0) return 0;
    const completados = hitos.filter(h => h.completado).length;
    return Math.round((completados / hitos.length) * 100);
}

function renderizarMiniGanttTabla(hitos, estadoActual) {
    const lista = hitos || [];
    const total = lista.length;
    const completados = ["OT COMPLETADA", "ORDEN FINALIZADA"].includes(estadoActual) ? total : lista.filter(h => h.completado).length;
    const pct = total > 0 ? Math.round((completados / total) * 100) : 0;

    return `
        <div class="space-y-1.5">
            <div class="flex justify-between text-xs">
                <span class="text-theme-muted">${completados}/${total} etapas</span>
                <span class="font-semibold text-theme-main">${pct}%</span>
            </div>
            <div class="h-2 w-full rounded-full bg-surface-3 overflow-hidden">
                <div class="h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-[#4f46e5]'}" style="width:${pct}%"></div>
            </div>
        </div>
    `;
}

// =========================================================================
// CÁLCULO DE TIEMPO SLA Y CALENDARIO
// =========================================================================

function calcularTiemposSLA(orden) {
    const creacion = new Date(orden.created_at);
    const fechaLimite = new Date(orden.fecha_limite);
    if (!orden.created_at || !orden.fecha_limite || isNaN(creacion.getTime()) || isNaN(fechaLimite.getTime())) {
        throw new Error(`Fechas inválidas en la orden ${orden.codigo_ot}`);
    }
    const ahora = new Date();
    const diferenciaMs = fechaLimite.getTime() - ahora.getTime();

    const dias = Math.floor(Math.abs(diferenciaMs) / (1000 * 60 * 60 * 24));
    const horas = Math.floor((Math.abs(diferenciaMs) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    let estadoSLA = "EN PLAZO";
    let textoRestante = `${dias}d ${horas}h restantes`;
    let colorTexto = "text-emerald-600";

    if (["OT COMPLETADA", "ORDEN FINALIZADA"].includes(orden.estado_actual)) {
        estadoSLA = "CERRADA";
        textoRestante = orden.estado_actual === "ORDEN FINALIZADA" ? "Finalizada" : "Pendiente de firma";
        colorTexto = "text-emerald-600 font-semibold";
    } else if (diferenciaMs < 0) {
        estadoSLA = "VENCIDA";
        textoRestante = `Vencida (${dias}d ${horas}h)`;
        colorTexto = "text-red-600 font-bold";
    } else if (diferenciaMs < 12 * 60 * 60 * 1000) {
        estadoSLA = "POR VENCER";
        textoRestante = `Urgente: ${horas}h restantes`;
        colorTexto = "text-amber-600 font-bold";
    }

    return { creacion, fechaLimite, textoRestante, estadoSLA, colorTexto };
}

function desplegarMinicalendario(event, codigoOt) {
    event.stopPropagation();
    const orden = ordenesGlobal.find(o => o.codigo_ot === codigoOt);
    if (!orden) return;

    let popover = document.getElementById('popover-calendario-ot');
    if (!popover) {
        popover = document.createElement('div');
        popover.id = 'popover-calendario-ot';
        popover.className = 'fixed z-50 bg-surface-1 border-2 border-theme-bright rounded-lg shadow-2xl p-4 w-72 text-xs transition-opacity duration-150';
        document.body.appendChild(popover);
    }

    const { creacion, fechaLimite, textoRestante, colorTexto } = calcularTiemposSLA(orden);

    const mesNombre = fechaLimite.toLocaleString('es-CL', { month: 'long', year: 'numeric' });
    const primerDiaSemana = new Date(fechaLimite.getFullYear(), fechaLimite.getMonth(), 1).getDay();
    const diasEnMes = new Date(fechaLimite.getFullYear(), fechaLimite.getMonth() + 1, 0).getDate();

    let celdasCalendario = '';
    const offset = primerDiaSemana === 0 ? 6 : primerDiaSemana - 1;
    for (let i = 0; i < offset; i++) {
        celdasCalendario += `<div class="p-1 text-center text-theme-dim opacity-30">-</div>`;
    }

    for (let d = 1; d <= diasEnMes; d++) {
        const esEmision = (d === creacion.getDate() && fechaLimite.getMonth() === creacion.getMonth() && fechaLimite.getFullYear() === creacion.getFullYear());
        const esLimite = (d === fechaLimite.getDate());
        let clase = "p-1 text-center rounded text-[11px] font-mono ";

        if (esLimite) {
            clase += "bg-[#4f46e5] text-white font-bold";
        } else if (esEmision) {
            clase += "bg-surface-2 border border-theme-bright text-accent font-bold";
        } else {
            clase += "text-theme-main hover:bg-surface-2";
        }

        celdasCalendario += `<div class="${clase}">${d}</div>`;
    }

    popover.innerHTML = `
        <div class="flex justify-between items-center border-b border-theme-dim pb-2 mb-2.5">
            <div class="flex items-center gap-1.5">
                <span class="font-bold text-accent font-mono">${orden.codigo_ot}</span>
            </div>
            <button onclick="cerrarPopoverCalendario()" class="text-theme-dim hover:text-theme-main font-bold text-xs px-1">✕</button>
        </div>

        <div class="bg-surface-2 border border-theme-dim rounded p-2.5 mb-3 space-y-1">
            <div class="flex justify-between text-[11px]">
                <span class="text-theme-dim">Emisión:</span>
                <span class="font-mono text-theme-main">${creacion.toLocaleDateString('es-CL')} ${creacion.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div class="flex justify-between text-[11px]">
                <span class="text-theme-dim">Plazo límite:</span>
                <span class="font-mono font-bold text-theme-main">${fechaLimite.toLocaleDateString('es-CL')} ${fechaLimite.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div class="flex justify-between text-[11px] pt-1 border-t border-theme-dim">
                <span class="text-theme-dim font-bold">Estado:</span>
                <span class="font-mono ${colorTexto}">${textoRestante}</span>
            </div>
        </div>

        <div class="border border-theme-dim rounded p-2 bg-surface-2">
            <div class="text-center font-bold text-[11px] text-theme-main uppercase mb-1.5">${mesNombre}</div>
            <div class="grid grid-cols-7 gap-1 text-[9px] font-mono text-theme-dim text-center border-b border-theme-dim pb-1 mb-1">
                <span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span>
            </div>
            <div class="grid grid-cols-7 gap-1">
                ${celdasCalendario}
            </div>
        </div>

        <div class="mt-2.5 pt-2 border-t border-theme-dim flex justify-between items-center text-[10px] text-theme-dim">
            <span>● Resaltado: Término SLA</span>
            <button onclick="cerrarPopoverCalendario(); abrirDrawerInspeccionPorCodigo('${orden.codigo_ot}')" class="text-accent hover:underline font-bold">
                Inspeccionar →
            </button>
        </div>
    `;

    const rect = event.currentTarget.getBoundingClientRect();
    popover.style.top = `${Math.min(window.innerHeight - 340, rect.bottom + 6)}px`;
    popover.style.left = `${Math.min(window.innerWidth - 300, Math.max(10, rect.left))}px`;
    popover.classList.remove('hidden');
}

function cerrarPopoverCalendario() {
    const popover = document.getElementById('popover-calendario-ot');
    if (popover) popover.classList.add('hidden');
}

// =========================================================================

async function actualizarMonitorCompleto() {
    await cargarTablaBitacora();
}

function actualizarKPIsDesdeLista(lista) {
    const total = lista.length;
    const detenidas = lista.filter(o => o.estado_actual === "DETENIDA POR ANOMALÍA").length;
    const completadas = lista.filter(o => ["OT COMPLETADA", "ORDEN FINALIZADA"].includes(o.estado_actual)).length;
    
    const sumaAvance = lista.reduce((acc, o) => acc + calcularAvanceHitosDinamico(o.hitos, o.estado_actual), 0);
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
            selectCli.innerHTML = `<option value="TODOS">Todos los clientes</option>` +
                clientesUnicos.map(c => `<option value="${c}">${c}</option>`).join('');
            if (clientesUnicos.includes(valorActual)) selectCli.value = valorActual;
        }

        aplicarFiltrosLocal();

        if (ordenSeleccionada && dragSrcIndex === null) {
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

    const filtroEstado = document.getElementById('filtro-estado');
    if (filtroEstado) {
        for (const opcion of filtroEstado.options) {
            if (opcion.value === 'OT COMPLETADA') opcion.disabled = mostrarHistorial;
            if (opcion.value === 'ORDEN FINALIZADA') opcion.disabled = !mostrarHistorial;
        }
        if (filtroEstado.selectedOptions[0]?.disabled) filtroEstado.value = 'TODOS';
    }
    const q = (document.getElementById('filtro-texto')?.value || '').toLowerCase().trim();
    const cliFiltro = document.getElementById('filtro-cliente')?.value || 'TODOS';
    const estFiltro = filtroEstado?.value || 'TODOS';

    const filtradas = ordenesGlobal.filter(o => {
        const historica = o.estado_actual === 'ORDEN FINALIZADA';
        const coincideTexto = !q ||
            o.codigo_ot.toLowerCase().includes(q) ||
            (o.cliente_mandante || '').toLowerCase().includes(q) ||
            (o.operario_responsable || '').toLowerCase().includes(q) ||
            (o.descripcion || '').toLowerCase().includes(q) ||
            (o.activo && o.activo.nombre.toLowerCase().includes(q));
        const coincideCli = (cliFiltro === 'TODOS') || (o.cliente_mandante === cliFiltro);
        const coincideEst = (estFiltro === 'TODOS') || (o.estado_actual === estFiltro);
        return historica === mostrarHistorial && coincideTexto && coincideCli && coincideEst;
    });

    const cont = document.getElementById('contador-resultados');
    const totalVista = ordenesGlobal.filter(o => (o.estado_actual === 'ORDEN FINALIZADA') === mostrarHistorial).length;
    if (cont) cont.innerText = `${filtradas.length} de ${totalVista} órdenes`;

    tbody.innerHTML = '';
    if (filtradas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-theme-dim">Sin registros coincidentes.</td></tr>`;
        return;
    }

    filtradas.forEach((r) => {
        const estado = r.estado_actual || 'EMITIDA';
        const hitos = r.hitos || [];
        const avanceCalculado = calcularAvanceHitosDinamico(hitos, estado);
        const info = obtenerInfoEstado(estado, avanceCalculado);
        const nombreEquipo = (r.activo && r.activo.nombre) ? r.activo.nombre : `Activo #${r.activo_id}`;
        const sla = calcularTiemposSLA(r);

        const tr = document.createElement('tr');
        tr.className = "border-b border-theme-dim hover:bg-surface-2 transition";

        tr.innerHTML = `
            <td class="px-4 py-4">
                <div class="font-mono font-semibold text-theme-main text-sm">${r.codigo_ot}</div>
                <div class="text-xs text-theme-dim truncate max-w-[230px] mt-0.5">${nombreEquipo}</div>
            </td>
            <td class="px-4 py-4">
                <div class="font-semibold text-theme-main text-sm">${r.cliente_mandante || 'Austral Conectividad SpA'}</div>
                <div class="text-xs text-theme-dim mt-0.5">${r.tipo_mantenimiento} · Prioridad ${r.prioridad}</div>
            </td>
            <td class="px-4 py-4">
                <div class="font-medium text-theme-main text-sm">${r.operario_responsable}</div>
                <div class="text-xs text-theme-dim mt-0.5">${ofuscarRUTLey21719(r.rut_responsable)}</div>
            </td>
            <td class="px-4 py-4 w-36">
                ${renderizarMiniGanttTabla(hitos, estado)}
            </td>
            <td class="px-4 py-4 whitespace-nowrap">
                <button type="button" onclick="desplegarMinicalendario(event, '${r.codigo_ot}')" class="btn-trigger-calendario inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-theme-bright bg-surface-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500" title="Ver calendario del plazo">
                    <span class="p-1.5 rounded-md bg-surface-1 border border-theme-dim text-accent">
                        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                        </svg>
                    </span>
                    <span>
                        <span class="block text-sm font-medium ${sla.colorTexto}">${sla.textoRestante}</span>
                        <span class="block text-xs text-theme-dim mt-0.5">Límite ${sla.fechaLimite.toLocaleDateString('es-CL')}</span>
                    </span>
                </button>
            </td>
            <td class="px-4 py-4 whitespace-nowrap">
                <span class="inline-block px-3 py-1 text-xs font-semibold rounded-full ${info.badge}">
                    ${etiquetaEstado(estado)}
                </span>
            </td>
            <td class="px-4 py-4 text-right whitespace-nowrap">
                <a href="orden_pdf.html?codigo=${encodeURIComponent(r.codigo_ot)}&modo=COMPLETA" target="_blank"                 class="inline-block px-3 py-2 rounded-lg border border-theme-bright bg-surface-1 hover:bg-surface-3 text-theme-main font-medium text-sm transition mr-1">Ver OT</a>
                                <button type="button" onclick="abrirDrawerInspeccionPorCodigo('${r.codigo_ot}')" class="btn-primary px-3 py-2 rounded-lg font-medium text-sm transition cursor-pointer">
                    Gestionar
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function poblarDatosInspector(orden) {
    const estado = orden.estado_actual || 'EMITIDA';
    const hitos = orden.hitos || [];
    const avanceCalculado = calcularAvanceHitosDinamico(hitos, estado);
    const info = obtenerInfoEstado(estado, avanceCalculado);

    const lat = (orden.activo && orden.activo.latitud_referencia) ? orden.activo.latitud_referencia.toFixed(4) : '-41.4870';
    const lon = (orden.activo && orden.activo.longitud_referencia) ? orden.activo.longitud_referencia.toFixed(4) : '-72.9550';
    const sla = calcularTiemposSLA(orden);

    const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };

    const pill = document.getElementById('inspect-fsm-pill');
    if (pill) {
        pill.className = `text-[10px] font-bold px-2.5 py-0.5 rounded ${info.badge}`;
        pill.innerText = etiquetaEstado(estado);
    }

    setTxt('inspect-ot-code', orden.codigo_ot);
    setTxt('inspect-cliente-mandante', orden.cliente_mandante || 'Austral Conectividad SpA');
    setTxt('inspect-sla-tiempo', `Plazo: ${sla.textoRestante} · límite ${sla.fechaLimite.toLocaleDateString('es-CL')}`);

    const btnCalInspect = document.getElementById('btn-inspect-calendar');
    if (btnCalInspect) {
        btnCalInspect.onclick = (e) => desplegarMinicalendario(e, orden.codigo_ot);
    }

    setTxt('inspect-asset-tag', orden.activo ? `${orden.activo.codigo_activo} · ${orden.activo.nombre}` : `Activo #${orden.activo_id}`);
    setTxt('inspect-asset-loc', orden.activo && orden.activo.ubicacion_tecnica ? orden.activo.ubicacion_tecnica : '');
    setTxt('inspect-ot-crew', `Técnico: ${orden.operario_responsable} (${ofuscarRUTLey21719(orden.rut_responsable)})`);
    setTxt('inspect-ot-desc', orden.descripcion || 'Sin descripción.');
    setTxt('inspect-progress-txt', `${avanceCalculado}% · ${hitos.filter(h => h.completado || estado === 'OT COMPLETADA').length}/${hitos.length} etapas`);

    const barProg = document.getElementById('inspect-progress-bar');
    if (barProg) {
        barProg.style.width = `${avanceCalculado}%`;
        barProg.className = `h-full rounded-full transition-all ${avanceCalculado === 100 ? 'bg-emerald-500' : 'bg-[#4f46e5]'}`;
    }

    // Lista única de etapas: checkbox + arrastre en la misma fila
    const contEtapas = document.getElementById('lista-etapas-inspector');
    setTxt('conteo-etapas-inspector', `${hitos.filter(h => h.completado || estado === 'OT COMPLETADA').length} de ${hitos.length} completadas`);
    if (contEtapas) {
        const soloLectura = (rolVistaActual === 'CLIENTE' || ['OT COMPLETADA', 'ORDEN FINALIZADA'].includes(estado));
        contEtapas.innerHTML = hitos.map((h, idx) => {
            const hecho = (estado === "OT COMPLETADA") || h.completado;
            const dragAttrs = soloLectura ? '' : `draggable="true"
                     ondragstart="manejarDragStart(event, ${idx})"
                     ondragover="manejarDragOver(event)"
                     ondragenter="manejarDragEnter(event)"
                     ondragleave="manejarDragLeave(event)"
                     ondrop="manejarDrop(event, ${idx})"
                     ondragend="manejarDragEnd(event)"`;
            return `
                <div ${dragAttrs}
                     class="item-gantt-draggable flex items-center gap-3 p-3.5 rounded-lg border border-theme-dim bg-surface-1 hover:border-theme-bright transition select-none">
                    ${soloLectura ? '' : '<span class="text-theme-dim cursor-grab active:cursor-grabbing text-base leading-none" title="Arrastra para reordenar">⠿</span>'}
                    <input type="checkbox" ${hecho ? 'checked' : ''} ${soloLectura ? 'disabled' : ''}
                        onchange="toggleHitoDesdeConsola(${idx}, this.checked)"
                        class="w-5 h-5 shrink-0 accent-[#4f46e5] cursor-pointer">
                    <div class="flex-1 min-w-0">
                        <span class="block text-xs font-medium text-theme-dim">${h.dia}</span>
                        <span class="block text-sm ${hecho ? 'line-through text-theme-dim' : 'text-theme-main'}">${h.titulo}</span>
                    </div>
                    ${soloLectura ? '' : `<button type="button" onclick="eliminarHitoDeOrdenExistente(${idx})" class="text-theme-dim hover:text-red-500 px-1.5 text-sm" title="Quitar etapa">✕</button>`}
                </div>
            `;
        }).join('');
    }

    const btnAddEtapa = document.getElementById('btn-agregar-etapa');
    if (btnAddEtapa) btnAddEtapa.classList.toggle('hidden', rolVistaActual === 'CLIENTE' || ['OT COMPLETADA', 'ORDEN FINALIZADA'].includes(estado));

    setTxt('inspect-laplacian-score', orden.laplacian_score ? `Nitidez verificada · ${orden.laplacian_score}` : 'Sin captura');
    const constancia = orden.constancia_tecnico;
    const fechaConstancia = constancia ? new Date(constancia.fecha_dispositivo) : null;
    setTxt('inspect-constancia-tecnico', constancia
        ? `${constancia.nombre} · ${fechaConstancia && !Number.isNaN(fechaConstancia.getTime()) ? fechaConstancia.toLocaleString('es-CL') : 'Fecha no disponible'}`
        : 'No hay constancia de término registrada.');
    setTxt('inspect-gps-val', `${lat}, ${lon}`);
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

    const datoFirma = orden.firma_data;
    const recepcionAnterior = document.getElementById('inspect-recepcion-anterior');
    recepcionAnterior.classList.toggle('hidden', !datoFirma);
    recepcionAnterior.classList.toggle('flex', !!datoFirma);
    const tokenQR = (datoFirma && datoFirma.startsWith('TOKEN-QR')) ? datoFirma : null;
    const nomEncargado = orden.encargado_nombre || 'Pendiente';
    const rutEncargado = orden.encargado_rut || '-';

    if (elEncargadoNom) elEncargadoNom.innerText = nomEncargado;
    if (elEncargadoRut) elEncargadoRut.innerText = `RUT ${rutEncargado}`;

    if (sigImg && sigPlaceholder && sigStatus) {
        if (datoFirma && datoFirma.startsWith('data:image')) {
            sigImg.src = datoFirma;
            sigImg.classList.remove('hidden');
            sigPlaceholder.classList.add('hidden');
            sigStatus.innerText = "Firmada";
            sigStatus.className = "text-xs px-2.5 py-0.5 rounded-full badge-completada font-semibold";
        } else if (tokenQR) {
            sigImg.classList.add('hidden');
            sigPlaceholder.classList.remove('hidden');
            sigPlaceholder.innerHTML = `<span class="text-theme-dim font-semibold text-xs">Registro QR anterior (no verificado)</span>`;
            sigStatus.innerText = "Token QR";
            sigStatus.className = "text-xs px-2.5 py-0.5 rounded-full badge-completada font-semibold";
        } else {
            sigImg.classList.add('hidden');
            sigPlaceholder.classList.remove('hidden');
            sigPlaceholder.innerHTML = `<span>Pendiente de firma en terreno</span>`;
            sigStatus.innerText = "Pendiente";
            sigStatus.className = "text-xs px-2.5 py-0.5 rounded-full badge-emitida font-semibold";
        }
    }

    const btnAprobar = document.getElementById('btn-aprobar-fsm');
    if (btnAprobar) {
        if (rolVistaActual === 'CLIENTE') {
            btnAprobar.classList.add('hidden');
        } else {
            btnAprobar.classList.remove('hidden');
            btnAprobar.disabled = estado !== 'OT COMPLETADA';
            btnAprobar.innerText = estado === 'ORDEN FINALIZADA'
                ? 'Orden finalizada'
                : estado === 'OT COMPLETADA' ? 'Firmar y finalizar' : 'Pendiente de término técnico';
        }
    }
}

// =========================================================================
// DRAG AND DROP NATIVO PARA REORDENAR LAS ETAPAS
// =========================================================================

function manejarDragStart(e, index) {
    dragSrcIndex = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
    e.currentTarget.classList.add('dragging');
}

function manejarDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function manejarDragEnter(e) {
    e.currentTarget.classList.add('drag-over');
}

function manejarDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
        e.currentTarget.classList.remove('drag-over');
    }
}

async function manejarDrop(e, targetIndex) {
    if (e.stopPropagation) e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');

    if (dragSrcIndex !== null && dragSrcIndex !== targetIndex && ordenSeleccionada && ordenSeleccionada.hitos) {
        const hitos = ordenSeleccionada.hitos;

        const elementoMovido = hitos.splice(dragSrcIndex, 1)[0];
        hitos.splice(targetIndex, 0, elementoMovido);
        hitos.forEach((h, i) => { h.id = i + 1; });

        dragSrcIndex = null;
        await sincronizarHitosOrden(hitos);
    }
    return false;
}

function manejarDragEnd() {
    dragSrcIndex = null;
    document.querySelectorAll('.item-gantt-draggable').forEach(el => {
        el.classList.remove('dragging', 'drag-over');
    });
}

// =========================================================================
// GESTOR DE HITOS INTEGRADO (CERO ALERTAS)
// =========================================================================

function mostrarFormularioNuevoHito() {
    const panel = document.getElementById('formulario-agregar-hito-panel');
    const inputTag = document.getElementById('nuevo-hito-tag');
    const inputTitulo = document.getElementById('nuevo-hito-titulo');

    if (!panel || !ordenSeleccionada) return;

    const siguienteNum = (ordenSeleccionada.hitos ? ordenSeleccionada.hitos.length : 0) + 1;
    inputTag.value = `Etapa ${siguienteNum}`;
    inputTitulo.value = '';

    panel.classList.remove('hidden');
    inputTitulo.focus();
}

function ocultarFormularioNuevoHito() {
    const panel = document.getElementById('formulario-agregar-hito-panel');
    if (panel) panel.classList.add('hidden');
}

async function guardarNuevoHitoDesdeFormulario() {
    if (!ordenSeleccionada) return;

    const tag = document.getElementById('nuevo-hito-tag').value.trim();
    const titulo = document.getElementById('nuevo-hito-titulo').value.trim();

    if (!titulo) {
        mostrarToastScada("Debe ingresar una actividad planificada.", true);
        return;
    }

    const hitosActuales = ordenSeleccionada.hitos || [];
    hitosActuales.push({
        id: hitosActuales.length + 1,
        dia: tag || `Etapa ${hitosActuales.length + 1}`,
        titulo: titulo,
        completado: false
    });

    ocultarFormularioNuevoHito();
    await sincronizarHitosOrden(hitosActuales);
}

async function eliminarHitoDeOrdenExistente(idx) {
    if (!ordenSeleccionada || !ordenSeleccionada.hitos) return;
    if (ordenSeleccionada.hitos.length <= 1) {
        mostrarToastScada("La orden debe tener al menos una etapa.", true);
        return;
    }

    ordenSeleccionada.hitos.splice(idx, 1);
    ordenSeleccionada.hitos.forEach((h, i) => { h.id = i + 1; });
    await sincronizarHitosOrden(ordenSeleccionada.hitos);
}

async function sincronizarHitosOrden(nuevosHitos) {
    try {
        const res = await fetch(`${API}/ordenes/${encodeURIComponent(ordenSeleccionada.codigo_ot)}/hitos`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hitos: nuevosHitos })
        });
        if (!res.ok) throw new Error("Error al actualizar cronograma");
        const actualizada = await res.json();
        ordenSeleccionada = actualizada;
        poblarDatosInspector(actualizada);
        await actualizarMonitorCompleto();
        mostrarToastScada(`Etapas actualizadas en ${actualizada.codigo_ot}`);
    } catch (e) {
        mostrarToastScada("No se pudo actualizar el cronograma", true);
    }
}

async function toggleHitoDesdeConsola(idx, nuevoValor) {
    if (!ordenSeleccionada || !ordenSeleccionada.hitos) return;
    ordenSeleccionada.hitos[idx].completado = nuevoValor;
    await sincronizarHitosOrden(ordenSeleccionada.hitos);
}

async function auditarOrdenActiva(accion) {
    if (!ordenSeleccionada) return;
    if (!window.confirm(`¿Confirma la firma de ${ordenSeleccionada.codigo_ot}? La orden quedará finalizada y esta acción no se puede deshacer.`)) return;

    try {
        const token = localStorage.getItem('tasknode_token');
        const res = await fetch(`${API}/estados/${encodeURIComponent(ordenSeleccionada.codigo_ot)}/finalizar`, {
            method: 'POST', headers: { Authorization: `Bearer ${token || ''}` }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            if (res.status === 401) {
                mostrarToastScada('Tu sesión no es válida o expiró. Inicia sesión nuevamente.', true);
                if (window.confirm('Tu sesión no es válida o expiró. ¿Deseas iniciar sesión ahora?')) {
                    window.location.href = 'login.html';
                }
                return;
            }
            mostrarToastScada(data.detail || 'No se pudo cerrar la orden', true);
            return;
        }
        mostrarToastScada(`Orden ${ordenSeleccionada.codigo_ot} firmada y finalizada. El documento está disponible.`);
        await actualizarMonitorCompleto();
    } catch (e) {
        mostrarToastScada(`Error de red: ${e.message}`, true);
    }
}

function alternarHistorial() {
    mostrarHistorial = !mostrarHistorial;
    document.getElementById('btn-historial').textContent = mostrarHistorial ? 'Ver órdenes activas' : 'Ver historial de órdenes';
    aplicarFiltrosLocal();
}

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

function actualizarSugerenciaPlantilla(tipo) {
    const clave = PLANTILLA_SUGERIDA_POR_TIPO[tipo];
    const sugerencia = document.getElementById('sugerencia-plantilla');
    const boton = document.getElementById('btn-aplicar-plantilla-sugerida');
    const selector = document.getElementById('selector-plantilla-hitos');
    const opcion = selector && Array.from(selector.options).find(o => o.value === clave);

    if (!sugerencia || !boton) return;
    if (!opcion) {
        sugerencia.textContent = 'No hay una plantilla sugerida para este tipo de intervención.';
        boton.hidden = true;
        return;
    }
    sugerencia.textContent = `Sugerencia por tipo: ${opcion.textContent}. Comprueba que corresponda al activo.`;
    boton.hidden = false;
}

function aplicarPlantillaSugerida() {
    const tipo = document.getElementById('form-tipo').value;
    const clave = PLANTILLA_SUGERIDA_POR_TIPO[tipo];
    if (!clave) {
        mostrarToastScada('No hay una plantilla sugerida para este tipo de intervención.', true);
        return;
    }
    aplicarPlantillaProtocolo(clave);
}

function obtenerContenidoConstructor() {
    return JSON.stringify({
        descripcion: document.getElementById('form-descripcion').value,
        hitos: hitosConstructor
    });
}

function aplicarPlantillaProtocolo(clave, inicializar = false) {
    const p = PLANTILLAS_PROTOCOLOS[clave];
    const selPlantilla = document.getElementById('selector-plantilla-hitos');
    if (!p) {
        if (selPlantilla && plantillaAplicada) selPlantilla.value = plantillaAplicada;
        mostrarToastScada('La plantilla seleccionada no está disponible.', true);
        return;
    }
    if (!inicializar && contenidoPlantillaAplicada !== null &&
        obtenerContenidoConstructor() !== contenidoPlantillaAplicada &&
        !window.confirm('Se reemplazarán la descripción y las etapas editadas. ¿Deseas continuar?')) {
        if (selPlantilla && plantillaAplicada) selPlantilla.value = plantillaAplicada;
        return;
    }

    const descInput = document.getElementById('form-descripcion');
    if (descInput) descInput.value = p.descripcion;
    if (selPlantilla) selPlantilla.value = clave;
    if (clave === 'DUOC') {
        const activo = document.getElementById('form-activo');
        const opcion = Array.from(activo.options).find(o => o.textContent.startsWith('DUOC-PM-PRUEBA '));
        const tecnico = listaTecnicosBD.find(u => u.nombre_completo === 'Carlos Valenzuela M.');
        document.getElementById('form-tipo').value = 'INSPECCION';
        document.getElementById('form-prioridad').value = 'MEDIA';
        actualizarSugerenciaPlantilla('INSPECCION');
        if (opcion) activo.value = opcion.value;
        if (tecnico) {
            document.getElementById('selector-tecnico-bd').value = String(tecnico.id);
            seleccionarTecnicoDesdeBD(tecnico.id);
        }
        if (!opcion || !tecnico) mostrarToastScada('Revisa el activo y el técnico: no se encontraron los datos de Duoc.', true);
    }
    hitosConstructor = p.etapas.map(e => ({ dia: e.dia, titulo: e.titulo }));
    plantillaAplicada = clave;
    contenidoPlantillaAplicada = obtenerContenidoConstructor();
    renderizarFilasConstructorHitos();
}

function escaparAtributoConstructor(valor) {
    return String(valor).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderizarFilasConstructorHitos() {
    const cont = document.getElementById('constructor-hitos-filas');
    const labelTotal = document.getElementById('label-total-dias-constructor');
    if (!cont) return;

    if (labelTotal) labelTotal.innerText = `Total: ${hitosConstructor.length} etapas planificadas`;

    cont.innerHTML = hitosConstructor.map((h, idx) => `
        <div class="flex items-center gap-2">
            <input type="text" value="${escaparAtributoConstructor(h.dia)}" oninput="actualizarDatoHitoConstructor(${idx}, 'dia', this.value)"
                class="w-24 border rounded px-2 py-1.5 text-[11px] font-mono font-bold shrink-0" placeholder="Día/Etapa">
            <input type="text" value="${escaparAtributoConstructor(h.titulo)}" oninput="actualizarDatoHitoConstructor(${idx}, 'titulo', this.value)"
                class="flex-1 border rounded px-2.5 py-1.5 text-xs" placeholder="Actividad planificada..." required>
            <button type="button" onclick="eliminarFilaHitoConstructor(${idx})"
                class="px-2 py-1 rounded border border-theme-dim hover:border-red-500 text-theme-dim hover:text-red-500 font-bold text-xs shrink-0" title="Eliminar este día">
                ✕
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

function generarFolioOT() {
    const maxNum = ordenesGlobal.reduce((max, o) => {
        const m = /^OT-2026-[A-Z]{2}-(\d{4})$/.exec(o.codigo_ot || '');
        return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 100);
    return `${PREFIJO_FOLIO}${String(maxNum + 1).padStart(4, '0')}`;
}

function abrirModalOT() {
    const modal = document.getElementById('modal-ot');
    if (!modal) return;

    document.getElementById('form-codigo').value = generarFolioOT();
    document.getElementById('form-cliente').value = 'Austral Conectividad SpA';

    if (listaTecnicosBD.length > 0) {
        document.getElementById('selector-tecnico-bd').value = String(listaTecnicosBD[0].id);
        seleccionarTecnicoDesdeBD(listaTecnicosBD[0].id);
    } else {
        document.getElementById('form-operario').value = 'Rodrigo Fuentes A.';
        document.getElementById('form-rut').value = '15.902.438-2';
    }

    const tipo = document.getElementById('form-tipo');
    tipo.value = 'PREVENTIVO';
    aplicarPlantillaProtocolo('ENLACE_RF', true);
    actualizarSugerenciaPlantilla(tipo.value);
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
        mostrarToastScada(`Orden ${payload.codigo_ot} emitida con ${hitosLimpios.length} etapas.`);
        await actualizarMonitorCompleto();
    } catch (err) {
        mostrarToastScada(`Error de red: ${err.message}`, true);
    }
}

function abrirPliegoDesdeConsola() {
    if (!ordenSeleccionada) return;
    const modo = (ordenSeleccionada.estado_actual === 'ORDEN FINALIZADA') ? 'COMPLETA' : 'ORIGINAL';
    window.open(`orden_pdf.html?codigo=${encodeURIComponent(ordenSeleccionada.codigo_ot)}&modo=${modo}`, '_blank');
}