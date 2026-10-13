const API = window.TaskNodeConfig.API_URL;
let ordenesEnMemoria = [];
let ordenSeleccionada = null;

document.addEventListener('DOMContentLoaded', () => {
    actualizarMonitorCompleto();
    iniciarReloj();
});

function iniciarReloj() {
    const el = document.getElementById('clock-telemetry');
    if (!el) return;
    setInterval(() => {
        const ahora = new Date();
        el.innerText = `${ahora.toISOString().slice(0, 10)} · ${ahora.toLocaleTimeString('es-CL')}`;
    }, 1000);
}

function mostrarToast(mensaje, esError = false) {
    const toast = document.getElementById('hud-toast');
    const msg = document.getElementById('toast-msg');
    const led = document.getElementById('toast-led');
    if (!toast || !msg) return;

    msg.innerText = mensaje;
    led.className = esError ? "w-2 h-2 rounded-full bg-red-500" : "w-2 h-2 rounded-full bg-amber-500";
    
    toast.classList.remove('opacity-0', 'translate-y-[-8px]');
    toast.classList.add('opacity-100', 'translate-y-0');

    setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', 'translate-y-[-8px]');
    }, 3000);
}

/* ==========================================================================
   CONTROL DE PANTALLA DIVIDIDA / CAJÓN RESPONSIVO
   ========================================================================== */

function toggleInspector() {
    const panel = document.getElementById('panel-inspeccion');
    if (!panel) return;
    panel.classList.contains('translate-x-full') ? abrirInspector() : cerrarInspector();
}

function abrirInspector() {
    const panel = document.getElementById('panel-inspeccion');
    const backdrop = document.getElementById('drawer-backdrop');
    if (panel) panel.classList.remove('translate-x-full');
    if (backdrop) backdrop.classList.remove('hidden');
}

function cerrarInspector() {
    const panel = document.getElementById('panel-inspeccion');
    const backdrop = document.getElementById('drawer-backdrop');
    if (panel) panel.classList.add('translate-x-full');
    if (backdrop) backdrop.classList.add('hidden');
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar-panel');
    if (!sidebar) return;

    if (sidebar.classList.contains('lg:w-56')) {
        sidebar.classList.replace('lg:w-56', 'lg:w-14');
        sidebar.querySelectorAll('aside nav span, aside header div.truncate, aside div span.uppercase').forEach(el => el.classList.add('lg:hidden'));
    } else {
        sidebar.classList.replace('lg:w-14', 'lg:w-56');
        sidebar.querySelectorAll('aside nav span, aside header div.truncate, aside div span.uppercase').forEach(el => el.classList.remove('lg:hidden'));
    }
}

/* ==========================================================================
   CARGA DE DATOS Y RENDERIZADO MAESTRO
   ========================================================================== */

function actualizarMonitorCompleto() {
    cargarKpisSuperiores();
    cargarTablaBitacora();
}

async function cargarKpisSuperiores() {
    try {
        const res = await fetch(`${API}/metricas/`);
        if (!res.ok) return;
        const d = await res.json();
        document.getElementById('kpi-volumen').innerText = d.volumen_total;
        document.getElementById('kpi-ejecucion').innerText = d.ejecucion_normal;
        document.getElementById('kpi-detenciones').innerText = d.detenciones_alertas;
        document.getElementById('kpi-resolucion').innerText = `${d.tasa_resolucion_pct}%`;
        document.getElementById('kpi-disp').innerText = `${d.disponibilidad_operacional_pct}%`;
    } catch (e) {
        console.error("Fallo al consultar indicadores:", e);
    }
}

