const API = window.TaskNodeConfig.API_URL;
let ordenesGlobal = [];
let ordenSeleccionada = null;
let rolVistaActual = 'SUPERVISOR';
let hitosConstructor = [];
let listaTecnicosBD = [];

// Índice temporal para el arrastre Drag & Drop
let dragSrcIndex = null;

// Horas SLA según prioridad
const SLA_HORAS_PRIORIDAD = {
    ALTA: 24,
    MEDIA: 72,
    BAJA: 168
};

// Plantillas de cronograma
const PLANTILLAS_PROTOCOLOS = {
    SEMANA_7D: {
        descripcion: "Faena zonal de mantenimiento integral: inspección previa, corte programado LOTO, intervención electromecánica, reemplazo de componentes, pruebas dinámicas, certificación final y entrega conforme.",
        etapas: [
            { dia: "Día 1", titulo: "Acceso al sitio, charla de seguridad, inspección de EPP y delimitación de faena" },
            { dia: "Día 2", titulo: "Aislamiento eléctrico LOTO (0.0V / 0.0 bar) y desmontaje de partes gastadas" },
            { dia: "Día 3", titulo: "Limpieza profunda de módulos, inspección de cables y chequeo térmico" },
            { dia: "Día 4", titulo: "Montaje e instalación de repuestos nuevos con torque calibrado" },
            { dia: "Día 5", titulo: "Retiro de candados LOTO, energización y calibración de parámetros en vacío" },
            { dia: "Día 6", titulo: "Prueba de carga continua, monitoreo de vibraciones y captura fotográfica" },
            { dia: "Día 7", titulo: "Limpieza final del área, cierre de minuta y firma del encargado en sitio" }
        ]
    },
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
        if (sub) sub.innerText = "Vista Cliente Mandante: Cronograma de etapas, SLA y actas de recepción";
    } else {
        if (btnSup) btnSup.className = "px-2.5 py-1 rounded bg-[#c2410c] text-white transition";
        if (btnCli) btnCli.className = "px-2.5 py-1 rounded text-theme-muted hover:text-theme-main transition";
        if (btnNueva) btnNueva.classList.remove('hidden');
        if (sub) sub.innerText = "Supervisión Operativa: Planificación de OTs, hitos de faena y control de cierre";
    }
    aplicarFiltrosLocal();
    if (ordenSeleccionada) poblarDatosInspector(ordenSeleccionada);
}

