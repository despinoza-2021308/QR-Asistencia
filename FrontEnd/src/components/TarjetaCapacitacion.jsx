import React from 'react';
import { Layers, Trash2, Users, QrCode, ChevronRight, FileSpreadsheet } from 'lucide-react';

/**
 * TarjetaCapacitacion (Fila Horizontal Fluida)
 * Estilo corporativo moderno tipo Stripe / Vercel
 * 
 * Directrices aplicadas:
 * - Fila horizontal: group flex flex-col md:flex-row items-center justify-between p-6 bg-slate-900/20 hover:bg-slate-900/50 border border-slate-800/40 rounded-xl transition-all
 * - Sin recuadros pesados ni marcos saturados
 * - Información visual jerarquizada: Título, descripción corta, contador de asistencias y acciones
 */
export default function TarjetaCapacitacion({
    cap,
    qrUrl,
    onSelect,
    onEliminar,
    onProyectarQR,
    onToggle,
    onDescargarExcel
}) {
    if (!cap) return null;

    const estaActiva = cap.activa !== false;

    return (
        <article className={`group flex flex-col md:flex-row md:items-center justify-between p-5 md:p-6 bg-slate-900/20 hover:bg-slate-900/50 border ${estaActiva ? 'border-slate-800/40 hover:border-slate-700/60' : 'border-amber-900/30 bg-amber-950/10 hover:border-amber-800/40'} rounded-xl transition-all duration-200 gap-4`}>
            
            {/* Información Principal: Título, Sesiones, Estado & Descripción */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                    {/* Badge Estado */}
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        estaActiva 
                            ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-800/50' 
                            : 'bg-amber-950/50 text-amber-300 border border-amber-800/50'
                    }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${estaActiva ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                        <span>{estaActiva ? 'QR Activo' : 'Finalizada (QR Cerrado)'}</span>
                    </span>

                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-950/40 text-cyan-300 border border-cyan-800/40">
                        <Layers className="w-3 h-3 text-cyan-400" />
                        <span>{cap.total_sesiones || 1} {cap.total_sesiones === 1 ? 'Sesión' : 'Sesiones'}</span>
                    </span>
                    
                    <span className="text-[11px] text-slate-500 hidden sm:inline">
                        ID #{cap.id}
                    </span>
                </div>

                <h3 
                    onClick={() => onSelect(cap)}
                    className="text-base md:text-lg font-bold text-white group-hover:text-cyan-300 transition-colors cursor-pointer truncate" 
                    title={cap.titulo}
                >
                    {cap.titulo}
                </h3>

                {cap.descripcion && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-1 max-w-2xl">
                        {cap.descripcion}
                    </p>
                )}
            </div>

            {/* Métricas y Acciones Integradas a la Derecha */}
            <div className="flex items-center justify-between md:justify-end gap-3 sm:gap-6 w-full md:w-auto shrink-0 pt-3 md:pt-0 border-t md:border-t-0 border-slate-800/40 flex-wrap">
                
                {/* Contador de Asistencias */}
                <div className="flex items-center gap-2 pr-2 sm:pr-4 md:border-r border-slate-800/60">
                    <div className="w-8 h-8 rounded-lg bg-emerald-950/30 border border-emerald-800/30 text-emerald-400 flex items-center justify-center">
                        <Users className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                        <div className="text-sm md:text-base font-extrabold text-emerald-400 tabular-numbers leading-tight">
                            {cap.total_asistencias || 0}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                            Asistencias
                        </div>
                    </div>
                </div>

                {/* Acciones Rápidas */}
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Botón Activar / Finalizar Evento */}
                    {onToggle && (
                        <button
                            type="button"
                            onClick={() => onToggle(cap.id)}
                            className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all min-h-[40px] flex items-center ${
                                estaActiva
                                    ? 'border-amber-700/50 hover:bg-amber-950/30 text-amber-300'
                                    : 'border-emerald-700/50 hover:bg-emerald-950/30 text-emerald-300'
                            }`}
                            title={estaActiva ? 'Finalizar actividad (bloquear nuevos registros por QR)' : 'Reactivar actividad (admitir registros)'}
                        >
                            {estaActiva ? 'Cerrar Evento' : 'Reactivar'}
                        </button>
                    )}

                    {/* Botón Proyectar QR */}
                    <button
                        type="button"
                        onClick={() => onProyectarQR({ titulo: cap.titulo, url: qrUrl })}
                        className="hover:bg-slate-800/70 text-slate-300 hover:text-white border border-slate-700/50 rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-1.5 transition-all min-h-[40px]"
                        title="Proyectar o descargar código QR"
                    >
                        <QrCode className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="hidden sm:inline">QR</span>
                    </button>

                    {/* Botón Descargar Excel Rápido */}
                    {onDescargarExcel && (
                        <button
                            type="button"
                            onClick={() => onDescargarExcel(cap.id, cap.titulo)}
                            className="hover:bg-emerald-950/40 text-emerald-300 hover:text-emerald-200 border border-emerald-700/40 rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-1.5 transition-all min-h-[40px]"
                            title="Descargar Reporte Consolidado en Excel (.xlsx)"
                        >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="hidden lg:inline">Excel</span>
                        </button>
                    )}

                    {/* Botón Administrar Sesiones */}
                    <button
                        type="button"
                        onClick={() => onSelect(cap)}
                        className="bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 hover:text-cyan-200 rounded-lg px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm min-h-[40px]"
                    >
                        <span>Administrar</span>
                        <ChevronRight className="w-3.5 h-3.5 text-cyan-400" />
                    </button>

                    {/* Botón Eliminar Discreto con Advertencia */}
                    <button
                        type="button"
                        onClick={() => onEliminar(cap.id, cap.titulo, cap.total_asistencias || 0)}
                        className="text-slate-500 hover:text-red-400 p-2 rounded-lg hover:bg-red-950/20 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
                        title="Eliminar capacitación y registros"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>

            </div>

        </article>
    );
}
