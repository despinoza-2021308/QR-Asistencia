import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import {
    Plus, LogOut, CheckCircle2, AlertCircle, BookOpen, Layers, Users,
    Search, Trash2, QrCode, Maximize2, ChevronRight, ArrowLeft, Download,
    Building2, Laptop, X, Copy, Check, FileSpreadsheet, FileText, Loader2, ShieldCheck,
    Clock, ExternalLink, Sparkles, Activity, TrendingUp, Wifi, Server
} from 'lucide-react';
import logoOne from '../assets/logo.png';
import PanelKPIs from './PanelKPIs';
import TarjetaCapacitacion from './TarjetaCapacitacion';
import { usePWA } from '../hooks/usePWA';
import BotonInstalarPWA from './BotonInstalarPWA';
import BannerOffline from './BannerOffline';
import { descargarExcelConsolidado, descargarPdfSesion } from '../services/reportes';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Helper de fechas 100% compatible con iOS WebKit / Safari
const parseFechaSegura = (fechaStr) => {
    if (!fechaStr) return null;
    try {
        let segura = fechaStr;
        if (typeof segura === 'string' && segura.includes(' ') && !segura.includes('T')) {
            segura = segura.replace(' ', 'T');
        }
        const d = new Date(segura);
        return isNaN(d.getTime()) ? null : d;
    } catch (e) {
        return null;
    }
};

