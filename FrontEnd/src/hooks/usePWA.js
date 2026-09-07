import { useState, useEffect, useCallback } from 'react';
import axios, { API_BASE_URL } from '../services/api';

/**
 * Hook de experiencia móvil avanzada (PWA):
 * - Detección de instalación PWA nativa y soporte para iOS Safari
 * - Retroalimentación háptica (Vibration API)
 * - Detección de conectividad en tiempo real (Online/Offline)
 * - Cola de sincronización resiliente para registros sin conexión
 */
const detectStandalone = () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches || 
           window.navigator.standalone === true;
};

const detectIOS = () => {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua) || 
           (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
};

export function usePWA() {
    const [installPrompt, setInstallPrompt] = useState(null);
    const [isStandalone, setIsStandalone] = useState(detectStandalone);
    const [isIOS, setIsIOS] = useState(detectIOS);
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [pendientesSincronizar, setPendientesSincronizar] = useState(0);

    useEffect(() => {
        // 1. Detectar si ya se está ejecutando como app instalada (Standalone)
        setIsStandalone(detectStandalone());
        setIsIOS(detectIOS());

        // 3. Capturar evento de instalación nativo (Chrome, Edge, Android)
        const handleBeforeInstall = (e) => {
            e.preventDefault();
            setInstallPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', handleBeforeInstall);

        const handleAppInstalled = () => {
            setInstallPrompt(null);
            setIsStandalone(true);
            triggerHaptic([50, 100, 50]);
        };
        window.addEventListener('appinstalled', handleAppInstalled);

        // 4. Monitoreo de conectividad (Online / Offline)
        const handleOnline = () => {
            setIsOnline(true);
            sincronizarColaPendientes();
        };
        const handleOffline = () => {
            setIsOnline(false);
        };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Contar asistencias pendientes iniciales
        contarPendientes();

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
            window.removeEventListener('appinstalled', handleAppInstalled);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Disparador de vibración táctil seguro
    const triggerHaptic = (pattern = [30]) => {
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
            try {
                navigator.vibrate(pattern);
            } catch (e) {
                // Silencioso si el navegador del celular restringe vibración
            }
        }
    };

    // Funciones hápticas predefinidas
    const hapticTap = useCallback(() => triggerHaptic([25]), []);
    const hapticSuccess = useCallback(() => triggerHaptic([40, 60, 40]), []);
    const hapticWarning = useCallback(() => triggerHaptic([60, 40, 60]), []);
    const hapticError = useCallback(() => triggerHaptic([90, 50, 90]), []);

    // Lanzar diálogo nativo de instalación
    const promptInstall = async () => {
        if (!installPrompt) return false;
        try {
            installPrompt.prompt();
            const { outcome } = await installPrompt.userChoice;
            if (outcome === 'accepted') {
                setInstallPrompt(null);
                return true;
            }
        } catch (err) {
            console.warn('Error al solicitar instalación PWA:', err);
        }
        return false;
    };

    // -------------------------------------------------------------
    // GESTIÓN DE COLA OFFLINE (RESILIENTE A CORTES DE SEÑAL)
    // -------------------------------------------------------------
    const contarPendientes = () => {
        try {
            const raw = localStorage.getItem('asistencias_cola_offline');
            const lista = raw ? JSON.parse(raw) : [];
            setPendientesSincronizar(lista.length);
        } catch (e) {
            setPendientesSincronizar(0);
        }
    };

    const guardarOffline = (datosAsistencia) => {
        try {
            const raw = localStorage.getItem('asistencias_cola_offline');
            const cola = raw ? JSON.parse(raw) : [];
            cola.push({
                ...datosAsistencia,
                fechaLocal: new Date().toISOString()
            });
            localStorage.setItem('asistencias_cola_offline', JSON.stringify(cola));
            contarPendientes();
            hapticWarning();
            return true;
        } catch (e) {
            console.error('Error al guardar en cola offline:', e);
            return false;
        }
    };

    const sincronizarColaPendientes = async () => {
        try {
            const raw = localStorage.getItem('asistencias_cola_offline');
            if (!raw) return;
            const cola = JSON.parse(raw);
            if (!Array.isArray(cola) || cola.length === 0) return;

            const pendientesRestantes = [];

            for (const item of cola) {
                try {
                    await axios.post(`${API_BASE_URL}/registrar-asistencia`, item);
                } catch (err) {
                    // Si el error no es duplicado (409), conservar en cola para reintentar
                    if (err.response?.status !== 409) {
                        pendientesRestantes.push(item);
                    }
                }
            }

            if (pendientesRestantes.length === 0) {
                localStorage.removeItem('asistencias_cola_offline');
                setPendientesSincronizar(0);
                hapticSuccess();
            } else {
                localStorage.setItem('asistencias_cola_offline', JSON.stringify(pendientesRestantes));
                setPendientesSincronizar(pendientesRestantes.length);
            }
        } catch (e) {
            console.warn('Error durante sincronización offline:', e);
        }
    };

    return {
        isStandalone,
        canInstall: !isStandalone,
        installPrompt,
        isIOS,
        isOnline,
        pendientesSincronizar,
        promptInstall,
        guardarOffline,
        sincronizarColaPendientes,
        hapticTap,
        hapticSuccess,
        hapticWarning,
        hapticError
    };
}
