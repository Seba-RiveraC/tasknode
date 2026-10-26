(function () {
    const origin = window.location.origin;
    let apiUrl = "http://127.0.0.1:8000/api/v1";

    if (origin && origin.startsWith("http") && !origin.includes(":5500")) {
        apiUrl = `${origin}/api/v1`;
    }

    window.TaskNodeConfig = {
        API_URL: apiUrl,
        VERSION: "3.1.0",
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

    window.addEventListener("storage", function (e) {
        if (e.key === "tasknode_theme" && e.newValue) {
            document.documentElement.setAttribute("data-theme", e.newValue);
            window.actualizarIconoTema();
        }
    });

    document.addEventListener("DOMContentLoaded", window.actualizarIconoTema);
})();