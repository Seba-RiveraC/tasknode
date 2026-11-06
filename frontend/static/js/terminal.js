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

// CANDADO: Evita que el polling de 6s o el cambio de app/cámara reinicien la pantalla
let modalFirmaAbierto = false;
let enviandoTransicion = false;

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
    cargarOrdenesEnTerminal();

    // Sincronización periódica protegida por candado
    setInterval(() => {
        if (!modoOfflineSimulado && navigator.onLine && puedeSincronizar()) {
            sincronizarHitosEnVivo();
        }
    }, 6000);

    // Al regresar de tomar la foto (abrir cámara), NO recargar si el técnico tiene una foto cargada
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !modoOfflineSimulado && navigator.onLine && puedeSincronizar()) {
            sincronizarHitosEnVivo();
        }
    });
});

// Comprueba si el técnico está interactuando para NO interrumpir su trabajo
function puedeSincronizar() {
    if (modalFirmaAbierto || enviandoTransicion) return false;
    const inputFoto = document.getElementById('foto');
    if (inputFoto && inputFoto.files && inputFoto.files.length > 0) return false;
    return true;
}

function togglePanelDiagnosticoDefensa() {
    const panel = document.getElementById('panel-diagnostico-oculto');
    if (panel) panel.classList.toggle('hidden');
}

function insertarChipMinuta(textoChip) {
    const txt = document.getElementById('obs');
    if (!txt) return;
    const actual = txt.value.trim();
    txt.value = actual ? `${actual} ${textoChip}` : textoChip;
}

function abrirModalFirmaCondicional() {
    const selectEstado = document.getElementById('estado_nuevo');
    const todosListos = hitosActivosTerminal.length > 0 && hitosActivosTerminal.every(h => h.completado);

    if (!todosListos) {
        mostrarToastTerminal("Debe completar todos los hitos con fotografía antes de solicitar la firma.", true);
        return;
    }

    if (selectEstado && selectEstado.value !== 'OT COMPLETADA') {
        selectEstado.value = 'OT COMPLETADA';
        manejarCambioEstado('OT COMPLETADA');
    }

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
    actualizarAspectoBotonesEvidencia();
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
        mostrarToastTerminal("Firma de supervisor cargada.");
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
    actualizarAspectoBotonesEvidencia();
}