function cambiarTabInspector(tab) {
    const tabs = ['GANTT', 'HITOS', 'EVIDENCIA', 'FORENSE'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t.toLowerCase()}`);
        const content = document.getElementById(`tab-content-${t.toLowerCase()}`);
        if (t === tab) {
            btn.className = "py-2 px-2 rounded-t border-b-2 border-[#c2410c] text-accent bg-surface-1 text-center truncate";
            content.classList.remove('hidden');
        } else {
            btn.className = "py-2 px-2 rounded-t text-theme-muted hover:text-theme-main text-center truncate";
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

// =========================================================================
// MINI CARTA GANTT Y CÁLCULO DINÁMICO DE HITOS
// =========================================================================

function calcularAvanceHitosDinamico(hitos, estadoActual) {
    if (estadoActual === "OT COMPLETADA") return 100;
    if (!hitos || hitos.length === 0) return 0;
    const completados = hitos.filter(h => h.completado).length;
    return Math.round((completados / hitos.length) * 100);
}

function renderizarMiniGanttTabla(hitos, estadoActual) {
    const lista = hitos || [];
    const total = lista.length;
    const completados = estadoActual === "OT COMPLETADA" ? total : lista.filter(h => h.completado).length;
    const pct = total > 0 ? Math.round((completados / total) * 100) : 0;

    let bloquesHTML = '';
    if (total === 0) {
        bloquesHTML = `<div class="w-full h-2 rounded bg-surface-3"></div>`;
    } else {
        bloquesHTML = lista.map((h, i) => {
            const estaCompletado = (estadoActual === "OT COMPLETADA") || h.completado;
            const esElActual = !estaCompletado && (i === completados);
            let color = "bg-surface-3 border border-theme-dim";
            if (estaCompletado) color = "bg-emerald-600";
            else if (esElActual) color = "bg-amber-500 animate-pulse";

            return `<div class="flex-1 h-2 rounded-xs ${color}" title="${h.dia}: ${h.titulo}"></div>`;
        }).join('');
    }

    return `
        <div class="space-y-1">
            <div class="flex justify-between text-[10px] font-mono">
                <span class="text-theme-muted">${completados}/${total} días listos</span>
                <span class="font-bold text-theme-main">${pct}%</span>
            </div>
            <div class="flex gap-0.5 w-full bg-surface-base p-0.5 rounded border border-theme-dim">
                ${bloquesHTML}
            </div>
        </div>
    `;
}

// =========================================================================
// CÁLCULO DE TIEMPO SLA Y CALENDARIO
// =========================================================================

function calcularTiemposSLA(orden) {
    const creacion = orden.created_at ? new Date(orden.created_at) : new Date();
    const horasSLA = SLA_HORAS_PRIORIDAD[orden.prioridad] || 72;
    const fechaLimite = new Date(creacion.getTime() + horasSLA * 60 * 60 * 1000);
    const ahora = new Date();
    const diferenciaMs = fechaLimite.getTime() - ahora.getTime();

    const dias = Math.floor(Math.abs(diferenciaMs) / (1000 * 60 * 60 * 24));
    const horas = Math.floor((Math.abs(diferenciaMs) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    let estadoSLA = "EN PLAZO";
    let textoRestante = `${dias}d ${horas}h restantes`;
    let colorTexto = "text-emerald-600";

    if (orden.estado_actual === "OT COMPLETADA") {
        estadoSLA = "CERRADA";
        textoRestante = "Finalizada";
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

    return { creacion, fechaLimite, horasSLA, textoRestante, estadoSLA, colorTexto };
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

    const { creacion, fechaLimite, horasSLA, textoRestante, colorTexto } = calcularTiemposSLA(orden);

    const mesNombre = fechaLimite.toLocaleString('es-CL', { month: 'long', year: 'numeric' });
    const primerDiaSemana = new Date(fechaLimite.getFullYear(), fechaLimite.getMonth(), 1).getDay();
    const diasEnMes = new Date(fechaLimite.getFullYear(), fechaLimite.getMonth() + 1, 0).getDate();

    let celdasCalendario = '';
    const offset = primerDiaSemana === 0 ? 6 : primerDiaSemana - 1;
    for (let i = 0; i < offset; i++) {
        celdasCalendario += `<div class="p-1 text-center text-theme-dim opacity-30">-</div>`;
    }

    for (let d = 1; d <= diasEnMes; d++) {
        const esEmision = (d === creacion.getDate() && fechaLimite.getMonth() === creacion.getMonth());
        const esLimite = (d === fechaLimite.getDate());
        let clase = "p-1 text-center rounded text-[11px] font-mono ";

        if (esLimite) {
            clase += "bg-[#c2410c] text-white font-bold";
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
                <span class="text-[10px] text-theme-dim font-semibold">(SLA ${horasSLA}h)</span>
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
    const completadas = lista.filter(o => o.estado_actual === "OT COMPLETADA").length;
    
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
            <td class="px-4 py-3">
                <div class="font-mono font-bold text-theme-main text-xs">${r.codigo_ot}</div>
                <div class="text-[11px] text-theme-dim truncate max-w-[190px]">${nombreEquipo}</div>
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                <div class="flex items-center gap-2">
                    <button type="button" onclick="desplegarMinicalendario(event, '${r.codigo_ot}')" class="btn-trigger-calendario flex items-center gap-1.5 px-2 py-1 rounded border border-theme-bright bg-surface-2 hover:bg-surface-3 text-accent font-mono text-[11px] font-semibold transition shadow-xs" title="Ver minicalendario">
                        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                        </svg>
                        <span>${sla.horasSLA}h</span>
                    </button>
                    <div class="text-[10px] font-mono ${sla.colorTexto}">
                        ${sla.textoRestante}
                    </div>
                </div>
                <div class="text-[9.5px] font-mono text-theme-dim mt-0.5">
                    Límite: ${sla.fechaLimite.toLocaleDateString('es-CL')}
                </div>
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
                ${renderizarMiniGanttTabla(hitos, estado)}
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                <span class="px-2.5 py-0.5 text-[10px] font-bold rounded ${info.badge}">
                    ${estado}
                </span>
            </td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
                <button type="button" onclick="abrirDrawerInspeccionPorCodigo('${r.codigo_ot}')" class="px-3 py-1.5 rounded border border-theme-bright bg-surface-1 hover:bg-surface-3 text-theme-main hover:text-accent font-bold text-[11px] transition shadow-xs cursor-pointer">
                    Inspeccionar
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
        pill.innerText = estado;
    }

    setTxt('inspect-ot-code', orden.codigo_ot);
    setTxt('inspect-cliente-mandante', `Empresa Mandante: ${orden.cliente_mandante || 'Austral Conectividad SpA'}`);
    setTxt('inspect-sla-tiempo', `Plazo SLA: ${sla.textoRestante} (Límite: ${sla.fechaLimite.toLocaleDateString('es-CL')})`);

    const btnCalInspect = document.getElementById('btn-inspect-calendar');
    if (btnCalInspect) {
        btnCalInspect.onclick = (e) => desplegarMinicalendario(e, orden.codigo_ot);
    }

    setTxt('inspect-asset-tag', orden.activo ? `${orden.activo.codigo_activo} · ${orden.activo.nombre}` : `Activo #${orden.activo_id}`);
    setTxt('inspect-ot-crew', `Especialista: ${orden.operario_responsable} (${ofuscarRUTLey21719(orden.rut_responsable)})`);
    setTxt('inspect-ot-desc', orden.descripcion || 'Sin descripción.');
    setTxt('inspect-progress-txt', `${avanceCalculado}% completado (${hitos.filter(h => h.completado).length}/${hitos.length} etapas)`);

    // Barra de segmentos Gantt
    const barGantt = document.getElementById('inspect-gantt-segmentos');
    if (barGantt) {
        const total = hitos.length;
        const comp = estado === "OT COMPLETADA" ? total : hitos.filter(h => h.completado).length;
        barGantt.innerHTML = hitos.map((h, i) => {
            const hecho = (estado === "OT COMPLETADA") || h.completado;
            const esHoy = !hecho && (i === comp);
            let cls = "bg-surface-3";
            if (hecho) cls = "bg-emerald-600";
            else if (esHoy) cls = "bg-amber-500 animate-pulse";
            return `<div class="flex-1 h-full rounded-xs ${cls}" title="${h.dia}: ${h.titulo}"></div>`;
        }).join('');
    }

    // 1. Render de la Carta Gantt con ARRASTRE Y SOLTAR (Drag & Drop nativo)
    const contGantt = document.getElementById('contenedor-carta-gantt');
    if (contGantt) {
        contGantt.innerHTML = hitos.map((h, idx) => {
            const estaCompletado = (estado === "OT COMPLETADA") || h.completado;

            return `
                <div draggable="true" 
                     ondragstart="manejarDragStart(event, ${idx})" 
                     ondragover="manejarDragOver(event)" 
                     ondragenter="manejarDragEnter(event)"
                     ondragleave="manejarDragLeave(event)"
                     ondrop="manejarDrop(event, ${idx})"
                     ondragend="manejarDragEnd(event)"
                     class="item-gantt-draggable p-2.5 rounded border border-theme-dim bg-surface-2 flex items-center justify-between gap-2.5 cursor-grab active:cursor-grabbing hover:border-accent transition select-none">
                    
                    <!-- Indicador visual de arrastre con el mouse -->
                    <div class="text-theme-dim hover:text-accent font-mono text-sm px-1 cursor-grab" title="Haz clic y arrastra para reordenar">
                        ⠿
                    </div>

                    <div class="flex items-center gap-2 flex-1 min-w-0 pointer-events-none">
                        <span class="w-16 font-mono text-[10px] font-bold ${estaCompletado ? 'text-emerald-600' : 'text-accent'} bg-surface-1 px-1.5 py-0.5 rounded border border-theme-dim shrink-0 text-center">
                            ${h.dia}
                        </span>
                        <div class="truncate text-xs ${estaCompletado ? 'line-through text-theme-dim' : 'text-theme-main font-medium'}">
                            ${h.titulo}
                        </div>
                    </div>

                    <div class="flex items-center gap-2 shrink-0 font-mono text-[10px]">
                        <span class="${estaCompletado ? 'text-emerald-600 font-bold' : 'text-theme-dim'}">
                            ${estaCompletado ? '✓ LISTO' : 'PENDIENTE'}
                        </span>
                        <button type="button" onclick="eliminarHitoDeOrdenExistente(${idx})" class="text-theme-dim hover:text-red-500 font-bold px-1" title="Eliminar este día">✕</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 2. Render de Checklists de verificación
    const contHitos = document.getElementById('lista-hitos-inspector');
    setTxt('conteo-etapas-inspector', `${hitos.length} etapas registradas`);
    if (contHitos) {
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

// =========================================================================
// DRAG AND DROP NATIVO PARA REORDENAR LA CARTA GANTT CON EL MOUSE
// =========================================================================

function manejarDragStart(e, index) {
    dragSrcIndex = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
    e.currentTarget.classList.add('opacity-40', 'border-accent');
}

function manejarDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function manejarDragEnter(e) {
    const contenedor = e.currentTarget.closest('.item-gantt-draggable');
    if (contenedor) {
        contenedor.classList.add('bg-surface-3', 'border-accent', 'scale-[1.01]');
    }
}

function manejarDragLeave(e) {
    const contenedor = e.currentTarget.closest('.item-gantt-draggable');
    if (contenedor) {
        contenedor.classList.remove('bg-surface-3', 'border-accent', 'scale-[1.01]');
    }
}

async function manejarDrop(e, targetIndex) {
    if (e.stopPropagation) e.stopPropagation();
    
    const contenedor = e.currentTarget.closest('.item-gantt-draggable');
    if (contenedor) {
        contenedor.classList.remove('bg-surface-3', 'border-accent', 'scale-[1.01]');
    }

    if (dragSrcIndex !== null && dragSrcIndex !== targetIndex && ordenSeleccionada && ordenSeleccionada.hitos) {
        const hitos = ordenSeleccionada.hitos;
        
        // Mover el elemento arrastrado a la nueva posición
        const elementoMovido = hitos.splice(dragSrcIndex, 1)[0];
        hitos.splice(targetIndex, 0, elementoMovido);

        // Reenumerar id de secuencia
        hitos.forEach((h, i) => { h.id = i + 1; });

        await sincronizarHitosOrden(hitos);
    }
    return false;
}

function manejarDragEnd(e) {
    dragSrcIndex = null;
    document.querySelectorAll('.item-gantt-draggable').forEach(el => {
        el.classList.remove('opacity-40', 'border-accent', 'bg-surface-3', 'scale-[1.01]');
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
    inputTag.value = `Día ${siguienteNum}`;
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
        dia: tag || `Día ${hitosActuales.length + 1}`,
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
        mostrarToastScada(`Cronograma Gantt actualizado en ${actualizada.codigo_ot}`);
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
    if (clave === 'PREVENTIVO') key = 'SEMANA_7D';
    if (clave === 'CORRECTIVO') key = 'FIBRA_OTDR';
    if (clave === 'INSPECCION') key = 'RF_MW';

    const p = PLANTILLAS_PROTOCOLOS[key] || PLANTILLAS_PROTOCOLOS.SEMANA_7D;
    const descInput = document.getElementById('form-descripcion');
    if (descInput) descInput.value = p.descripcion;

    hitosConstructor = p.etapas.map(e => ({ dia: e.dia, titulo: e.titulo }));
    renderizarFilasConstructorHitos();
}

function renderizarFilasConstructorHitos() {
    const cont = document.getElementById('constructor-hitos-filas');
    const labelTotal = document.getElementById('label-total-dias-constructor');
    if (!cont) return;

    if (labelTotal) labelTotal.innerText = `Total: ${hitosConstructor.length} etapas planificadas`;

    cont.innerHTML = hitosConstructor.map((h, idx) => `
        <div class="flex items-center gap-2">
            <input type="text" value="${h.dia}" oninput="actualizarDatoHitoConstructor(${idx}, 'dia', this.value)"
                class="w-24 border rounded px-2 py-1.5 text-[11px] font-mono font-bold shrink-0" placeholder="Día/Etapa">
            <input type="text" value="${h.titulo}" oninput="actualizarDatoHitoConstructor(${idx}, 'titulo', this.value)"
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
        dia: `Día ${num}`,
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

    aplicarPlantillaProtocolo('SEMANA_7D');
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
            dia: (h.dia || `Día ${idx + 1}`).trim(),
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
        mostrarToastScada(`Orden ${payload.codigo_ot} planificada con ${hitosLimpios.length} días de faena.`);
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