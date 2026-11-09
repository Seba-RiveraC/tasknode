const OUTBOX_DB = 'tasknode_outbox_v2';
let sincronizandoOutbox = false;

function abrirOutbox() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(OUTBOX_DB, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('registros', { keyPath: 'registro_id' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('El almacenamiento local está bloqueado por otra pestaña.'));
    });
}

async function operarOutbox(modo, operacion) {
    const db = await abrirOutbox();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction('registros', modo);
            const request = operacion(tx.objectStore('registros'));
            tx.oncomplete = () => resolve(request.result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error('Transacción local cancelada.'));
        });
    } finally {
        db.close();
    }
}

function listarOutboxNuevo() {
    return operarOutbox('readonly', store => store.getAll());
}

function guardarOutboxNuevo(item) {
    return operarOutbox('readwrite', store => store.add(item));
}

function eliminarOutboxNuevo(id) {
    return operarOutbox('readwrite', store => store.delete(id));
}
