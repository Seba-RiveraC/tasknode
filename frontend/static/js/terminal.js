const API = window.TaskNodeConfig.API_URL;
let listaOTsCache = [];
let hitosActivosTerminal = [];
let modoOfflineSimulado = false;

let modoFirmaActivo = 'TACTIL';
let canvasFirma = null;
let ctxFirma = null;
let dibujando = false;
let firmaTactilRealizada = false;
let credencialQRValidada = false;
let fotoPreviewUrl = null;

// CANDADO: Evita que el polling de 6s o el cambio de app/cámara reinicien la pantalla
let modalFirmaAbierto = false;
let enviandoTransicion = false;

const ESTADO_ANOMALIA = 'DETENIDA POR ANOMALÍA';
const GPS_PRUEBA = 'PRUEBA_SIN_GPS';
let permitirPruebaSinGps = false;
let trabajadorPrueba = null;

const FIRMA_ENCARGADO_DEMO = "data:image/svg+xml;utf8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="90" viewBox="0 0 300 90">
  <path d="M 25 65 Q 45 15 70 35 T 115 50 T 150 25 T 195 65 Q 220 75 270 45" fill="none" stroke="#c2410c" stroke-width="2.8" stroke-linecap="round"/>
  <path d="M 85 45 Q 140 10 240 20" fill="none" stroke="#c2410c" stroke-width="2.2" stroke-linecap="round"/>
