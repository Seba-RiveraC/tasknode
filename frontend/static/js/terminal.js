const API = window.TaskNodeConfig.API_URL;
let listaOTsCache = [];
let modoOfflineSimulado = false;
let gpsFueraDePlanta = false;

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('formularioEstado');
    if (form) form.addEventListener('submit', procesarTransicionTerreno);

    actualizarContadorOutbox();
    cargarOrdenesEnTerminal('OT-2610-PMT-PRV-0045');
});

function mostrarToastTerminal(mensaje, esError = false) {
    const toast = document.getElementById('hud-toast');
    const msg = document.getElementById('toast-msg');
    const led = document.getElementById('toast-led');
    if (!toast || !msg) return;

    msg.innerText = mensaje;
    led.className = esError ? 'w-2.5 h-2.5 rounded-full bg-red-500 shrink-0' : 'w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0';

    toast.classList.remove('opacity-0', 'translate-y-[-6px]');
    toast.classList.add('opacity-100', 'translate-y-0');

    setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', 'translate-y-[-6px]');
    }, 3800);
}

async function cargarOrdenesEnTerminal(codigoPreseleccionado = null) {
    const select = document.getElementById('codigo_ot');
    if (!select) return;

    try {
        const res = await fetch(`${API}/ordenes/`);
        if (!res.ok) throw new Error('Error al consultar órdenes');
        listaOTsCache = await res.json();
        localStorage.setItem('tasknode_cached_ots', JSON.stringify(listaOTsCache));
        poblarDropdown(listaOTsCache, codigoPreseleccionado);
    } catch (e) {
        const cached = JSON.parse(localStorage.getItem('tasknode_cached_ots') || '[]');
        if (cached.length > 0) {
            listaOTsCache = cached;
            poblarDropdown(cached, codigoPreseleccionado);
        }
    }
}

function poblarDropdown(ots, codigoPreseleccionado = null) {
    const select = document.getElementById('codigo_ot');
    if (ots.length === 0) {
        select.innerHTML = '<option value="">No hay órdenes disponibles</option>';
        return;
    }

    select.innerHTML = ots.map(o =>
        `<option value="${o.codigo_ot}">${o.codigo_ot} — ${o.activo ? o.activo.nombre : o.tipo_mantenimiento}</option>`
    ).join('');

    if (codigoPreseleccionado && ots.some(o => o.codigo_ot === codigoPreseleccionado)) {
        select.value = codigoPreseleccionado;
    }
    actualizarInfoOTSeleccionada();
}

function actualizarInfoOTSeleccionada() {
    const codigo = document.getElementById('codigo_ot').value;
    const ot = listaOTsCache.find(o => o.codigo_ot === codigo);
    if (!ot) return;

    const estadoActual = ot.estado_actual || 'EMITIDA';
    document.getElementById('info-ot-estado').innerText = `Estado: ${estadoActual}`;
    document.getElementById('info-ot-descripcion').innerText = ot.descripcion || 'Sin instrucciones.';

    const nom = ot.operario_responsable || 'Sebastián Rivera';
    const rut = ot.rut_responsable || '18.421.903-K';
    const iniciales = nom.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();

    document.getElementById('perfil-nombre').innerText = nom;
    document.getElementById('perfil-rut-cargo').innerText = `RUT: ${rut} · Técnico Responsable`;
    document.getElementById('perfil-iniciales').innerText = iniciales;

    gpsFueraDePlanta = false;
    actualizarCoordenadaGPS();

    const selectEstado = document.getElementById('estado_nuevo');
    if (estadoActual === 'EMITIDA' || estadoActual === 'DETENIDA POR ANOMALÍA') {
        selectEstado.value = 'EN EJECUCIÓN';
    } else if (estadoActual === 'EN EJECUCIÓN') {
        selectEstado.value = 'EN VALIDACIÓN';
    } else if (estadoActual === 'EN VALIDACIÓN') {
        selectEstado.value = 'OT COMPLETADA';
    }
    autocompletarNovedad();
}

function actualizarCoordenadaGPS() {
    const codigo = document.getElementById('codigo_ot').value;
    const ot = listaOTsCache.find(o => o.codigo_ot === codigo);
    const badge = document.getElementById('badge-geocerca');
    const btnSim = document.getElementById('btn-sim-gps');

    if (gpsFueraDePlanta) {
        const coordsLejanas = "-41.4950, -72.9900";
        document.getElementById('gps').value = coordsLejanas;
        badge.className = "font-mono font-semibold text-red-600";
        badge.innerText = `⚠ Fuera de Planta (>4 km)`;
        if (btnSim) btnSim.innerText = "Restaurar GPS en planta";
    } else {
        const lat = (ot && ot.activo && ot.activo.latitud_referencia) ? ot.activo.latitud_referencia.toFixed(4) : '-41.4693';
        const lon = (ot && ot.activo && ot.activo.longitud_referencia) ? ot.activo.longitud_referencia.toFixed(4) : '-72.9424';
        const coords = `${lat}, ${lon}`;
        document.getElementById('gps').value = coords;
        badge.className = "font-mono font-semibold text-emerald-600";
        badge.innerText = `✓ En Planta (${coords})`;
        if (btnSim) btnSim.innerText = "Simular GPS fuera de planta";
    }
}

function alternarSimulacionGPS() {
    gpsFueraDePlanta = !gpsFueraDePlanta;
    actualizarCoordenadaGPS();
    if (gpsFueraDePlanta) {
        mostrarToastTerminal('GPS alejado a >4 km para demostrar bloqueo por geocerca Haversine.', true);
    } else {
        mostrarToastTerminal('GPS restaurado en la ubicación de la máquina.');
    }
}

