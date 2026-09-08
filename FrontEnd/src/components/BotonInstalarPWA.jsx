import React, { useState } from 'react';
import { Smartphone, Share, PlusSquare, X, CheckCircle2, MoreVertical, Compass } from 'lucide-react';
import { usePWA } from '../hooks/usePWA';
import logoOne from '../assets/logo.png';

/**
 * Componente BotonInstalarPWA:
 * Siempre visible en navegadores web móviles y de escritorio (Safari, Chrome, etc.)
 * Se oculta automáticamente cuando la app ya se ejecuta en modo standalone instalada.
 */
export default function BotonInstalarPWA({ className = '', texto = 'Instalar App' }) {
    const { isStandalone, isIOS, promptInstall, installPrompt, hapticTap } = usePWA();
    const [mostrarModal, setMostrarModal] = useState(false);

    // Si ya está instalada y ejecutándose a pantalla completa, no mostrar botón
    if (isStandalone) {
        return null;
    }

    const handleClick = async () => {
        hapticTap();
        // Si el navegador soporta el diálogo nativo directo (Android / Chrome)
        if (installPrompt) {
            const instalado = await promptInstall();
            if (!instalado) {
                setMostrarModal(true);
            }
        } else {
            // En iOS Safari o navegadores donde Apple/Google no disparan prompt automático
            setMostrarModal(true);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={handleClick}
                className={`h-10 inline-flex items-center gap-2 px-3.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-cyan-500/40 shadow-sm backdrop-blur-md transition-all active:scale-95 cursor-pointer shrink-0 ${className}`}
                title="Instalar ONE Consulting en tu pantalla de inicio"
            >
                <div className="w-5 h-5 rounded-lg bg-cyan-400/15 border border-cyan-400/25 flex items-center justify-center shrink-0">
                    <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <span className="whitespace-nowrap font-medium tracking-wide">{texto}</span>
            </button>

            {/* Modal Universal de Instalación (iOS Safari / Android / Chrome) */}
            {mostrarModal && (
                <div className="fixed inset-0 bg-[#050811]/90 backdrop-blur-xl z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 pb-[max(1rem,env(safe-area-inset-bottom))] animate-in fade-in duration-200">
                    <div className="liquid-glass-panel rounded-3xl p-6 sm:p-8 max-w-sm w-full relative shadow-2xl border border-white/20 animate-in slide-in-from-bottom-5 duration-300">
                        <button
                            type="button"
                            onClick={() => setMostrarModal(false)}
                            className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-3 mb-4">
                            <div className="bg-white/95 p-2 rounded-xl shadow-sm border border-white/20 shrink-0">
                                <img src={logoOne} alt="Logo" className="h-6 w-auto object-contain" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-white font-display">
                                    {isIOS ? 'Instalar en iPhone / iPad' : 'Instalar Aplicación'}
                                </h3>
                                <p className="text-[11px] text-slate-400">ONE Consulting • Control QR</p>
                            </div>
                        </div>

                        <p className="text-xs text-slate-300 mb-5 leading-relaxed">
                            {isIOS 
                                ? 'Agrega la app a tu pantalla de inicio para abrirla a pantalla completa sin la barra de Safari:'
                                : 'Accede de forma instantánea sin escribir la dirección web:'}
                        </p>

                        {/* Pasos para iPhone / iPad en Safari */}
                        {isIOS ? (
                            <div className="space-y-3 mb-6 text-xs">
                                <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
                                    <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 flex items-center justify-center font-bold shrink-0 text-[11px]">
                                        1
                                    </span>
                                    <div className="text-slate-300 leading-snug">
                                        Toca el botón <strong className="text-white">Compartir</strong> <Share className="w-3.5 h-3.5 inline text-cyan-400 mx-1 align-baseline" /> en la barra inferior o superior de Safari.
                                    </div>
                                </div>

                                <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
                                    <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 flex items-center justify-center font-bold shrink-0 text-[11px]">
                                        2
                                    </span>
                                    <div className="text-slate-300 leading-snug">
                                        Desplaza hacia abajo y selecciona <strong className="text-white">"Añadir a pantalla de inicio"</strong> <PlusSquare className="w-3.5 h-3.5 inline text-cyan-400 mx-1 align-baseline" />.
                                    </div>
                                </div>

                                <p className="text-[11px] text-slate-400 italic text-center">
                                    Nota: Asegúrate de estar abriendo el enlace en Safari.
                                </p>
                            </div>
                        ) : (
                            /* Pasos para Android / Chrome / Otros */
                            <div className="space-y-3 mb-6 text-xs">
                                <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
                                    <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 flex items-center justify-center font-bold shrink-0 text-[11px]">
                                        1
                                    </span>
                                    <div className="text-slate-300 leading-snug">
                                        Toca los <strong className="text-white">3 puntos (⋮)</strong> <MoreVertical className="w-3.5 h-3.5 inline text-cyan-400 mx-0.5 align-baseline" /> del menú del navegador arriba a la derecha.
                                    </div>
                                </div>

                                <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
                                    <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 flex items-center justify-center font-bold shrink-0 text-[11px]">
                                        2
                                    </span>
                                    <div className="text-slate-300 leading-snug">
                                        Selecciona <strong className="text-white">"Instalar aplicación"</strong> o <strong className="text-white">"Agregar a la pantalla principal"</strong>.
                                    </div>
                                </div>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => setMostrarModal(false)}
                            className="w-full liquid-btn-primary text-white py-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 min-h-[44px]"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Entendido</span>
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
