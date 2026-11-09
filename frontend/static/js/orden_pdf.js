const API = window.TaskNodeConfig.API_URL;
let modoActual = 'COMPLETA';
let codigoActual = null;
let cacheOrdenes = [];
let cacheTransiciones = [];

const TIMBRE_SUPERVISOR_SVG = "data:image/svg+xml;utf8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="130" height="44" viewBox="0 0 130 44">
  <rect x="1.5" y="1.5" width="127" height="41" rx="8" fill="#ecfdf5" stroke="#047857" stroke-width="1.5"/>
  <circle cx="22" cy="22" r="10" fill="none" stroke="#047857" stroke-width="1.8"/>
  <path d="M 17 22 L 21 26 L 28 17" fill="none" stroke="#047857" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="76" y="19" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#047857" text-anchor="middle">FIRMA</text>
  <text x="76" y="31" font-family="Arial, sans-serif" font-size="9" fill="#065f46" text-anchor="middle">REGISTRADA</text>
</svg>`);

const TIMBRE_CONSTANCIA_SVG = "data:image/svg+xml;utf8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="130" height="44" viewBox="0 0 130 44">
  <rect x="1.5" y="1.5" width="127" height="41" rx="8" fill="#ecfdf5" stroke="#047857" stroke-width="1.5"/>
  <circle cx="22" cy="22" r="10" fill="none" stroke="#047857" stroke-width="1.8"/>
  <path d="M 17 22 L 21 26 L 28 17" fill="none" stroke="#047857" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="76" y="19" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#047857" text-anchor="middle">CONSTANCIA</text>
  <text x="76" y="31" font-family="Arial, sans-serif" font-size="9" fill="#065f46" text-anchor="middle">REGISTRADA</text>
</svg>`);

function esc(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function setTexto(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
}

function formatearFecha(valor, conHora) {
    if (!valor) return '--/--/----';
    const texto = String(valor);
    const d = valor instanceof Date ? valor : new Date(/(Z|[+-]\d{2}:\d{2})$/i.test(texto) ? texto : `${texto}Z`);
    if (isNaN(d.getTime())) return '--/--/----';
    return conHora
        ? d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function resumirHash(hash) {
    if (!hash) return null;
    return hash.length > 24 ? `${hash.slice(0, 12)}…${hash.slice(-8)}` : hash;
}

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    codigoActual = params.get('codigo');
    const modoParam = (params.get('modo') || 'COMPLETA').toUpperCase();
    modoActual = (modoParam === 'ORIGINAL') ? 'ORIGINAL' : 'COMPLETA';
    await cargarDatosYRenderizar();
});

async function cargarDatosYRenderizar() {
    try {
        const [resOrdenes, resEstados] = await Promise.all([
            fetch(`${API}/ordenes/`),
            fetch(`${API}/estados/`)
        ]);
        if (!resOrdenes.ok || !resEstados.ok) throw new Error('No se pudieron consultar las órdenes o sus registros.');
        cacheOrdenes = await resOrdenes.json();
        cacheTransiciones = await resEstados.json();

        const select = document.getElementById('selector-ot-pdf');
        if (cacheOrdenes.length > 0) {
            if (!codigoActual || !cacheOrdenes.some(o => o.codigo_ot === codigoActual)) {
                codigoActual = cacheOrdenes[0].codigo_ot;
            }
            select.innerHTML = cacheOrdenes.map(o =>
                `<option value="${esc(o.codigo_ot)}" ${o.codigo_ot === codigoActual ? 'selected' : ''}>${esc(o.codigo_ot)} — [${esc(o.estado_actual)}]</option>`
            ).join('');
            renderizarHojaA4();
        } else {
            select.innerHTML = '<option value="">Sin órdenes disponibles</option>';
        }
    } catch (e) {
        console.error('Error al cargar el documento:', e);
        const select = document.getElementById('selector-ot-pdf');
        if (select) select.innerHTML = '<option value="">No se pudo cargar las órdenes</option>';
        document.getElementById('hoja-a4').hidden = true;
        document.querySelector('.btn-print').disabled = true;
    }
}

function cambiarOTDesdeBarra(nuevoCodigo) {
    codigoActual = nuevoCodigo;
    renderizarHojaA4();
}

function conmutarModoDocumento(nuevoModo) {
    modoActual = nuevoModo;
    renderizarHojaA4();
}

function clasePorEstado(estado) {
    if (estado === 'OT COMPLETADA') return 'chip ok';
    if (estado === 'EN VALIDACIÓN' || estado === 'EN VALIDACION') return 'chip warn';
    return 'chip';
}

