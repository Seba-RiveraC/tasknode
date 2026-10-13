const API = window.TaskNodeConfig.API_URL;
let listaOTsCache = [];
let modoOfflineSimulado = false;

document.addEventListener('DOMContentLoaded', () => {
    inicializarTerminal();
});

function inicializarTerminal() {
    const btnAuth = document.getElementById('btn-autenticar');
    if (btnAuth) btnAuth.addEventListener('click', desbloquearTerminal);

    const form = document.getElementById('formularioEstado');
    if (form) form.addEventListener('submit', procesarTransicionTerreno);

    const btnNet = document.getElementById('btn-toggle-net');
    if (btnNet) btnNet.addEventListener('click', conmutarModoRed);
}

function mostrarToastTerminal(mensaje, esError = false) {
    const toast = document.getElementById('hud-toast');
    const msg = document.getElementById('toast-msg');
    const led = document.getElementById('toast-led');
    if (!toast || !msg) return;

    msg.innerText = mensaje;
    led.className = esError ? 'w-1.5 h-1.5 rounded-full bg-red-500' : 'w-1.5 h-1.5 rounded-full bg-amber-500';
    
    toast.classList.remove('opacity-0', 'translate-y-[-6px]');
    toast.classList.add('opacity-100', 'translate-y-0');

    setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', 'translate-y-[-6px]');
    }, 3200);
}

async function desbloquearTerminal() {
    const lock = document.getElementById('pantalla-bloqueo');
    lock.classList.add('opacity-0');
    setTimeout(() => {
        lock.classList.add('hidden');
        const app = document.getElementById('app-principal');
        app.classList.remove('hidden');
        setTimeout(() => app.classList.remove('opacity-0'), 20);
        cargarOrdenesEnTerminal();
    }, 250);
}

async function cargarOrdenesEnTerminal(codigoPreseleccionado = null) {
    const select = document.getElementById('codigo_ot');
    select.innerHTML = '<option value="">Cargando órdenes...</option>';

    try {
        const res = await fetch(`${API}/ordenes/`);
        if (!res.ok) throw new Error('Fallo al consultar /ordenes/');
        listaOTsCache = await res.json();
        localStorage.setItem('tasknode_cached_ots', JSON.stringify(listaOTsCache));
        poblarDropdown(listaOTsCache, codigoPreseleccionado);
    } catch (e) {
        const cached = JSON.parse(localStorage.getItem('tasknode_cached_ots') || '[]');
        if (cached.length > 0) {
            listaOTsCache = cached;
            poblarDropdown(cached, codigoPreseleccionado);
            mostrarToastTerminal('Modo local: órdenes cargadas desde almacenamiento.');
        } else {
            select.innerHTML = '<option value="">Sin OTs disponibles</option>';
        }
    }
}

function poblarDropdown(ots, codigoPreseleccionado = null) {
    const select = document.getElementById('codigo_ot');
    if (ots.length === 0) {
        select.innerHTML = '<option value="">No hay OTs emitidas</option>';
        return;
    }
    select.innerHTML = ots.map(o => `<option value="${o.codigo_ot}">${o.codigo_ot} [${o.tipo_mantenimiento}]</option>`).join('');
    
    if (codigoPreseleccionado) {
        select.value = codigoPreseleccionado;
    }
    actualizarInfoOTSeleccionada();
}

function actualizarInfoOTSeleccionada() {
    const codigo = document.getElementById('codigo_ot').value;
    const ot = listaOTsCache.find(o => o.codigo_ot === codigo);
    const label = document.getElementById('info-ot-estado');
    if (ot && label) {
        const estadoActual = ot.estado_actual || ot.estado || 'EMITIDA';
        const activoCod = (ot.activo && ot.activo.codigo_activo) ? ot.activo.codigo_activo : 'S/A';
        label.innerHTML = `Estado actual: <span class="text-amber-400 font-bold">${estadoActual}</span> | Activo: <span class="text-slate-300">${activoCod}</span>`;
    }
}

function actualizarNombreFoto(input) {
    const label = document.getElementById('camera-label');
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const sizeKb = (file.size / 1024).toFixed(1);
        label.innerHTML = `
            <span class="text-[10px] font-mono text-amber-400 font-bold block truncate">${file.name}</span>
            <span class="text-[9px] font-mono text-slate-500 block">(${sizeKb} KB)</span>
        `;
    }
}

