const API = window.TaskNodeConfig.API_URL;
let listaOTsCache = [];
let hitosActivosTerminal = [];
let modoOfflineSimulado = false;
let gpsFueraDePlanta = false;

let modoFirmaActivo = 'TACTIL';
let canvasFirma = null;
let ctxFirma = null;
let dibujando = false;
let firmaTactilRealizada = false;
let credencialQRValidada = false;

const FIRMA_ENCARGADO_DEMO = "data:image/svg+xml;utf8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="90" viewBox="0 0 300 90">
  <path d="M 25 65 Q 45 15 70 35 T 115 50 T 150 25 T 195 65 Q 220 75 270 45" fill="none" stroke="#c2410c" stroke-width="2.8" stroke-linecap="round"/>
  <path d="M 85 45 Q 140 10 240 20" fill="none" stroke="#c2410c" stroke-width="2.2" stroke-linecap="round"/>
  <text x="30" y="82" font-family="monospace" font-size="8.5" fill="#18181b" font-weight="bold">C. VALENZUELA · 14.285.631-8 (ENCARGADO TERRENO)</text>
</svg>`);

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('formularioEstado');
    if (form) form.addEventListener('submit', procesarTransicionTerreno);

    inicializarCanvasFirma();
    actualizarContadorOutbox();
    cargarOrdenesEnTerminal('OT-1002');
});

function abrirModalFirma() {
    const modal = document.getElementById('modal-firma-terreno');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function cerrarModalFirma() {
    const modal = document.getElementById('modal-firma-terreno');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    actualizarBadgeFirma();
}

function inicializarCanvasFirma() {
    canvasFirma = document.getElementById('signature-canvas');
    if (!canvasFirma) return;

    ctxFirma = canvasFirma.getContext('2d');
    ctxFirma.lineWidth = 2.4;
    ctxFirma.lineCap = 'round';
    ctxFirma.lineJoin = 'round';
    ajustarColorTrazo();

    canvasFirma.addEventListener('mousedown', iniciarTrazo);
    canvasFirma.addEventListener('mousemove', trazar);
    window.addEventListener('mouseup', finalizarTrazo);

    canvasFirma.addEventListener('touchstart', (e) => {
        e.preventDefault();
        iniciarTrazo(e.touches[0]);
    }, { passive: false });

    canvasFirma.addEventListener('touchmove', (e) => {
        e.preventDefault();
        trazar(e.touches[0]);
    }, { passive: false });

    canvasFirma.addEventListener('touchend', (e) => {
        e.preventDefault();
        finalizarTrazo();
    }, { passive: false });
}

function ajustarColorTrazo() {
    if (!ctxFirma) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    ctxFirma.strokeStyle = isDark ? '#fb923c' : '#c2410c';
}

function getPos(e) {
    const rect = canvasFirma.getBoundingClientRect();
    const scaleX = canvasFirma.width / rect.width;
    const scaleY = canvasFirma.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

function iniciarTrazo(e) {
    dibujando = true;
    ajustarColorTrazo();
    const pos = getPos(e);
    ctxFirma.beginPath();
    ctxFirma.moveTo(pos.x, pos.y);
}

function trazar(e) {
    if (!dibujando) return;
    const pos = getPos(e);
    ctxFirma.lineTo(pos.x, pos.y);
    ctxFirma.stroke();
    firmaTactilRealizada = true;
    actualizarBadgeFirma();
}

function finalizarTrazo() {
    if (dibujando) {
        ctxFirma.closePath();
        dibujando = false;
    }
}

function limpiarCanvasFirma() {
    if (!ctxFirma || !canvasFirma) return;
    ctxFirma.clearRect(0, 0, canvasFirma.width, canvasFirma.height);
    firmaTactilRealizada = false;
    credencialQRValidada = false;
    const res = document.getElementById('qr-resultado');
    if (res) res.classList.add('hidden');
    actualizarBadgeFirma();
}

function cargarFirmaRapidaPrueba() {
    if (!ctxFirma || !canvasFirma) return;
    limpiarCanvasFirma();
    const img = new Image();
    img.onload = () => {
        ctxFirma.drawImage(img, 0, 0, canvasFirma.width, canvasFirma.height);
        firmaTactilRealizada = true;
        actualizarBadgeFirma();
        mostrarToastTerminal("Firma del Encargado cargada.");
    };
    img.src = FIRMA_ENCARGADO_DEMO;
}

function seleccionarModoFirma(modo) {
    modoFirmaActivo = modo;
    const btnTactil = document.getElementById('btn-tab-tactil');
    const btnQR = document.getElementById('btn-tab-qr');
    const panelTactil = document.getElementById('panel-firma-tactil');
    const panelQR = document.getElementById('panel-firma-qr');

    if (modo === 'TACTIL') {
        btnTactil.className = "py-1.5 px-2 rounded font-bold text-xs border border-accent text-accent bg-surface-2";
        btnQR.className = "py-1.5 px-2 rounded font-bold text-xs border border-theme-dim text-theme-muted bg-surface-2";
        panelTactil.classList.remove('hidden');
        panelQR.classList.add('hidden');
    } else {
        btnQR.className = "py-1.5 px-2 rounded font-bold text-xs border border-accent text-accent bg-surface-2";
        btnTactil.className = "py-1.5 px-2 rounded font-bold text-xs border border-theme-dim text-theme-muted bg-surface-2";
        panelTactil.classList.add('hidden');
        panelQR.classList.remove('hidden');
    }
    actualizarBadgeFirma();
}

function simularEscaneoQR() {
    credencialQRValidada = true;
    const res = document.getElementById('qr-resultado');
    if (res) res.classList.remove('hidden');
    mostrarToastTerminal("Credencial QR validada.");
    actualizarBadgeFirma();
}

function actualizarBadgeFirma() {
    const badge = document.getElementById('badge-tipo-firma');
    if (!badge) return;

    if (modoFirmaActivo === 'TACTIL' && firmaTactilRealizada) {
        badge.className = "text-[10px] font-mono text-emerald-600 font-bold mt-0.5";
        badge.innerText = "Firma adjuntada";
    } else if (modoFirmaActivo === 'QR' && credencialQRValidada) {
        badge.className = "text-[10px] font-mono text-emerald-600 font-bold mt-0.5";
        badge.innerText = "QR adjuntado";
    } else {
        badge.className = "text-[10px] font-mono text-theme-dim mt-0.5";
        badge.innerText = "No adjuntada (Abrir)";
    }
}

function manejarCambioEstado(nuevoEstado) {
    autocompletarNovedad();
    actualizarBadgeFirma();
}

function mostrarToastTerminal(mensaje, esError = false) {
    const toast = document.getElementById('hud-toast');
    const msg = document.getElementById('toast-msg');
    const led = document.getElementById('toast-led');
    if (!toast || !msg) return;

    msg.innerText = mensaje;
    led.className = esError ? 'w-2 h-2 rounded-full bg-red-500 shrink-0' : 'w-2 h-2 rounded-full bg-emerald-500 shrink-0';

    toast.classList.remove('opacity-0', 'translate-y-[-6px]');
    toast.classList.add('opacity-100', 'translate-y-0');

    setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', 'translate-y-[-6px]');
    }, 3500);
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
        } else {
            select.innerHTML = '<option value="">Sin órdenes cargadas</option>';
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
        `<option value="${o.codigo_ot}">${o.codigo_ot} — ${o.cliente_mandante || 'SurTel'} (${o.avance_pct || 0}%)</option>`
    ).join('');

    if (codigoPreseleccionado && ots.some(o => o.codigo_ot === codigoPreseleccionado)) {
        select.value = codigoPreseleccionado;
    }
    actualizarInfoOTSeleccionada();
}

function obtenerHitosPorDefecto(ot) {
    const completado = (ot && ot.estado_actual === 'OT COMPLETADA');
    return [
        { id: 1, dia: "Etapa 1", titulo: "Permiso de acceso a sitio y bloqueo LOTO (D.S. 594)", completado },
        { id: 2, dia: "Etapa 2", titulo: "Inspección física de infraestructura e intervención técnica", completado },
        { id: 3, dia: "Etapa 3", titulo: "Ajuste de parámetros operativos y verificación de enlace", completado },
        { id: 4, dia: "Etapa 4", titulo: "Captura de evidencia fotográfica y recepción en terreno", completado }
    ];
}

function renderizarChecklistTerminal() {
    const cont = document.getElementById('contenedor-hitos-terminal');
    const txtProg = document.getElementById('terminal-progreso-hitos');
    const barra = document.getElementById('terminal-barra-hitos');
    if (!cont) return;

    const total = hitosActivosTerminal.length;
    const comp = hitosActivosTerminal.filter(h => h.completado).length;
    const pct = total > 0 ? Math.round((comp / total) * 100) : 0;

    if (txtProg) txtProg.innerText = `${comp}/${total} (${pct}%)`;
    if (barra) barra.style.width = `${pct}%`;

    cont.innerHTML = hitosActivosTerminal.map((h, idx) => `
        <label class="flex items-start gap-2.5 p-2 rounded border border-theme-dim bg-surface-2 cursor-pointer">
            <input type="checkbox" ${h.completado ? 'checked' : ''} onchange="cambiarHitoEnTerminal(${idx}, this.checked)" class="mt-0.5 w-4 h-4 accent-[#c2410c]">
            <div class="text-xs leading-snug">
                <span class="font-mono text-[10px] font-bold text-accent block">${h.dia}</span>
                <span class="${h.completado ? 'line-through text-theme-dim' : 'text-theme-main font-medium'}">${h.titulo}</span>
            </div>
        </label>
    `).join('');
}

function cambiarHitoEnTerminal(idx, marcado) {
    if (!hitosActivosTerminal[idx]) return;
    hitosActivosTerminal[idx].completado = marcado;
    renderizarChecklistTerminal();

    const todosListos = hitosActivosTerminal.every(h => h.completado);
    const selectEstado = document.getElementById('estado_nuevo');
    if (todosListos && selectEstado && selectEstado.value === 'EN EJECUCIÓN') {
        selectEstado.value = 'EN VALIDACIÓN';
        manejarCambioEstado('EN VALIDACIÓN');
    }
}

function actualizarInfoOTSeleccionada() {
    const codigo = document.getElementById('codigo_ot').value;
    const ot = listaOTsCache.find(o => o.codigo_ot === codigo);
    if (!ot) return;

    const estadoActual = ot.estado_actual || 'EMITIDA';
    document.getElementById('info-ot-estado').innerText = estadoActual;
    document.getElementById('info-ot-cliente').innerText = `Cliente: ${ot.cliente_mandante || 'SurTel Redes'}`;
    document.getElementById('info-ot-descripcion').innerText = ot.descripcion || 'Sin instrucciones.';
    document.getElementById('perfil-nombre').innerText = `${ot.operario_responsable} (${ot.rut_responsable})`;

    const hitosBase = (ot.hitos && ot.hitos.length > 0) ? ot.hitos : obtenerHitosPorDefecto(ot);
    hitosActivosTerminal = JSON.parse(JSON.stringify(hitosBase));
    renderizarChecklistTerminal();

    gpsFueraDePlanta = false;
    actualizarCoordenadaGPS();
    limpiarCanvasFirma();

    const selectEstado = document.getElementById('estado_nuevo');
    if (estadoActual === 'EMITIDA' || estadoActual === 'DETENIDA POR ANOMALÍA') {
        selectEstado.value = 'EN EJECUCIÓN';
    } else if (estadoActual === 'EN EJECUCIÓN') {
        selectEstado.value = 'EN VALIDACIÓN';
    } else if (estadoActual === 'EN VALIDACIÓN') {
        selectEstado.value = 'OT COMPLETADA';
    }
    manejarCambioEstado(selectEstado.value);
}

function actualizarCoordenadaGPS() {
    const codigo = document.getElementById('codigo_ot').value;
    const ot = listaOTsCache.find(o => o.codigo_ot === codigo);
    const badge = document.getElementById('badge-geocerca');

    if (gpsFueraDePlanta) {
        document.getElementById('gps').value = "-41.4950, -72.9900";
        badge.className = "font-mono font-bold text-red-600";
        badge.innerText = "Fuera de rango (>4 km)";
    } else {
        const lat = (ot && ot.activo && ot.activo.latitud_referencia) ? ot.activo.latitud_referencia.toFixed(4) : '-41.4870';
        const lon = (ot && ot.activo && ot.activo.longitud_referencia) ? ot.activo.longitud_referencia.toFixed(4) : '-72.9550';
        document.getElementById('gps').value = `${lat}, ${lon}`;
        badge.className = "font-mono font-bold text-emerald-600";
        badge.innerText = `GPS en Sitio (${lat}, ${lon})`;
    }
}

function alternarSimulacionGPS() {
    gpsFueraDePlanta = !gpsFueraDePlanta;
    actualizarCoordenadaGPS();
}

function abrirPliegoPDFDesdeTerminal() {
    const codigo = document.getElementById('codigo_ot').value;
    if (!codigo) return;
    window.open(`orden_pdf.html?codigo=${encodeURIComponent(codigo)}&modo=COMPLETA`, '_blank');
}

function actualizarNombreFoto(input) {
    const label = document.getElementById('camera-label');
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const sizeKb = (file.size / 1024).toFixed(1);
        label.innerHTML = `<span class="text-accent font-bold">${file.name} (${sizeKb} KB)</span>`;
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
    let obsVal = document.getElementById('obs').value || '';

    const nombreEncargado = document.getElementById('nombre_encargado').value.trim() || 'Carlos Valenzuela M.';
    const rutEncargado = document.getElementById('rut_encargado').value.trim() || '14.285.631-8';

    let firmaPayload = "";
    if (modoFirmaActivo === 'TACTIL' && firmaTactilRealizada && canvasFirma) {
        firmaPayload = canvasFirma.toDataURL('image/png');
    } else if (modoFirmaActivo === 'QR' && credencialQRValidada) {
        firmaPayload = `TOKEN-QR-ENCARGADO-142856318-${Date.now().toString(36).toUpperCase()}`;
    }

    const hitosSerializados = JSON.stringify(hitosActivosTerminal);

    if (modoOfflineSimulado || !navigator.onLine) {
        const cola = JSON.parse(localStorage.getItem('tasknode_outbox') || '[]');
        cola.push({
            codigo_ot: codigoOT,
            operario_id: operarioId,
            estado_nuevo: estadoNuevo,
            coordenadas_gps: gpsVal,
            observacion: obsVal || 'Avance registrado sin conexión.',
            encargado_nombre: nombreEncargado,
            encargado_rut: rutEncargado,
            firma_data: firmaPayload,
            hitos_json: hitosSerializados,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem('tasknode_outbox', JSON.stringify(cola));
        actualizarContadorOutbox();
        mostrarToastTerminal(`Guardado en cola local (${cola.length} pendientes).`);
        btn.disabled = false;
        return;
    }

    const formData = new FormData();
    formData.append('codigo_ot', codigoOT);
    formData.append('operario_id', operarioId);
    formData.append('estado_nuevo', estadoNuevo);
    formData.append('coordenadas_gps', gpsVal);
    formData.append('observacion', obsVal);
    formData.append('encargado_nombre', nombreEncargado);
    formData.append('encargado_rut', rutEncargado);
    formData.append('hitos_json', hitosSerializados);
    if (firmaPayload) formData.append('firma_data', firmaPayload);

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
            mostrarToastTerminal(`Avance sincronizado en ${data.codigo_ot}.`);
            if (inputFoto) inputFoto.value = '';
            document.getElementById('camera-label').innerText = "Adjuntar Fotografía";
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
        label.innerText = 'SIN RED';
        mostrarToastTerminal('Modo sin conexión activado.');
    } else {
        dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
        label.innerText = 'EN LÍNEA';
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
    if (cola.length === 0) return;

    let sincronizados = 0;
    const codigoActual = document.getElementById('codigo_ot').value;

    for (const item of cola) {
        const fd = new FormData();
        fd.append('codigo_ot', item.codigo_ot);
        fd.append('operario_id', item.operario_id || '45');
        fd.append('estado_nuevo', item.estado_nuevo);
        fd.append('coordenadas_gps', item.coordenadas_gps);
        fd.append('observacion', item.observacion);
        if (item.hitos_json) fd.append('hitos_json', item.hitos_json);
        if (item.encargado_nombre) fd.append('encargado_nombre', item.encargado_nombre);
        if (item.encargado_rut) fd.append('encargado_rut', item.encargado_rut);
        if (item.firma_data) fd.append('firma_data', item.firma_data);

        try {
            const res = await fetch(`${API}/estados/`, { method: 'POST', body: fd });
            if (res.ok) sincronizados++;
        } catch (err) {}
    }

    localStorage.removeItem('tasknode_outbox');
    actualizarContadorOutbox();
    await cargarOrdenesEnTerminal(codigoActual);
    mostrarToastTerminal(`Sincronizados ${sincronizados}/${cola.length} registros.`);
}

function autocompletarNovedad() {
    const estado = document.getElementById('estado_nuevo').value;
    const txt = document.getElementById('obs');
    const comp = hitosActivosTerminal.filter(h => h.completado).length;
    if (estado === 'DETENIDA POR ANOMALÍA') {
        txt.value = `Faena pausada con ${comp}/${hitosActivosTerminal.length} hitos completados. Equipo bloqueado bajo protocolo LOTO.`;
    } else if (estado === 'EN VALIDACIÓN' || estado === 'OT COMPLETADA') {
        txt.value = `Plan de ${hitosActivosTerminal.length} hitos completado al 100%. Parámetros verificados y recepción conforme.`;
    } else {
        txt.value = `Avance registrado (${comp}/${hitosActivosTerminal.length} hitos listos). Bloqueo LOTO y EPP verificados.`;
    }
}