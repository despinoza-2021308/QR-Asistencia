import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Interceptor para inyectar token JWT automáticamente en todas las peticiones con axios
axios.interceptors.request.use(
    (config) => {
        try {
            const authData = localStorage.getItem('one_admin_auth');
            if (authData) {
                const { token } = JSON.parse(authData);
                if (token) {
                    config.headers = config.headers || {};
                    config.headers.Authorization = `Bearer ${token}`;
                }
            }
        } catch (e) {
            console.error('Error al leer token de sesión:', e);
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Interceptor de respuesta para detectar expiración de sesión (401)
axios.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            const isLoginRequest = error.config && error.config.url && error.config.url.includes('/login');
            if (!isLoginRequest) {
                localStorage.removeItem('one_admin_auth');
                window.dispatchEvent(new CustomEvent('auth:expired', {
                    detail: { message: error.response?.data?.error || 'Tu sesión ha expirado.' }
                }));
            }
        }
        return Promise.reject(error);
    }
);

export default axios;
export { API_BASE_URL };