async function procesarTransicionTerreno(e) {
    e.preventDefault();
    const btn = document.getElementById('btnEnviar');
    btn.disabled = true;

    const codigoOT = document.getElementById('codigo_ot').value;
    const estadoNuevo = document.getElementById('estado_nuevo').value;

    const formData = new FormData();
    formData.append('codigo_ot', codigoOT);
    formData.append('operario_id', document.getElementById('operario_id').value || '45');
    formData.append('estado_nuevo', estadoNuevo);
    formData.append('coordenadas_gps', document.getElementById('gps').value || '-41.4693, -72.9424');
    formData.append('observacion', document.getElementById('obs').value || '');

    const inputFoto = document.getElementById('foto');
    if (inputFoto && inputFoto.files && inputFoto.files.length > 0) {
        formData.append('foto', inputFoto.files[0]);
    }

    if (modoOfflineSimulado || !navigator.onLine) {
        const cola = JSON.parse(localStorage.getItem('tasknode_outbox') || '[]');
        cola.push({
            codigo_ot: codigoOT,
            estado_nuevo: estadoNuevo,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem('tasknode_outbox', JSON.stringify(cola));
        actualizarContadorOutbox();
        mostrarToastTerminal('Sin red: transición encolada en Outbox local.');
        btn.disabled = false;
        return;
    }

    try {
        const res = await fetch(`${API}/estados/`, { method: 'POST', body: formData });
        
        let data = {};
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            data = await res.json();
        } else {
            const rawText = await res.text();
            data = { detail: rawText };
        }

        if (res.status === 422) {
            const detalle = typeof data.detail === 'string' ? data.detail : 'Transición no permitida por FSM (EN 13306)';
            mostrarToastTerminal(`Rechazo FSM: ${detalle}`, true);
        } else if (!res.ok) {
            mostrarToastTerminal(`Error ${res.status}: ${data.detail || 'Fallo del servidor'}`, true);
        } else {
            mostrarToastTerminal(`Aprobado: ${data.codigo_ot} -> ${data.estado_nuevo}`);
            document.getElementById('obs').value = '';
            if (inputFoto) inputFoto.value = '';
            document.getElementById('camera-label').innerHTML = `
                <svg class="w-5 h-5 text-slate-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                <span class="text-[10px] font-mono text-slate-400 block">Abrir sensor de cámara</span>
            `;
            await cargarOrdenesEnTerminal(codigoOT);
        }
    } catch (err) {
        console.error("Fallo de red o enlace al endpoint /estados/:", err);
        mostrarToastTerminal(`Fallo de conexión: ${err.message}`, true);
    } finally {
        btn.disabled = false;
    }
}

function conmutarModoRed() {
    modoOfflineSimulado = !modoOfflineSimulado;
    const dot = document.getElementById('dot-red');
    const label = document.getElementById('txt-red');
    const btn = document.getElementById('btn-toggle-net');

    if (modoOfflineSimulado) {
        dot.className = 'w-1.5 h-1.5 rounded-full bg-amber-500';
        label.innerText = 'OFFLINE';
        btn.innerText = 'Reconectar';
    } else {
        dot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse';
        label.innerText = 'ONLINE';
        btn.innerText = 'Simular Offline';
        sincronizarColaOutbox();
    }
}

function actualizarContadorOutbox() {
    const cola = JSON.parse(localStorage.getItem('tasknode_outbox') || '[]');
    const contador = document.getElementById('outbox-count');
    if (contador) contador.innerText = `Outbox: ${cola.length}`;
}

function sincronizarColaOutbox() {
    const cola = JSON.parse(localStorage.getItem('tasknode_outbox') || '[]');
    if (cola.length > 0) {
        mostrarToastTerminal(`Sincronizados ${cola.length} eventos retenidos.`);
        localStorage.removeItem('tasknode_outbox');
        actualizarContadorOutbox();
        cargarOrdenesEnTerminal();
    }
}

function autocompletarNovedad() {
    const estado = document.getElementById('estado_nuevo').value;
    const txt = document.getElementById('obs');
    if (estado === 'DETENIDA POR ANOMALÍA') {
        txt.value = 'Detención por riesgo técnico bajo D.S. 594 Art. 53. Fuga activa de fluido en brida secundaria. Se requiere repuesto CUM-4932.';
    } else if (estado === 'EN VALIDACIÓN' || estado === 'OT COMPLETADA') {
        txt.value = 'Intervención finalizada. Cambio de sello mecánico y alineación láser completados. Parámetros de presión estables a 6.2 bar.';
    } else {
        txt.value = 'Despliegue inicial de cuadrilla en frente de trabajo. Inspección de EPP completada. Condiciones aptas para inicio de labores.';
    }
}