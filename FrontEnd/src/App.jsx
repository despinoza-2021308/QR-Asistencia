import React, { useState, useEffect } from 'react';
import Registro from './components/Registro';
import AdminSesiones from './components/AdminSesiones';
import Login from './components/Login';
import axios, { API_BASE_URL } from './services/api';

export default function App() {
    // Si la URL contiene ?token=XYZ, es un participante escaneando el QR
    const [tokenPresente, setTokenPresente] = useState(false);
    const [tokenVal, setTokenVal] = useState('');
    const [forzarVistaAdmin, setForzarVistaAdmin] = useState(false);

    // Estado de autenticación del administrador
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authChecking, setAuthChecking] = useState(true);

    useEffect(() => {
        const queryParams = new URLSearchParams(window.location.search);
        const token = queryParams.get('token');
        const adminParam = queryParams.get('admin');

        // Si se pide explícitamente ?admin=true
        if (adminParam === 'true' || adminParam === '1') {
            setForzarVistaAdmin(true);
        }

        if (token) {
            setTokenPresente(true);
            setTokenVal(token);
        }

        // Verificar si hay sesión de admin guardada en localStorage
        try {
            const authData = localStorage.getItem('one_admin_auth');
            if (authData) {
                const parsed = JSON.parse(authData);
                // Validar que tenga sesión activa y token JWT presente
                if (parsed.isAuth && parsed.token && typeof parsed.token === 'string' && parsed.token.length > 20) {
                    setIsAuthenticated(true);
                } else {
                    localStorage.removeItem('one_admin_auth');
                }
            }
        } catch (e) {
            console.warn('Error al leer sesión');
        } finally {
            setAuthChecking(false);
        }

        // Manejar expiración automática de sesión cuando una petición devuelva 401
        const handleAuthExpired = () => {
            setIsAuthenticated(false);
            setForzarVistaAdmin(false);
        };
        window.addEventListener('auth:expired', handleAuthExpired);
        return () => window.removeEventListener('auth:expired', handleAuthExpired);
    }, []);

    const handleLoginSuccess = () => {
        setIsAuthenticated(true);
        setForzarVistaAdmin(true);
    };

    const handleLogout = async () => {
        try {
            await axios.post(`${API_BASE_URL}/logout`);
        } catch (err) {
            // Silencioso si no hay conexión
        }
        localStorage.removeItem('one_admin_auth');
        setIsAuthenticated(false);
        setForzarVistaAdmin(false);
    };

    if (authChecking) {
        return (
            <div className="min-h-screen bg-navy-950 flex items-center justify-center p-4">
                <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    // 1. Si el usuario escaneó un QR y no forzó vista de admin:
    if (tokenPresente && !forzarVistaAdmin) {
        return (
            <Registro 
                tokenProp={tokenVal} 
                onIrAdmin={() => setForzarVistaAdmin(true)} 
            />
        );
    }

    // 2. Vista de Administrador (Login o Dashboard):
    return isAuthenticated ? (
        <AdminSesiones onLogout={handleLogout} />
    ) : (
        <Login 
            onLoginSuccess={handleLoginSuccess}
            onVolverRegistro={tokenPresente ? () => setForzarVistaAdmin(false) : null}
        />
    );
}
