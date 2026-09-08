import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    CheckCircle2, AlertCircle, Building2, Laptop, User, Mail, 
    Layers, ShieldCheck, Loader2, Calendar, Clock, ArrowRight, 
    RotateCcw, Sparkles, Check, WifiOff
} from 'lucide-react';
import logoOne from '../assets/logo.png';
import { usePWA } from '../hooks/usePWA';
import BotonInstalarPWA from './BotonInstalarPWA';
import BannerOffline from './BannerOffline';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Helper compatible 100% con iOS WebKit / Safari para parsear y formatear horas
const formatearHoraSegura = (fechaStr) => {
    if (!fechaStr) return '';
    try {
        let segura = fechaStr;
        if (typeof segura === 'string' && segura.includes(' ') && !segura.includes('T')) {
            segura = segura.replace(' ', 'T');
        }
        const d = new Date(segura);
        return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '';
    }
};

// Helper compatible para formatear fechas en formato legible en español
const formatearFechaSegura = (fechaStr) => {
    if (!fechaStr) return '';
    try {
        let limpia = String(fechaStr).split('T')[0];
        if (limpia.includes(' ')) limpia = limpia.split(' ')[0];
        const partes = limpia.split('-');
        if (partes.length === 3) {
            const y = parseInt(partes[0], 10);
            const m = parseInt(partes[1], 10) - 1;
            const d = parseInt(partes[2], 10);
            const fechaObj = new Date(y, m, d);
            return fechaObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
        }
        const d = new Date(fechaStr);
        return isNaN(d.getTime()) ? String(fechaStr) : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) {
        return String(fechaStr || '');
    }
};

// Diccionario de dominios comunes para detección de errores tipográficos (anti-typo)
const SUGERENCIAS_DOMINIOS = {
    'gmial.com': 'gmail.com',
    'gmaill.com': 'gmail.com',
    'gamil.com': 'gmail.com',
    'gmai.com': 'gmail.com',
    'hotmial.com': 'hotmail.com',
    'hotmaill.com': 'hotmail.com',
    'hotmil.com': 'hotmail.com',
    'outlok.com': 'outlook.com',
    'outllok.com': 'outlook.com',
    'yaho.com': 'yahoo.com',
    'yahooo.com': 'yahoo.com'
};

const detectarSugerenciaDominio = (emailStr) => {
    if (!emailStr || !emailStr.includes('@')) return null;
    const partes = emailStr.trim().split('@');
    if (partes.length !== 2) return null;
    const dominio = partes[1].toLowerCase();
    const sugerido = SUGERENCIAS_DOMINIOS[dominio];
    if (sugerido) {
        return `${partes[0]}@${sugerido}`;
    }
    return null;
};

// Sanitización de texto en cliente
const sanitizarTexto = (str) => {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
};

// Capitalización formal de Nombres Propios (Title Case)
const toTitleCase = (str) => {
    if (!str || typeof str !== 'string') return '';
    const particulas = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'di', 'van', 'von', 'der']);
    const palabras = str.replace(/[<>]/g, '').trim().toLowerCase().split(/\s+/);
    return palabras.map((palabra, index) => {
        if (!palabra) return '';
        if (index > 0 && particulas.has(palabra)) return palabra;
        if (palabra.includes('-')) {
            return palabra.split('-').map(part => part ? part.charAt(0).toUpperCase() + part.slice(1) : '').join('-');
        }
        return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    }).join(' ');
};


/**
 * Componente Registro: Permite a los participantes registrar su asistencia
 * Bloquea registros duplicados por Nombre o Correo en una misma sesión.
 * Estilo: Apple Liquid Glass (VisionOS / Apple Wallet Pass)
 * Optimizado para iOS Safari (iPhone / iPad) y Android.
 */