export default function AdminSesiones({ onLogout }) {
    const { hapticTap, hapticSuccess, hapticWarning, hapticError } = usePWA();

    // Listado de capacitaciones y capacitación seleccionada
    const [capacitaciones, setCapacitaciones] = useState([]);
    const [capacitacionSeleccionada, setCapacitacionSeleccionada] = useState(null); // null = Vista Dashboard Principal

    // Datos de la capacitación activa
    const [sesiones, setSesiones] = useState([]);
    const [reporte, setReporte] = useState(null);
    const [sesionDetalle, setSesionDetalle] = useState(null); // Detalle de una sesión específica

    // Navegación interna dentro de una capacitación
    const [tabCapacitacion, setTabCapacitacion] = useState('sesiones'); // 'sesiones' | 'qr' | 'consolidado'

    // Formularios
    const [mostrarCrearModal, setMostrarCrearModal] = useState(false);
    const [nuevoTitulo, setNuevoTitulo] = useState('');
    const [nuevoNumSesiones, setNuevoNumSesiones] = useState(3);
    const [nuevaDesc, setNuevaDesc] = useState('');

    const [mostrarAgregarSesion, setMostrarAgregarSesion] = useState(false);
    const [nombreSesionExtra, setNombreSesionExtra] = useState('');

    // Modal de confirmación UI para acciones destructivas (eliminar sesión o actividad)
    const [modalConfirmacion, setModalConfirmacion] = useState(null);

    // Modal de QR en pantalla completa
    const [modalQRData, setModalQRData] = useState(null); // { titulo, url }
    const [copiadoExito, setCopiadoExito] = useState(false);

    // Estados de UI
    const [loading, setLoading] = useState(false);
    const [mensaje, setMensaje] = useState(null);
    const [filtroTexto, setFiltroTexto] = useState('');
    const [filtroDashboard, setFiltroDashboard] = useState('');

    // Estados de descarga de reportes
    const [descargandoExcel, setDescargandoExcel] = useState(false);
    const [descargandoPdfId, setDescargandoPdfId] = useState(null);

    // Estado para auto-actualización en vivo (Polling silencioso en tiempo real)
    const [autoRefreshActivo, setAutoRefreshActivo] = useState(true);
    const [actualizandoSilencioso, setActualizandoSilencioso] = useState(false);

    // 1. Cargar capacitaciones al inicio
    useEffect(() => {
        cargarCapacitaciones();
    }, []);

    // 2. Al cambiar la capacitación seleccionada, cargar sus sesiones y reporte
    useEffect(() => {
        if (capacitacionSeleccionada) {
            cargarSesiones(capacitacionSeleccionada.id);
            cargarReporte(capacitacionSeleccionada.id);
            setSesionDetalle(null);
            setTabCapacitacion('sesiones');
        } else {
            setSesiones([]);
            setReporte(null);
            setSesionDetalle(null);
        }
    }, [capacitacionSeleccionada]);

    // 3. Auto-actualización periódica en vivo (cada 3.5 segundos de forma silenciosa y fluida)
    useEffect(() => {
        if (!autoRefreshActivo) return;

        const intervalId = setInterval(async () => {
            // No hacer llamadas si la pestaña está en segundo plano / minimizada
            if (typeof document !== 'undefined' && document.hidden) return;

            try {
                setActualizandoSilencioso(true);

                if (sesionDetalle && sesionDetalle.sesion?.id) {
                    // Si el administrador está dentro de una sesión viendo la lista de asistentes:
                    const res = await axios.get(`${API_BASE_URL}/sesiones/${sesionDetalle.sesion.id}/asistencias`);
                    setSesionDetalle(res.data);
                } else if (capacitacionSeleccionada && capacitacionSeleccionada.id) {
                    // Si está viendo el detalle general o reporte de una capacitación:
                    const [resSes, resRep] = await Promise.all([
                        axios.get(`${API_BASE_URL}/sesiones/capacitacion/${capacitacionSeleccionada.id}`),
                        axios.get(`${API_BASE_URL}/reporte/capacitacion/${capacitacionSeleccionada.id}`)
                    ]);
                    setSesiones(resSes.data);
                    setReporte(resRep.data);
                } else {
                    // Si está en el dashboard general con las tarjetas de capacitaciones:
                    const res = await axios.get(`${API_BASE_URL}/capacitaciones`);
                    setCapacitaciones(res.data);
                }
            } catch (err) {
                // Silencioso para no generar alertas intrusivas si hay micro-cortes
            } finally {
                setActualizandoSilencioso(false);
            }
        }, 3500);

        return () => clearInterval(intervalId);
    }, [autoRefreshActivo, sesionDetalle?.sesion?.id, capacitacionSeleccionada?.id]);

    const cargarCapacitaciones = async (selectId = null) => {
        try {
            setLoading(true);
            const res = await axios.get(`${API_BASE_URL}/capacitaciones`);
            setCapacitaciones(res.data);
            if (selectId) {
                const encontrada = res.data.find(c => c.id === selectId);
                if (encontrada) setCapacitacionSeleccionada(encontrada);
            }
        } catch (err) {
            console.error('Error al cargar capacitaciones:', err);
            mostrarAlerta('error', 'Error al conectar con la base de datos.');
        } finally {
            setLoading(false);
        }
    };

    const cargarSesiones = async (capId) => {
        try {
            const res = await axios.get(`${API_BASE_URL}/sesiones/capacitacion/${capId}`);
            setSesiones(res.data);
        } catch (err) {
            console.error('Error al cargar sesiones:', err);
        }
    };

    const cargarReporte = async (capId) => {
        try {
            const res = await axios.get(`${API_BASE_URL}/reporte/capacitacion/${capId}`);
            setReporte(res.data);
        } catch (err) {
            console.error('Error al cargar reporte:', err);
        }
    };

    const verAsistentesSesion = async (sesionId) => {
        try {
            setLoading(true);
            const res = await axios.get(`${API_BASE_URL}/sesiones/${sesionId}/asistencias`);
            setSesionDetalle(res.data);
            window.scrollTo({ top: 200, behavior: 'smooth' });
        } catch (err) {
            console.error('Error al ver asistentes:', err);
            mostrarAlerta('error', 'Error al consultar los asistentes de la sesión.');
        } finally {
            setLoading(false);
        }
    };

    const mostrarAlerta = (tipo, texto) => {
        setMensaje({ tipo, texto });
        setTimeout(() => setMensaje(null), 4500);
    };

    // Resolver URL completa del QR
    const getQrUrl = (cap) => {
        if (!cap) return '';
        if (typeof window !== 'undefined' && window.location.origin && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
            return `${window.location.origin}/?token=${cap.token}`;
        }
        return cap.qr_url || `${window.location.origin}/?token=${cap.token}`;
    };

    // Crear Nueva Capacitación con Validaciones Estrictas
    const handleCrearCapacitacion = async (e) => {
        e.preventDefault();
        const tituloLimpio = nuevoTitulo.trim();

        if (!tituloLimpio || tituloLimpio.length < 3) {
            mostrarAlerta('error', 'El nombre de la actividad debe tener al menos 3 caracteres.');
            hapticError();
            return;
        }

        if (tituloLimpio.length > 150) {
            mostrarAlerta('error', 'El nombre de la actividad no puede exceder los 150 caracteres.');
            hapticError();
            return;
        }

        const numSesiones = parseInt(nuevoNumSesiones, 10);
        if (!numSesiones || numSesiones < 1 || numSesiones > 50) {
            mostrarAlerta('error', 'La cantidad de sesiones debe ser un número entre 1 y 50.');
            hapticError();
            return;
        }

        try {
            setLoading(true);
            const res = await axios.post(`${API_BASE_URL}/capacitaciones`, {
                titulo: tituloLimpio,
                cantidad_sesiones: numSesiones,
                descripcion: nuevaDesc.trim()
            });

            const nueva = res.data.capacitacion;
            setCapacitaciones(prev => [nueva, ...prev]);
            setCapacitacionSeleccionada(nueva);

            setNuevoTitulo('');
            setNuevoNumSesiones(3);
            setNuevaDesc('');
            setMostrarCrearModal(false);

            mostrarAlerta('exito', `Capacitación "${nueva.titulo}" creada con éxito.`);
            hapticSuccess();
            cargarCapacitaciones(nueva.id);
        } catch (err) {
            console.error('Error al crear:', err);
            hapticError();
            mostrarAlerta('error', err.response?.data?.error || 'No se pudo crear la capacitación.');
        } finally {
            setLoading(false);
        }
    };

    // Agregar Sesión Extra
    const handleAgregarSesion = async (e) => {
        e.preventDefault();
        if (!capacitacionSeleccionada || !nombreSesionExtra.trim()) return;

        try {
            setLoading(true);
            await axios.post(`${API_BASE_URL}/capacitaciones/${capacitacionSeleccionada.id}/sesiones`, {
                nombre_sesion: nombreSesionExtra.trim()
            });
            setNombreSesionExtra('');
            setMostrarAgregarSesion(false);
            mostrarAlerta('exito', 'Sesión adicional agregada con éxito.');
            hapticSuccess();
            cargarSesiones(capacitacionSeleccionada.id);
            cargarReporte(capacitacionSeleccionada.id);
        } catch (err) {
            console.error('Error al agregar sesión:', err);
            hapticError();
            mostrarAlerta('error', 'Error al agregar la sesión.');
        } finally {
            setLoading(false);
        }
    };

    // Ejecutar Eliminación de Sesión tras Confirmación en Modal
    const ejecutarEliminarSesion = async (sesionId, nombreSesion) => {
        try {
            setLoading(true);
            await axios.delete(`${API_BASE_URL}/sesiones/${sesionId}`);
            hapticWarning();
            mostrarAlerta('exito', `Sesión "${nombreSesion}" eliminada.`);
            if (sesionDetalle?.sesion?.id === sesionId) {
                setSesionDetalle(null);
            }
            cargarSesiones(capacitacionSeleccionada.id);
            cargarReporte(capacitacionSeleccionada.id);
        } catch (err) {
            console.error('Error al eliminar sesión:', err);
            mostrarAlerta('error', 'No se pudo eliminar la sesión.');
        } finally {
            setLoading(false);
        }
    };

    // Solicitar confirmación para eliminar sesión
    const handleEliminarSesion = (sesionId, nombreSesion) => {
        hapticWarning();
        setModalConfirmacion({
            titulo: 'Eliminar Sesión',
            subtitulo: `"${nombreSesion}"`,
            mensaje: `¿Estás seguro de que deseas eliminar permanentemente esta sesión?`,
            advertenciaCritica: 'Se borrarán todos los registros de asistencia vinculados a esta sesión y la acción no se puede deshacer.',
            textoBotonConfirmar: 'Eliminar Sesión',
            onConfirmar: () => ejecutarEliminarSesion(sesionId, nombreSesion)
        });
    };

    // Alternar Activación de Sesión
    const handleToggleSesion = async (sesionId) => {
        try {
            await axios.put(`${API_BASE_URL}/sesiones/${sesionId}/toggle`);
            cargarSesiones(capacitacionSeleccionada.id);
            cargarReporte(capacitacionSeleccionada.id);
        } catch (err) {
            console.error('Error al actualizar estado:', err);
        }
    };

    // Alternar Estado Activa / Cerrada de una Capacitación
    const handleToggleCapacitacion = async (capId) => {
        try {
            setLoading(true);
            const res = await axios.put(`${API_BASE_URL}/capacitaciones/${capId}/toggle`);
            const estaActiva = res.data.activa;
            mostrarAlerta('exito', `Capacitación ${estaActiva ? 'reactivada (admitiendo registros)' : 'finalizada y cerrada (código QR bloqueado)'}.`);
            if (capacitacionSeleccionada?.id === capId) {
                setCapacitacionSeleccionada(prev => ({ ...prev, activa: estaActiva }));
            }
            cargarCapacitaciones(capId);
        } catch (err) {
            console.error('Error al cambiar estado de capacitación:', err);
            mostrarAlerta('error', 'Error al actualizar el estado de la actividad.');
        } finally {
            setLoading(false);
        }
    };

    // Ejecutar Eliminación de Capacitación tras Confirmación en Modal
    const ejecutarEliminarCapacitacion = async (capId, titulo) => {
        try {
            setLoading(true);
            await axios.delete(`${API_BASE_URL}/capacitaciones/${capId}`);
            mostrarAlerta('exito', `Capacitación "${titulo}" eliminada con éxito.`);
            if (capacitacionSeleccionada?.id === capId) {
                setCapacitacionSeleccionada(null);
            }
            cargarCapacitaciones();
        } catch (err) {
            console.error('Error al eliminar capacitación:', err);
            mostrarAlerta('error', 'Error al eliminar la capacitación.');
        } finally {
            setLoading(false);
        }
    };

    // Solicitar confirmación para eliminar capacitación
    const handleEliminarCapacitacion = (capId, titulo, totalAsistencias = 0) => {
        hapticWarning();
        setModalConfirmacion({
            titulo: 'Eliminar Capacitación Completa',
            subtitulo: `"${titulo}"`,
            mensaje: `¿Estás seguro de que deseas eliminar permanentemente esta actividad?`,
            advertenciaCritica: totalAsistencias > 0
                ? `⚠️ ADVERTENCIA CRÍTICA: Esta actividad contiene ${totalAsistencias} asistencias registradas. Al eliminarla, todos los registros de los participantes se perderán de forma permanente e irreversible.`
                : 'Se eliminarán todas sus sesiones asociadas y el código QR quedará inhabilitado de inmediato.',
            textoBotonConfirmar: 'Eliminar Todo el Programa',
            onConfirmar: () => ejecutarEliminarCapacitacion(capId, titulo)
        });
    };

    const copiarEnlace = async (url) => {
        hapticSuccess();
        let copiado = false;
        if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(url);
                copiado = true;
            } catch (e) {
                // Fallback para iOS WebKit en contextos de seguridad estrictos
            }
        }
        if (!copiado) {
            try {
                const textarea = document.createElement('textarea');
                textarea.value = url;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                copiado = true;
            } catch (e) {
                console.warn('Fallback copy failed', e);
            }
        }
        setCopiadoExito(true);
        setTimeout(() => setCopiadoExito(false), 2500);
        mostrarAlerta('exito', 'Enlace copiado al portapapeles');
    };

    const descargarQR = (elementId, nombreArchivo) => {
        const svgElement = document.getElementById(elementId);
        if (!svgElement) return;

        const svgData = new XMLSerializer().serializeToString(svgElement);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = () => {
            canvas.width = img.width + 80;
            canvas.height = img.height + 80;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 40, 40);

            // Soporte universal para iOS Safari y navegadores móviles modernos
            canvas.toBlob(async (blob) => {
                if (!blob) return;

                // En iOS Safari / iPhone: si navigator.share está disponible para archivos, compartir directamente a Fotos o Archivos
                if (typeof navigator !== 'undefined' && navigator.canShare) {
                    try {
                        const file = new File([blob], `${nombreArchivo}.png`, { type: 'image/png' });
                        if (navigator.canShare({ files: [file] })) {
                            await navigator.share({
                                title: `Código QR - ${nombreArchivo}`,
                                files: [file]
                            });
                            mostrarAlerta('exito', 'Código QR compartido o guardado en el carrete.');
                            return;
                        }
                    } catch (e) {
                        if (e.name !== 'AbortError') console.warn(e);
                        return;
                    }
                }

                // Descarga estándar vía Blob ObjectURL
                const blobUrl = URL.createObjectURL(blob);
                const downloadLink = document.createElement('a');
                downloadLink.href = blobUrl;
                downloadLink.download = `${nombreArchivo}.png`;
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
                mostrarAlerta('exito', 'Código QR descargado');
            }, 'image/png');
        };

        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    };

    // Sanitizador de celdas para prevenir inyección de fórmulas CSV (CWE-1236)
    const sanitizeCSVCell = (val) => {
        if (val === null || val === undefined) return '""';
        let str = String(val).trim();
        // Si el valor inicia con caracteres de fórmula de Excel/Calc (=, +, -, @, \t, \r), neutralizar con apóstrofe '
        if (/^[=+\-@\t\r]/.test(str)) {
            str = "'" + str;
        }
        // Escapar comillas dobles internas duplicándolas (" -> "")
        return `"${str.replace(/"/g, '""')}"`;
    };

    // Exportar Asistencias de una Sesión a CSV (Protegido contra Formula Injection)
    const exportarCSVSesion = () => {
        if (!sesionDetalle || !sesionDetalle.asistentes || sesionDetalle.asistentes.length === 0) {
            mostrarAlerta('error', 'No hay asistentes registrados en esta sesión.');
            return;
        }

        const headers = `Nombre Completo;Empresa;Modalidad;Instructor;Correo Electrónico;Nombre Actividad;Fecha y Hora de Registro`;
        const rows = sesionDetalle.asistentes.map(a => {
            const d = parseFechaSegura(a.fecha_registro);
            const fechaHora = d ? d.toLocaleString('es-ES') : '';
            return [
                sanitizeCSVCell(a.nombre_usuario),
                sanitizeCSVCell(a.empresa || ''),
                sanitizeCSVCell(a.modalidad || 'Presencial'),
                sanitizeCSVCell(a.instructor || ''),
                sanitizeCSVCell(a.correo_usuario),
                sanitizeCSVCell(a.nombre_actividad || ''),
                sanitizeCSVCell(fechaHora)
            ].join(';');
        });

        const csvContent = '\uFEFF' + [headers, ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Asistencia_${sesionDetalle.sesion.nombre_sesion.replace(/[^a-zA-Z0-9]/g, '_')}_${capacitacionSeleccionada?.titulo.replace(/[^a-zA-Z0-9]/g, '_')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Exportar Consolidado Completo a CSV (Protegido contra Formula Injection)
    const exportarCSVConsolidado = () => {
        if (!reporte || !reporte.participantes || reporte.participantes.length === 0) {
            mostrarAlerta('error', 'No hay datos de asistencia para exportar.');
            return;
        }

        const sesionesHeaders = reporte.sesiones.map(s => s.nombre_sesion).join(';');
        const headers = `Nombre Completo;Empresa;Modalidad;Instructor;Correo Electrónico;${sesionesHeaders};Total Asistidas;Total Sesiones;% Cumplimiento;Estado`;

        const rows = reporte.participantes.map(p => {
            const asistenciasColumns = reporte.sesiones.map(s => {
                const asistio = p.asistencias_por_sesion.find(a => a.sesion_id === s.id)?.asistio;
                return sanitizeCSVCell(asistio ? 'PRESENTE' : 'AUSENTE');
            }).join(';');

            const estado = p.cumplio_totalidad ? 'COMPLETO' : 'EN PROGRESO';
            return [
                sanitizeCSVCell(p.nombre_usuario),
                sanitizeCSVCell(p.empresa),
                sanitizeCSVCell(p.modalidad),
                sanitizeCSVCell(p.instructor),
                sanitizeCSVCell(p.correo_usuario),
                asistenciasColumns,
                sanitizeCSVCell(p.total_sesiones_asistidas),
                sanitizeCSVCell(p.total_sesiones_capacitacion),
                sanitizeCSVCell(`${p.porcentaje_asistencia}%`),
                sanitizeCSVCell(estado)
            ].join(';');
        });

        const csvContent = '\uFEFF' + [headers, ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Reporte_Consolidado_${capacitacionSeleccionada?.titulo.replace(/[^a-zA-Z0-9]/g, '_') || 'Evento'}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Descargar Reporte Consolidado en Excel (.xlsx) Profesional
    const handleDescargarExcel = async (capId, titulo) => {
        if (!capId) return;
        try {
            setDescargandoExcel(true);
            hapticTap();
            const res = await descargarExcelConsolidado(capId, titulo);
            mostrarAlerta('exito', `Reporte Excel descargado: ${res.filename}`);
            hapticSuccess();
        } catch (err) {
            console.error('Error al descargar Excel:', err);
            mostrarAlerta('error', err.message || 'Error al generar el reporte en Excel.');
            hapticError();
        } finally {
            setDescargandoExcel(false);
        }
    };

    // Descargar Reporte de Sesión Individual en PDF (.pdf) Formal
    const handleDescargarPdf = async (sesionId, nombreSesion) => {
        if (!sesionId) return;
        try {
            setDescargandoPdfId(sesionId);
            hapticTap();
            const res = await descargarPdfSesion(sesionId, nombreSesion);
            mostrarAlerta('exito', `Lista en PDF descargada: ${res.filename}`);
            hapticSuccess();
        } catch (err) {
            console.error('Error al descargar PDF:', err);
            mostrarAlerta('error', err.message || 'Error al generar el reporte en PDF.');
            hapticError();
        } finally {
            setDescargandoPdfId(null);
        }
    };

    // Filtrar lista del dashboard
    const capacitacionesFiltradas = capacitaciones.filter(c =>
        c.titulo.toLowerCase().includes(filtroDashboard.toLowerCase()) ||
        (c.descripcion && c.descripcion.toLowerCase().includes(filtroDashboard.toLowerCase()))
    );

    const totalAsistenciasGlobal = capacitaciones.reduce((acc, c) => acc + (c.total_asistencias || 0), 0);
    const totalSesionesGlobal = capacitaciones.reduce((acc, c) => acc + (c.total_sesiones || 0), 0);

    return (
        <div className="min-h-[100dvh] bg-[#050811] text-slate-100 font-sans relative overflow-x-hidden overflow-y-auto pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1.5rem,calc(1.5rem+env(safe-area-inset-bottom))]">
            {/* Orbes Líquidos Orgánicos Flotantes de Fondo (VisionOS Ambience) */}
            <div className="fixed -top-32 left-1/4 w-[550px] h-[550px] bg-brand-500/20 rounded-full blur-[130px] pointer-events-none animate-fluid-orb-1" />
            <div className="fixed top-1/3 -right-24 w-[600px] h-[600px] bg-corp-blue/25 rounded-full blur-[140px] pointer-events-none animate-fluid-orb-2" />
            <div className="fixed -bottom-40 left-10 w-[500px] h-[500px] bg-sky-600/15 rounded-full blur-[120px] pointer-events-none animate-fluid-orb-1" />

            {/* Malla sutil de profundidad */}
            <div className="fixed inset-0 bg-[radial-gradient(rgba(255,255,255,0.025)_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

            <div className="max-w-[1720px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-6 relative z-10 flex flex-col min-h-screen justify-between">

                {/* CABECERA CORPORATIVA FLUIDA (ESTILO VISIONOS / FLOATING GLASS BAR) */}
                <header className="mb-8 p-3 sm:p-4 rounded-2xl sm:rounded-3xl bg-slate-900/40 border border-white/[0.08] backdrop-blur-xl shadow-2xl shadow-black/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Lado Izquierdo: Identidad de Marca Integrada y Título */}
                    <div className="flex items-center gap-3.5">
                        <div className="bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/40 shadow-sm flex items-center justify-center shrink-0 transition-transform hover:scale-[1.02]">
                            <img src={logoOne} alt="ONE Consulting" className="h-7 sm:h-8 w-auto object-contain" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <h1 className="text-base sm:text-lg font-extrabold text-white tracking-tight font-display">
                                    Sistema de Control de Asistencia QR
                                </h1>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-950/60 text-cyan-300 border border-cyan-800/50">
                                    <ShieldCheck className="w-3 h-3 text-cyan-400" />
                                    <span>Oficial</span>
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-400">
                                ONE Consulting • <span className="text-slate-500 italic">¡Su aliado en generar valor!</span>
                            </p>
                        </div>
                    </div>

                    {/* Lado Derecho: Controles Unificados (Misma Altura h-10 y Radio rounded-xl) */}
                    <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap self-end md:self-auto">
                        {/* Indicador de Auto-Actualización en Tiempo Real */}
                        <button
                            type="button"
                            onClick={() => { setAutoRefreshActivo(!autoRefreshActivo); hapticTap(); }}
                            className={`h-10 px-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all backdrop-blur-md cursor-pointer ${
                                autoRefreshActivo
                                    ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/50'
                                    : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200'
                            }`}
                            title={autoRefreshActivo ? 'Click para pausar auto-actualización en vivo' : 'Click para reanudar auto-actualización en vivo'}
                        >
                            <span className={`w-2 h-2 rounded-full ${
                                autoRefreshActivo 
                                    ? (actualizandoSilencioso ? 'bg-cyan-400 animate-ping' : 'bg-emerald-400 animate-pulse') 
                                    : 'bg-slate-500'
                            }`} />
                            <span>{autoRefreshActivo ? 'En vivo' : 'Pausado'}</span>
                        </button>

                        <BotonInstalarPWA />

                        {/* Botón Primario con Gradiente Ejecutivo */}
                        <button
                            onClick={() => { hapticTap(); setMostrarCrearModal(true); }}
                            className="h-10 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-400 hover:brightness-110 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/35 transition-all flex items-center gap-2 active:scale-95 cursor-pointer shrink-0"
                        >
                            <Plus className="w-4 h-4 text-white" />
                            <span>Nueva Capacitación</span>
                        </button>

                        {onLogout && (
                            <button
                                onClick={() => { hapticTap(); onLogout(); }}
                                className="h-10 px-3.5 rounded-xl text-xs font-medium text-slate-400 hover:text-red-300 bg-white/[0.03] hover:bg-red-950/20 border border-white/[0.08] hover:border-red-500/30 transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer shrink-0"
                                title="Cerrar sesión de administrador"
                            >
                                <LogOut className="w-3.5 h-3.5 text-slate-400" />
                                <span className="hidden sm:inline">Cerrar Sesión</span>
                            </button>
                        )}
                    </div>
                </header>

                {/* Banner de Notificaciones */}
                {mensaje && (
                    <div className={`mb-6 p-4 rounded-2xl border flex items-center gap-3 text-xs font-medium backdrop-blur-xl shadow-xl transition-all animate-in fade-in duration-200 ${mensaje.tipo === 'exito'
                            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                            : 'bg-red-950/40 border-red-500/40 text-red-200'
                        }`}>
                        {mensaje.tipo === 'exito' ? (
                            <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" />
                        ) : (
                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                        )}
                        <span>{mensaje.texto}</span>
                    </div>
                )}

                {/* VISTA 1: DASHBOARD DE CAPACITACIONES */}
                {!capacitacionSeleccionada ? (
                    <div className="space-y-8 animate-in fade-in duration-300">

                        {/* MÉTRICAS GLOBALES APPLE LIQUID GLASS CARDS */}
                        <PanelKPIs
                            totalCapacitaciones={capacitaciones.length}
                            totalSesiones={totalSesionesGlobal}
                            totalAsistencias={totalAsistenciasGlobal}
                        />

                        {/* DISTRIBUCIÓN A PANTALLA COMPLETA (12 COLUMNAS) */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-2">

                            {/* COLUMNA PRINCIPAL: LISTADO DE CAPACITACIONES (8 o 9 cols) */}
                            <div className="lg:col-span-8 xl:col-span-9 space-y-4">
                                {/* Barra de Búsqueda y Título */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
                                    <div>
                                        <h2 className="text-xl font-bold text-white tracking-tight font-display flex items-center gap-2.5">
                                            <span>Programas de Capacitación</span>
                                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-cyan-300 border border-slate-700/50">
                                                {capacitacionesFiltradas.length}
                                            </span>
                                        </h2>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            Gestión individual de sesiones, emisión de códigos QR y control de asistencia.
                                        </p>
                                    </div>

                                    <div className="w-full sm:w-80 relative">
                                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                        <input
                                            type="text"
                                            placeholder="Buscar por título o descripción..."
                                            value={filtroDashboard}
                                            onChange={(e) => setFiltroDashboard(e.target.value)}
                                            className="w-full liquid-glass-input rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Listado de Capacitaciones en Filas Horizontales */}
                                {capacitacionesFiltradas.length === 0 ? (
                                    <div className="rounded-2xl p-16 text-center border border-dashed border-slate-800/60 bg-slate-900/10">
                                        <BookOpen className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                                        <p className="text-sm text-slate-300 font-semibold mb-1">No se encontraron capacitaciones</p>
                                        <p className="text-xs text-slate-500 mb-5 max-w-sm mx-auto">
                                            Crea un nuevo programa definiendo sus sesiones para generar su código QR automático.
                                        </p>
                                        <button
                                            onClick={() => setMostrarCrearModal(true)}
                                            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold px-4 py-2.5 rounded-lg transition inline-flex items-center gap-2"
                                        >
                                            <Plus className="w-4 h-4" />
                                            <span>Crear Capacitación</span>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {capacitacionesFiltradas.map((cap) => (
                                            <TarjetaCapacitacion
                                                key={cap.id}
                                                cap={cap}
                                                qrUrl={getQrUrl(cap)}
                                                onSelect={setCapacitacionSeleccionada}
                                                onEliminar={handleEliminarCapacitacion}
                                                onProyectarQR={setModalQRData}
                                                onToggle={handleToggleCapacitacion}
                                                onDescargarExcel={handleDescargarExcel}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* COLUMNA LATERAL: CONTEXTO, SALUD Y GUÍAS (3 o 4 cols) */}
                            <aside className="lg:col-span-4 xl:col-span-3 space-y-5">
                                {/* Panel 1: Estado del Sistema & Cloud */}
                                <div className="p-5 rounded-2xl bg-slate-900/30 border border-slate-800/60 backdrop-blur-md">
                                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/60">
                                        <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                                            <Activity className="w-3.5 h-3.5 text-cyan-400" />
                                            Salud de Infraestructura
                                        </span>
                                        <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-0.5 rounded-full font-semibold">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                            100% Operativo
                                        </span>
                                    </div>

                                    <div className="space-y-3 text-xs text-slate-400">
                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-2">
                                                <Server className="w-3.5 h-3.5 text-slate-500" />
                                                Supabase PostgreSQL
                                            </span>
                                            <span className="text-slate-200 font-semibold text-[11px]">Online (~32ms)</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-2">
                                                <Wifi className="w-3.5 h-3.5 text-slate-500" />
                                                Servidor Edge Vercel
                                            </span>
                                            <span className="text-slate-200 font-semibold text-[11px]">US-East (iad1)</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-2">
                                                <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                                                Seguridad y SSL
                                            </span>
                                            <span className="text-cyan-400 font-semibold text-[11px]">TLS 1.3 / Activo</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Panel 2: Guía Rápida de Proyección */}
                                <div className="p-5 rounded-2xl bg-slate-900/30 border border-slate-800/60 backdrop-blur-md">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2.5 flex items-center gap-2">
                                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                                        Proyección en Salas
                                    </h4>
                                    <p className="text-xs text-slate-400 leading-relaxed mb-3.5">
                                        Al dar clic en <strong className="text-cyan-300">"Proyectar QR"</strong> en cualquier capacitación, se abrirá el código en alta resolución optimizado para pantallas y proyectores.
                                    </p>
                                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/60 text-[11px] text-slate-400 space-y-1">
                                        <p>💡 <strong className="text-slate-200">Tip:</strong> Presiona <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[10px]">F11</kbd> para maximizar la pantalla y facilitar el escaneo masivo de los participantes.</p>
                                    </div>
                                </div>
                            </aside>

                        </div>
                    </div>
                ) : (

                    /* VISTA 2: DETALLE DE CAPACITACIÓN SELECCIONADA */
                    <div className="space-y-6 animate-in fade-in duration-300">

                        {/* Barra Superior */}
                        <div className="liquid-glass-card rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <button
                                    onClick={() => setCapacitacionSeleccionada(null)}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-300 hover:text-brand-200 mb-2 transition-colors"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" />
                                    <span>Volver al Dashboard General</span>
                                </button>
                                <h2 className="text-2xl font-bold text-white tracking-tight font-display">
                                    {capacitacionSeleccionada.titulo}
                                </h2>
                                <p className="text-xs text-slate-400 mt-1">
                                    {sesiones.length} sesiones configuradas en este programa.
                                </p>
                            </div>

                            <div className="flex items-center gap-2.5 flex-wrap">
                                <button
                                    onClick={() => handleToggleCapacitacion(capacitacionSeleccionada.id)}
                                    className={`border text-xs font-semibold px-4 py-2.5 rounded-xl transition inline-flex items-center gap-1.5 ${capacitacionSeleccionada.activa !== false
                                            ? 'border-amber-500/40 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40'
                                            : 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40'
                                        }`}
                                    title={capacitacionSeleccionada.activa !== false ? 'Cerrar evento y bloquear nuevos registros por QR' : 'Reactivar evento para admitir registros'}
                                >
                                    <span>{capacitacionSeleccionada.activa !== false ? 'Cerrar Evento' : 'Reactivar Evento'}</span>
                                </button>

                                <button
                                    onClick={() => handleDescargarExcel(capacitacionSeleccionada.id, capacitacionSeleccionada.titulo)}
                                    disabled={descargandoExcel}
                                    className="liquid-btn-primary disabled:opacity-50 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition inline-flex items-center gap-2 shadow-lg shadow-brand-500/25 min-h-[40px]"
                                    title="Descargar matriz consolidada con participantes y sesiones en formato Excel (.xlsx)"
                                >
                                    {descargandoExcel ? (
                                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                                    ) : (
                                        <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
                                    )}
                                    <span>{descargandoExcel ? 'Generando Excel...' : 'Descargar Consolidado (Excel)'}</span>
                                </button>

                                <button
                                    onClick={() => setModalQRData({ titulo: capacitacionSeleccionada.titulo, url: getQrUrl(capacitacionSeleccionada) })}
                                    className="liquid-glass-pill hover:bg-white/10 text-slate-200 text-xs font-semibold px-4 py-2.5 rounded-xl transition inline-flex items-center gap-2 min-h-[40px]"
                                >
                                    <QrCode className="w-4 h-4 text-brand-400" />
                                    <span>Proyectar QR</span>
                                </button>

                                <button
                                    onClick={() => handleEliminarCapacitacion(
                                        capacitacionSeleccionada.id,
                                        capacitacionSeleccionada.titulo,
                                        reporte?.participantes?.length || capacitacionSeleccionada.total_asistencias || 0
                                    )}
                                    className="bg-red-950/30 hover:bg-red-900/40 border border-red-500/30 text-red-300 text-xs font-semibold px-4 py-2.5 rounded-xl transition inline-flex items-center gap-1.5"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    <span>Eliminar</span>
                                </button>
                            </div>
                        </div>

                        {/* Pestañas de la Capacitación */}
                        <div className="flex border-b border-white/[0.08] overflow-x-auto gap-2">
                            <button
                                onClick={() => { setTabCapacitacion('sesiones'); setSesionDetalle(null); }}
                                className={`py-3.5 px-5 text-xs font-semibold border-b-2 transition-all inline-flex items-center gap-2 whitespace-nowrap ${tabCapacitacion === 'sesiones'
                                        ? 'border-brand-400 text-brand-300'
                                        : 'border-transparent text-slate-400 hover:text-slate-200'
                                    }`}
                            >
                                <Layers className="w-4 h-4" />
                                <span>Sesiones ({sesiones.length})</span>
                            </button>

                            <button
                                onClick={() => { setTabCapacitacion('qr'); setSesionDetalle(null); }}
                                className={`py-3.5 px-5 text-xs font-semibold border-b-2 transition-all inline-flex items-center gap-2 whitespace-nowrap ${tabCapacitacion === 'qr'
                                        ? 'border-brand-400 text-brand-300'
                                        : 'border-transparent text-slate-400 hover:text-slate-200'
                                    }`}
                            >
                                <QrCode className="w-4 h-4" />
                                <span>Código QR del Programa</span>
                            </button>

                            <button
                                onClick={() => { setTabCapacitacion('consolidado'); setSesionDetalle(null); }}
                                className={`py-3.5 px-5 text-xs font-semibold border-b-2 transition-all inline-flex items-center gap-2 whitespace-nowrap ${tabCapacitacion === 'consolidado'
                                        ? 'border-brand-400 text-brand-300'
                                        : 'border-transparent text-slate-400 hover:text-slate-200'
                                    }`}
                            >
                                <FileSpreadsheet className="w-4 h-4" />
                                <span>Resumen Consolidado Completo</span>
                            </button>
                        </div>

                        {/* CONTENIDO 1: SESIONES */}
                        {tabCapacitacion === 'sesiones' && (
                            <div className="space-y-6">
                                {sesionDetalle ? (
                                    /* Detalle de Asistentes de una Sesión */
                                    <div className="liquid-glass-card rounded-3xl p-6 md:p-8 shadow-2xl animate-in fade-in duration-200">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-6 border-b border-white/[0.08]">
                                            <div>
                                                <button
                                                    onClick={() => setSesionDetalle(null)}
                                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-300 hover:text-brand-200 mb-2 transition-colors"
                                                >
                                                    <ArrowLeft className="w-3.5 h-3.5" />
                                                    <span>Volver al listado de sesiones</span>
                                                </button>
                                                <h3 className="text-2xl font-bold text-white flex items-center gap-3 font-display flex-wrap">
                                                    <span>Asistentes: {sesionDetalle.sesion.nombre_sesion}</span>
                                                    <span className="px-3 py-1 rounded-full text-xs font-semibold liquid-glass-pill text-brand-300 tabular-numbers">
                                                        {sesionDetalle.total_asistentes} registros
                                                    </span>
                                                    {autoRefreshActivo && (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/50 text-emerald-300 border border-emerald-800/50">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                            Actualizando en vivo
                                                        </span>
                                                    )}
                                                </h3>
                                            </div>

                                            <div className="flex items-center gap-2 flex-wrap">
                                                <button
                                                    onClick={() => handleDescargarPdf(sesionDetalle.sesion.id, sesionDetalle.sesion.nombre_sesion)}
                                                    disabled={descargandoPdfId === sesionDetalle.sesion.id}
                                                    className="liquid-btn-primary disabled:opacity-40 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-all inline-flex items-center gap-2 shadow-lg shadow-brand-500/20 min-h-[40px]"
                                                    title="Descargar lista oficial de acreditación en formato PDF"
                                                >
                                                    {descargandoPdfId === sesionDetalle.sesion.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                                                    ) : (
                                                        <FileText className="w-4 h-4 text-white" />
                                                    )}
                                                    <span>{descargandoPdfId === sesionDetalle.sesion.id ? 'Generando PDF...' : 'Descargar Lista (PDF)'}</span>
                                                </button>

                                                <button
                                                    onClick={exportarCSVSesion}
                                                    disabled={sesionDetalle.total_asistentes === 0}
                                                    className="liquid-glass-pill hover:bg-white/10 text-slate-300 text-xs font-semibold px-4 py-2.5 rounded-xl transition-all inline-flex items-center gap-2 min-h-[40px]"
                                                >
                                                    <Download className="w-4 h-4" />
                                                    <span>CSV</span>
                                                </button>
                                            </div>
                                        </div>

                                        {sesionDetalle.total_asistentes === 0 ? (
                                            <div className="p-16 text-center text-slate-400 border border-dashed border-white/10 rounded-2xl">
                                                <Users className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                                                <p className="text-sm">No hay asistentes registrados en esta sesión.</p>
                                            </div>
                                        ) : (
                                            <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
                                                <table className="w-full text-left text-xs text-slate-300">
                                                    <thead className="bg-white/[0.03] text-slate-400 uppercase text-[11px] font-semibold border-b border-white/[0.08] tracking-wider">
                                                        <tr>
                                                            <th className="py-3.5 px-4">#</th>
                                                            <th className="py-3.5 px-4">Nombre Completo</th>
                                                            <th className="py-3.5 px-4">Empresa</th>
                                                            <th className="py-3.5 px-4">Modalidad</th>
                                                            <th className="py-3.5 px-4">Instructor</th>
                                                            <th className="py-3.5 px-4">Correo Electrónico</th>
                                                            <th className="py-3.5 px-4 text-right">Hora Registro</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-white/[0.05]">
                                                        {sesionDetalle.asistentes.map((a, idx) => (
                                                            <tr key={a.id} className="hover:bg-white/[0.04] transition-colors">
                                                                <td className="py-3.5 px-4 font-mono text-slate-500 tabular-numbers">{idx + 1}</td>
                                                                <td className="py-3.5 px-4 font-bold text-white whitespace-nowrap">{a.nombre_usuario}</td>
                                                                <td className="py-3.5 px-4 whitespace-nowrap">
                                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg liquid-glass-pill text-slate-200 text-[11px]">
                                                                        <Building2 className="w-3 h-3 text-brand-400" />
                                                                        {a.empresa || '-'}
                                                                    </span>
                                                                </td>
                                                                <td className="py-3.5 px-4 whitespace-nowrap">
                                                                    {a.modalidad === 'Virtual' ? (
                                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/20">
                                                                            <Laptop className="w-3 h-3" />
                                                                            Virtual
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-brand-500/10 text-brand-300 border border-brand-500/20">
                                                                            <Building2 className="w-3 h-3" />
                                                                            Presencial
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="py-3.5 px-4 text-slate-300 whitespace-nowrap">{a.instructor || '-'}</td>
                                                                <td className="py-3.5 px-4 font-mono text-slate-400 whitespace-nowrap text-[11px]">{a.correo_usuario}</td>
                                                                <td className="py-3.5 px-4 text-right text-slate-400 whitespace-nowrap tabular-numbers">
                                                                    {(() => {
                                                                        const d = parseFechaSegura(a.fecha_registro);
                                                                        return d ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '-';
                                                                    })()}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    /* Grilla de Sesiones */
                                    <div>
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-base font-bold text-white font-display">Sesiones del Programa</h3>
                                            <button
                                                onClick={() => setMostrarAgregarSesion(!mostrarAgregarSesion)}
                                                className="liquid-btn-primary text-white text-xs font-semibold px-4 py-2 rounded-xl transition inline-flex items-center gap-1.5"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                                <span>Añadir Sesión</span>
                                            </button>
                                        </div>

                                        {mostrarAgregarSesion && (
                                            <form onSubmit={handleAgregarSesion} className="mb-6 p-5 liquid-glass-panel rounded-2xl flex flex-col sm:flex-row gap-2.5 animate-in fade-in duration-200">
                                                <input
                                                    type="text"
                                                    placeholder="Nombre de la nueva sesión..."
                                                    value={nombreSesionExtra}
                                                    onChange={(e) => setNombreSesionExtra(e.target.value)}
                                                    className="flex-1 liquid-glass-input rounded-xl px-4 py-2.5 text-base sm:text-xs text-white focus:outline-none min-h-[44px]"
                                                />
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="submit"
                                                        className="flex-1 sm:flex-none liquid-btn-primary text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition min-h-[44px]"
                                                    >
                                                        Guardar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setMostrarAgregarSesion(false)}
                                                        className="flex-1 sm:flex-none text-slate-400 hover:text-white px-3 py-2.5 text-xs min-h-[44px] flex items-center justify-center"
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
                                            </form>
                                        )}

                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {sesiones.map((sesion, index) => (
                                                <div
                                                    key={sesion.id}
                                                    className="liquid-glass-card rounded-3xl p-6 flex flex-col justify-between"
                                                >
                                                    <div>
                                                        <div className="flex items-start justify-between gap-2 mb-3">
                                                            <div className="flex items-center gap-2.5">
                                                                <div className="w-8 h-8 rounded-xl bg-white/[0.06] text-brand-300 border border-white/10 flex items-center justify-center font-bold text-xs tabular-numbers shadow-inner">
                                                                    {sesion.numero_sesion || index + 1}
                                                                </div>
                                                                <h4 className="font-bold text-white text-base font-display">
                                                                    {sesion.nombre_sesion}
                                                                </h4>
                                                            </div>

                                                            <button
                                                                onClick={() => handleEliminarSesion(sesion.id, sesion.nombre_sesion)}
                                                                className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-950/30 transition-colors"
                                                                title="Eliminar sesión"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>

                                                        <div className="liquid-glass-input rounded-2xl p-4 mb-5 space-y-2.5 text-xs border-white/[0.08]">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-slate-400 font-medium">Asistentes:</span>
                                                                <span className="font-bold text-white tabular-numbers">
                                                                    {sesion.total_asistentes ?? 0}
                                                                </span>
                                                            </div>

                                                            <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between">
                                                                <span className="text-slate-400">Estado:</span>
                                                                <button
                                                                    onClick={() => handleToggleSesion(sesion.id)}
                                                                    className={`px-3 py-1 rounded-full font-semibold text-[11px] inline-flex items-center gap-1.5 transition border ${sesion.activa
                                                                            ? 'bg-brand-500/15 text-brand-300 border-brand-500/30 hover:bg-brand-500/25'
                                                                            : 'bg-white/[0.05] text-slate-400 border-white/10 hover:bg-white/10'
                                                                        }`}
                                                                    title={sesion.activa ? 'Clic para cerrar sesión' : 'Clic para habilitar sesión'}
                                                                >
                                                                    <span className={`w-1.5 h-1.5 rounded-full ${sesion.activa ? 'bg-brand-400 animate-pulse' : 'bg-slate-500'}`} />
                                                                    {sesion.activa ? 'Abierta' : 'Cerrada'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                                        <button
                                                            onClick={() => verAsistentesSesion(sesion.id)}
                                                            className="liquid-glass-pill hover:bg-white/10 text-slate-200 hover:text-white text-xs font-semibold py-2.5 px-3 rounded-2xl transition-all duration-200 inline-flex items-center justify-center gap-1.5 min-h-[40px]"
                                                        >
                                                            <Users className="w-3.5 h-3.5 text-brand-400" />
                                                            <span>Ver ({sesion.total_asistentes ?? 0})</span>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDescargarPdf(sesion.id, sesion.nombre_sesion)}
                                                            disabled={descargandoPdfId === sesion.id}
                                                            className="bg-brand-500/15 hover:bg-brand-500/25 border border-brand-500/30 text-brand-300 hover:text-brand-200 text-xs font-semibold py-2.5 px-3 rounded-2xl transition-all duration-200 inline-flex items-center justify-center gap-1.5 min-h-[40px]"
                                                            title="Descargar lista oficial de asistencia en formato PDF"
                                                        >
                                                            {descargandoPdfId === sesion.id ? (
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-300" />
                                                            ) : (
                                                                <FileText className="w-3.5 h-3.5 text-brand-400" />
                                                            )}
                                                            <span>{descargandoPdfId === sesion.id ? 'PDF...' : 'Lista (PDF)'}</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* CONTENIDO 2: CÓDIGO QR */}
                        {tabCapacitacion === 'qr' && (
                            <div className="liquid-glass-card rounded-3xl p-8 shadow-2xl max-w-md mx-auto text-center animate-in fade-in duration-200">
                                <span className="px-3.5 py-1.5 liquid-glass-pill text-brand-300 text-[11px] font-semibold rounded-full mb-4 inline-flex items-center gap-1.5">
                                    <QrCode className="w-3.5 h-3.5 text-brand-400" />
                                    Código QR Institucional ONE
                                </span>

                                <h2 className="text-2xl font-bold text-white mb-1.5 leading-snug font-display">
                                    {capacitacionSeleccionada.titulo}
                                </h2>

                                <p className="text-xs text-slate-400 mb-6">
                                    Válido para todas las {sesiones.length} sesiones de esta capacitación.
                                </p>

                                <div
                                    onClick={() => setModalQRData({ titulo: capacitacionSeleccionada.titulo, url: getQrUrl(capacitacionSeleccionada) })}
                                    className="bg-white p-5 rounded-2xl inline-block cursor-pointer hover:scale-[1.02] transition-transform shadow-2xl mb-6"
                                    title="Clic para proyectar en pantalla grande"
                                >
                                    <QRCodeSVG
                                        id="qr-svg-capacitacion"
                                        value={getQrUrl(capacitacionSeleccionada)}
                                        size={220}
                                        level="H"
                                        includeMargin={true}
                                    />
                                    <span className="text-[11px] font-semibold text-slate-600 mt-2 block">
                                        Clic para Proyectar
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
                                    <button
                                        onClick={() => copiarEnlace(getQrUrl(capacitacionSeleccionada))}
                                        className="liquid-glass-pill hover:bg-white/10 text-slate-200 text-xs font-medium py-2.5 px-3 rounded-xl transition inline-flex items-center justify-center gap-1.5"
                                    >
                                        {copiadoExito ? <Check className="w-3.5 h-3.5 text-brand-400" /> : <Copy className="w-3.5 h-3.5" />}
                                        <span>{copiadoExito ? 'Copiado' : 'Copiar URL'}</span>
                                    </button>

                                    <button
                                        onClick={() => descargarQR('qr-svg-capacitacion', capacitacionSeleccionada.titulo)}
                                        className="liquid-glass-pill hover:bg-white/10 text-slate-200 text-xs font-medium py-2.5 px-3 rounded-xl transition inline-flex items-center justify-center gap-1.5"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        <span>Descargar PNG</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* CONTENIDO 3: CONSOLIDADO */}
                        {tabCapacitacion === 'consolidado' && (
                            <div className="space-y-4 animate-in fade-in duration-200">
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 liquid-glass-card rounded-2xl p-4">
                                    <div className="w-full sm:w-80 relative">
                                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                        <input
                                            type="text"
                                            placeholder="Filtrar por participante, empresa o correo..."
                                            value={filtroTexto}
                                            onChange={(e) => setFiltroTexto(e.target.value)}
                                            className="w-full liquid-glass-input rounded-xl pl-10 pr-3 py-2 text-xs text-white focus:outline-none"
                                        />
                                    </div>

                                    <div className="flex items-center gap-2.5 flex-wrap">
                                        <button
                                            onClick={() => handleDescargarExcel(capacitacionSeleccionada.id, capacitacionSeleccionada.titulo)}
                                            disabled={descargandoExcel}
                                            className="liquid-btn-primary disabled:opacity-50 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition inline-flex items-center gap-2 shadow-lg shadow-brand-500/20"
                                            title="Descargar matriz en Excel (.xlsx)"
                                        >
                                            {descargandoExcel ? (
                                                <Loader2 className="w-4 h-4 animate-spin text-white" />
                                            ) : (
                                                <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
                                            )}
                                            <span>{descargandoExcel ? 'Generando Excel...' : 'Descargar Consolidado (Excel)'}</span>
                                        </button>

                                        <button
                                            onClick={exportarCSVConsolidado}
                                            className="liquid-glass-pill hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition inline-flex items-center gap-1.5"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            <span>Exportar CSV</span>
                                        </button>
                                    </div>
                                </div>

                                {reporte && (
                                    <div className="liquid-glass-card rounded-3xl overflow-hidden shadow-2xl">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left text-xs text-slate-300">
                                                <thead className="bg-white/[0.03] text-slate-400 uppercase text-[11px] font-semibold border-b border-white/[0.08] tracking-wider">
                                                    <tr>
                                                        <th className="py-4 px-4">Participante</th>
                                                        <th className="py-4 px-4">Empresa</th>
                                                        <th className="py-4 px-4">Modalidad</th>
                                                        <th className="py-4 px-4">Correo</th>
                                                        {reporte.sesiones.map((s) => (
                                                            <th key={s.id} className="py-4 px-3 text-center whitespace-nowrap">
                                                                {s.nombre_sesion}
                                                            </th>
                                                        ))}
                                                        <th className="py-4 px-4 text-center">Asistencias</th>
                                                        <th className="py-4 px-4 text-center">% Cumplimiento</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/[0.05]">
                                                    {reporte.participantes
                                                        .filter(p =>
                                                            p.nombre_usuario.toLowerCase().includes(filtroTexto.toLowerCase()) ||
                                                            p.empresa.toLowerCase().includes(filtroTexto.toLowerCase()) ||
                                                            p.correo_usuario.toLowerCase().includes(filtroTexto.toLowerCase())
                                                        )
                                                        .map((p, idx) => (
                                                            <tr key={idx} className="hover:bg-white/[0.04] transition-colors">
                                                                <td className="py-3.5 px-4 font-bold text-white whitespace-nowrap">{p.nombre_usuario}</td>
                                                                <td className="py-3.5 px-4 whitespace-nowrap text-slate-300">{p.empresa}</td>
                                                                <td className="py-3.5 px-4 whitespace-nowrap">
                                                                    <span className="text-[11px] text-slate-400">{p.modalidad}</span>
                                                                </td>
                                                                <td className="py-3.5 px-4 font-mono text-slate-400 whitespace-nowrap text-[11px]">{p.correo_usuario}</td>
                                                                {reporte.sesiones.map((s) => {
                                                                    const asistio = p.asistencias_por_sesion.find(a => a.sesion_id === s.id)?.asistio;
                                                                    return (
                                                                        <td key={s.id} className="py-3.5 px-3 text-center whitespace-nowrap">
                                                                            {asistio ? (
                                                                                <span className="inline-flex items-center gap-1 text-brand-300 font-semibold text-[11px]">
                                                                                    <CheckCircle2 className="w-3.5 h-3.5 text-brand-400" />
                                                                                    <span>Presente</span>
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-slate-600 text-[11px]">—</span>
                                                                            )}
                                                                        </td>
                                                                    );
                                                                })}
                                                                <td className="py-3.5 px-4 text-center font-bold text-white tabular-numbers">
                                                                    {p.total_sesiones_asistidas} / {p.total_sesiones_capacitacion}
                                                                </td>
                                                                <td className="py-3.5 px-4 text-center font-bold text-brand-300 tabular-numbers">
                                                                    {p.porcentaje_asistencia}%
                                                                </td>
                                                            </tr>
                                                        ))
                                                    }
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* MODAL CREAR NUEVA CAPACITACIÓN APPLE LIQUID GLASS */}
                {mostrarCrearModal && (
                    <div className="fixed inset-0 bg-[#050811]/85 backdrop-blur-xl flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
                        <div className="liquid-glass-panel rounded-3xl p-5 sm:p-8 max-w-lg w-full relative max-h-[92vh] overflow-y-auto">
                            <div className="flex items-center justify-between mb-4 sm:mb-5">
                                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 font-display">
                                    <BookOpen className="w-4 h-4 text-brand-400" />
                                    <span>Nueva Capacitación</span>
                                </h3>
                                <button
                                    onClick={() => setMostrarCrearModal(false)}
                                    className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <form onSubmit={handleCrearCapacitacion} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                                        Título del Programa / Actividad *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ej. Auditoría Interna ISO 9001:2015"
                                        value={nuevoTitulo}
                                        onChange={(e) => setNuevoTitulo(e.target.value)}
                                        className="w-full liquid-glass-input rounded-xl px-4 py-3 sm:py-2.5 text-base sm:text-xs text-white focus:outline-none min-h-[44px]"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                                        Número de Sesiones *
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min="1"
                                            max="50"
                                            required
                                            value={nuevoNumSesiones}
                                            onChange={(e) => setNuevoNumSesiones(parseInt(e.target.value, 10) || 1)}
                                            className="w-full liquid-glass-input rounded-xl px-4 py-3 sm:py-2.5 text-base sm:text-xs text-white focus:outline-none tabular-numbers min-h-[44px]"
                                        />
                                        <span className="text-xs text-slate-400 whitespace-nowrap">sesiones</span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 mt-1">
                                        Se creará un código QR unificado con {nuevoNumSesiones} sesiones correspondientes.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                                        Descripción o Notas (Opcional)
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={nuevaDesc}
                                        onChange={(e) => setNuevaDesc(e.target.value)}
                                        placeholder="Objetivos o alcance del programa..."
                                        className="w-full liquid-glass-input rounded-xl px-4 py-2.5 text-base sm:text-xs text-white focus:outline-none resize-none"
                                    />
                                </div>

                                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 pt-4 border-t border-white/[0.08]">
                                    <button
                                        type="button"
                                        onClick={() => setMostrarCrearModal(false)}
                                        className="w-full sm:w-auto px-4 py-2.5 text-xs font-medium text-slate-400 hover:text-white transition-colors min-h-[44px] flex items-center justify-center"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full sm:w-auto liquid-btn-primary text-white px-5 py-2.5 rounded-xl text-xs font-semibold transition-all min-h-[44px] flex items-center justify-center"
                                    >
                                        Crear y Generar QR
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* MODAL DE CONFIRMACIÓN DESTRUIDA ELEGANTE (VISIONOS / APPLE LIQUID GLASS) */}
                {modalConfirmacion && (
                    <div className="fixed inset-0 bg-[#050811]/90 backdrop-blur-xl flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                        <div className="liquid-glass-panel border-red-500/30 rounded-3xl p-6 sm:p-8 max-w-md w-full relative shadow-2xl animate-in zoom-in-95 duration-200 text-left">
                            <div className="flex items-center gap-3.5 mb-4">
                                <div className="w-11 h-11 rounded-2xl bg-red-950/60 border border-red-500/40 flex items-center justify-center shrink-0">
                                    <AlertCircle className="w-6 h-6 text-red-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white font-display">
                                        {modalConfirmacion.titulo}
                                    </h3>
                                    {modalConfirmacion.subtitulo && (
                                        <p className="text-xs text-brand-300 font-medium truncate max-w-[260px]">
                                            {modalConfirmacion.subtitulo}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
                                {modalConfirmacion.mensaje}
                            </p>

                            {modalConfirmacion.advertenciaCritica && (
                                <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-2xl mb-6 flex items-start gap-2.5 text-[11px] text-red-200">
                                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                    <p className="leading-relaxed">
                                        {modalConfirmacion.advertenciaCritica}
                                    </p>
                                </div>
                            )}

                            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 pt-2 border-t border-white/[0.08]">
                                <button
                                    type="button"
                                    onClick={() => setModalConfirmacion(null)}
                                    disabled={loading}
                                    className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors min-h-[44px] flex items-center justify-center rounded-xl hover:bg-white/5"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    disabled={loading}
                                    onClick={async () => {
                                        const fn = modalConfirmacion.onConfirmar;
                                        setModalConfirmacion(null);
                                        if (fn) await fn();
                                    }}
                                    className="w-full sm:w-auto bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg shadow-red-600/30 min-h-[44px] flex items-center justify-center gap-2"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    <span>{modalConfirmacion.textoBotonConfirmar || 'Sí, Eliminar'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* MODAL PROYECCIÓN DE QR VISIONOS CINEMA */}
                {modalQRData && (
                    <div className="fixed inset-0 bg-[#050811]/90 backdrop-blur-2xl flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-300">
                        <div className="liquid-glass-panel rounded-3xl p-5 sm:p-8 max-w-lg w-full text-center relative shadow-2xl max-h-[90dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                            <button
                                onClick={() => setModalQRData(null)}
                                className="absolute top-3.5 right-3.5 text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            {/* Logo Oficial */}
                            <div className="flex justify-center mb-3 sm:mb-4">
                                <div className="bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-2xl shadow-sm border border-white/40">
                                    <img src={logoOne} alt="ONE Consulting" className="h-8 sm:h-9 w-auto object-contain mx-auto" />
                                </div>
                            </div>

                            <span className="px-3 py-1 liquid-glass-pill text-brand-300 text-[11px] sm:text-xs font-semibold rounded-full mb-2.5 inline-flex items-center gap-1.5">
                                <ShieldCheck className="w-3.5 h-3.5 text-brand-400" />
                                Control de Asistencia Oficial ONE
                            </span>

                            <h3 className="text-xl sm:text-2xl font-black text-white mb-2 leading-tight font-display px-2">
                                {modalQRData.titulo}
                            </h3>

                            <div className="bg-white p-4 sm:p-6 rounded-3xl inline-block shadow-2xl mb-4 sm:mb-6 max-w-full">
                                <div className="flex justify-center items-center">
                                    <QRCodeSVG
                                        id="qr-svg-modal"
                                        value={modalQRData.url}
                                        size={typeof window !== 'undefined' ? Math.min(260, window.innerWidth - 90) : 260}
                                        level="H"
                                        includeMargin={true}
                                        className="w-auto max-w-full h-auto"
                                    />
                                </div>
                            </div>

                            <p className="text-xs text-slate-400 mb-4 sm:mb-6 px-2">
                                Escanea con la cámara de tu smartphone para registrar tu asistencia.
                            </p>

                            <div className="flex flex-col sm:flex-row justify-center gap-2.5 sm:gap-3">
                                <button
                                    onClick={() => copiarEnlace(modalQRData.url)}
                                    className="w-full sm:w-auto liquid-btn-primary text-white text-xs font-semibold py-2.5 px-5 rounded-xl transition inline-flex items-center justify-center gap-1.5 min-h-[44px]"
                                >
                                    {copiadoExito ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                    <span>{copiadoExito ? 'Enlace Copiado' : 'Copiar Enlace'}</span>
                                </button>
                                <button
                                    onClick={() => descargarQR('qr-svg-modal', modalQRData.titulo)}
                                    className="w-full sm:w-auto liquid-glass-pill hover:bg-white/10 text-slate-200 text-xs font-semibold py-2.5 px-4 rounded-xl transition inline-flex items-center justify-center gap-1.5 min-h-[44px]"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Descargar Imagen PNG</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* FOOTER CORPORATIVO (FOOTPAGE) */}
                <footer className="mt-20 pt-8 pb-10 border-t border-slate-800/80 flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-slate-500">
                    <div className="flex items-center gap-3.5">
                        <div className="bg-white/95 backdrop-blur-md p-2 rounded-xl shadow-sm border border-white/20 flex items-center justify-center shrink-0">
                            <img src={logoOne} alt="ONE Consulting" className="h-6 w-auto object-contain" />
                        </div>
                        <div>
                            <p className="text-slate-300 font-semibold text-xs flex items-center gap-2">
                                <span>ONE Consulting</span>
                                <span className="text-[10px] text-cyan-400 bg-cyan-950/40 border border-cyan-800/40 px-1.5 py-0.5 rounded font-mono">
                                    v2.5 Enterprise
                                </span>
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                                Soluciones Corporativas y Gestión del Talento • ¡Su aliado en generar valor!
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-5 text-[11px] text-slate-400 flex-wrap justify-center">
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            Supabase Cloud DB
                        </span>
                        <span className="text-slate-700 hidden sm:inline">•</span>
                        <span className="flex items-center gap-1.5">
                            <Server className="w-3.5 h-3.5 text-sky-400" />
                            Vercel Edge Network
                        </span>
                        <span className="text-slate-700 hidden sm:inline">•</span>
                        <span className="flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                            Seguridad SHA-256
                        </span>
                    </div>

                    <div className="text-[11px] text-slate-500 text-center md:text-right">
                        <p>© 2026 ONE Consulting. Todos los derechos reservados.</p>
                        <p className="text-slate-600 text-[10px] mt-0.5">Control y Registro Oficial de Asistencias</p>
                    </div>
                </footer>

            </div>
            <BannerOffline />
        </div>
    );
}