async function cargarTablaBitacora() {
    const icon = document.getElementById('icon-refresh');
    const tbody = document.getElementById('tabla-body');
    if (icon) icon.classList.add('animate-spin');

    try {
        const res = await fetch(`${API}/ordenes/`);
        if (!res.ok) throw new Error("Fallo en GET /ordenes/");
        ordenesEnMemoria = await res.json();
        tbody.innerHTML = '';

        if (ordenesEnMemoria.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500 font-mono text-xs">Sin órdenes de trabajo emitidas.</td></tr>`;
            return;
        }

        ordenesEnMemoria.forEach((r, idx) => {
            const estadoActual = r.estado_actual || r.estado_nuevo || r.estado || 'EMITIDA';
            
            let gpsDisplay = r.coordenadas_gps || '';
            if (!gpsDisplay && r.activo && r.activo.latitud_referencia) {
                gpsDisplay = `${r.activo.latitud_referencia.toFixed(4)}, ${r.activo.longitud_referencia.toFixed(4)}`;
            }
            if (!gpsDisplay) gpsDisplay = '-41.4693, -72.9424';

            const rawFecha = r.timestamp || r.created_at || r.fecha_creacion;
            let horaDisplay = '--:--';
            if (rawFecha) {
                try {
                    horaDisplay = new Date(rawFecha).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
                } catch(e) {}
            }

            let estadoBadge = "bg-slate-800 text-slate-300 border-slate-700";
            if (estadoActual === "EN EJECUCIÓN") estadoBadge = "bg-emerald-950/80 text-emerald-400 border-emerald-800/80";
            if (estadoActual === "DETENIDA POR ANOMALÍA") estadoBadge = "bg-red-950/80 text-red-400 border-red-800/80";
            if (estadoActual === "OT COMPLETADA") estadoBadge = "bg-zinc-800 text-zinc-400 border-zinc-700";
            if (estadoActual === "EN VALIDACIÓN" || estadoActual === "EMITIDA") estadoBadge = "bg-amber-950/80 text-amber-400 border-amber-800/80";

            const tr = document.createElement('tr');
            tr.className = "hover:bg-surface-2 cursor-pointer transition border-b border-theme-dim";
            tr.onclick = () => {
                seleccionarFilaInspeccion(r, tr);
                if (window.innerWidth < 1280) abrirInspector();
            };

            tr.innerHTML = `
                <td class="px-3.5 py-2.5 font-bold text-slate-100 flex items-center gap-2">
                    <span class="w-1.5 h-1.5 rounded-full ${estadoActual === 'DETENIDA POR ANOMALÍA' ? 'bg-red-500 animate-ping' : 'bg-amber-500'}"></span>
                    <span class="truncate">${r.codigo_ot}</span>
                </td>
                <td class="px-3.5 py-2.5">
                    <span class="text-slate-200 block truncate">${r.operario_responsable}</span>
                    <span class="text-slate-500 text-[10px] hidden sm:block">${r.rut_responsable || 'RUT N/D'}</span>
                </td>
                <td class="px-3.5 py-2.5 whitespace-nowrap">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${estadoBadge}">
                        ${estadoActual}
                    </span>
                </td>
                <td class="px-3.5 py-2.5 text-slate-400 text-[10px] hidden md:table-cell font-mono">${gpsDisplay}</td>
                <td class="px-3.5 py-2.5 text-right text-slate-500 text-[10px] font-mono">${horaDisplay}</td>
            `;
            tbody.appendChild(tr);

            if (idx === 0 && !ordenSeleccionada) {
                seleccionarFilaInspeccion(r, tr);
            }
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-red-400 font-mono text-xs">Error al sincronizar con el catálogo de órdenes.</td></tr>`;
    } finally {
        if (icon) icon.classList.remove('animate-spin');
    }
}

function seleccionarFilaInspeccion(orden, filaElem) {
    ordenSeleccionada = orden;
    document.querySelectorAll('#tabla-body tr').forEach(r => r.classList.remove('bg-surface-2', 'border-l-2', 'border-l-amber-500'));
    if (filaElem) filaElem.classList.add('bg-surface-2', 'border-l-2', 'border-l-amber-500');

    const estado = orden.estado_actual || orden.estado_nuevo || orden.estado || 'EMITIDA';
    document.getElementById('inspect-ot-code').innerText = orden.codigo_ot;
    document.getElementById('inspect-fsm-pill').innerText = estado;
    document.getElementById('inspect-ot-desc').innerText = orden.descripcion || orden.observacion || "Sin alcance especificado.";
    document.getElementById('inspect-ot-crew').innerText = `Operario: ${orden.operario_responsable} (${orden.rut_responsable || 'N/D'})`;
    document.getElementById('inspect-hash-val').innerText = orden.hash_cadena || "Firma generada al transicionar";
    
    let gps = orden.coordenadas_gps || '';
    if (!gps && orden.activo) gps = `${orden.activo.latitud_referencia}, ${orden.activo.longitud_referencia}`;
    document.getElementById('inspect-gps-val').innerText = gps || '-41.4693, -72.9424';

    const imgView = document.getElementById('inspect-img-view');
    const imgPlaceholder = document.getElementById('inspect-img-placeholder');
    const laplacianLabel = document.getElementById('inspect-laplacian-score');

    if (orden.evidencia_url) {
        imgView.src = orden.evidencia_url;
        imgView.classList.remove('hidden');
        imgPlaceholder.classList.add('hidden');
        laplacianLabel.innerText = `Laplacian: ${orden.laplacian_score || 'N/A'}`;
    } else {
        imgView.classList.add('hidden');
        imgPlaceholder.classList.remove('hidden');
        laplacianLabel.innerText = "Laplacian: --";
    }

    const btnAprobar = document.getElementById('btn-aprobar-fsm');
    const btnRechazar = document.getElementById('btn-rechazar-fsm');
    const esValidable = (estado === "EN VALIDACIÓN");
    btnAprobar.disabled = !esValidable;
    btnRechazar.disabled = !esValidable;
}

/* ==========================================================================
   DOSSIER TÉCNICO FOLIADO (ACTA OFICIAL DE INGENIERÍA)
   ========================================================================== */

function generarDossierOficial() {
    if (!ordenSeleccionada) {
        mostrarToast("Seleccione una orden para emitir el dossier.", true);
        return;
    }

    document.getElementById('dossier-folio').innerText = ordenSeleccionada.codigo_ot;
    
    const activoInfo = (ordenSeleccionada.activo && ordenSeleccionada.activo.codigo_activo)
        ? `${ordenSeleccionada.activo.codigo_activo} - ${ordenSeleccionada.activo.nombre}`
        : "PMP-ISO-2610-01 - Bomba de Alimentación Principal";
    document.getElementById('dossier-activo').innerText = activoInfo;

    const ubicacionInfo = (ordenSeleccionada.activo && ordenSeleccionada.activo.ubicacion_tecnica)
        ? ordenSeleccionada.activo.ubicacion_tecnica
        : "Sala de Máquinas - Circuito Secundario";
    document.getElementById('dossier-ubicacion').innerText = ubicacionInfo;

    document.getElementById('dossier-operario').innerText = ordenSeleccionada.operario_responsable;
    document.getElementById('dossier-rut').innerText = ordenSeleccionada.rut_responsable || "18.421.903-K";
    document.getElementById('dossier-descripcion').innerText = ordenSeleccionada.descripcion || ordenSeleccionada.observacion || "Protocolo de mantenimiento programado.";
    document.getElementById('dossier-hash').innerText = ordenSeleccionada.hash_cadena || "CADENA_SHA256_VERIFICADA_ISO55001_TASKNODE_NODO_CENTRAL";

    const modal = document.getElementById('modal-dossier');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

/* ==========================================================================
   AUDITORÍA FSM Y EMISIÓN DE OTs
   ========================================================================== */

async function auditarOrdenActiva(accion) {
    if (!ordenSeleccionada) return;
    const nuevoEstado = (accion === 'COMPLETAR') ? 'OT COMPLETADA' : 'EN EJECUCIÓN';

    try {
        const formData = new FormData();
        formData.append('codigo_ot', ordenSeleccionada.codigo_ot);
        formData.append('operario_id', 1);
        formData.append('estado_nuevo', nuevoEstado);
        formData.append('coordenadas_gps', document.getElementById('inspect-gps-val').innerText);
        formData.append('observacion', (accion === 'COMPLETAR') ? 'Cierre de auditoría técnica conforme a norma.' : 'Devuelto a terreno por observación.');

        const res = await fetch(`${API}/estados/`, { method: 'POST', body: formData });
        if (!res.ok) throw new Error("Transición no autorizada por FSM.");

        mostrarToast(`Transición registrada: ${nuevoEstado}`);
        actualizarMonitorCompleto();
        if (window.innerWidth < 1280) cerrarInspector();
    } catch (e) {
        mostrarToast("No se pudo completar la auditoría.", true);
    }
}

async function abrirModalOT() {
    const select = document.getElementById('form-activo');
    select.innerHTML = '<option value="">Consultando catálogo ISO 55000...</option>';
    document.getElementById('modal-ot').classList.remove('hidden');
    document.getElementById('modal-ot').classList.add('flex');

    const correlativo = Math.floor(1000 + Math.random() * 9000);
    document.getElementById('form-codigo').value = `OT-2610-PMT-PRV-${correlativo}`;

    try {
        const res = await fetch(`${API}/activos/`);
        const activos = await res.json();
        select.innerHTML = activos.map(a => `<option value="${a.id}">${a.codigo_activo} — ${a.nombre} [${a.criticidad}]</option>`).join('');
    } catch (e) {
        select.innerHTML = '<option value="">Error al cargar activos</option>';
    }
}

function cerrarModalOT() {
    document.getElementById('modal-ot').classList.add('hidden');
    document.getElementById('modal-ot').classList.remove('flex');
}

async function enviarNuevaOT(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-guardar-ot');
    btn.disabled = true;

    const payload = {
        codigo_ot: document.getElementById('form-codigo').value,
        activo_id: parseInt(document.getElementById('form-activo').value),
        tipo_mantenimiento: document.getElementById('form-tipo').value,
        prioridad: document.getElementById('form-prioridad').value,
        operario_responsable: document.getElementById('form-operario').value,
        rut_responsable: document.getElementById('form-rut').value,
        descripcion: document.getElementById('form-descripcion').value
    };

    try {
        const res = await fetch(`${API}/ordenes/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error("Fallo de emisión.");

        cerrarModalOT();
        actualizarMonitorCompleto();
        mostrarToast(`OT ${payload.codigo_ot} emitida.`);
    } catch (err) {
        mostrarToast("Error al emitir orden.", true);
    } finally {
        btn.disabled = false;
    }
}

const PLANTILLAS_TECNICAS = [
    {
        codigo: "OT-2610-PMT-PRV-0045", tipo: "PREVENTIVO", prioridad: "ALTA",
        operario: "S. Rivera", rut: "18.421.903-K",
        desc: "Inspección de 500h: reemplazo de sello mecánico doble, alineación láser y balanceo dinámico."
    },
    {
        codigo: "OT-2610-SUR-COR-0089", tipo: "CORRECTIVO", prioridad: "ALTA",
        operario: "M. Soto", rut: "16.892.110-3",
        desc: "Atención correctiva por disparo térmico. Fuga en circuito de refrigeración secundario."
    }
];
let idxPlantilla = 0;

function autocompletarModalOT() {
    const p = PLANTILLAS_TECNICAS[idxPlantilla % PLANTILLAS_TECNICAS.length];
    idxPlantilla++;
    document.getElementById('form-codigo').value = p.codigo;
    document.getElementById('form-tipo').value = p.tipo;
    document.getElementById('form-prioridad').value = p.prioridad;
    document.getElementById('form-operario').value = p.operario;
    document.getElementById('form-rut').value = p.rut;
    document.getElementById('form-descripcion').value = p.desc;
}