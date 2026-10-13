// Detección automática del host de la API
const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname === "";
const API_BASE_URL = isLocalhost 
    ? "http://127.0.0.1:8000/api/v1" 
    : `${window.location.origin}/api/v1`;

window.TaskNodeConfig = {
    API_URL: API_BASE_URL,
    GEOCERCA_RADIO_MAX: 150.0
};