function renderizarHojaA4() {
    const orden = cacheOrdenes.find(o => o.codigo_ot === codigoActual);
    if (!orden) return;

    if (orden.estado_actual !== 'ORDEN FINALIZADA') modoActual = 'ORIGINAL';
    const esOriginal = (modoActual === 'ORIGINAL');
    const esCerrada = (orden.estado_actual === 'ORDEN FINALIZADA') && !esOriginal;

    // Modo del documento
    document.getElementById('btn-modo-original').className = esOriginal ? 'activo' : '';
    document.getElementById('btn-modo-completa').className = esOriginal ? '' : 'activo';
    document.getElementById('btn-modo-completa').disabled = orden.estado_actual !== 'ORDEN FINALIZADA';
    setTexto('doc-titulo', esOriginal ? 'Pliego de Orden de Trabajo' : 'Orden finalizada');

    // 1. Cabecera
    const estado = esOriginal ? 'EMITIDA' : (orden.estado_actual || 'EMITIDA');
    setTexto('pdf-codigo-ot', orden.codigo_ot);
    const chipEstado = document.getElementById('pdf-estado-ot');
    chipEstado.textContent = estado;
    chipEstado.className = esOriginal ? 'chip' : clasePorEstado(estado);
    setTexto('pdf-fecha-emision', formatearFecha(orden.created_at, false));
    setTexto('pdf-cliente', orden.cliente_mandante || '—');
    setTexto('pdf-prioridad', orden.prioridad || '—');
    setTexto('pdf-tipo-mant', orden.tipo_mantenimiento || '—');

    // 2. Activo y técnico
    const act = orden.activo || {};
    setTexto('pdf-activo-codigo', act.codigo_activo || `ACT-${orden.activo_id}`);
    setTexto('pdf-activo-nombre', act.nombre || 'Activo de red');
    setTexto('pdf-activo-ubicacion', act.ubicacion_tecnica || 'Sitio de red');
    setTexto('pdf-activo-criticidad', act.criticidad || '—');
    const lat = Number(act.latitud_referencia);
    const lon = Number(act.longitud_referencia);
    const tieneGps = act.latitud_referencia != null && act.longitud_referencia != null && isFinite(lat) && isFinite(lon);
    setTexto('pdf-activo-gps', tieneGps ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : 'Sin coordenadas');

    const operario = orden.operario_responsable || 'Pendiente';
    const rutOperario = orden.rut_responsable || 'Pendiente';
    setTexto('pdf-operario-nombre', operario);
    setTexto('pdf-operario-rut', rutOperario);

    // 3. Descripción
    setTexto('pdf-descripcion-general', orden.descripcion || 'Sin descripción registrada.');

    // 4. Etapas
    const hitos = orden.hitos || [];
    let completadas = 0;
    document.getElementById('pdf-tabla-pasos').innerHTML = hitos.map((h, idx) => {
        const marcado = !esOriginal && (h.completado || esCerrada);
        if (marcado) completadas++;
        const etapa = `${String(idx + 1).padStart(2, '0')}${h.dia ? ' · ' + esc(h.dia) : ''}`;
        return `
            <tr>
                <td class="col-n">${etapa}</td>
                <td>${esc(h.titulo)}</td>
                <td class="col-e">${marcado ? '<span class="st ok">✓ Completada</span>' : '<span class="st pend">Pendiente</span>'}</td>
            </tr>`;
    }).join('') || '<tr><td colspan="3" class="st pend">Sin etapas definidas.</td></tr>';
    document.getElementById('hoja-a4').classList.toggle('denso', hitos.length > 8);
    const pct = hitos.length ? Math.round((completadas / hitos.length) * 100) : 0;
    setTexto('pdf-avance-resumen', `${completadas}/${hitos.length} · ${pct}%`);
    setTexto('pdf-avance-texto', `${completadas} de ${hitos.length}`);
    setTexto('pdf-avance-pct', `${pct}%`);
    document.getElementById('pdf-avance-barra').style.width = `${pct}%`;

    // 5. Integridad (el pliego inicial aún no tiene ejecución)
    const transOT = cacheTransiciones.filter(t => t.codigo_ot === orden.codigo_ot).sort((a, b) => a.id - b.id);
    const hashResumen = esOriginal ? null : resumirHash(orden.hash_cadena);
    setTexto('pdf-hash-resumen', hashResumen || 'Pendiente');
    document.getElementById('pdf-chip-cadena').innerHTML = hashResumen
        ? '<span class="chip neutral">Hash registrado</span>'
        : '<span class="chip neutral">Pendiente</span>';

    const bit = document.getElementById('pdf-bitacora-resumen');
    if (esOriginal || transOT.length === 0) {
        bit.textContent = esOriginal ? 'Bitácora: sin registros (pliego inicial).' : 'Bitácora: sin transiciones registradas.';
    } else {
        const ult = transOT[transOT.length - 1];
        bit.innerHTML = `Bitácora: <b>${transOT.length}</b> transicion${transOT.length === 1 ? '' : 'es'} · último evento: <b>${esc(ult.estado_anterior)} → ${esc(ult.estado_nuevo)}</b> (${esc(formatearFecha(ult.timestamp, true))})`;
    }

    // 6. Observaciones
    const obsBox = document.getElementById('pdf-observaciones');
    const conObs = transOT.filter(t => t.observacion && String(t.observacion).trim());
    if (!esOriginal && conObs.length > 0) {
        const ult = conObs[conObs.length - 1];
        obsBox.className = 'obs-box';
        obsBox.innerHTML = `<p>${esc(ult.observacion)}</p><div class="meta">${esc(ult.estado_anterior)} → ${esc(ult.estado_nuevo)} · ${esc(formatearFecha(ult.timestamp, true))}</div>`;
    } else if (esOriginal) {
        obsBox.className = 'obs-box obs-blank';
        obsBox.innerHTML = '';
    } else {
        obsBox.className = 'obs-box';
        obsBox.innerHTML = '<p style="color:#9ca3af">Sin observaciones registradas.</p>';
    }

    // 7. Firmas
    setTexto('pdf-firma-operario', operario);
    setTexto('pdf-firma-rut', rutOperario === 'Pendiente' ? 'Pendiente' : `RUT ${rutOperario}`);
    const constancia = orden.constancia_tecnico;
    const contConstancia = document.getElementById('pdf-firma-tecnico-area');
    if (!esOriginal && constancia) {
        contConstancia.innerHTML = `<img src="${TIMBRE_CONSTANCIA_SVG}" alt="Constancia del técnico registrada" />`;
        setTexto('pdf-firma-operario', constancia.nombre);
        setTexto('pdf-firma-tecnico-fecha', formatearFecha(constancia.fecha_dispositivo, true));
        if (constancia.usuario_id !== orden.operario_id) setTexto('pdf-firma-rut', 'RUT no disponible');
    } else {
        contConstancia.innerHTML = '<span class="pendiente">Pendiente de registro</span>';
        setTexto('pdf-firma-tecnico-fecha', '');
    }

    const nomEncargado = !esOriginal && orden.encargado_nombre || 'Pendiente';
    const rutEncargado = !esOriginal && orden.encargado_rut || 'Pendiente';
    setTexto('pdf-firma-encargado-pie', nomEncargado);
    setTexto('pdf-firma-encargado-rut', rutEncargado === 'Pendiente' ? 'Pendiente' : `RUT ${rutEncargado}`);

    const contFirma = document.getElementById('pdf-contenedor-firma-grafica');
    const firmaBackend = orden.firma_data || '';
    document.getElementById('pdf-recepcion-anterior').hidden = !esOriginal && !firmaBackend;
    document.querySelector('.firmas').classList.toggle('dos', !esOriginal && !firmaBackend);
    setTexto('pdf-firma-encargado-rol', esOriginal ? 'Firma del encargado' : 'Recepción anterior');
    let firmaImg = firmaBackend.startsWith('data:image') ? firmaBackend : null;
    let tokenQR = firmaBackend.startsWith('TOKEN-QR') ? firmaBackend : null;
    const contSello = document.getElementById('pdf-contenedor-sello-cierre');
    if (!esOriginal && firmaImg && firmaImg.startsWith('data:image')) {
        contFirma.innerHTML = `<img src="${esc(firmaImg)}" alt="Firma encargado" />`;
    } else if (!esOriginal && tokenQR) {
        const abreviado = tokenQR.length > 22 ? `${tokenQR.slice(0, 22)}…` : tokenQR;
        contFirma.innerHTML = `<div>Registro QR anterior (no verificado)<small>${esc(abreviado)}</small></div>`;
    } else {
        contFirma.innerHTML = '<span class="pendiente">Pendiente de firma</span>';
    }

    const aprobacion = transOT.find(t => t.estado_nuevo === 'ORDEN FINALIZADA');
    if (esCerrada && aprobacion) {
        contSello.innerHTML = `<img src="${TIMBRE_SUPERVISOR_SVG}" alt="Firma registrada del supervisor" />`;
        setTexto('pdf-visado-estado', `${aprobacion.operario_responsable} · ${formatearFecha(aprobacion.timestamp, true)}`);
    } else {
        contSello.innerHTML = '<span class="pendiente">Pendiente de firma</span>';
        setTexto('pdf-visado-estado', 'Pendiente');
    }

    // Pie
    setTexto('pdf-pie-folio', orden.codigo_ot);
    setTexto('pdf-pie-impresion', formatearFecha(new Date(), true));
}
