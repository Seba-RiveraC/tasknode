(function () {
    const origin = window.location.origin;
    let apiUrl = "http://127.0.0.1:8000/api/v1";

    // Si corre servido desde el mismo FastAPI (local o desplegado en Cloud/Azure/Render)
    if (origin && origin.startsWith("http") && !origin.includes(":5500")) {
        apiUrl = `${origin}/api/v1`;
    }

    window.TaskNodeConfig = {
        API_URL: apiUrl,
        VERSION: "2.5.0-CLOUD",
        LEY_PRIVACIDAD: "Ley 21.719 (Chile)"
    };
})();