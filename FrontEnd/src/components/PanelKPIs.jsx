import React from 'react';
import { BookOpen, Layers, Users, CheckCircle2 } from 'lucide-react';

/**
 * PanelKPIs - Sección de Métricas sin Recuadros (Estilo Corporativo Fluido tipo Stripe / Vercel)
 * 
 * Directrices aplicadas:
 * - Métricas distribuidas horizontalmente sobre el fondo oscuro
 * - Separadas únicamente por líneas divisorias verticales sutiles (border-slate-800/80)
 * - Cero cajas anidadas ni recuadros individuales pesados
 * - Tipografía de alto impacto: text-4xl font-extrabold text-white
 * - Acentos cromáticos controlados (cyan-400 y emerald-400)
 */
export default function PanelKPIs({ 
    totalCapacitaciones = 0, 
    totalSesiones = 0, 
    totalAsistencias = 0 
}) {
    return (
        <section aria-label="Métricas Globales del Sistema" className="w-full py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-800/80">
                
                {/* Métrica 1: Capacitaciones */}
                <div className="py-4 md:py-1 md:pr-8 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium uppercase tracking-wider text-slate-400 flex items-center gap-2">
                            <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                            Programas de Capacitación
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold text-cyan-300 bg-cyan-950/40 border border-cyan-800/40">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                            Activos
                        </span>
                    </div>
                    <div className="flex items-baseline gap-3 mt-1">
                        <span className="text-4xl font-extrabold text-white tracking-tight tabular-numbers font-display">
                            {totalCapacitaciones}
                        </span>
                        <span className="text-xs text-slate-500">en plataforma</span>
                    </div>
                </div>

                {/* Métrica 2: Módulos / Sesiones */}
                <div className="py-4 md:py-1 md:px-8 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium uppercase tracking-wider text-slate-400 flex items-center gap-2">
                            <Layers className="w-3.5 h-3.5 text-sky-400" />
                            Módulos / Sesiones
                        </span>
                        <span className="text-[10px] font-semibold text-sky-300 bg-sky-950/40 border border-sky-800/40 px-2 py-0.5 rounded-full">
                            Configuradas
                        </span>
                    </div>
                    <div className="flex items-baseline gap-3 mt-1">
                        <span className="text-4xl font-extrabold text-white tracking-tight tabular-numbers font-display">
                            {totalSesiones}
                        </span>
                        <span className="text-xs text-slate-500">con control individual</span>
                    </div>
                </div>

                {/* Métrica 3: Asistencias Totales */}
                <div className="py-4 md:py-1 md:pl-8 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium uppercase tracking-wider text-slate-400 flex items-center gap-2">
                            <Users className="w-3.5 h-3.5 text-emerald-400" />
                            Asistencias Totales
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-emerald-300 bg-emerald-950/40 border border-emerald-800/40">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            Verificadas
                        </span>
                    </div>
                    <div className="flex items-baseline gap-3 mt-1">
                        <span className="text-4xl font-extrabold text-white tracking-tight tabular-numbers font-display">
                            {totalAsistencias}
                        </span>
                        <span className="text-xs text-slate-500">registros biométricos</span>
                    </div>
                </div>

            </div>
        </section>
    );
}
