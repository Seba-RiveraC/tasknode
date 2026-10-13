document.addEventListener('DOMContentLoaded', () => {
    cargarCatalogoActivos();
    const input = document.getElementById('input-busqueda-activos');
    if (input) {
        input.addEventListener('input', filtrarActivosLocal);
    }
});

let cacheActivos = [];

async function cargarCatalogoActivos() {
    const tbody = document.getElementById('tabla-activos');
    const badge = document.getElementById('conteo-activos');
    if (!tbody) return;

    try {
        const res = await fetch(`${window.TaskNodeConfig.API_URL}/activos/`);
        if (!res.ok) throw new Error("Fallo de red");
        cacheActivos = await res.json();

        if (badge) badge.innerText = `${cacheActivos.length} UNIDADES ACTIVAS`;
        renderizarActivos(cacheActivos);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-red-400 font-mono">No se pudo consultar el catálogo de activos.</td></tr>`;
    }
}

function renderizarActivos(lista) {
    const tbody = document.getElementById('tabla-activos');
    tbody.innerHTML = '';

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-6 text-center text-slate-500">Sin coincidencias.</td></tr>`;
        return;
    }

    lista.forEach(a => {
        let criticidadBadge = "bg-surface-base text-slate-400 border-theme-dim";
        if (a.criticidad === "ALTA") criticidadBadge = "bg-red-950/80 text-red-400 border-red-800/80";
        if (a.criticidad === "MEDIA") criticidadBadge = "bg-amber-950/80 text-amber-400 border-amber-800/80";
        if (a.criticidad === "BAJA") criticidadBadge = "bg-surface-2 text-slate-300 border-theme-dim";

        const tr = document.createElement('tr');
        tr.className = "hover:bg-surface-2 transition border-b border-theme-dim";
        tr.innerHTML = `
            <td class="px-4 py-2.5 font-bold text-slate-200">${a.codigo_activo}</td>
            <td class="px-4 py-2.5 text-slate-300 font-sans text-xs">${a.nombre}</td>
            <td class="px-4 py-2.5 text-slate-400 text-[10px]">${a.ubicacion_tecnica}</td>
            <td class="px-4 py-2.5 whitespace-nowrap">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${criticidadBadge}">${a.criticidad}</span>
            </td>
            <td class="px-4 py-2.5 text-slate-500 text-[10px]">${a.latitud_referencia.toFixed(4)}, ${a.longitud_referencia.toFixed(4)}</td>
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