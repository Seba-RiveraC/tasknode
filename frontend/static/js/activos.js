document.addEventListener('DOMContentLoaded', () => {
    cargarCatalogoActivos();
    const input = document.getElementById('input-busqueda-activos');
    if (input) input.addEventListener('input', filtrarActivosLocal);
});

let cacheActivos = [];

async function cargarCatalogoActivos() {
    const tbody = document.getElementById('tabla-activos');
    const badge = document.getElementById('conteo-activos');
    if (!tbody) return;

    try {
        const res = await fetch(`${window.TaskNodeConfig.API_URL}/activos/`);
        if (!res.ok) throw new Error("Error de red");
        cacheActivos = await res.json();

        if (badge) badge.innerText = `${cacheActivos.length} EQUIPOS REGISTRADOS`;
        renderizarActivos(cacheActivos);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-red-600 font-semibold">No se pudo cargar el catálogo de equipos.</td></tr>`;
    }
}

function renderizarActivos(lista) {
    const tbody = document.getElementById('tabla-activos');
    tbody.innerHTML = '';

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-6 text-center text-theme-dim">Sin coincidencias para el filtro aplicado.</td></tr>`;
        return;
    }

    lista.forEach(a => {
        let badge = "badge-completada";
        if (a.criticidad === "ALTA") badge = "badge-detenida";
        if (a.criticidad === "MEDIA") badge = "badge-emitida";

        const tr = document.createElement('tr');
        tr.className = "border-b border-theme-dim";
        tr.innerHTML = `
            <td class="px-4 py-3">
                <span class="code-pill px-2 py-0.5 rounded font-bold text-xs">${a.codigo_activo}</span>
            </td>
            <td class="px-4 py-3 font-bold text-theme-main">${a.nombre}</td>
            <td class="px-4 py-3 text-theme-muted font-medium">${a.ubicacion_tecnica}</td>
            <td class="px-4 py-3">
                <span class="px-2.5 py-0.5 rounded text-[10px] font-bold ${badge}">CRITICIDAD ${a.criticidad}</span>
            </td>
            <td class="px-4 py-3 font-mono text-[11px] text-theme-muted">
                ${a.latitud_referencia.toFixed(4)}, ${a.longitud_referencia.toFixed(4)}
                <span class="text-[10px] text-emerald-600 font-bold ml-1">(R &le; 500m)</span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filtrarActivosLocal(e) {
    const q = e.target.value.toLowerCase().trim();
    const filtrados = cacheActivos.filter(a =>
        a.codigo_activo.toLowerCase().includes(q) ||
        a.nombre.toLowerCase().includes(q) ||
        a.ubicacion_tecnica.toLowerCase().includes(q)
    );
    renderizarActivos(filtrados);
}