function simularEscaneoQR() {
    credencialQRValidada = true;
    const res = document.getElementById('qr-resultado');
    if (res) res.classList.remove('hidden');
    mostrarToastTerminal("Token QR verificado.");
    actualizarAspectoBotonesEvidencia();
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

function configurarOpcionesEstado(estadoActual) {
    const selectEstado = document.getElementById('estado_nuevo');
    if (!selectEstado) return;

    const valorPrevio = selectEstado.value;
    const todosListos = hitosActivosTerminal.length > 0 && hitosActivosTerminal.every(h => h.completado);
    let opcionesHTML = '';

    if (estadoActual === 'EMITIDA') {
        opcionesHTML += `<option value="EN EJECUCIÓN">EN EJECUCIÓN (Iniciar faena en terreno)</option>`;
    }

    opcionesHTML += `<option value="EN VALIDACIÓN">EN VALIDACIÓN (Validar avance de hitos con foto)</option>`;
    opcionesHTML += `<option value="DETENIDA POR ANOMALÍA">DETENIDA POR ANOMALÍA (Pausa técnica / Espera repuesto)</option>`;

    if (todosListos) {
        opcionesHTML += `<option value="OT COMPLETADA">OT COMPLETADA (Cierre definitivo con firma/QR)</option>`;
    } else {
        opcionesHTML += `<option value="OT COMPLETADA" disabled>OT COMPLETADA (Bloqueado: faltan hitos por validar)</option>`;
    }

    selectEstado.innerHTML = opcionesHTML;
    
    // Mantener la selección actual si sigue siendo válida
    if (valorPrevio && Array.from(selectEstado.options).some(o => o.value === valorPrevio && !o.disabled)) {
        selectEstado.value = valorPrevio;
    } else if (estadoActual === 'EMITIDA') {
        selectEstado.value = 'EN EJECUCIÓN';
    } else {
        selectEstado.value = todosListos ? 'OT COMPLETADA' : 'EN VALIDACIÓN';
    }

    manejarCambioEstado(selectEstado.value);
}

function manejarCambioEstado(nuevoEstado) {
    autocompletarNovedad();
    actualizarAspectoBotonesEvidencia();
}

function actualizarAspectoBotonesEvidencia() {
    const selectEstado = document.getElementById('estado_nuevo');
    const estado = selectEstado ? selectEstado.value : 'EN VALIDACIÓN';

    const btnContainerFoto = document.getElementById('btn-container-foto');
    const lblFoto = document.getElementById('camera-label');
    const subLblFoto = document.getElementById('camera-sublabel');

    const btnAbrirFirma = document.getElementById('btn-abrir-firma');
    const lblBtnFirma = document.getElementById('lbl-btn-firma');
    const badgeFirma = document.getElementById('badge-tipo-firma');
    const badgeInstruccion = document.getElementById('badge-instruccion-estado');

    if (estado === 'EN VALIDACIÓN' || estado === 'EN EJECUCIÓN') {
        if (badgeInstruccion) badgeInstruccion.innerText = "Foto obligatoria para validar avance";

        if (btnContainerFoto) {
            btnContainerFoto.className = "border-2 border-emerald-500 bg-emerald-950/20 rounded p-2.5 text-center cursor-pointer hover:bg-emerald-900/30 transition flex flex-col justify-center shadow-xs";
        }
        if (lblFoto) lblFoto.className = "text-xs font-bold text-emerald-400";
        if (subLblFoto) {
            subLblFoto.className = "text-[9.5px] text-emerald-300 font-semibold mt-0.5";
            subLblFoto.innerText = "Obligatoria p/ validar";
        }

        if (btnAbrirFirma) {
            btnAbrirFirma.className = "border border-theme-dim rounded p-2.5 text-center bg-surface-2 opacity-50 cursor-not-allowed transition flex flex-col justify-center";
        }
        if (lblBtnFirma) lblBtnFirma.className = "text-xs font-bold text-theme-muted";
        if (badgeFirma) {
            badgeFirma.className = "text-[9.5px] font-mono text-theme-dim mt-0.5";
            badgeFirma.innerText = "Solo cierre final";
        }
    } else if (estado === 'OT COMPLETADA') {
        if (badgeInstruccion) badgeInstruccion.innerText = "Firma o QR del supervisor requerido";

        if (btnContainerFoto) {
            btnContainerFoto.className = "border border-theme-dim bg-surface-2 rounded p-2.5 text-center cursor-pointer hover:bg-surface-3 transition flex flex-col justify-center opacity-70";
        }
        if (lblFoto) lblFoto.className = "text-xs font-bold text-theme-main";
        if (subLblFoto) {
            subLblFoto.className = "text-[9.5px] text-theme-dim mt-0.5";
            subLblFoto.innerText = "Opcional en cierre";
        }

        if (btnAbrirFirma) {
            btnAbrirFirma.className = "border-2 border-amber-600 bg-amber-950/20 rounded p-2.5 text-center hover:bg-amber-900/30 cursor-pointer transition flex flex-col justify-center shadow-xs";
        }
        if (lblBtnFirma) lblBtnFirma.className = "text-xs font-bold text-amber-500";

        if (badgeFirma) {
            if (modoFirmaActivo === 'TACTIL' && firmaTactilRealizada) {
                badgeFirma.className = "text-[9.5px] font-mono text-emerald-600 font-bold mt-0.5";
                badgeFirma.innerText = "Firma en pantalla ✓";
            } else if (modoFirmaActivo === 'QR' && credencialQRValidada) {
                badgeFirma.className = "text-[9.5px] font-mono text-emerald-600 font-bold mt-0.5";
                badgeFirma.innerText = "Token QR verificado ✓";
            } else {
                badgeFirma.className = "text-[9.5px] font-mono text-red-500 font-bold mt-0.5";
                badgeFirma.innerText = "Pendiente de firma";
            }
        }
    } else {
        if (badgeInstruccion) badgeInstruccion.innerText = "Indique motivo de detención";
    }
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
    const verTodas = document.getElementById('chk-ver-todas')?.checked;
    const userLog = window.obtenerUsuarioActual ? window.obtenerUsuarioActual() : null;

    let listaFiltrada = ots || [];
    if (!verTodas && userLog && userLog.rol === 'TRABAJADOR') {
        const propias = listaFiltrada.filter(o =>
            (o.operario_id && o.operario_id === userLog.id) ||
            (o.rut_responsable && o.rut_responsable === userLog.rut)
        );
        if (propias.length > 0) listaFiltrada = propias;
    }

    if (listaFiltrada.length === 0) {
        select.innerHTML = '<option value="">No hay órdenes asignadas</option>';
        return;
    }

    const valorPrevio = select.value;
    select.innerHTML = listaFiltrada.map(o => {
        const total = (o.hitos && o.hitos.length) || 0;
        const comp = (o.hitos && o.hitos.filter(h => h.completado).length) || 0;
        const pct = total > 0 ? Math.round((comp / total) * 100) : 0;
        return `<option value="${o.codigo_ot}">${o.codigo_ot} — ${o.cliente_mandante || 'Austral Conectividad'} (${pct}%)</option>`;
    }).join('');

    const seleccionado = codigoPreseleccionado || valorPrevio;
    if (seleccionado && listaFiltrada.some(o => o.codigo_ot === seleccionado)) {
        select.value = seleccionado;
    }
    actualizarInfoOTSeleccionada();
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
            configurarOpcionesEstado(otActualizada.estado_actual);
            mostrarToastTerminal(`Cronograma de ${codigoActual} actualizado desde Supervisión.`);
        }
    } catch (e) {}
}

