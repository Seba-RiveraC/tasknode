const API = window.TaskNodeConfig.API_URL;
let listaOTsCache = [];
let modoOfflineSimulado = false;
let gpsFueraDePlanta = false;

// Estado de Firma del Encargado de Terreno
let modoFirmaActivo = 'TACTIL';
let canvasFirma = null;
let ctxFirma = null;
let dibujando = false;
let firmaTactilRealizada = false;
let credencialQRValidada = false;

// Rúbrica de muestra para el botón "Firma Rápida"
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
    cargarOrdenesEnTerminal('OT-2610-PMT-PRV-0045');
});

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
        mostrarToastTerminal("✓ Rúbrica del Encargado de Terreno cargada.");
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
        btnTactil.className = "py-1.5 px-2 rounded font-bold text-xs border border-accent text-accent bg-surface-2 transition";
        btnQR.className = "py-1.5 px-2 rounded font-bold text-xs border border-theme-dim text-theme-muted bg-surface-2 transition";
        panelTactil.classList.remove('hidden');
        panelQR.classList.add('hidden');
    } else {
        btnQR.className = "py-1.5 px-2 rounded font-bold text-xs border border-accent text-accent bg-surface-2 transition";
        btnTactil.className = "py-1.5 px-2 rounded font-bold text-xs border border-theme-dim text-theme-muted bg-surface-2 transition";
        panelTactil.classList.add('hidden');
        panelQR.classList.remove('hidden');
    }
    actualizarBadgeFirma();
}

function simularEscaneoQR() {
    credencialQRValidada = true;
    const res = document.getElementById('qr-resultado');
    const btn = document.getElementById('btn-escanear-qr');
    if (res) res.classList.remove('hidden');
    if (btn) {
        btn.classList.add('border-emerald-600', 'text-emerald-500');
        btn.innerHTML = `<span>✓ Credencial Encargado Validada (14.285.631-8)</span>`;
    }
    mostrarToastTerminal("✓ Credencial de Encargado de Terreno acreditada por QR.");
    actualizarBadgeFirma();
}

function actualizarBadgeFirma() {
    const badge = document.getElementById('badge-tipo-firma');
    if (!badge) return;

    if (modoFirmaActivo === 'TACTIL' && firmaTactilRealizada) {
        badge.className = "code-pill text-[9px] font-bold px-2 py-0.5 rounded text-emerald-500 border-emerald-600";
        badge.innerText = "✓ RÚBRICA ENCARGADO OK";
    } else if (modoFirmaActivo === 'QR' && credencialQRValidada) {
        badge.className = "code-pill text-[9px] font-bold px-2 py-0.5 rounded text-emerald-500 border-emerald-600";
        badge.innerText = "✓ TOKEN QR ENCARGADO OK";
    } else {
        badge.className = "code-pill text-[9px] font-bold px-2 py-0.5 rounded text-theme-dim";
        badge.innerText = "PENDIENTE";
    }
}

function manejarCambioEstado(nuevoEstado) {
    autocompletarNovedad();
    const btnEnviar = document.getElementById('btnEnviar');
    const panelFirma = document.getElementById('panel-modulo-firma') || document.querySelector('.sig-canvas')?.closest('.border-2');
    const badgeFirma = document.getElementById('badge-tipo-firma');

    const requiereFirma = (nuevoEstado === 'EN VALIDACIÓN' || nuevoEstado === 'OT COMPLETADA');

    if (requiereFirma) {
        btnEnviar.innerText = "Firmar Recepción Conforme y Finalizar OT (SHA-256)";
        if (badgeFirma && !firmaTactilRealizada && !credencialQRValidada) {
            badgeFirma.innerText = "OBLIGATORIA PARA CIERRE";
            badgeFirma.className = "code-pill text-[9px] font-bold px-2 py-0.5 rounded text-amber-500 border-amber-600";
        }
        if (panelFirma) {
            panelFirma.classList.remove('opacity-60');
            panelFirma.style.pointerEvents = "auto";
        }
    } else {
        btnEnviar.innerText = "Guardar Reporte de Avance en Terreno";
        if (badgeFirma) {
            badgeFirma.innerText = "NO REQUERIDA EN AVANCE";
            badgeFirma.className = "code-pill text-[9px] font-bold px-2 py-0.5 rounded text-theme-dim";
        }
        if (panelFirma) {
            panelFirma.classList.add('opacity-60');
        }
    }
}

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
    document.getElementById('perfil-rut-cargo').innerText = `RUT: ${rut} · Técnico Ejecutor`;
    document.getElementById('perfil-iniciales').innerText = iniciales;

    gpsFueraDePlanta = false;
    actualizarCoordenadaGPS();

    // Cargar si ya existía una firma del encargado en localStorage
    limpiarCanvasFirma();
    credencialQRValidada = false;
    const firmaGuardada = localStorage.getItem(`tasknode_signature_encargado_${codigo}`) || localStorage.getItem(`tasknode_signature_${codigo}`);
    if (firmaGuardada && ctxFirma) {
        const img = new Image();
        img.onload = () => {
            ctxFirma.drawImage(img, 0, 0, canvasFirma.width, canvasFirma.height);
            firmaTactilRealizada = true;
            actualizarBadgeFirma();
        };
        img.src = firmaGuardada;
    }

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
        if (btnSim) btnSim.innerText = "Simular GPS lejos (>4km)";
    }
}

