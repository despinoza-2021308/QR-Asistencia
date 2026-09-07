import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, RefreshCw, CheckCircle2, CloudUpload } from 'lucide-react';
import { usePWA } from '../hooks/usePWA';

/**
 * BannerOffline: Notificación no intrusiva de estado de conexión
 * Alerta cuando se pierde la señal en auditorios/salones sin cobertura y
 * gestiona la cola de sincronización de asistencias de forma visual.
 */
export default function BannerOffline() {
    const { 
        isOnline, 
        pendientesSincronizar, 
        sincronizarColaPendientes,
        hapticTap 
    } = usePWA();

    const [mostrandoReconexion, setMostrandoReconexion] = useState(false);
    const [sincronizandoManual, setSincronizandoManual] = useState(false);

    // Detectar cuando recupera la señal
    useEffect(() => {
        if (isOnline) {
            setMostrandoReconexion(true);
            const timer = setTimeout(() => {
                setMostrandoReconexion(false);
            }, 3500);
            return () => clearTimeout(timer);
        }
    }, [isOnline]);

    const handleSincronizar = async () => {
        hapticTap();
        setSincronizandoManual(true);
        try {
            await sincronizarColaPendientes();
        } finally {
            setTimeout(() => setSincronizandoManual(false), 600);
        }
    };

    // Si todo está online y no hay pendientes ni mensaje de reconexión, no estorba
    if (isOnline && pendientesSincronizar === 0 && !mostrandoReconexion) {
        return null;
    }

    return (
        <div className="fixed bottom-[max(1rem,calc(0.75rem+env(safe-area-inset-bottom)))] inset-x-3 sm:inset-x-auto sm:right-5 z-50 pointer-events-none flex justify-center sm:justify-end">
            <div className="pointer-events-auto max-w-md w-full sm:w-auto">
                {/* 1. Alerta Sin Conexión */}
                {!isOnline && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-950/90 text-amber-200 border border-amber-500/40 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-3 duration-300">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center shrink-0">
                            <WifiOff className="w-4 h-4 text-amber-400 animate-pulse" />
                        </div>
                        <div className="flex-1 text-xs">
                            <p className="font-bold text-amber-100 font-display">Sin conexión a internet</p>
                            <p className="text-[11px] text-amber-300/80">
                                {pendientesSincronizar > 0 
                                    ? `${pendientesSincronizar} registro(s) guardado(s) localmente.` 
                                    : 'Modo resiliente activo en este dispositivo.'}
                            </p>
                        </div>
                    </div>
                )}

                {/* 2. Alerta de Reconexión o Cola Pendiente Online */}
                {isOnline && (pendientesSincronizar > 0 || mostrandoReconexion) && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-teal-950/90 text-teal-200 border border-teal-500/40 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-3 duration-300">
                        <div className="w-8 h-8 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center shrink-0">
                            {pendientesSincronizar > 0 ? (
                                <CloudUpload className="w-4 h-4 text-teal-300 animate-bounce" />
                            ) : (
                                <CheckCircle2 className="w-4 h-4 text-teal-400" />
                            )}
                        </div>
                        <div className="flex-1 text-xs pr-2">
                            <p className="font-bold text-teal-100 font-display">
                                {pendientesSincronizar > 0 ? 'Sincronizando asistencias' : 'Conexión restablecida'}
                            </p>
                            <p className="text-[11px] text-teal-300/80">
                                {pendientesSincronizar > 0 
                                    ? `${pendientesSincronizar} en cola para envío al servidor.`
                                    : 'Todos tus cambios están sincronizados.'}
                            </p>
                        </div>
                        {pendientesSincronizar > 0 && (
                            <button
                                type="button"
                                onClick={handleSincronizar}
                                disabled={sincronizandoManual}
                                className="px-2.5 py-1.5 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 border border-teal-400/40 text-[10px] font-bold text-teal-200 flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                            >
                                <RefreshCw className={`w-3 h-3 ${sincronizandoManual ? 'animate-spin' : ''}`} />
                                <span>Enviar</span>
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