</svg>`);

document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('formularioEstado');
    if (form) form.addEventListener('submit', (e) => procesarTransicionTerreno(e));

    inicializarCanvasFirma();
    actualizarContadorOutbox();
    actualizarIndicadorRed();
    await cargarConfiguracionTerminal();
    await cargarOrdenesEnTerminal();

    // Sincronización periódica protegida por candado
    setInterval(() => {
        if (!modoOfflineSimulado && navigator.onLine && puedeSincronizar()) {
            sincronizarHitosEnVivo();
        }
    }, 6000);

    // Al regresar de la cámara, NO recargar si el técnico tiene una foto cargada (puedeSincronizar lo evita)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !modoOfflineSimulado && navigator.onLine && puedeSincronizar()) {
            sincronizarHitosEnVivo();
        }
    });

    window.addEventListener('offline', actualizarIndicadorRed);
    window.addEventListener('online', async () => {
        actualizarIndicadorRed();
        if (!modoOfflineSimulado) await sincronizarColaOutbox();
    });
    if (navigator.onLine) sincronizarColaOutbox();
});

// Comprueba si el técnico está interactuando para NO interrumpir su trabajo
function puedeSincronizar() {
    if (modalFirmaAbierto || enviandoTransicion) return false;
    const inputFoto = document.getElementById('foto');
    if (inputFoto && inputFoto.files && inputFoto.files.length > 0) return false;
    return true;
}

function escaparHTML(valor) {
    return String(valor == null ? '' : valor)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function setTexto(id, texto) {
    const el = document.getElementById(id);
    if (el) el.innerText = texto;
}

function todasLasEtapasListas() {
    return hitosActivosTerminal.every(h => h.completado);
}

function firmaDisponible() {
    return (modoFirmaActivo === 'TACTIL' && firmaTactilRealizada) ||
        (modoFirmaActivo === 'QR' && credencialQRValidada);
}

function obtenerOTSeleccionada() {
    const select = document.getElementById('codigo_ot');
    if (!select) return null;
    return listaOTsCache.find(o => o.codigo_ot === select.value) || null;
}

function obtenerTrabajadorTerminal() {
    const usuario = window.obtenerUsuarioActual ? window.obtenerUsuarioActual() : null;
    if (usuario && usuario.rol === 'TRABAJADOR' && usuario.id) {
        return { id: usuario.id, nombre: usuario.nombre_completo, prueba: false };
    }
    return trabajadorPrueba ? { ...trabajadorPrueba, prueba: true } : null;
}

function insertarChipMinuta(textoChip) {
    const txt = document.getElementById('obs');
    if (!txt) return;
    const actual = txt.value.trim();
    txt.value = actual ? `${actual} ${textoChip}` : textoChip;
}

/* ---------- Firma ---------- */

function abrirModalFirmaCondicional() {
    const ot = obtenerOTSeleccionada();
    if (ot && ot.estado_actual === 'OT COMPLETADA') return;

    modalFirmaAbierto = true; // Bloquea el polling
    const modal = document.getElementById('modal-firma-terreno');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function cerrarModalFirma() {
    modalFirmaAbierto = false; // Libera el candado
    const modal = document.getElementById('modal-firma-terreno');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    actualizarAspectoBotonesEvidencia();
}

function confirmarFirma() {
    if (!firmaDisponible()) {
        mostrarToastTerminal(modoFirmaActivo === 'QR' ? 'Escanee el código QR para continuar.' : 'Falta la firma en el recuadro.', true);
        return;
    }
    if (!document.getElementById('nombre_encargado').value.trim() || !document.getElementById('rut_encargado').value.trim()) {
        mostrarToastTerminal('Indica el nombre y RUT de quien recibe.', true);
        return;
    }
    cerrarModalFirma();
}

function inicializarCanvasFirma() {
    canvasFirma = document.getElementById('signature-canvas');
    if (!canvasFirma) return;

    ctxFirma = canvasFirma.getContext('2d');
    ctxFirma.lineWidth = 2.8;
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
}

function finalizarTrazo() {
    if (dibujando) {
        ctxFirma.closePath();
        dibujando = false;
        actualizarAspectoBotonesEvidencia();
    }
}

function limpiarCanvasFirma() {
    if (ctxFirma && canvasFirma) {
        ctxFirma.clearRect(0, 0, canvasFirma.width, canvasFirma.height);
    }
    firmaTactilRealizada = false;
    credencialQRValidada = false;
    const res = document.getElementById('qr-resultado');
    if (res) res.classList.add('hidden');
    actualizarAspectoBotonesEvidencia();
}

function cargarFirmaRapidaPrueba() {
    if (!ctxFirma || !canvasFirma) return;
    limpiarCanvasFirma();
    const img = new Image();
    img.onload = () => {
        ctxFirma.drawImage(img, 0, 0, canvasFirma.width, canvasFirma.height);
        firmaTactilRealizada = true;
        actualizarAspectoBotonesEvidencia();
        mostrarToastTerminal('Firma de prueba cargada.');
    };
    img.src = FIRMA_ENCARGADO_DEMO;
}

function seleccionarModoFirma(modo) {
    modoFirmaActivo = modo;
    const btnTactil = document.getElementById('btn-tab-tactil');
    const btnQR = document.getElementById('btn-tab-qr');
    const panelTactil = document.getElementById('panel-firma-tactil');
    const panelQR = document.getElementById('panel-firma-qr');
    if (!btnTactil || !btnQR || !panelTactil || !panelQR) return;

    const claseActiva = "min-h-[48px] px-2 rounded-lg font-bold text-sm border border-accent text-accent bg-surface-2";
    const claseInactiva = "min-h-[48px] px-2 rounded-lg font-bold text-sm border border-theme-dim text-theme-muted bg-surface-2";

    if (modo === 'TACTIL') {
        btnTactil.className = claseActiva;
        btnQR.className = claseInactiva;
        panelTactil.classList.remove('hidden');
        panelQR.classList.add('hidden');
    } else {
        btnQR.className = claseActiva;
        btnTactil.className = claseInactiva;
        panelTactil.classList.add('hidden');
        panelQR.classList.remove('hidden');
    }
    actualizarAspectoBotonesEvidencia();
}

function simularEscaneoQR() {
    credencialQRValidada = true;
    const res = document.getElementById('qr-resultado');
    if (res) res.classList.remove('hidden');
    mostrarToastTerminal('Código QR verificado.');
    actualizarAspectoBotonesEvidencia();
}

function mostrarToastTerminal(mensaje, esError = false) {
    const toast = document.getElementById('hud-toast');
    const msg = document.getElementById('toast-msg');
    const led = document.getElementById('toast-led');
    if (!toast || !msg) return;

    msg.innerText = mensaje;
    if (led) {
        led.className = esError ? 'w-2.5 h-2.5 rounded-full bg-red-500 shrink-0' : 'w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0';
    }

    toast.classList.remove('opacity-0', 'translate-y-[-6px]');
    toast.classList.add('opacity-100', 'translate-y-0');

    setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', 'translate-y-[-6px]');
    }, 3500);
}

/* ---------- Aspecto de acciones ---------- */

function actualizarAspectoBotonesEvidencia() {
    const contFoto = document.getElementById('btn-container-foto');
    const inputFoto = document.getElementById('foto');
    const tieneFoto = !!(inputFoto && inputFoto.files && inputFoto.files.length > 0);
    if (contFoto) {
        contFoto.className = tieneFoto
            ? "border-2 border-emerald-500 bg-emerald-950/20 rounded-lg px-4 min-h-[56px] py-2 cursor-pointer flex items-center gap-3 transition"
            : "border-2 border-theme-bright bg-surface-2 rounded-lg px-4 min-h-[56px] py-2 cursor-pointer flex items-center gap-3 transition";
    }

    const btnFirma = document.getElementById('btn-abrir-firma');
    const badgeFirma = document.getElementById('badge-tipo-firma');
    const firmada = firmaDisponible();
    if (btnFirma) {
        btnFirma.className = firmada
            ? "w-full border-2 border-emerald-500 bg-emerald-950/20 rounded-lg px-4 min-h-[56px] py-2 text-left flex flex-col justify-center transition"
            : "w-full border-2 border-theme-bright bg-surface-2 rounded-lg px-4 min-h-[56px] py-2 text-left flex flex-col justify-center transition";
    }
    if (badgeFirma) {
        badgeFirma.className = firmada ? "text-xs text-emerald-600 font-bold" : "text-xs text-theme-dim";
        badgeFirma.innerText = firmada ? 'Firma lista ✓' : 'Completa las etapas y cierra la orden';
    }
}

function actualizarNombreFoto(input) {
    const label = document.getElementById('camera-label');
    const sublabel = document.getElementById('camera-sublabel');
    const preview = document.getElementById('foto-preview');

    if (fotoPreviewUrl) {
        URL.revokeObjectURL(fotoPreviewUrl);
        fotoPreviewUrl = null;
    }

    if (input && input.files && input.files[0]) {
        const file = input.files[0];
        const sizeKb = (file.size / 1024).toFixed(0);
        if (label) label.innerText = '📷 Foto lista ✓';
        if (sublabel) sublabel.innerText = `${file.name} · ${sizeKb} KB`;
        if (preview) {
            fotoPreviewUrl = URL.createObjectURL(file);
            preview.src = fotoPreviewUrl;
            preview.classList.remove('hidden');
        }
    } else {
        if (label) label.innerText = '📷 Tomar / Subir Foto';
        if (sublabel) sublabel.innerText = 'Evidencia del trabajo';
        if (preview) {
            preview.removeAttribute('src');
            preview.classList.add('hidden');
        }
    }
    actualizarAspectoBotonesEvidencia();
}

function limpiarEvidencias() {
    const inputFoto = document.getElementById('foto');
    if (inputFoto) inputFoto.value = '';
    actualizarNombreFoto(inputFoto);
    limpiarCanvasFirma();
    const obs = document.getElementById('obs');
    if (obs) obs.value = '';
    const nombre = document.getElementById('nombre_encargado');
    const rut = document.getElementById('rut_encargado');
    if (nombre) nombre.value = '';
    if (rut) rut.value = '';
}

/* ---------- Órdenes ---------- */

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
    if (!select) return;
    const trabajador = obtenerTrabajadorTerminal();
    const listaFiltrada = trabajador ? (ots || []).filter(o => o.operario_id === trabajador.id && !['OT COMPLETADA', 'ORDEN FINALIZADA'].includes(o.estado_actual)) : [];
    setTexto('perfil-nombre', trabajador
        ? `${trabajador.nombre}${trabajador.prueba ? ' · usuario de prueba' : ''}`
        : 'Sin trabajador identificado');

    if (listaFiltrada.length === 0) {
        select.innerHTML = `<option value="">${trabajador ? 'No hay órdenes asignadas' : 'No hay trabajador identificado'}</option>`;
        for (const id of ['info-ot-activo', 'info-ot-ubicacion', 'info-ot-cliente', 'info-ot-descripcion', 'info-ot-estado']) setTexto(id, '—');
        hitosActivosTerminal = [];
        renderizarChecklistTerminal();
        const fs = document.getElementById('fs-trabajo');
        if (fs) fs.disabled = true;
        const barra = document.getElementById('barra-cierre');
        if (barra) barra.hidden = true;
        return;
    }

    const valorPrevio = select.value;
    select.innerHTML = listaFiltrada.map(o => {
        const activo = (o.activo && o.activo.nombre) ? o.activo.nombre : (o.cliente_mandante || 'Austral Conectividad SpA');
        return `<option value="${escaparHTML(o.codigo_ot)}">${escaparHTML(o.codigo_ot)} · ${escaparHTML(activo)}</option>`;
    }).join('');

    const seleccionado = codigoPreseleccionado || valorPrevio;
    if (seleccionado && listaFiltrada.some(o => o.codigo_ot === seleccionado)) {
        select.value = seleccionado;
    }
    actualizarInfoOTSeleccionada();
}

function claseBadgeEstado(estado) {
    switch (estado) {
        case 'EN EJECUCIÓN': return 'badge-ejecucion';
        case 'EN VALIDACIÓN': return 'badge-validacion';
        case 'OT COMPLETADA': return 'badge-completada';
        case ESTADO_ANOMALIA: return 'badge-detenida';
        default: return 'badge-emitida';
    }
}

// Pinta etiqueta de estado y bloquea acciones si la orden ya está cerrada
function pintarCabeceraOT(ot) {
    const estado = (ot && ot.estado_actual) || 'EMITIDA';
    const badge = document.getElementById('info-ot-estado');
    if (badge) {
        badge.innerText = estado;
        badge.className = `text-xs font-bold px-2.5 py-1 rounded shrink-0 ${claseBadgeEstado(estado)}`;
    }

    const completada = ['OT COMPLETADA', 'ORDEN FINALIZADA'].includes(estado);
    const puedeCerrar = ['EN EJECUCIÓN', 'EN VALIDACIÓN'].includes(estado);
    const btnFirma = document.getElementById('btn-abrir-firma');
    if (btnFirma) btnFirma.hidden = !puedeCerrar;
    const barraCierre = document.getElementById('barra-cierre');
    if (barraCierre) barraCierre.hidden = !puedeCerrar;
    const fs = document.getElementById('fs-trabajo');
    if (fs) {
        fs.disabled = completada;
        fs.classList.toggle('opacity-60', completada);
    }
    const btnEnviar = document.getElementById('btnEnviar');
    if (btnEnviar) btnEnviar.disabled = completada || enviandoTransicion || !puedeCerrar;
    const acciones = {
        'btn-iniciar': ['EMITIDA', 'ASIGNADA'],
        'btn-reanudar': [ESTADO_ANOMALIA, 'EN VALIDACIÓN'],
        'btn-jornada': ['EN EJECUCIÓN', ESTADO_ANOMALIA],
        'btn-reportar-anomalia': ['EMITIDA', 'ASIGNADA', 'EN EJECUCIÓN']
    };
    for (const [id, estados] of Object.entries(acciones)) {
        const boton = document.getElementById(id);
        if (boton) boton.hidden = !estados.includes(estado);
    }
    const seccionAnomalia = document.getElementById('seccion-anomalia');
    if (seccionAnomalia) seccionAnomalia.hidden = !acciones['btn-reportar-anomalia'].includes(estado);
    const ayudaJornada = document.getElementById('ayuda-jornada');
    if (ayudaJornada) ayudaJornada.hidden = !acciones['btn-jornada'].includes(estado);
    const aviso = document.getElementById('aviso-completada');
    if (aviso) aviso.classList.toggle('hidden', !completada);
}

async function sincronizarHitosEnVivo() {
    const select = document.getElementById('codigo_ot');
    if (!select || !select.value) return;

    const codigoActual = select.value;
    try {
        const res = await fetch(`${API}/ordenes/`);
        if (!res.ok) return;
        const data = await res.json();
        listaOTsCache = data;
        localStorage.setItem('tasknode_cached_ots', JSON.stringify(data));

        const otActualizada = data.find(o => o.codigo_ot === codigoActual);
        if (!otActualizada) return;

        pintarCabeceraOT(otActualizada);

        const hitosServidor = otActualizada.hitos || [];

        // Comprobar si hubo cambios estructurales en el servidor (más días o reordenamiento)
        const cambioEstructural = hitosServidor.length !== hitosActivosTerminal.length ||
            hitosServidor.some((hs, idx) => !hitosActivosTerminal[idx] || hs.titulo !== hitosActivosTerminal[idx].titulo);

        if (cambioEstructural) {
            // Respeta los checks que el técnico tiene marcados localmente
            const mapaChecksLocales = {};
            hitosActivosTerminal.forEach(h => { mapaChecksLocales[h.dia] = h.completado; });

            hitosActivosTerminal = hitosServidor.map(h => ({
                ...h,
                completado: mapaChecksLocales[h.dia] !== undefined ? mapaChecksLocales[h.dia] : h.completado
            }));

            renderizarChecklistTerminal();
            mostrarToastTerminal(`Etapas de ${codigoActual} actualizadas.`);
        }
    } catch (e) {}
}

function etiquetaDia(dia) {
    return /^\d+$/.test(String(dia)) ? `Día ${dia}` : String(dia == null ? '' : dia);
}

function renderizarChecklistTerminal() {
    const cont = document.getElementById('contenedor-hitos-terminal');
    const txtProg = document.getElementById('terminal-progreso-hitos');
    const barra = document.getElementById('terminal-barra-hitos');
    if (!cont) return;

    const total = hitosActivosTerminal.length;
    const comp = hitosActivosTerminal.filter(h => h.completado).length;
    const pct = total > 0 ? Math.round((comp / total) * 100) : 0;

    if (txtProg) txtProg.innerText = `${comp} de ${total}`;
    if (barra) barra.style.width = `${pct}%`;

    if (total === 0) {
        cont.innerHTML = `<div class="p-3 text-center text-theme-dim text-sm">Esta orden no tiene etapas.</div>`;
        return;
    }

    cont.innerHTML = hitosActivosTerminal.map((h, idx) => `
        <label class="flex items-center gap-3 px-3 min-h-[56px] py-2 rounded-lg border border-theme-dim bg-surface-2 cursor-pointer hover:bg-surface-3 transition">
            <input type="checkbox" ${h.completado ? 'checked' : ''} onchange="cambiarHitoEnTerminal(${idx}, this.checked)" class="w-7 h-7 shrink-0" style="accent-color: var(--accent-primary, #c2410c)">
            <div class="leading-snug flex-1 min-w-0">
                <span class="text-xs text-theme-dim block">${escaparHTML(etiquetaDia(h.dia))}</span>
                <span class="text-base ${h.completado ? 'line-through text-theme-dim' : 'text-theme-main font-semibold'}">${escaparHTML(h.titulo)}</span>
            </div>
        </label>
    `).join('');
}

function cambiarHitoEnTerminal(idx, marcado) {
    if (!hitosActivosTerminal[idx]) return;
    hitosActivosTerminal[idx].completado = marcado;
    renderizarChecklistTerminal();
}

function actualizarInfoOTSeleccionada() {
    const ot = obtenerOTSeleccionada();
    if (!ot) return;

    setTexto('info-ot-activo', (ot.activo && ot.activo.nombre) ? ot.activo.nombre : 'Activo sin nombre');
    setTexto('info-ot-ubicacion', (ot.activo && ot.activo.ubicacion_tecnica) ? ot.activo.ubicacion_tecnica : 'Ubicación no indicada');
    setTexto('info-ot-cliente', ot.cliente_mandante || 'Austral Conectividad SpA');
    setTexto('info-ot-descripcion', ot.descripcion || 'Sin instrucciones.');
    pintarCabeceraOT(ot);

    hitosActivosTerminal = JSON.parse(JSON.stringify(ot.hitos || []));
    renderizarChecklistTerminal();

    setTexto('badge-geocerca', 'Ubicación: se solicitará al guardar');
    limpiarEvidencias();
}

function obtenerUbicacionActual() {
    if (!window.isSecureContext || !navigator.geolocation) {
        return Promise.reject(new Error('La ubicación requiere HTTPS o localhost y un dispositivo compatible.'));
    }
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            (posicion) => {
                const { latitude, longitude } = posicion.coords;
                if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
                    Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
                    reject(new Error('El dispositivo entregó coordenadas inválidas.'));
                    return;
                }
                resolve(`${latitude}, ${longitude}`);
            },
            (error) => {
                const mensaje = error.code === 1
                    ? 'Permite el acceso a la ubicación para guardar.'
                    : 'No se pudo obtener la ubicación. Activa el GPS e inténtalo nuevamente.';
                reject(new Error(mensaje));
            },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
    });
}

async function cargarConfiguracionTerminal() {
    try {
        const res = await fetch(`${API}/estados/configuracion`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const config = await res.json();
        permitirPruebaSinGps = config.permitir_prueba_sin_gps === true;
        trabajadorPrueba = config.trabajador_prueba || null;
        const opcion = document.getElementById('opcion-prueba-ubicacion');
        if (opcion) {
            opcion.hidden = !permitirPruebaSinGps;
            opcion.classList.toggle('flex', permitirPruebaSinGps);
            if (!permitirPruebaSinGps) document.getElementById('chk-prueba-ubicacion').checked = false;
        }
    } catch (error) {
        permitirPruebaSinGps = false;
        trabajadorPrueba = null;
        const opcion = document.getElementById('opcion-prueba-ubicacion');
        if (opcion) opcion.hidden = true;
        const check = document.getElementById('chk-prueba-ubicacion');
        if (check) check.checked = false;
        mostrarToastTerminal('No se pudo cargar la configuración de la terminal.', true);
        console.error('No se pudo consultar la configuración de prueba GPS:', error);
    }
}

function cambiarPruebaUbicacion(input) {
    if (input.checked && !window.confirm('Prueba: se guardará sin solicitar ubicación. El registro no acreditará presencia. ¿Activar?')) {
        input.checked = false;
    }
    setTexto('badge-geocerca', input.checked ? 'Prueba sin ubicación: presencia no verificada' : 'Ubicación: se solicitará al guardar');
}

function abrirPliegoPDFDesdeTerminal() {
    const select = document.getElementById('codigo_ot');
    const codigo = select ? select.value : '';
    if (!codigo) return;
    window.open(`orden_pdf.html?codigo=${encodeURIComponent(codigo)}&modo=COMPLETA`, '_blank');
}

/* ---------- Guardado ---------- */

function generarNovedad(estado) {
    const total = hitosActivosTerminal.length;
    const comp = hitosActivosTerminal.filter(h => h.completado).length;
    if (estado === 'OT COMPLETADA') return `Trabajo terminado. ${comp} de ${total} etapas completadas. Pendiente de aprobación.`;
    if (estado === 'EN VALIDACIÓN') return `Avance con foto de respaldo. ${comp} de ${total} etapas completadas.`;
    return `Trabajo en curso. ${comp} de ${total} etapas completadas.`;
}

function reportarAnomalia() {
    const ot = obtenerOTSeleccionada();
    if (!ot) return;
    const obs = document.getElementById('obs');
    if (!obs || !obs.value.trim()) {
        mostrarToastTerminal('Escribe en Observación qué ocurrió y vuelve a pulsar "Reportar anomalía".', true);
        if (obs) obs.focus();
        return;
    }
    registrarAccionTerreno('ANOMALIA');
}

function registrarAccionTerreno(tipo) {
    return procesarTransicionTerreno(null, tipo);
}

async function procesarTransicionTerreno(e, tipo = 'CIERRE') {
    if (e) e.preventDefault();
    if (enviandoTransicion) return;

    const codigoOT = document.getElementById('codigo_ot').value;
    if (!codigoOT) {
        mostrarToastTerminal('Seleccione una orden.', true);
        return;
    }

    const otActual = obtenerOTSeleccionada();
    const trabajador = obtenerTrabajadorTerminal();
    if (!otActual || !trabajador || otActual.operario_id !== trabajador.id) {
        mostrarToastTerminal('No hay una orden asignada al trabajador identificado.', true);
        return;
    }
    if (otActual && otActual.estado_actual === 'OT COMPLETADA') {
        mostrarToastTerminal('Esta orden ya está completada.', true);
        return;
    }
    const inputFoto = document.getElementById('foto');
    const foto = inputFoto && inputFoto.files && inputFoto.files[0];
    const obsTexto = (document.getElementById('obs').value || '').trim();
    if (tipo !== 'REANUDACION' && !foto) {
        mostrarToastTerminal('Adjunta una foto para registrar esta acción.', true);
        return;
    }
    if (foto && foto.size > 5 * 1024 * 1024) {
        mostrarToastTerminal('La foto supera el máximo de 5 MB.', true);
        return;
    }
    if (['FIN_JORNADA', 'ANOMALIA'].includes(tipo) && !obsTexto) {
        mostrarToastTerminal('Describe brevemente el avance o el motivo en Observación.', true);
        document.getElementById('obs').focus();
        return;
    }
    if (tipo === 'CIERRE' && (!hitosActivosTerminal.length || !todasLasEtapasListas())) {
        mostrarToastTerminal('Completa todas las etapas antes de terminar el trabajo.', true);
        return;
    }

    enviandoTransicion = true; // Bloquea cualquier actualización en segundo plano
    const btn = document.getElementById('btnEnviar');
    const selectOrden = document.getElementById('codigo_ot');
    const fs = document.getElementById('fs-trabajo');
    if (btn) btn.disabled = true;
    if (selectOrden) selectOrden.disabled = true;
    if (fs) fs.disabled = true;
    const liberar = () => {
        enviandoTransicion = false;
        const ot = obtenerOTSeleccionada();
        if (selectOrden) selectOrden.disabled = false;
        if (fs) fs.disabled = !!(ot && ot.estado_actual === 'OT COMPLETADA');
        if (ot) pintarCabeceraOT(ot);
    };

    const operarioId = trabajador.id;
    if (!operarioId) {
        mostrarToastTerminal('No se pudo identificar al técnico. Inicia sesión e inténtalo nuevamente.', true);
        liberar();
        return;
    }

    const estados = { LLEGADA: 'EN EJECUCIÓN', REANUDACION: 'EN EJECUCIÓN', ANOMALIA: ESTADO_ANOMALIA, FIN_JORNADA: 'EN VALIDACIÓN', CIERRE: 'OT COMPLETADA' };
    const estadoNuevo = estados[tipo];
    const sinConexion = modoOfflineSimulado || !navigator.onLine;
    try {
        const pendientes = await listarOutboxNuevo();
        if (pendientes.some(item => item.codigo_ot === codigoOT)) {
            mostrarToastTerminal('Esta orden tiene un registro pendiente. Sincronízalo antes de continuar.', true);
            liberar();
            return;
        }
    } catch (error) {
        mostrarToastTerminal(`No se puede acceder a los registros pendientes: ${error.message}`, true);
        liberar();
        return;
    }

    let gpsVal;
    let sinGpsPrueba = false;
    const omitirUbicacion = permitirPruebaSinGps && document.getElementById('chk-prueba-ubicacion').checked;
    if (omitirUbicacion) {
        gpsVal = GPS_PRUEBA;
        sinGpsPrueba = true;
        setTexto('badge-geocerca', 'Prueba sin ubicación: presencia no verificada');
    } else try {
        setTexto('badge-geocerca', 'Ubicación: obteniendo GPS...');
        gpsVal = await obtenerUbicacionActual();
        setTexto('badge-geocerca', 'Ubicación obtenida; se validará al sincronizar');
    } catch (error) {
        setTexto('badge-geocerca', 'Ubicación no disponible');
        if (!permitirPruebaSinGps || !window.confirm(`${error.message}\n\nModo de prueba: ¿guardar sin ubicación? El registro no acreditará presencia.`)) {
            mostrarToastTerminal(error.message, true);
            liberar();
            return;
        }
        gpsVal = GPS_PRUEBA;
        sinGpsPrueba = true;
        setTexto('badge-geocerca', 'Prueba sin GPS: presencia no verificada');
    }

    const obsVal = obsTexto || generarNovedad(estadoNuevo);
    const hitosSerializados = JSON.stringify(hitosActivosTerminal);

    try {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        const registroId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        await guardarOutboxNuevo({
            registro_id: registroId, tipo_registro: tipo, fecha_dispositivo: new Date().toISOString(),
            codigo_ot: codigoOT, operario_id: operarioId, estado_nuevo: estadoNuevo,
            coordenadas_gps: gpsVal, sin_gps_prueba: sinGpsPrueba,
            observacion: obsVal, hitos_json: hitosSerializados, foto: foto || null
        });
        limpiarEvidencias();
        await actualizarContadorOutbox();
        if (sinConexion) mostrarToastTerminal('Guardado en el dispositivo. Pendiente de sincronización.');
        else await sincronizarRegistrosNuevos();
    } catch (err) {
        mostrarToastTerminal(`No se pudo guardar en el dispositivo: ${err.message}`, true);
    } finally {
        liberar();
    }
}

/* ---------- Red y cola offline ---------- */

function actualizarIndicadorRed() {
    const dot = document.getElementById('dot-red');
    const label = document.getElementById('txt-red');
    const sinConexion = modoOfflineSimulado || !navigator.onLine;
    if (dot) dot.className = sinConexion ? 'w-2 h-2 rounded-full bg-amber-500' : 'w-2 h-2 rounded-full bg-emerald-500';
    if (label) label.innerText = sinConexion ? 'Sin señal' : 'En línea';
}

async function conmutarModoRed(valor) {
    modoOfflineSimulado = typeof valor === 'boolean' ? valor : !modoOfflineSimulado;
    const chk = document.getElementById('chk-sim-offline');
    if (chk) chk.checked = modoOfflineSimulado;
    actualizarIndicadorRed();

    if (modoOfflineSimulado) {
        mostrarToastTerminal('Modo sin señal: los avances quedan en el equipo.');
    } else {
        await sincronizarColaOutbox();
    }
}

async function actualizarContadorOutbox() {
    try {
        const cola = JSON.parse(localStorage.getItem('tasknode_outbox') || '[]');
        const nuevos = await listarOutboxNuevo();
        setTexto('outbox-count', String(cola.length + nuevos.length));
        const lista = document.getElementById('registros-pendientes');
        if (lista) {
            lista.replaceChildren();
            for (const item of nuevos) {
                const fila = document.createElement('div');
                fila.className = 'p-2 rounded border border-theme-dim bg-surface-2';
                const descripcion = document.createElement('span');
                descripcion.textContent = `${item.codigo_ot} · ${item.tipo_registro} · pendiente`;
                const eliminar = document.createElement('button');
                eliminar.type = 'button';
                eliminar.className = 'block text-red-600 underline font-semibold mt-1';
                eliminar.textContent = 'Descartar registro pendiente';
                eliminar.onclick = async () => {
                    if (!window.confirm('Se eliminarán del dispositivo este registro y su foto. ¿Deseas descartarlos?')) return;
                    try {
                        await eliminarOutboxNuevo(item.registro_id);
                        await actualizarContadorOutbox();
                        mostrarToastTerminal('Registro pendiente descartado.');
                    } catch (error) {
                        mostrarToastTerminal(`No se pudo descartar: ${error.message}`, true);
                    }
                };
                fila.append(descripcion, eliminar);
                lista.appendChild(fila);
            }
        }
    } catch (error) {
        setTexto('outbox-count', '?');
        mostrarToastTerminal(`No se puede consultar la cola local: ${error.message}`, true);
    }
}

async function sincronizarRegistrosNuevos() {
    if (sincronizandoOutbox || modoOfflineSimulado || !navigator.onLine) return;
    sincronizandoOutbox = true;
    try {
        const cola = await listarOutboxNuevo();
        let sincronizados = 0;
        cola.sort((a, b) => a.fecha_dispositivo.localeCompare(b.fecha_dispositivo));
        for (const item of cola) {
            const fd = new FormData();
            for (const campo of ['registro_id', 'tipo_registro', 'fecha_dispositivo', 'codigo_ot', 'operario_id', 'estado_nuevo', 'coordenadas_gps', 'observacion', 'encargado_nombre', 'encargado_rut', 'firma_data', 'hitos_json']) {
                if (item[campo] !== null && item[campo] !== undefined && item[campo] !== '') fd.append(campo, item[campo]);
            }
            if (item.sin_gps_prueba) fd.append('sin_gps_prueba', 'true');
            if (item.sin_geocerca_prueba) fd.append('sin_geocerca_prueba', 'true');
            if (item.foto) fd.append('foto', item.foto, item.foto.name || 'evidencia.jpg');
            let res;
            try {
                res = await fetch(`${API}/estados/`, { method: 'POST', body: fd });
            } catch (error) {
                mostrarToastTerminal('Sin conexión: el registro y la foto quedan pendientes en el dispositivo.', true);
                break;
            }
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                mostrarToastTerminal(`Pendiente: ${typeof data.detail === 'string' ? data.detail : `error ${res.status}`}`, true);
                break;
            }
            await eliminarOutboxNuevo(item.registro_id);
            sincronizados++;
            mostrarToastTerminal('Registro sincronizado correctamente.');
        }
        await actualizarContadorOutbox();
        if (sincronizados) {
            if (enviandoTransicion) await cargarOrdenesEnTerminal(document.getElementById('codigo_ot').value);
            else await sincronizarHitosEnVivo();
        }
    } catch (error) {
        mostrarToastTerminal(`No se pudo sincronizar la cola local: ${error.message}`, true);
    } finally {
        sincronizandoOutbox = false;
    }
}

async function sincronizarColaOutbox() {
    await sincronizarRegistrosNuevos();
    const cola = JSON.parse(localStorage.getItem('tasknode_outbox') || '[]');
    if (cola.length === 0) return;

    const select = document.getElementById('codigo_ot');
    const codigoActual = select ? select.value : null;
    let sincronizados = 0;
    let fallo = '';

    for (const item of cola) {
        if (item.ubicacion_capturada !== true) {
            fallo = 'Hay un registro anterior con ubicación no verificable. Se conserva pendiente y no se enviará automáticamente.';
            break;
        }
        const fd = new FormData();
        fd.append('codigo_ot', item.codigo_ot);
        fd.append('operario_id', item.operario_id || '45');
        fd.append('estado_nuevo', item.estado_nuevo);
        fd.append('coordenadas_gps', item.coordenadas_gps);
        if (item.sin_gps_prueba === true) fd.append('sin_gps_prueba', 'true');
        fd.append('observacion', item.observacion);
        if (item.hitos_json) fd.append('hitos_json', item.hitos_json);
        if (item.encargado_nombre) fd.append('encargado_nombre', item.encargado_nombre);
        if (item.encargado_rut) fd.append('encargado_rut', item.encargado_rut);
        if (item.firma_data) fd.append('firma_data', item.firma_data);

        try {
            const res = await fetch(`${API}/estados/`, { method: 'POST', body: fd });
            if (!res.ok) {
                fallo = `El servidor rechazó un registro pendiente (error ${res.status}). Se conservó para revisión.`;
                break;
            }
            sincronizados++;
        } catch (err) {
            fallo = `No se pudo sincronizar: ${err.message}. Los registros restantes se conservaron.`;
            break;
        }
    }

    const pendientes = cola.slice(sincronizados);
    if (pendientes.length > 0) localStorage.setItem('tasknode_outbox', JSON.stringify(pendientes));
    else localStorage.removeItem('tasknode_outbox');
    actualizarContadorOutbox();
    await cargarOrdenesEnTerminal(codigoActual);
    mostrarToastTerminal(fallo || `Sincronizados ${sincronizados} de ${cola.length} pendientes.`, !!fallo);
}
