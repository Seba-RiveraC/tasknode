document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch(`${window.TaskNodeConfig.API_URL}/auth/demo/configuracion`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const config = await res.json();
        document.getElementById('demo-cuentas').hidden = !config.habilitado;
    } catch (error) {
        console.error('No se pudo consultar la configuración de acceso:', error);
    }
});

async function autocompletarCuenta() {
    const val = document.getElementById('selector-directorio').value;
    const errBox = document.getElementById('login-error');
    if (!val) {
        errBox.innerText = 'Selecciona una cuenta para autocompletar.';
        errBox.classList.remove('hidden');
        return;
    }
    try {
        const res = await fetch(`${window.TaskNodeConfig.API_URL}/auth/demo/autocompletar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: val })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || `Error ${res.status}`);
        document.getElementById('login-id').value = data.email;
        document.getElementById('login-pwd').value = data.password;
        errBox.classList.add('hidden');
    } catch (error) {
        errBox.innerText = `No se pudo autocompletar: ${error.message}`;
        errBox.classList.remove('hidden');
    }
}

async function procesarLogin(e) {
    e.preventDefault();
    const errBox = document.getElementById('login-error');
    const btn = document.getElementById('btn-submit-login');
    errBox.classList.add('hidden');
    btn.disabled = true;

    const payload = {
        identificador: document.getElementById('login-id').value.trim(),
        password: document.getElementById('login-pwd').value
    };

    try {
        const res = await fetch(`${window.TaskNodeConfig.API_URL}/auth/login/panel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            errBox.innerText = data.detail || 'Credenciales inválidas.';
            errBox.classList.remove('hidden');
            btn.disabled = false;
            return;
        }

        localStorage.setItem('tasknode_token', data.token);
        localStorage.setItem('tasknode_user', JSON.stringify(data.usuario));
        window.location.href = data.redirect_url || '/app/monitor.html';
    } catch (err) {
        errBox.innerText = 'No fue posible establecer conexión con el servicio de autenticación.';
        errBox.classList.remove('hidden');
        btn.disabled = false;
    }
}
