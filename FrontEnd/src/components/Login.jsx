import React, { useState } from 'react';
import axios from 'axios';
import { User, Lock, Eye, EyeOff, ShieldCheck, AlertCircle, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import logoOne from '../assets/logo.png';
import BotonInstalarPWA from './BotonInstalarPWA';
import BannerOffline from './BannerOffline';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export default function Login({ onLoginSuccess, onVolverRegistro }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        if (!username.trim() || !password) {
            setError('Por favor completa todos los campos requeridos.');
            return;
        }

        try {
            setLoading(true);
            const response = await axios.post(`${API_BASE_URL}/login`, {
                username: username.trim(),
                password: password
            });

            if (response.data.success) {
                localStorage.setItem('one_admin_auth', JSON.stringify({
                    isAuth: true,
                    token: response.data.token,
                    usuario: response.data.usuario,
                    timestamp: Date.now()
                }));
                onLoginSuccess(response.data.usuario);
            }
        } catch (err) {
            console.error('Error al iniciar sesión:', err);
            setError(err.response?.data?.error || 'Credenciales incorrectas o error de conexión al servidor.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[100dvh] bg-[#050811] flex flex-col items-center justify-start sm:justify-center p-4 sm:p-6 relative overflow-x-hidden overflow-y-auto pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2rem,calc(1.5rem+env(safe-area-inset-bottom)))]">
            {/* Orbes Líquidos Bioluminiscentes Fluctuantes (Efecto VisionOS) */}
            <div className="fixed top-1/4 -left-20 w-[480px] h-[480px] bg-brand-500/25 rounded-full blur-[120px] pointer-events-none animate-fluid-orb-1" />
            <div className="fixed bottom-1/4 -right-20 w-[520px] h-[520px] bg-corp-blue/30 rounded-full blur-[130px] pointer-events-none animate-fluid-orb-2" />
            <div className="fixed top-2/3 left-1/3 w-[380px] h-[380px] bg-sky-600/20 rounded-full blur-[110px] pointer-events-none animate-fluid-orb-1" />

            {/* Malla sutil de profundidad óptica */}
            <div className="fixed inset-0 bg-[radial-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

            <div className="w-full max-w-md relative z-10 animate-in fade-in zoom-in-95 duration-500 my-auto">
                {/* Botón flotante para instalar PWA */}
                <div className="flex justify-end mb-3">
                    <BotonInstalarPWA />
                </div>

                <div className="liquid-glass-panel rounded-3xl p-7 sm:p-10 relative">
                    
                    {/* Reflejo especular superior continuo de cristal biselado */}
                    <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-white/50 to-transparent" />

                    {/* Header Institucional */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center p-3.5 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-white/40 mb-6 group transition-all duration-300 hover:scale-105 hover:shadow-brand-500/20">
                            <img 
                                src={logoOne} 
                                alt="ONE Consulting" 
                                className="h-10 w-auto object-contain transition-transform duration-300" 
                            />
                        </div>

                        <div className="inline-flex items-center gap-1.5 px-3 py-1 liquid-glass-pill rounded-full text-brand-300 text-xs font-semibold mb-3">
                            <ShieldCheck className="w-3.5 h-3.5 text-brand-400" />
                            <span>Portal Administrativo Oficial</span>
                        </div>

                        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-display">
                            Iniciar Sesión
                        </h1>
                        <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
                            Control centralizado de asistencias y programas de capacitación.
                        </p>
                    </div>

                    {/* Mensaje de Error */}
                    {error && (
                        <div className="mb-6 p-3.5 bg-red-950/40 border border-red-500/30 rounded-2xl flex items-start gap-3 text-red-200 text-xs backdrop-blur-xl animate-in fade-in duration-200">
                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <span className="leading-snug">{error}</span>
                        </div>
                    )}

                    {/* Formulario */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                                Usuario
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                                    <User className="w-4 h-4" />
                                </div>
                                <input
                                    type="text"
                                    required
                                    autoComplete="username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Nombre de usuario"
                                    className="w-full liquid-glass-input rounded-xl pl-10 pr-4 py-3 text-base sm:text-xs text-white placeholder-slate-500 focus:outline-none transition-all min-h-[44px]"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                                Contraseña
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                                    <Lock className="w-4 h-4" />
                                </div>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••••••"
                                    className="w-full liquid-glass-input rounded-xl pl-10 pr-11 py-3 text-base sm:text-xs text-white placeholder-slate-500 focus:outline-none transition-all font-mono min-h-[44px]"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                                    tabIndex={-1}
                                    title={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                                >
                                    {showPassword ? (
                                        <EyeOff className="w-4 h-4 text-slate-400 hover:text-slate-200" />
                                    ) : (
                                        <Eye className="w-4 h-4 text-slate-400 hover:text-slate-200" />
                                    )}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full mt-4 liquid-btn-primary text-white font-semibold py-3.5 px-4 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-xs uppercase tracking-wider min-h-[48px]"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                                    <span>Verificando credenciales...</span>
                                </>
                            ) : (
                                <>
                                    <span>Acceder al Panel</span>
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </form>

                    {onVolverRegistro && (
                        <div className="mt-5 text-center">
                            <button
                                type="button"
                                onClick={onVolverRegistro}
                                className="text-xs text-brand-300 hover:text-brand-200 font-medium transition-colors inline-flex items-center gap-1 min-h-[40px]"
                            >
                                ← Volver al formulario de registro de participante
                            </button>
                        </div>
                    )}

                    <div className="mt-8 pt-6 border-t border-white/[0.08] text-center">
                        <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
                            <span className="font-semibold text-slate-300">ONE Consulting</span>
                            <span>•</span>
                            <span className="text-corp-coral font-medium italic">¡Su aliado en generar valor!</span>
                        </p>
                    </div>
                </div>
            </div>
            <BannerOffline />
        </div>
    );
}