function abrirPliegoPDFDesdeTerminal() {
    const codigo = document.getElementById('codigo_ot').value;
    if (!codigo) return;
    const ot = listaOTsCache.find(o => o.codigo_ot === codigo);
    const modo = (ot && ot.estado_actual === 'EMITIDA') ? 'ORIGINAL' : 'COMPLETA';
    window.open(`orden_pdf.html?codigo=${encodeURIComponent(codigo)}&modo=${modo}`, '_blank');
}

function actualizarNombreFoto(input) {
    const label = document.getElementById('camera-label');
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const sizeKb = (file.size / 1024).toFixed(1);
        label.innerHTML = `<span class="text-sky-600 font-semibold">✓ ${file.name} (${sizeKb} KB)</span>`;
    }
}

async function procesarTransicionTerreno(e) {
    e.preventDefault();
    const btn = document.getElementById('btnEnviar');
    btn.disabled = true;

    const codigoOT = document.getElementById('codigo_ot').value;
    const operarioId = document.getElementById('operario_id').value || '45';
    const estadoNuevo = document.getElementById('estado_nuevo').value;
    const gpsVal = document.getElementById('gps').value;
    const obsVal = document.getElementById('obs').value || '';

    if (modoOfflineSimulado || !navigator.onLine) {
        const cola = JSON.parse(localStorage.getItem('tasknode_outbox') || '[]');
        cola.push({
            codigo_ot: codigoOT,
            operario_id: operarioId,
            estado_nuevo: estadoNuevo,
            coordenadas_gps: gpsVal,
            observacion: obsVal || 'Avance guardado sin conexión.',
            timestamp: new Date().toISOString()
        });
        localStorage.setItem('tasknode_outbox', JSON.stringify(cola));
        actualizarContadorOutbox();
        mostrarToastTerminal(`Guardado localmente (${cola.length} pendientes de conexión).`);
        btn.disabled = false;
        return;
    }

    const formData = new FormData();
    formData.append('codigo_ot', codigoOT);
    formData.append('operario_id', operarioId);
    formData.append('estado_nuevo', estadoNuevo);
    formData.append('coordenadas_gps', gpsVal);
    formData.append('observacion', obsVal);

    const inputFoto = document.getElementById('foto');
    if (inputFoto && inputFoto.files && inputFoto.files.length > 0) {
        formData.append('foto', inputFoto.files[0]);
    }

    try {
        const res = await fetch(`${API}/estados/`, { method: 'POST', body: formData });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            mostrarToastTerminal(data.detail || `Error HTTP ${res.status}`, true);
        } else {
            mostrarToastTerminal(`✓ Avance guardado: ${data.codigo_ot} pasó a ${data.estado_nuevo}`);
            if (inputFoto) inputFoto.value = '';
            document.getElementById('camera-label').innerHTML = `📷 Seleccionar fotografía de inspección`;
            await cargarOrdenesEnTerminal(codigoOT);
        }
    } catch (err) {
        mostrarToastTerminal(`Error de red: ${err.message}`, true);
    } finally {
        btn.disabled = false;
    }
}

async function conmutarModoRed() {
    modoOfflineSimulado = !modoOfflineSimulado;
    const dot = document.getElementById('dot-red');
    const label = document.getElementById('txt-red');

    if (modoOfflineSimulado) {
        dot.className = 'w-2 h-2 rounded-full bg-amber-500';
        label.innerText = 'SIN SEÑAL';
        mostrarToastTerminal('Modo Sin Señal activado. Los avances se guardarán en memoria local.');
    } else {
        dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
        label.innerText = 'CONECTADO';
        await sincronizarColaOutbox();
    }
}

function actualizarContadorOutbox() {
    const cola = JSON.parse(localStorage.getItem('tasknode_outbox') || '[]');
    const contador = document.getElementById('outbox-count');
    if (contador) contador.innerText = cola.length;
}

async function sincronizarColaOutbox() {
    const cola = JSON.parse(localStorage.getItem('tasknode_outbox') || '[]');
    if (cola.length === 0) {
        mostrarToastTerminal('Conexión restablecida.');
        return;
    }

    let sincronizados = 0;
    const codigoActual = document.getElementById('codigo_ot').value;

    for (const item of cola) {
        const fd = new FormData();
        fd.append('codigo_ot', item.codigo_ot);
        fd.append('operario_id', item.operario_id || '45');
        fd.append('estado_nuevo', item.estado_nuevo);
        fd.append('coordenadas_gps', item.coordenadas_gps);
        fd.append('observacion', item.observacion);

        try {
            const res = await fetch(`${API}/estados/`, { method: 'POST', body: fd });
            if (res.ok) sincronizados++;
        } catch (err) {}
    }

    localStorage.removeItem('tasknode_outbox');
    actualizarContadorOutbox();
    await cargarOrdenesEnTerminal(codigoActual);
    mostrarToastTerminal(`Sincronizados ${sincronizados}/${cola.length} reportes pendientes.`);
}

function autocompletarNovedad() {
    const estado = document.getElementById('estado_nuevo').value;
    const txt = document.getElementById('obs');
    if (estado === 'DETENIDA POR ANOMALÍA') {
        txt.value = 'Se detiene el trabajo por hallazgo de fuga en sello secundario. Máquina queda bloqueada (LOTO) a la espera de repuesto.';
    } else if (estado === 'EN VALIDACIÓN' || estado === 'OT COMPLETADA') {
        txt.value = 'Trabajo finalizado según pauta técnica. Cambio de kit de sellado ejecutado, prueba de presión a 6.2 bar sin pérdidas y vibración en 1.38 mm/s.';
    } else {
        txt.value = 'Inicio de intervención en terreno. Bloqueo eléctrico LOTO aplicado (0.0 V verificados) y elementos de protección personal completos.';
    }
}