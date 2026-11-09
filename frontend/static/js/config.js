(function () {
    const origin = window.location.origin;
    if (window.location.protocol === "file:" ||
        (["localhost", "127.0.0.1"].includes(window.location.hostname) && window.location.port === "5500")) {
        const page = window.location.pathname.split("/").pop() || "login.html";
        window.location.replace(`http://localhost:8000/app/${page}${window.location.search}${window.location.hash}`);
        return;
    }

    let apiUrl = "http://localhost:8000/api/v1";

    if (origin && origin.startsWith("http")) {
        apiUrl = `${origin}/api/v1`;
    }

    window.TaskNodeConfig = {
        API_URL: apiUrl,
        VERSION: "3.4.0",
        LEY_PRIVACIDAD: "Ley 21.719 (Chile)"
    };

    const savedTheme = localStorage.getItem("tasknode_theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);

    window.toggleTheme = function () {
        const current = document.documentElement.getAttribute("data-theme") || "light";
        const next = current === "light" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("tasknode_theme", next);
        window.actualizarIconoTema();
    };

    window.actualizarIconoTema = function () {
        const current = document.documentElement.getAttribute("data-theme") || "light";
        const botones = document.querySelectorAll("#btn-theme-toggle, .btn-theme-toggle");
        botones.forEach(btn => {
            btn.innerText = current === "light" ? "Tema Oscuro" : "Tema Claro";
        });
    };

    window.obtenerUsuarioActual = function () {
        try {
            const raw = localStorage.getItem("tasknode_user");
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    };

    window.cerrarSesion = async function () {
        const token = localStorage.getItem("tasknode_token");
        if (token) {
            try {
                const res = await fetch(`${apiUrl}/auth/logout`, {
                    method: "POST", headers: { Authorization: `Bearer ${token}` }
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
            } catch (error) {
                console.error("No se pudo cerrar la sesión en el servidor:", error);
                alert("No se pudo cerrar la sesión en el servidor. Comprueba la conexión e inténtalo nuevamente.");
                return;
            }
        }
        localStorage.removeItem("tasknode_user");
        localStorage.removeItem("tasknode_token");
        window.location.href = "login.html";
    };

    window.addEventListener("storage", function (e) {
        if (e.key === "tasknode_theme" && e.newValue) {
            document.documentElement.setAttribute("data-theme", e.newValue);
            window.actualizarIconoTema();
        }
    });

    document.addEventListener("DOMContentLoaded", window.actualizarIconoTema);
})();