function alternarSimulacionGPS() {
    gpsFueraDePlanta = !gpsFueraDePlanta;
    actualizarCoordenadaGPS();
    if (gpsFueraDePlanta) {
        mostrarToastTerminal('GPS desplazado a >4 km para probar bloqueo Haversine.', true);
    } else {
        mostrarToastTerminal('GPS restaurado en ubicación de máquina.');
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
        label.innerHTML = `<span class="text-accent font-semibold">✓ ${file.name} (${sizeKb} KB)</span>`;
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

    // Guardar datos del Encargado en localStorage
    localStorage.setItem(`tasknode_encargado_nombre_${codigoOT}`, nombreEncargado);
    localStorage.setItem(`tasknode_encargado_rut_${codigoOT}`, rutEncargado);

    let infoFirmaTexto = "";
    if (modoFirmaActivo === 'TACTIL' && firmaTactilRealizada && canvasFirma) {
        const dataUrl = canvasFirma.toDataURL('image/png');
        localStorage.setItem(`tasknode_signature_encargado_${codigoOT}`, dataUrl);
        localStorage.setItem(`tasknode_signature_${codigoOT}`, dataUrl); // retrocompatibilidad
        infoFirmaTexto = ` [RECEPCION_ENCARGADO: ${nombreEncargado} (${rutEncargado}) - FIRMA_TACTIL_REGISTRADA]`;
    } else if (modoFirmaActivo === 'QR' && credencialQRValidada) {
        const tokenQR = `TOKEN-QR-ENCARGADO-142856318-${Date.now().toString(36).toUpperCase()}`;
        localStorage.setItem(`tasknode_qr_encargado_${codigoOT}`, tokenQR);
        localStorage.setItem(`tasknode_qr_${codigoOT}`, tokenQR);
        infoFirmaTexto = ` [RECEPCION_ENCARGADO: ${nombreEncargado} - CREDENCIAL_QR_VALIDADA: ${tokenQR}]`;
    }

    const obsFinal = `${obsVal}${infoFirmaTexto}`.trim();

    if (modoOfflineSimulado || !navigator.onLine) {
        const cola = JSON.parse(localStorage.getItem('tasknode_outbox') || '[]');
        cola.push({
            codigo_ot: codigoOT,
            operario_id: operarioId,
            estado_nuevo: estadoNuevo,
            coordenadas_gps: gpsVal,
            observacion: obsFinal || 'Recepción en terreno guardada sin conexión.',
            timestamp: new Date().toISOString()
        });
        localStorage.setItem('tasknode_outbox', JSON.stringify(cola));
        actualizarContadorOutbox();
        mostrarToastTerminal(`Guardado localmente (${cola.length} pendientes).`);
        btn.disabled = false;
        return;
    }

    const formData = new FormData();
    formData.append('codigo_ot', codigoOT);
    formData.append('operario_id', operarioId);
    formData.append('estado_nuevo', estadoNuevo);
    formData.append('coordenadas_gps', gpsVal);
    formData.append('observacion', obsFinal);

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
            mostrarToastTerminal(`✓ Orden ${data.codigo_ot} recibida por Encargado y sincronizada.`);
            if (inputFoto) inputFoto.value = '';
            document.getElementById('camera-label').innerHTML = `📷 Adjuntar fotografía de inspección`;
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
        mostrarToastTerminal('Modo Sin Señal activado. Los reportes se almacenan en cola local.');
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
    mostrarToastTerminal(`Sincronizados ${sincronizados}/${cola.length} reportes con firma.`);
}

function autocompletarNovedad() {
    const estado = document.getElementById('estado_nuevo').value;
    const txt = document.getElementById('obs');
    if (estado === 'DETENIDA POR ANOMALÍA') {
        txt.value = 'Se suspende intervención por hallazgo de fuga activa en sello secundario. Equipo bloqueado bajo protocolo LOTO.';
    } else if (estado === 'EN VALIDACIÓN' || estado === 'OT COMPLETADA') {
        txt.value = 'Pauta técnica ejecutada al 100%. Reemplazo de kit de sellos finalizado, prueba hidráulica a 6.2 bar conforme y vibración global en 1.38 mm/s.';
    } else {
        txt.value = 'Inicio de intervención en terreno. Desenergización comprobada (0.0 V) y candado personal LOTO instalado.';
    }
}