function renderizarChecklistTerminal() {
    const cont = document.getElementById('contenedor-hitos-terminal');
    const txtProg = document.getElementById('terminal-progreso-hitos');
    const barra = document.getElementById('terminal-barra-hitos');
    const lblDias = document.getElementById('label-dias-terminal');
    if (!cont) return;

    const total = hitosActivosTerminal.length;
    const comp = hitosActivosTerminal.filter(h => h.completado).length;
    const pct = total > 0 ? Math.round((comp / total) * 100) : 0;

    if (lblDias) lblDias.innerText = `${total} etapas planificadas (valida con foto)`;
    if (txtProg) txtProg.innerText = `${comp}/${total} (${pct}%)`;
    if (barra) barra.style.width = `${pct}%`;

    if (total === 0) {
        cont.innerHTML = `<div class="p-3 text-center text-theme-dim text-xs">Sin etapas definidas en la orden.</div>`;
        return;
    }

    cont.innerHTML = hitosActivosTerminal.map((h, idx) => `
        <label class="flex items-start gap-2.5 p-2 rounded border border-theme-dim bg-surface-2 cursor-pointer hover:bg-surface-3 transition">
            <input type="checkbox" ${h.completado ? 'checked' : ''} onchange="cambiarHitoEnTerminal(${idx}, this.checked)" class="mt-0.5 w-4 h-4 accent-[#c2410c]">
            <div class="text-xs leading-snug flex-1">
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

    const selectEstado = document.getElementById('estado_nuevo');
    const todosListos = hitosActivosTerminal.length > 0 && hitosActivosTerminal.every(h => h.completado);

    configurarOpcionesEstado(document.getElementById('info-ot-estado').innerText);

    if (todosListos && selectEstado) {
        selectEstado.value = 'OT COMPLETADA';
        manejarCambioEstado('OT COMPLETADA');
    }
}

function actualizarInfoOTSeleccionada() {
    const codigo = document.getElementById('codigo_ot').value;
    const ot = listaOTsCache.find(o => o.codigo_ot === codigo);
    if (!ot) return;

    const estadoActual = ot.estado_actual || 'EMITIDA';
    document.getElementById('info-ot-estado').innerText = estadoActual;
    document.getElementById('info-ot-cliente').innerText = `Mandante: ${ot.cliente_mandante || 'Austral Conectividad SpA'}`;
    document.getElementById('info-ot-descripcion').innerText = ot.descripcion || 'Sin instrucciones.';
    document.getElementById('perfil-nombre').innerText = `${ot.operario_responsable} (${ot.rut_responsable})`;

    hitosActivosTerminal = JSON.parse(JSON.stringify(ot.hitos || []));
    renderizarChecklistTerminal();
    configurarOpcionesEstado(estadoActual);

    gpsFueraDePlanta = false;
    actualizarCoordenadaGPS();
    limpiarCanvasFirma();
}

function actualizarCoordenadaGPS() {
    const codigo = document.getElementById('codigo_ot').value;
    const ot = listaOTsCache.find(o => o.codigo_ot === codigo);
    const badge = document.getElementById('badge-geocerca');

    if (gpsFueraDePlanta) {
        document.getElementById('gps').value = "-41.4950, -72.9900";
        badge.className = "font-mono font-bold text-red-600";
        badge.innerText = "DESVIACIÓN GPS (>4 KM)";
    } else {
        const lat = (ot && ot.activo && ot.activo.latitud_referencia) ? ot.activo.latitud_referencia.toFixed(4) : '-41.4870';
        const lon = (ot && ot.activo && ot.activo.longitud_referencia) ? ot.activo.longitud_referencia.toFixed(4) : '-72.9550';
        document.getElementById('gps').value = `${lat}, ${lon}`;
        badge.className = "font-mono font-bold text-emerald-600";
        badge.innerText = `WGS84 EN SITIO (${lat}, ${lon})`;
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
    const sublabel = document.getElementById('camera-sublabel');
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const sizeKb = (file.size / 1024).toFixed(1);
        label.innerHTML = `📷 Foto: ${file.name}`;
        sublabel.innerHTML = `✓ Adjunta (${sizeKb} KB)`;
    }
}

async function procesarTransicionTerreno(e) {
    e.preventDefault();
    enviandoTransicion = true; // Bloquea cualquier actualización en segundo plano
    const btn = document.getElementById('btnEnviar');
    btn.disabled = true;

    const codigoOT = document.getElementById('codigo_ot').value;
    const operarioId = document.getElementById('operario_id').value || '45';
    const estadoNuevo = document.getElementById('estado_nuevo').value;
    const gpsVal = document.getElementById('gps').value;
    let obsVal = document.getElementById('obs').value || '';

    const inputFoto = document.getElementById('foto');
    const tieneFoto = inputFoto && inputFoto.files && inputFoto.files.length > 0;

    let firmaPayload = "";
    if (modoFirmaActivo === 'TACTIL' && firmaTactilRealizada && canvasFirma) {
        firmaPayload = canvasFirma.toDataURL('image/png');
    } else if (modoFirmaActivo === 'QR' && credencialQRValidada) {
        firmaPayload = `TOKEN-QR-ENCARGADO-142856318-${Date.now().toString(36).toUpperCase()}`;
    }

    // Validación estricta: EN VALIDACIÓN exige fotografía
    if (estadoNuevo === 'EN VALIDACIÓN' && !tieneFoto) {
        mostrarToastTerminal("Debe adjuntar una fotografía como evidencia para validar el hito.", true);
        btn.disabled = false;
        enviandoTransicion = false;
        return;
    }

    // Validación estricta: OT COMPLETADA exige firma o QR
    if (estadoNuevo === 'OT COMPLETADA' && !firmaPayload) {
        mostrarToastTerminal("El cierre de la orden requiere la firma en pantalla o Token QR del supervisor.", true);
        btn.disabled = false;
        enviandoTransicion = false;
        abrirModalFirmaCondicional();
        return;
    }

    const nombreEncargado = document.getElementById('nombre_encargado').value.trim() || 'Carlos Valenzuela M.';
    const rutEncargado = document.getElementById('rut_encargado').value.trim() || '14.285.631-8';
    const hitosSerializados = JSON.stringify(hitosActivosTerminal);

    if (modoOfflineSimulado || !navigator.onLine) {
        const cola = JSON.parse(localStorage.getItem('tasknode_outbox') || '[]');
        cola.push({
            codigo_ot: codigoOT,
            operario_id: operarioId,
            estado_nuevo: estadoNuevo,
            coordenadas_gps: gpsVal,
            observacion: obsVal || 'Avance registrado en cola local (Store-and-Forward).',
            encargado_nombre: nombreEncargado,
            encargado_rut: rutEncargado,
            firma_data: firmaPayload,
            hitos_json: hitosSerializados,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem('tasknode_outbox', JSON.stringify(cola));
        actualizarContadorOutbox();
        mostrarToastTerminal(`Almacenado en cola local (${cola.length} pendientes).`);
        btn.disabled = false;
        enviandoTransicion = false;
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
    if (tieneFoto) formData.append('foto', inputFoto.files[0]);

    try {
        const res = await fetch(`${API}/estados/`, { method: 'POST', body: formData });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            mostrarToastTerminal(data.detail || `Error HTTP ${res.status}`, true);
        } else {
            mostrarToastTerminal(`Avance sincronizado en ${data.codigo_ot}.`);
            if (inputFoto) inputFoto.value = '';
            document.getElementById('camera-label').innerText = "📷 Tomar Foto Hito";
            document.getElementById('camera-sublabel').innerText = "Obligatoria p/ validar";
            limpiarCanvasFirma();
            await cargarOrdenesEnTerminal(codigoOT);
        }
    } catch (err) {
        mostrarToastTerminal(`Error de red: ${err.message}`, true);
    } finally {
        btn.disabled = false;
        enviandoTransicion = false;
    }
}

async function conmutarModoRed() {
    modoOfflineSimulado = !modoOfflineSimulado;
    const dot = document.getElementById('dot-red');
    const label = document.getElementById('txt-red');

    if (modoOfflineSimulado) {
        dot.className = 'w-2 h-2 rounded-full bg-amber-500';
        label.innerText = 'OFFLINE';
        mostrarToastTerminal('Modo almacenamiento local (Sin señal) activo.');
    } else {
        dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
        label.innerText = 'ONLINE';
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
    mostrarToastTerminal(`Sincronizados ${sincronizados}/${cola.length} registros pendientes.`);
}

function autocompletarNovedad() {
    const estado = document.getElementById('estado_nuevo').value;
    const txt = document.getElementById('obs');
    const comp = hitosActivosTerminal.filter(h => h.completado).length;

    if (estado === 'DETENIDA POR ANOMALÍA') {
        txt.value = `Faena pausada con ${comp}/${hitosActivosTerminal.length} etapas completadas. Activo asegurado bajo bloqueo LOTO.`;
    } else if (estado === 'OT COMPLETADA') {
        txt.value = `Protocolo de ${hitosActivosTerminal.length} etapas finalizado al 100%. Recepción conforme y firma del supervisor en faena.`;
    } else {
        txt.value = `Avance operativo registrado con respaldo fotográfico (${comp}/${hitosActivosTerminal.length} etapas listas).`;
    }
}