export default function Registro({ tokenProp, onIrAdmin }) {
    const { 
        isOnline, 
        guardarOffline, 
        hapticTap, 
        hapticSuccess, 
        hapticWarning, 
        hapticError 
    } = usePWA();

    // Token del QR
    const [token, setToken] = useState('');
    const [eventoInfo, setEventoInfo] = useState(null);
    const [loadingInfo, setLoadingInfo] = useState(true);
    
    // Formulario del participante
    const [nombre, setNombre] = useState('');
    const [empresa, setEmpresa] = useState('');
    const [correo, setCorreo] = useState('');
    const [nombreActividad, setNombreActividad] = useState('');
    const [instructor, setInstructor] = useState('');
    const [modalidad, setModalidad] = useState('Presencial'); // 'Presencial' | 'Virtual'
    const [sesionSeleccionadaId, setSesionSeleccionadaId] = useState('');
    const [fechaSesion, setFechaSesion] = useState(() => {
        const hoy = new Date();
        const y = hoy.getFullYear();
        const m = String(hoy.getMonth() + 1).padStart(2, '0');
        const d = String(hoy.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    });
    const [submitting, setSubmitting] = useState(false);
    
    // Feedback y resultados
    const [error, setError] = useState(null);
    const [registroExitoso, setRegistroExitoso] = useState(null);

    // Control de validaciones y campos tocados
    const [tocado, setTocado] = useState({ nombre: false, empresa: false, correo: false, instructor: false, fecha: false });
    const [hpVerificacion, setHpVerificacion] = useState(''); // Campo Honeypot invisible contra bots

    // Asistencias ya registradas localmente en este dispositivo
    const [asistenciasPrevias, setAsistenciasPrevias] = useState({});

    // Validaciones computadas en tiempo real
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const nombreLimpio = sanitizarTexto(nombre);
    const empresaLimpia = sanitizarTexto(empresa);
    const correoLimpio = correo.trim().toLowerCase();
    const instructorLimpio = sanitizarTexto(instructor);

    const esNombreValido = nombreLimpio.length >= 3 && /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(nombreLimpio);
    const tieneApellido = nombreLimpio.split(' ').filter(Boolean).length >= 2;
    const esEmpresaValida = empresaLimpia.length >= 2;
    const esCorreoValido = emailRegex.test(correoLimpio);
    const esInstructorValido = instructorLimpio.length >= 3 && /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(instructorLimpio);
    const esFechaValida = Boolean(fechaSesion && /^\d{4}-\d{2}-\d{2}$/.test(fechaSesion));
    const sugerenciaCorreo = detectarSugerenciaDominio(correoLimpio);

    const formularioValido = esNombreValido && esEmpresaValida && esCorreoValido && esInstructorValido && esFechaValida && Boolean(sesionSeleccionadaId);


    // 1. Extraer token de la URL y cargar datos previos de localStorage
    useEffect(() => {
        const queryParams = new URLSearchParams(window.location.search);
        const urlToken = tokenProp || queryParams.get('token');

        // Autocompletar datos del participante si ya se registró antes en este teléfono
        try {
            const guardado = localStorage.getItem('asistencia_perfil_usuario');
            if (guardado) {
                const perfil = JSON.parse(guardado);
                if (perfil.nombre) setNombre(toTitleCase(perfil.nombre));
                if (perfil.empresa) setEmpresa(perfil.empresa);
                if (perfil.correo) setCorreo(perfil.correo);
                if (perfil.instructor) setInstructor(toTitleCase(perfil.instructor));
            }

            const previas = localStorage.getItem('asistencias_registradas_historial');
            if (previas) {
                setAsistenciasPrevias(JSON.parse(previas));
            }
        } catch (e) {
            console.warn('LocalStorage no disponible');
        }

        if (urlToken) {
            setToken(urlToken);
            verificarEvento(urlToken);
        } else {
            setLoadingInfo(false);
            setError('No se proporcionó un código QR de evento. Por favor escanea un código QR válido.');
        }
    }, [tokenProp]);

    // 2. Obtener información de la actividad y sus sesiones
    const verificarEvento = async (tokenVal) => {
        try {
            setLoadingInfo(true);
            setError(null);
            const response = await axios.get(`${API_BASE_URL}/evento-info/${tokenVal}`);
            const data = response.data;
            setEventoInfo(data);
            
            if (data.activa === false) {
                setError(data.mensaje_cierre || 'Esta actividad de capacitación ha sido finalizada y cerrada por el organizador. Ya no se admiten nuevos registros de asistencia.');
                setLoadingInfo(false);
                return;
            }

            if (data.titulo) setNombreActividad(data.titulo);
            if (data.instructor) setInstructor(toTitleCase(data.instructor));

            // Preseleccionar la primera sesión activa no registrada y sincronizar fecha si existe
            if (data.sesiones && data.sesiones.length > 0) {
                const primeraActiva = data.sesiones.find(s => s.activa) || data.sesiones[0];
                setSesionSeleccionadaId(primeraActiva.id);
                if (primeraActiva.fecha) {
                    try {
                        const fStr = String(primeraActiva.fecha).split('T')[0];
                        if (/^\d{4}-\d{2}-\d{2}$/.test(fStr)) {
                            setFechaSesion(fStr);
                        }
                    } catch (e) {}
                }
            }
        } catch (err) {
            console.error('Error al validar evento:', err);
            const msg = err.response?.data?.error || 'El código QR no es válido o la actividad no está disponible.';
            setError(msg);
        } finally {
            setLoadingInfo(false);
        }
    };

    // 3. Enviar registro de asistencia
    const handleSubmit = async (e) => {
        e.preventDefault();
        hapticTap();
        setError(null);
        setTocado({ nombre: true, empresa: true, correo: true, instructor: true, fecha: true });

        if (!formularioValido) {
            hapticError();
            if (!sesionSeleccionadaId) {
                setError('Por favor selecciona la sesión a la que estás asistiendo.');
            } else if (!esFechaValida) {
                setError('Por favor selecciona una fecha válida para la sesión.');
            } else if (!esNombreValido) {
                setError('Por favor ingresa un nombre válido de al menos 3 letras.');
            } else if (!esEmpresaValida) {
                setError('Por favor ingresa el nombre de tu empresa o institución.');
            } else if (!esCorreoValido) {
                setError('Por favor ingresa un correo electrónico válido (ejemplo@empresa.com).');
            } else if (!esInstructorValido) {
                setError('Por favor ingresa el nombre del instructor o facilitador a cargo (mínimo 3 letras).');
            }
            return;
        }

        // Validar si localmente ya registró esta sesión con este mismo nombre o correo
        const claveSesion = `${token}_${sesionSeleccionadaId}`;
        if (asistenciasPrevias[claveSesion]) {
            hapticWarning();
            const previa = asistenciasPrevias[claveSesion];
            setError(`Ya has confirmado tu asistencia en esta sesión como "${previa.nombre_usuario}". No es necesario registrarte dos veces.`);
            return;
        }

        // Auto-capitalización formal Title Case del nombre e instructor
        const nombreFormateado = toTitleCase(nombreLimpio);
        const instructorFormateado = toTitleCase(instructorLimpio);
        const actividadFinal = eventoInfo?.titulo || sanitizarTexto(nombreActividad) || 'Capacitación';

        // Si el dispositivo está sin señal/offline, guardar en cola local resiliente
        if (!navigator.onLine) {
            const sesionObj = eventoInfo?.sesiones?.find(s => s.id === sesionSeleccionadaId);
            const regOffline = {
                id: `offline-${Date.now()}`,
                token: token,
                sesion_id: sesionSeleccionadaId,
                nombre_usuario: nombreFormateado,
                empresa: empresaLimpia,
                correo: correoLimpio,
                modalidad: modalidad,
                nombre_actividad: actividadFinal,
                capacitacion_titulo: actividadFinal,
                nombre_sesion: sesionObj?.nombre_sesion || sesionObj?.nombre || 'Sesión seleccionada',
                fecha_sesion: fechaSesion,
                instructor: instructorFormateado || eventoInfo?.instructor || '',
                fecha_registro: new Date().toISOString(),
                isOffline: true
            };

            guardarOffline({
                token: token,
                sesion_id: sesionSeleccionadaId,
                nombre: nombreFormateado,
                empresa: empresaLimpia,
                correo: correoLimpio,
                nombre_actividad: actividadFinal,
                instructor: instructorFormateado,
                fecha: fechaSesion,
                modalidad: modalidad
            });

            setRegistroExitoso(regOffline);
            hapticSuccess();

            try {
                localStorage.setItem('asistencia_perfil_usuario', JSON.stringify({
                    nombre: nombreFormateado,
                    empresa: empresaLimpia,
                    correo: correoLimpio,
                    instructor: instructorFormateado
                }));

                const nuevoHistorial = {
                    ...asistenciasPrevias,
                    [claveSesion]: regOffline
                };
                localStorage.setItem('asistencias_registradas_historial', JSON.stringify(nuevoHistorial));
                setAsistenciasPrevias(nuevoHistorial);
            } catch (e) {
                console.warn('No se pudo guardar en LocalStorage');
            }
            return;
        }

        try {
            setSubmitting(true);
            const response = await axios.post(`${API_BASE_URL}/registrar-asistencia`, {
                token: token,
                sesion_id: sesionSeleccionadaId,
                nombre: nombreFormateado,
                empresa: empresaLimpia,
                correo: correoLimpio,
                nombre_actividad: actividadFinal,
                instructor: instructorFormateado,
                fecha: fechaSesion,
                modalidad: modalidad,
                _hp_verificacion: hpVerificacion
            });

            const reg = response.data.registro;
            setRegistroExitoso(reg);
            hapticSuccess();

            // Guardar en localStorage para recordar perfil y bloquear duplicados futuros en este dispositivo
            try {
                localStorage.setItem('asistencia_perfil_usuario', JSON.stringify({
                    nombre: nombreFormateado,
                    empresa: empresaLimpia,
                    correo: correoLimpio,
                    instructor: instructorFormateado
                }));

                const nuevoHistorial = {
                    ...asistenciasPrevias,
                    [claveSesion]: reg
                };
                localStorage.setItem('asistencias_registradas_historial', JSON.stringify(nuevoHistorial));
                setAsistenciasPrevias(nuevoHistorial);
            } catch (e) {
                console.warn('No se pudo guardar en LocalStorage');
            }

        } catch (err) {
            console.error('Error al registrar asistencia:', err);

            if (err.response?.status === 422) {
                hapticError();
                const campos = err.response?.data?.campos;
                const primerMensaje = campos ? Object.values(campos)[0] : err.response?.data?.error;
                setError(primerMensaje || 'Por favor corrige los datos del formulario.');
                return;
            }


            // Resiliencia ante corte de red repentino en auditorio
            if (!err.response || err.code === 'ERR_NETWORK') {
                const sesionObj = eventoInfo?.sesiones?.find(s => s.id === sesionSeleccionadaId);
                const regOffline = {
                    id: `offline-${Date.now()}`,
                    token: token,
                    sesion_id: sesionSeleccionadaId,
                    nombre_usuario: nombre.trim(),
                    empresa: empresa.trim(),
                    correo: correo.trim().toLowerCase(),
                    modalidad: modalidad,
                    nombre_actividad: actividadFinal,
                    capacitacion_titulo: eventoInfo?.titulo || actividadFinal,
                    nombre_sesion: sesionObj?.nombre_sesion || sesionObj?.nombre || 'Sesión seleccionada',
                    fecha_sesion: fechaSesion,
                    instructor: instructor.trim() || eventoInfo?.instructor || '',
                    fecha_registro: new Date().toISOString(),
                    isOffline: true
                };

                guardarOffline({
                    token: token,
                    sesion_id: sesionSeleccionadaId,
                    nombre: nombre.trim(),
                    empresa: empresa.trim(),
                    correo: correo.trim().toLowerCase(),
                    nombre_actividad: actividadFinal,
                    instructor: instructor.trim(),
                    fecha: fechaSesion,
                    modalidad: modalidad
                });

                setRegistroExitoso(regOffline);
                hapticSuccess();
                return;
            }

            hapticError();
            if (err.response?.status === 409) {
                setError(err.response?.data?.error || 'Ya has registrado tu asistencia en esta sesión con este nombre o correo electrónico.');
                if (err.response?.data?.registro) {
                    setRegistroExitoso(err.response.data.registro);
                }
            } else {
                setError(err.response?.data?.error || 'Ocurrió un error al procesar tu asistencia. Inténtalo nuevamente.');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const sesionesActivas = eventoInfo?.sesiones ? eventoInfo.sesiones.filter(s => s.activa) : [];

    // ----------------------------------------------------------------
    // RENDERIZADO: Estado de carga inicial
    // ----------------------------------------------------------------
    if (loadingInfo) {
        return (
            <div className="min-h-[100dvh] bg-[#050811] flex items-center justify-center p-4 font-sans relative overflow-x-hidden overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
                <div className="absolute top-1/3 left-1/3 w-[350px] h-[350px] bg-brand-500/20 rounded-full blur-[100px] pointer-events-none animate-fluid-orb-1" />
                <div className="liquid-glass-panel p-8 rounded-3xl text-center max-w-sm w-full relative z-10">
                    <Loader2 className="w-9 h-9 text-brand-400 animate-spin mx-auto mb-3" />
                    <p className="text-white font-bold text-sm font-display">Validando código QR...</p>
                    <p className="text-slate-400 text-xs mt-1">Conectando con ONE Consulting</p>
                </div>
            </div>
        );
    }

    // ----------------------------------------------------------------
    // RENDERIZADO: Pantalla de Éxito / Credencial Digital (Apple Wallet)
    // ----------------------------------------------------------------
    if (registroExitoso) {
        return (
            <div className="min-h-[100dvh] bg-[#050811] flex flex-col items-center justify-start sm:justify-center p-4 sm:p-6 font-sans relative overflow-x-hidden overflow-y-auto pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2.5rem,calc(1.5rem+env(safe-area-inset-bottom)))]">
                {/* Orbes Líquidos de Fondo */}
                <div className="fixed top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-brand-500/20 rounded-full blur-[130px] pointer-events-none animate-fluid-orb-1" />
                <div className="fixed bottom-10 right-10 w-[400px] h-[400px] bg-emerald-500/15 rounded-full blur-[110px] pointer-events-none animate-fluid-orb-2" />

                <div className="w-full max-w-md relative z-10 animate-in fade-in zoom-in-95 duration-500 my-auto">
                    {/* Botón flotante para instalar PWA */}
                    <div className="flex justify-end mb-3">
                        <BotonInstalarPWA />
                    </div>

                    <div className="liquid-glass-panel rounded-3xl p-6 sm:p-9 text-center relative">
                        
                        {/* Reflejo especular superior continuo de cristal */}
                        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-white/50 to-transparent" />

                        {/* Logo Corporativo en cápsula de cristal */}
                        <div className="inline-flex items-center justify-center p-2.5 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-white/40 mb-5">
                            <img src={logoOne} alt="ONE Consulting" className="h-8 w-auto object-contain" />
                        </div>

                        {/* Icono de Confirmación Líquido */}
                        <div className={`w-16 h-16 rounded-3xl border flex items-center justify-center mx-auto mb-4 shadow-xl ${
                            registroExitoso.isOffline
                                ? 'bg-gradient-to-br from-amber-500/25 to-yellow-600/20 border-amber-400/40 text-amber-300 shadow-amber-500/20'
                                : 'bg-gradient-to-br from-brand-500/25 to-emerald-600/20 border-brand-400/40 text-brand-300 shadow-brand-500/20'
                        }`}>
                            {registroExitoso.isOffline ? (
                                <WifiOff className="w-8 h-8 stroke-[2.5]" />
                            ) : (
                                <Check className="w-8 h-8 stroke-[2.5]" />
                            )}
                        </div>

                        {registroExitoso.isOffline ? (
                            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-amber-300 text-xs font-semibold bg-amber-500/10 border border-amber-400/30 mb-2">
                                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                                <span>Guardado en Celular • Modo Resiliente</span>
                            </div>
                        ) : (
                            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-brand-300 text-xs font-semibold liquid-glass-pill mb-2">
                                <ShieldCheck className="w-3.5 h-3.5 text-brand-400" />
                                <span>Acreditación Oficial Verificada</span>
                            </div>
                        )}

                        <h2 className="text-2xl font-black text-white tracking-tight font-display">
                            {registroExitoso.isOffline ? '¡Registro Asegurado!' : '¡Asistencia Confirmada!'}
                        </h2>
                        <p className="text-slate-400 text-xs mt-1 mb-6">
                            {registroExitoso.isOffline
                                ? 'Sin cobertura en este momento. Tu asistencia se guardó localmente y se sincronizará automáticamente apenas recuperes señal.'
                                : 'Tu participación ha quedado validada en el registro de ONE Consulting.'}
                        </p>

                        {/* Credencial Digital / Apple Wallet Pass */}
                        <div className="liquid-glass-input rounded-2xl p-5 text-left space-y-3.5 mb-6 text-xs border-white/[0.1] relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-brand-500/10 rounded-full blur-xl pointer-events-none" />
                            
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Participante</span>
                                <p className="text-white font-extrabold text-base mt-0.5 font-display">{registroExitoso.nombre_usuario}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-white/[0.08]">
                                <div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Empresa</span>
                                    <span className="inline-flex items-center gap-1.5 text-slate-200 font-medium mt-1">
                                        <Building2 className="w-3.5 h-3.5 text-brand-400" />
                                        {registroExitoso.empresa}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Modalidad</span>
                                    <span className="inline-flex items-center gap-1.5 text-brand-300 font-semibold mt-1">
                                        {registroExitoso.modalidad === 'Virtual' ? (
                                            <>
                                                <Laptop className="w-3.5 h-3.5" />
                                                <span>Virtual</span>
                                            </>
                                        ) : (
                                            <>
                                                <Building2 className="w-3.5 h-3.5" />
                                                <span>Presencial</span>
                                            </>
                                        )}
                                    </span>
                                </div>
                            </div>

                            <div className="pt-2.5 border-t border-white/[0.08]">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Programa</span>
                                <p className="text-slate-200 font-medium mt-0.5">{registroExitoso.capacitacion_titulo}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-white/[0.08]">
                                <div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Sesión Registrada</span>
                                    <p className="text-brand-300 font-semibold mt-0.5">{registroExitoso.nombre_sesion}</p>
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Fecha de la Sesión</span>
                                    <span className="inline-flex items-center gap-1.5 text-slate-200 font-medium mt-0.5">
                                        <Calendar className="w-3.5 h-3.5 text-brand-400" />
                                        {formatearFechaSegura(registroExitoso.fecha_sesion || registroExitoso.fecha || registroExitoso.fecha_registro)}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-white/[0.08]">
                                <div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Hora de Registro</span>
                                    <span className="inline-flex items-center gap-1 text-slate-400 mt-0.5 tabular-numbers">
                                        <Clock className="w-3 h-3 text-slate-400" />
                                        {formatearHoraSegura(registroExitoso.fecha_registro)}
                                    </span>
                                </div>
                                {registroExitoso.instructor && (
                                    <div>
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Instructor</span>
                                        <p className="text-slate-300 mt-0.5 truncate">{registroExitoso.instructor}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="w-full bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3 text-center">
                            <p className="text-xs text-emerald-300 font-semibold flex items-center justify-center gap-1.5">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Asistencia Registrada Exitosamente</span>
                            </p>
                        </div>
                    </div>
                </div>
                <BannerOffline />
            </div>
        );
    }

    // ----------------------------------------------------------------
    // RENDERIZADO: Formulario de Registro Apple Liquid Glass
    // ----------------------------------------------------------------
    return (
        <div className="min-h-[100dvh] bg-[#050811] flex flex-col items-center justify-start sm:justify-center p-4 sm:p-6 font-sans relative overflow-x-hidden overflow-y-auto pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2.5rem,calc(1.5rem+env(safe-area-inset-bottom)))]">
            {/* Orbes Líquidos de Fondo */}
            <div className="fixed top-12 left-1/3 w-[500px] h-[500px] bg-brand-500/20 rounded-full blur-[130px] pointer-events-none animate-fluid-orb-1" />
            <div className="fixed bottom-12 -right-20 w-[450px] h-[450px] bg-corp-blue/25 rounded-full blur-[120px] pointer-events-none animate-fluid-orb-2" />

            <div className="w-full max-w-md relative z-10 animate-in fade-in zoom-in-95 duration-500 my-auto">
                {/* Botón flotante para instalar PWA */}
                <div className="flex justify-end mb-3">
                    <BotonInstalarPWA />
                </div>

                <div className="liquid-glass-panel rounded-3xl p-6 sm:p-9 relative">
                    
                    {/* Reflejo especular superior continuo de cristal */}
                    <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-white/50 to-transparent" />

                    {/* Header Institucional */}
                    <div className="text-center mb-6">
                        <div className="inline-flex items-center justify-center p-2.5 bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-white/40 mb-4">
                            <img src={logoOne} alt="ONE Consulting" className="h-9 w-auto object-contain" />
                        </div>

                        <div className="inline-flex items-center gap-1.5 px-3 py-1 liquid-glass-pill rounded-full text-brand-300 text-xs font-semibold mb-2.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-brand-400" />
                            <span>Registro Oficial de Asistencia</span>
                        </div>
                        
                        <h1 className="text-2xl font-bold text-white tracking-tight font-display">
                            Control de Asistencia
                        </h1>
                        <p className="text-slate-400 text-xs mt-1">
                            {eventoInfo?.titulo ? eventoInfo.titulo : 'Completa tus datos para confirmar tu participación.'}
                        </p>
                    </div>

                    {/* Mensaje de Error / Alerta */}
                    {error && (
                        <div className="mb-5 p-3.5 bg-red-950/40 border border-red-500/30 rounded-2xl flex items-start gap-3 text-red-200 text-xs backdrop-blur-xl animate-in fade-in duration-200">
                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                                <p className="font-semibold">Registro no completado</p>
                                <p className="leading-relaxed">{error}</p>
                            </div>
                        </div>
                    )}

                    {/* Formulario */}
                    {(!error || token) && (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            
                            {/* Trampa Honeypot invisible para humanos contra robots automáticos */}
                            <div className="opacity-0 absolute -z-50 pointer-events-none h-0 w-0 overflow-hidden" aria-hidden="true">
                                <label htmlFor="telefono_confirmacion">Confirmación</label>
                                <input
                                    id="telefono_confirmacion"
                                    type="text"
                                    name="telefono_confirmacion"
                                    tabIndex="-1"
                                    autoComplete="off"
                                    value={hpVerificacion}
                                    onChange={(e) => setHpVerificacion(e.target.value)}
                                />
                            </div>

                            {/* 1. Selección de Sesión */}
                            {sesionesActivas.length === 0 ? (
                                <div className="p-5 bg-amber-950/30 border border-amber-500/30 rounded-2xl text-amber-200 text-xs text-center space-y-2 mb-2 backdrop-blur-lg">
                                    <AlertCircle className="w-5 h-5 text-amber-400 mx-auto" />
                                    <p className="font-bold text-white">No hay sesiones abiertas en este momento</p>
                                    <p className="text-slate-300 text-[11px] leading-relaxed">
                                        El facilitador aún no ha habilitado la sesión activa para esta actividad.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => verificarEvento(token)}
                                        className="mt-2 bg-amber-600/30 hover:bg-amber-600 text-white font-semibold py-1.5 px-3.5 rounded-xl border border-amber-500/30 text-xs transition-colors inline-flex items-center gap-1.5"
                                    >
                                        <RotateCcw className="w-3 h-3" />
                                        <span>Comprobar nuevamente</span>
                                    </button>
                                </div>
                            ) : sesionesActivas.length === 1 ? (
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                                        Sesión Activa
                                    </label>
                                    <div className="p-3.5 liquid-glass-input rounded-2xl text-brand-300 font-semibold text-xs flex items-center justify-between border-white/[0.08]">
                                        <span className="flex items-center gap-2">
                                            <Layers className="w-4 h-4 text-brand-400" />
                                            {sesionesActivas[0].nombre_sesion}
                                        </span>
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold liquid-glass-pill text-brand-300">
                                            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
                                            Abierta
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                                        Selecciona la Sesión de Hoy *
                                    </label>
                                    <select
                                        value={sesionSeleccionadaId}
                                        onChange={(e) => {
                                            const nuevaId = e.target.value;
                                            setSesionSeleccionadaId(nuevaId);
                                            setError(null);
                                            const sElegida = eventoInfo?.sesiones?.find(s => String(s.id) === String(nuevaId));
                                            if (sElegida?.fecha) {
                                                try {
                                                    const fStr = String(sElegida.fecha).split('T')[0];
                                                    if (/^\d{4}-\d{2}-\d{2}$/.test(fStr)) {
                                                        setFechaSesion(fStr);
                                                    }
                                                } catch (err) {}
                                            }
                                        }}
                                        required
                                        className="w-full liquid-glass-input text-slate-200 font-medium rounded-2xl px-4 py-3 text-base sm:text-xs focus:outline-none min-h-[44px]"
                                    >
                                        {sesionesActivas.map((s) => {
                                            const yaAsistioLocal = Boolean(asistenciasPrevias[`${token}_${s.id}`]);
                                            return (
                                                <option key={s.id} value={s.id} className="bg-[#0a101d] text-white">
                                                    {s.nombre_sesion} {yaAsistioLocal ? ' (✓ Registrada)' : ' (Abierta)'}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                            )}

                            {/* Fecha de la Sesión */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                                        Fecha de la Sesión *
                                    </label>
                                    {esFechaValida && (
                                        <span className="text-[11px] text-emerald-400 font-medium inline-flex items-center gap-1">
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            Válida
                                        </span>
                                    )}
                                </div>
                                <div className="relative">
                                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    <input
                                        type="date"
                                        required
                                        value={fechaSesion}
                                        onBlur={() => setTocado(prev => ({ ...prev, fecha: true }))}
                                        onChange={(e) => {
                                            setFechaSesion(e.target.value);
                                            if (error) setError(null);
                                        }}
                                        className={`w-full liquid-glass-input rounded-xl pl-10 pr-4 py-3 text-base sm:text-xs text-white placeholder-slate-500 focus:outline-none transition-all min-h-[44px] [color-scheme:dark] ${
                                            tocado.fecha && !esFechaValida ? 'border-red-500/60 ring-1 ring-red-500/30' : ''
                                        }`}
                                    />
                                    {tocado.fecha && !esFechaValida && (
                                        <AlertCircle className="w-4 h-4 text-red-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    )}
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1">
                                    Fecha en que se impartió o se está impartiendo la sesión.
                                </p>
                            </div>

                            {/* Aviso si ya registró esta sesión */}
                            {yaRegistradoEnEsta && (
                                <div className="p-3.5 liquid-glass-pill rounded-2xl text-brand-300 text-xs flex items-center justify-between">
                                    <span className="inline-flex items-center gap-1.5">
                                        <Check className="w-4 h-4 text-brand-400" />
                                        Asistencia ya confirmada en este dispositivo.
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setRegistroExitoso(asistenciasPrevias[`${token}_${sesionSeleccionadaId}`])}
                                        className="font-semibold text-white hover:text-brand-200 underline ml-2 text-[11px]"
                                    >
                                        Ver comprobante
                                    </button>
                                </div>
                            )}

                            {/* Nombre Completo con Validación en Tiempo Real */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                                        Nombre Completo *
                                    </label>
                                    {esNombreValido && (
                                        <span className="text-[11px] text-emerald-400 font-medium inline-flex items-center gap-1">
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            Válido
                                        </span>
                                    )}
                                </div>
                                <div className="relative">
                                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    <input
                                        type="text"
                                        required
                                        value={nombre}
                                        onBlur={() => {
                                            setTocado(prev => ({ ...prev, nombre: true }));
                                            if (nombre && nombre.trim()) {
                                                setNombre(toTitleCase(nombre));
                                            }
                                        }}
                                        onChange={(e) => {
                                            setNombre(e.target.value);
                                            if (error) setError(null);
                                        }}
                                        placeholder="Ej: Carlos Martínez Gómez"
                                        className={`w-full liquid-glass-input rounded-xl pl-10 pr-10 py-3 text-base sm:text-xs text-white placeholder-slate-500 focus:outline-none transition-all min-h-[44px] ${
                                            tocado.nombre && !esNombreValido ? 'border-red-500/60 ring-1 ring-red-500/30' : ''
                                        }`}
                                    />
                                    {tocado.nombre && !esNombreValido && (
                                        <AlertCircle className="w-4 h-4 text-red-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    )}
                                </div>
                                {tocado.nombre && !esNombreValido ? (
                                    <p className="text-[11px] text-red-400 mt-1 flex items-center gap-1">
                                        <span>• Ingresa tu nombre (mínimo 3 letras, no solo números).</span>
                                    </p>
                                ) : esNombreValido && !tieneApellido && (
                                    <p className="text-[11px] text-amber-400/90 mt-1 flex items-center gap-1">
                                        <span>💡 Sugerencia: Recuerda incluir tu apellido para que tu acreditación oficial sea completa.</span>
                                    </p>
                                )}
                            </div>

                            {/* Empresa con Validación en Tiempo Real */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                                        Empresa o Institución *
                                    </label>
                                    {esEmpresaValida && (
                                        <span className="text-[11px] text-emerald-400 font-medium inline-flex items-center gap-1">
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            Válido
                                        </span>
                                    )}
                                </div>
                                <div className="relative">
                                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    <input
                                        type="text"
                                        required
                                        value={empresa}
                                        onBlur={() => setTocado(prev => ({ ...prev, empresa: true }))}
                                        onChange={(e) => {
                                            setEmpresa(e.target.value);
                                            if (error) setError(null);
                                        }}
                                        placeholder="Ej: Empresa XYZ"
                                        className={`w-full liquid-glass-input rounded-xl pl-10 pr-10 py-3 text-base sm:text-xs text-white placeholder-slate-500 focus:outline-none transition-all min-h-[44px] ${
                                            tocado.empresa && !esEmpresaValida ? 'border-red-500/60 ring-1 ring-red-500/30' : ''
                                        }`}
                                    />
                                    {tocado.empresa && !esEmpresaValida && (
                                        <AlertCircle className="w-4 h-4 text-red-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    )}
                                </div>
                                {tocado.empresa && !esEmpresaValida && (
                                    <p className="text-[11px] text-red-400 mt-1 flex items-center gap-1">
                                        <span>• Ingresa el nombre de la empresa u organización (mínimo 2 caracteres).</span>
                                    </p>
                                )}
                            </div>

                            {/* Correo Electrónico con Validación en Tiempo Real y Detector Anti-Typo */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                                        Correo Electrónico *
                                    </label>
                                    {esCorreoValido && (
                                        <span className="text-[11px] text-emerald-400 font-medium inline-flex items-center gap-1">
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            Válido
                                        </span>
                                    )}
                                </div>
                                <div className="relative">
                                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    <input
                                        type="email"
                                        required
                                        value={correo}
                                        onBlur={() => setTocado(prev => ({ ...prev, correo: true }))}
                                        onChange={(e) => {
                                            setCorreo(e.target.value);
                                            if (error) setError(null);
                                        }}
                                        placeholder="Ej: carlos.martinez@empresa.com"
                                        className={`w-full liquid-glass-input rounded-xl pl-10 pr-10 py-3 text-base sm:text-xs text-white placeholder-slate-500 focus:outline-none transition-all min-h-[44px] ${
                                            tocado.correo && !esCorreoValido ? 'border-red-500/60 ring-1 ring-red-500/30' : ''
                                        }`}
                                    />
                                    {tocado.correo && !esCorreoValido && (
                                        <AlertCircle className="w-4 h-4 text-red-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    )}
                                </div>

                                {/* Detector y sugerencia de dominios tipográficos */}
                                {sugerenciaCorreo && (
                                    <div className="mt-1.5 p-2 bg-amber-950/40 border border-amber-500/30 rounded-xl flex items-center justify-between gap-2 text-xs text-amber-200 animate-in fade-in duration-200">
                                        <span className="text-[11px] truncate">
                                            ¿Quisiste escribir <strong>{sugerenciaCorreo}</strong>?
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                hapticTap();
                                                setCorreo(sugerenciaCorreo);
                                            }}
                                            className="shrink-0 bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 font-semibold px-2.5 py-1 rounded-lg text-[11px] transition-colors"
                                        >
                                            Corregir
                                        </button>
                                    </div>
                                )}

                                {tocado.correo && !esCorreoValido && (
                                    <p className="text-[11px] text-red-400 mt-1 flex items-center gap-1">
                                        <span>• Ingresa un correo electrónico válido (ejemplo@empresa.com).</span>
                                    </p>
                                )}
                            </div>

                            {/* Modalidad (Presencial / Virtual) */}
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                                    Modalidad de Participación *
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => { hapticTap(); setModalidad('Presencial'); }}
                                        className={`py-2.5 px-3.5 rounded-xl text-xs font-semibold transition-all inline-flex items-center justify-center gap-2 min-h-[44px] ${
                                            modalidad === 'Presencial'
                                                ? 'liquid-btn-primary text-white shadow-lg shadow-brand-500/25'
                                                : 'liquid-glass-pill text-slate-300 hover:bg-white/10'
                                        }`}
                                    >
                                        <Building2 className="w-4 h-4" />
                                        <span>Presencial</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => { hapticTap(); setModalidad('Virtual'); }}
                                        className={`py-2.5 px-3.5 rounded-xl text-xs font-semibold transition-all inline-flex items-center justify-center gap-2 min-h-[44px] ${
                                            modalidad === 'Virtual'
                                                ? 'liquid-btn-primary text-white shadow-lg shadow-brand-500/25'
                                                : 'liquid-glass-pill text-slate-300 hover:bg-white/10'
                                        }`}
                                    >
                                        <Laptop className="w-4 h-4" />
                                        <span>Virtual</span>
                                    </button>
                                </div>
                            </div>

                            {/* Instructor / Facilitador (Obligatorio) */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                                        Instructor / Facilitador *
                                    </label>
                                    {esInstructorValido && (
                                        <span className="text-[11px] text-emerald-400 font-medium inline-flex items-center gap-1">
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            Válido
                                        </span>
                                    )}
                                </div>
                                <div className="relative">
                                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    <input
                                        type="text"
                                        required
                                        value={instructor}
                                        onBlur={() => {
                                            setTocado(prev => ({ ...prev, instructor: true }));
                                            if (instructor && instructor.trim()) {
                                                setInstructor(toTitleCase(instructor));
                                            }
                                        }}
                                        onChange={(e) => {
                                            setInstructor(e.target.value);
                                            if (error) setError(null);
                                        }}
                                        placeholder="Ej: Ing. Roberto Méndez / Lic. Ana Gómez"
                                        className={`w-full liquid-glass-input rounded-xl pl-10 pr-10 py-3 text-base sm:text-xs text-white placeholder-slate-500 focus:outline-none transition-all min-h-[44px] ${
                                            tocado.instructor && !esInstructorValido ? 'border-red-500/60 ring-1 ring-red-500/30' : ''
                                        }`}
                                    />
                                    {tocado.instructor && !esInstructorValido && (
                                        <AlertCircle className="w-4 h-4 text-red-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    )}
                                </div>
                                {tocado.instructor && !esInstructorValido && (
                                    <p className="text-[11px] text-red-400 mt-1 flex items-center gap-1">
                                        <span>• Ingresa el nombre del instructor (mínimo 3 letras, no solo números).</span>
                                    </p>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={submitting || !token || !formularioValido}
                                className="w-full mt-4 liquid-btn-primary text-white font-semibold py-3.5 px-4 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-xs uppercase tracking-wider min-h-[48px] transition-all"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                                        <span>Confirmando Asistencia...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Confirmar mi Asistencia</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </form>
                    )}


                    <div className="mt-6 pt-5 border-t border-white/[0.08] text-center space-y-2.5">
                        <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-brand-400" />
                            <span>ONE Consulting • Control de Acreditación Oficial</span>
                        </p>
                        {onIrAdmin && (
                            <button
                                type="button"
                                onClick={() => { hapticTap(); onIrAdmin(); }}
                                className="text-[11px] text-brand-300 hover:text-brand-200 transition-colors font-medium inline-flex items-center gap-1 min-h-[40px]"
                            >
                                <span>¿Eres Administrador? Iniciar Sesión</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
            <BannerOffline />
        </div>
    );
}
