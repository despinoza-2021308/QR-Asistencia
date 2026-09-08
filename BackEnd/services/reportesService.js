/**
 * ====================================================================
 * SERVICIO DE REPORTES CORPORATIVOS (EXCEL & PDF)
 * Tecnologías: ExcelJS, PDFKit, PostgreSQL (pg)
 * ONE Consulting - Control de Acreditación Oficial
 * ====================================================================
 */

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// Precarga estática para garantizar que el empaquetador de Vercel (@vercel/nft) incluya las fuentes estándar
try {
    require('pdfkit/standard-fonts/Helvetica');
    require('pdfkit/standard-fonts/HelveticaBold');
    require('pdfkit/standard-fonts/HelveticaOblique');
    require('pdfkit/standard-fonts/HelveticaBoldOblique');
} catch (fontErr) {
    console.warn('Nota: precarga de fuentes estándar de PDFKit:', fontErr.message);
}

/**
 * Helper para formatear fechas de manera segura y legible en español
 */
function formatearFecha(fechaStr) {
    if (!fechaStr) return 'No especificada';
    try {
        const d = new Date(fechaStr);
        if (isNaN(d.getTime())) return String(fechaStr);
        return d.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch {
        return String(fechaStr);
    }
}

/**
 * Helper para formatear horas en formato HH:mm:ss
 */
function formatearHora(fechaStr) {
    if (!fechaStr) return '--:--';
    try {
        let segura = fechaStr;
        if (typeof segura === 'string' && segura.includes(' ') && !segura.includes('T')) {
            segura = segura.replace(' ', 'T');
        }
        const d = new Date(segura);
        if (isNaN(d.getTime())) return '--:--';
        return d.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch {
        return '--:--';
    }
}

/**
 * Convierte un nombre a formato Title Case (Capitalización formal de Nombres Propios).
 * Garantiza que en reportes Excel y PDF los nombres siempre se presenten con la máxima formalidad corporativa.
 */
function toTitleCase(str) {
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
}

/**
 * --------------------------------------------------------------------
 * 1. REPORTE CONSOLIDADO TOTAL EN EXCEL (.xlsx)
 * --------------------------------------------------------------------
 * Genera una matriz ejecutiva cruzando todos los participantes registrados
 * contra todas las sesiones del programa, calculando totales y porcentajes.
 *
 * @param {number|string} capacitacionId - ID de la capacitación
 * @param {object} pool - Pool de conexiones de PostgreSQL
 * @returns {Promise<Buffer>} - Buffer binario con el archivo .xlsx
 */
async function generarExcelConsolidado(capacitacionId, pool) {
    // 1. Obtener metadatos de la capacitación
    const capRes = await pool.query(
        `SELECT id, titulo, descripcion, instructor, duracion, token, COALESCE(activa, TRUE) AS activa, fecha_creacion
         FROM capacitaciones
         WHERE id = $1`,
        [capacitacionId]
    );

    if (capRes.rows.length === 0) {
        throw new Error('Capacitación no encontrada');
    }
    const capacitacion = capRes.rows[0];

    // 2. Obtener todas las sesiones ordenadas
    const sesRes = await pool.query(
        `SELECT id, nombre_sesion, numero_sesion, fecha, activa
         FROM sesiones
         WHERE capacitacion_id = $1
         ORDER BY numero_sesion ASC, id ASC`,
        [capacitacionId]
    );
    const sesiones = sesRes.rows;
    const totalSesiones = sesiones.length;

    // 3. Obtener participantes unificados y sus asistencias por sesión
    const repRes = await pool.query(
        `SELECT 
            p.id AS participant_id,
            p.nombre AS nombre_usuario,
            p.email_principal AS correo_usuario,
            COALESCE(MAX(a.empresa), p.empresa, 'No especificada') AS empresa,
            COALESCE(MAX(a.modalidad), 'Presencial') AS modalidad,
            COALESCE(MAX(a.instructor), 'No especificado') AS instructor,
            COUNT(DISTINCT a.sesion_id)::int AS total_sesiones_asistidas,
            json_agg(
                json_build_object(
                    'sesion_id', s.id,
                    'nombre_sesion', s.nombre_sesion,
                    'numero_sesion', s.numero_sesion
                ) ORDER BY s.numero_sesion ASC, s.id ASC
            ) AS detalle_sesiones
         FROM participantes p
         JOIN asistencias a ON a.participant_id = p.id
         JOIN sesiones s ON a.sesion_id = s.id
         WHERE p.capacitacion_id = $1
         GROUP BY p.id, p.nombre, p.email_principal, p.empresa
         ORDER BY total_sesiones_asistidas DESC, p.nombre ASC`,
        [capacitacionId]
    );

    const participantes = repRes.rows.map(user => {
        const asistenciasSet = new Set(user.detalle_sesiones.map(d => d.sesion_id));
        const porcentaje = totalSesiones > 0 
            ? Number(((user.total_sesiones_asistidas / totalSesiones) * 100).toFixed(1)) 
            : 0;

        return {
            nombre_usuario: toTitleCase(user.nombre_usuario),
            empresa: user.empresa || 'No especificada',
            modalidad: user.modalidad || 'Presencial',
            correo_usuario: user.correo_usuario,
            total_sesiones_asistidas: user.total_sesiones_asistidas,
            porcentaje_asistencia: porcentaje,
            cumplio_totalidad: user.total_sesiones_asistidas === totalSesiones && totalSesiones > 0,
            asistenciasPorSesion: sesiones.map(s => ({
                sesion_id: s.id,
                asistio: asistenciasSet.has(s.id)
            }))
        };
    });

    // 4. Construir Libro de Trabajo con ExcelJS
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ONE Consulting - Sistema de Control de Asistencia QR';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Consolidado de Asistencia', {
        views: [{ showGridLines: true }],
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    // Paleta de colores corporativos
    const COLOR_HEADER_BG = '0F172A';     // Azul Slate Oscuro Ejecutivo
    const COLOR_HEADER_TEXT = 'FFFFFF';   // Blanco
    const COLOR_SUBHEADER_BG = '0284C7';  // Azul Brand ONE Consulting
    const COLOR_ACCENT = '0EA5E9';        // Cyan Corporativo
    const COLOR_PRESENTE_BG = 'DCFCE7';   // Verde suave
    const COLOR_PRESENTE_TEXT = '166534'; // Verde oscuro
    const COLOR_AUSENTE_BG = 'F1F5F9';    // Gris suave
    const COLOR_AUSENTE_TEXT = '94A3B8';  // Gris texto
    const COLOR_META_BG = 'F8FAFC';       // Fondo sutil tarjetas info

    const totalColumnasMatriz = 4 + sesiones.length + 4; // Participante, Empresa, Modalidad, Correo + Sesiones + Total, Sesiones Totales, %, Estado

    // FILA 1: Espacio superior
    sheet.addRow([]);

    // FILA 2: Banner Institucional Principal
    const filaBanner = sheet.addRow(['ONE CONSULTING • CONTROL DE ASISTENCIA Y ACREDITACIÓN OFICIAL']);
    filaBanner.height = 34;
    sheet.mergeCells(2, 1, 2, Math.max(totalColumnasMatriz, 8));
    const celdaBanner = filaBanner.getCell(1);
    celdaBanner.font = { name: 'Arial', size: 14, bold: true, color: { argb: COLOR_HEADER_TEXT } };
    celdaBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
    celdaBanner.alignment = { vertical: 'middle', horizontal: 'center' };

    // FILA 3: Subtítulo - Nombre de la Capacitación
    const filaTitulo = sheet.addRow([`ACTIVIDAD: ${capacitacion.titulo.toUpperCase()}`]);
    filaTitulo.height = 26;
    sheet.mergeCells(3, 1, 3, Math.max(totalColumnasMatriz, 8));
    const celdaTitulo = filaTitulo.getCell(1);
    celdaTitulo.font = { name: 'Arial', size: 11, bold: true, color: { argb: COLOR_HEADER_TEXT } };
    celdaTitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_SUBHEADER_BG } };
    celdaTitulo.alignment = { vertical: 'middle', horizontal: 'center' };

    // FILA 4: Separador
    sheet.addRow([]);

    // FILAS 5 y 6: Bloque de Metadatos
    const fechaEmision = new Date().toLocaleString('es-ES', { 
        year: 'numeric', month: '2-digit', day: '2-digit', 
        hour: '2-digit', minute: '2-digit' 
    });

    const filaMeta1 = sheet.addRow([
        'Instructor:', capacitacion.instructor || 'No especificado', '',
        'Duración:', capacitacion.duracion || 'No especificada', '',
        'Fecha de Emisión:', fechaEmision
    ]);
    filaMeta1.height = 20;

    const filaMeta2 = sheet.addRow([
        'Total de Sesiones:', `${totalSesiones} ${totalSesiones === 1 ? 'Sesión' : 'Sesiones'}`, '',
        'Total Participantes:', `${participantes.length} registrados`, '',
        'Estado del Evento:', capacitacion.activa ? 'Activo (QR habilitado)' : 'Cerrado / Concluido'
    ]);
    filaMeta2.height = 20;

    // Estilos de metadatos
    [filaMeta1, filaMeta2].forEach(row => {
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            if ([1, 4, 7].includes(colNumber)) {
                cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: '334155' } };
            } else if ([2, 5, 8].includes(colNumber)) {
                cell.font = { name: 'Arial', size: 9, bold: false, color: { argb: '0F172A' } };
            }
        });
    });

    // FILA 7: Espacio antes de la tabla
    sheet.addRow([]);

    // FILA 8: Encabezados de la Tabla Matriz
    const headers = [
        '#',
        'Nombre Completo',
        'Empresa / Organización',
        'Modalidad',
        'Correo Electrónico',
        ...sesiones.map(s => `${s.nombre_sesion}${s.fecha ? ` (${new Date(s.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })})` : ''}`),
        'Total Asistidas',
        'Total Sesiones',
        '% Cumplimiento',
        'Estado Final'
    ];

    const filaHeaders = sheet.addRow(headers);
    filaHeaders.height = 28;

    filaHeaders.eachCell((cell, colNumber) => {
        cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: COLOR_HEADER_TEXT } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
        cell.alignment = { vertical: 'middle', horizontal: colNumber <= 3 ? 'left' : 'center', wrapText: true };
        cell.border = {
            top: { style: 'thin', color: { argb: '475569' } },
            bottom: { style: 'medium', color: { argb: COLOR_ACCENT } },
            left: { style: 'thin', color: { argb: '334155' } },
            right: { style: 'thin', color: { argb: '334155' } }
        };
    });

    // FILAS DE DATOS
    participantes.forEach((p, index) => {
        const rowData = [
            index + 1,
            p.nombre_usuario,
            p.empresa,
            p.modalidad,
            p.correo_usuario,
            ...p.asistenciasPorSesion.map(a => a.asistio ? 'PRESENTE' : 'AUSENTE'),
            p.total_sesiones_asistidas,
            totalSesiones,
            p.porcentaje_asistencia / 100, // Formato numérico para porcentaje en Excel
            p.cumplio_totalidad ? 'COMPLETO' : 'EN PROGRESO'
        ];

        const row = sheet.addRow(rowData);
        row.height = 22;

        const isEven = index % 2 === 0;
        const baseBgColor = isEven ? 'FFFFFF' : 'F8FAFC';

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            // Fuente base
            cell.font = { name: 'Arial', size: 9 };
            cell.border = {
                top: { style: 'thin', color: { argb: 'E2E8F0' } },
                bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
                left: { style: 'thin', color: { argb: 'E2E8F0' } },
                right: { style: 'thin', color: { argb: 'E2E8F0' } }
            };

            // Alineación y color según la columna
            if (colNumber === 1) {
                // Índice #
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.font = { name: 'Arial', size: 8, color: { argb: '64748B' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseBgColor } };
            } else if (colNumber === 2) {
                // Nombre Completo
                cell.alignment = { vertical: 'middle', horizontal: 'left' };
                cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: '0F172A' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseBgColor } };
            } else if (colNumber === 3) {
                // Empresa
                cell.alignment = { vertical: 'middle', horizontal: 'left' };
                cell.font = { name: 'Arial', size: 9, color: { argb: '334155' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseBgColor } };
            } else if (colNumber === 4) {
                // Modalidad
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseBgColor } };
            } else if (colNumber === 5) {
                // Correo
                cell.alignment = { vertical: 'middle', horizontal: 'left' };
                cell.font = { name: 'Arial', size: 8.5, color: { argb: '475569' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseBgColor } };
            } else if (colNumber > 5 && colNumber <= 5 + sesiones.length) {
                // Columnas de Sesiones (PRESENTE / AUSENTE)
                const val = cell.value;
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                if (val === 'PRESENTE') {
                    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: COLOR_PRESENTE_TEXT } };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_PRESENTE_BG } };
                } else {
                    cell.font = { name: 'Arial', size: 8.5, color: { argb: COLOR_AUSENTE_TEXT } };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_AUSENTE_BG } };
                }
            } else if (colNumber === 6 + sesiones.length) {
                // Total Asistidas
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: '0F172A' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseBgColor } };
            } else if (colNumber === 7 + sesiones.length) {
                // Total Sesiones
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.font = { name: 'Arial', size: 9, color: { argb: '64748B' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseBgColor } };
            } else if (colNumber === 8 + sesiones.length) {
                // % Cumplimiento
                cell.numFmt = '0.0%';
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.font = { name: 'Arial', size: 9, bold: true };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseBgColor } };
            } else if (colNumber === 9 + sesiones.length) {
                // Estado Final
                const cumplio = cell.value === 'COMPLETO';
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.font = { 
                    name: 'Arial', 
                    size: 8.5, 
                    bold: true, 
                    color: { argb: cumplio ? '166534' : '92400E' } 
                };
                cell.fill = { 
                    type: 'pattern', 
                    pattern: 'solid', 
                    fgColor: { argb: cumplio ? 'DCFCE7' : 'FEF3C7' } 
                };
            }
        });
    });

    // Auto-ajuste de ancho de columnas dinámico
    sheet.columns.forEach((column, colIdx) => {
        let maxLen = 0;
        column.eachCell({ includeEmpty: false }, (cell, rowIdx) => {
            if (rowIdx > 3) { // No medir el banner ni el título fusionados
                const cellLen = cell.value ? String(cell.value).length : 0;
                if (cellLen > maxLen) maxLen = cellLen;
            }
        });
        if (colIdx === 0) {
            column.width = 6;
        } else if (colIdx === 1) {
            column.width = Math.max(maxLen + 3, 24);
        } else if (colIdx === 2) {
            column.width = Math.max(maxLen + 3, 20);
        } else if (colIdx === 4) {
            column.width = Math.max(maxLen + 3, 26);
        } else {
            column.width = Math.max(maxLen + 4, 14);
        }
    });

    // Generar buffer en memoria
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
}

/**
 * --------------------------------------------------------------------
 * 2. REPORTE POR SESIÓN INDIVIDUAL EN PDF (.pdf)
 * --------------------------------------------------------------------
 * Genera un documento corporativo formal listo para auditoría o impresión,
 * con lista completa de acreditados, hora de registro y formato institucional.
 *
 * @param {number|string} sesionId - ID de la sesión
 * @param {object} pool - Pool de conexiones de PostgreSQL
 * @returns {Promise<Buffer>} - Buffer binario con el archivo .pdf
 */
async function generarPdfSesion(sesionId, pool) {
    // 1. Obtener datos de la sesión y su capacitación
    const sesRes = await pool.query(
        `SELECT 
            s.id, 
            s.nombre_sesion, 
            s.numero_sesion, 
            s.fecha, 
            s.activa, 
            c.id AS capacitacion_id, 
            c.titulo AS capacitacion_titulo, 
            c.instructor AS capacitacion_instructor,
            c.duracion AS capacitacion_duracion
         FROM sesiones s
         JOIN capacitaciones c ON s.capacitacion_id = c.id
         WHERE s.id = $1`,
        [sesionId]
    );

    if (sesRes.rows.length === 0) {
        throw new Error('Sesión no encontrada');
    }
    const sesion = sesRes.rows[0];

    // 2. Obtener lista de asistentes registrados en esta sesión con perfil maestro unificado
    const asistenciasRes = await pool.query(
        `SELECT 
            a.id, 
            a.sesion_id, 
            a.participant_id,
            COALESCE(p.nombre, a.nombre_usuario) AS nombre_usuario, 
            COALESCE(a.empresa, p.empresa, '—') AS empresa, 
            COALESCE(p.email_principal, a.correo_usuario) AS correo_usuario, 
            a.modalidad, 
            a.instructor, 
            COALESCE(a.fecha_hora_registro, a.fecha_registro) AS fecha_registro
         FROM asistencias a
         LEFT JOIN participantes p ON a.participant_id = p.id
         WHERE a.sesion_id = $1
         ORDER BY COALESCE(a.fecha_hora_registro, a.fecha_registro) ASC, a.id ASC`,
        [sesionId]
    );
    const asistentes = asistenciasRes.rows;

    // 3. Crear documento PDF con PDFKit
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 40, bottom: 50, left: 40, right: 40 },
                bufferPages: true,
                autoFirstPage: true,
                info: {
                    Title: `Reporte de Asistencia - ${sesion.nombre_sesion}`,
                    Author: 'ONE Consulting',
                    Subject: `Control de Asistencia QR - ${sesion.capacitacion_titulo}`,
                    Keywords: 'Asistencia, QR, ONE Consulting, Reporte'
                }
            });

            const buffers = [];
            doc.on('data', chunk => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', err => reject(err));

            const PAGE_WIDTH = doc.page.width;
            const PAGE_HEIGHT = doc.page.height;
            const MARGIN = 40;
            const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2); // 515.28 pt

            // Constantes de diseño
            const COLOR_NAVY = '#0F172A';
            const COLOR_BLUE = '#0284C7';
            const COLOR_CYAN = '#0EA5E9';
            const COLOR_SLATE_DARK = '#334155';
            const COLOR_SLATE_MUTED = '#64748B';
            const COLOR_LIGHT_BG = '#F8FAFC';
            const COLOR_BORDER = '#CBD5E1';

            // Anchos de columnas de la tabla (Total = 515 pt)
            const COL_WIDTHS = {
                num: 25,
                nombre: 135,
                empresa: 110,
                modalidad: 60,
                correo: 125,
                hora: 60
            };

            const COL_POS = {
                num: MARGIN,
                nombre: MARGIN + COL_WIDTHS.num,
                empresa: MARGIN + COL_WIDTHS.num + COL_WIDTHS.nombre,
                modalidad: MARGIN + COL_WIDTHS.num + COL_WIDTHS.nombre + COL_WIDTHS.empresa,
                correo: MARGIN + COL_WIDTHS.num + COL_WIDTHS.nombre + COL_WIDTHS.empresa + COL_WIDTHS.modalidad,
                hora: MARGIN + COL_WIDTHS.num + COL_WIDTHS.nombre + COL_WIDTHS.empresa + COL_WIDTHS.modalidad + COL_WIDTHS.correo
            };

            // Función para dibujar la cabecera de la página
            function dibujarEncabezadoPagina(esPrimeraPagina = false) {
                // Barra superior de acento
                doc.rect(MARGIN, MARGIN, CONTENT_WIDTH, 4)
                   .fill(COLOR_BLUE);

                // Título Institucional
                doc.fontSize(8)
                   .font('Helvetica-Bold')
                   .fillColor(COLOR_CYAN)
                   .text('ONE CONSULTING  •  SISTEMA DE CONTROL DE ASISTENCIA Y ACREDITACIÓN', MARGIN, MARGIN + 10);

                if (esPrimeraPagina) {
                    // Nombre de la Capacitación
                    doc.fontSize(16)
                       .font('Helvetica-Bold')
                       .fillColor(COLOR_NAVY)
                       .text(sesion.capacitacion_titulo, MARGIN, MARGIN + 26, { width: CONTENT_WIDTH });

                    const yAfterTitle = doc.y;

                    // Nombre de la Sesión y Badge de Estado
                    doc.fontSize(12)
                       .font('Helvetica-Bold')
                       .fillColor(COLOR_BLUE)
                       .text(`Sesión: ${sesion.nombre_sesion} (Sesión #${sesion.numero_sesion})`, MARGIN, yAfterTitle + 2);

                    const yCard = doc.y + 8;
                    const cardHeight = 52;

                    // Tarjeta de Metadatos
                    doc.roundedRect(MARGIN, yCard, CONTENT_WIDTH, cardHeight, 6)
                       .fillAndStroke(COLOR_LIGHT_BG, COLOR_BORDER);

                    const fechaFormateada = formatearFecha(sesion.fecha);
                    const estadoTexto = sesion.activa ? 'Abierta (Admite registros)' : 'Cerrada (Finalizada)';

                    // Columna 1 en la tarjeta
                    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLOR_SLATE_DARK)
                       .text('Fecha de la Sesión:', MARGIN + 12, yCard + 10)
                       .font('Helvetica').fillColor(COLOR_NAVY)
                       .text(fechaFormateada, MARGIN + 110, yCard + 10);

                    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLOR_SLATE_DARK)
                       .text('Instructor:', MARGIN + 12, yCard + 24)
                       .font('Helvetica').fillColor(COLOR_NAVY)
                       .text(sesion.capacitacion_instructor || 'No especificado', MARGIN + 110, yCard + 24);

                    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLOR_SLATE_DARK)
                       .text('Estado:', MARGIN + 12, yCard + 38)
                       .font('Helvetica-Bold').fillColor(sesion.activa ? '#166534' : '#991B1B')
                       .text(estadoTexto, MARGIN + 110, yCard + 38);

                    // Columna 2 en la tarjeta
                    const col2X = MARGIN + (CONTENT_WIDTH / 2) + 10;
                    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLOR_SLATE_DARK)
                       .text('Total Asistentes:', col2X, yCard + 10)
                       .font('Helvetica-Bold').fillColor(COLOR_BLUE)
                       .text(`${asistentes.length} participantes`, col2X + 90, yCard + 10);

                    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLOR_SLATE_DARK)
                       .text('Duración Estimada:', col2X, yCard + 24)
                       .font('Helvetica').fillColor(COLOR_NAVY)
                       .text(sesion.capacitacion_duracion || 'N/A', col2X + 90, yCard + 24);

                    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLOR_SLATE_DARK)
                       .text('Emisión:', col2X, yCard + 38)
                       .font('Helvetica').fillColor(COLOR_SLATE_MUTED)
                       .text(new Date().toLocaleDateString('es-ES'), col2X + 90, yCard + 38);

                    return yCard + cardHeight + 16;
                } else {
                    // Cabecera simplificada para páginas siguientes
                    doc.fontSize(9)
                       .font('Helvetica-Bold')
                       .fillColor(COLOR_NAVY)
                       .text(`${sesion.capacitacion_titulo} — ${sesion.nombre_sesion}`, MARGIN, MARGIN + 22);

                    return MARGIN + 40;
                }
            }

            // Función para dibujar los encabezados de la tabla
            function dibujarHeadersTabla(yPos) {
                const headerHeight = 20;
                doc.rect(MARGIN, yPos, CONTENT_WIDTH, headerHeight)
                   .fill(COLOR_NAVY);

                doc.fontSize(8)
                   .font('Helvetica-Bold')
                   .fillColor('#FFFFFF');

                doc.text('#', COL_POS.num + 5, yPos + 6, { width: COL_WIDTHS.num - 10, align: 'center' });
                doc.text('NOMBRE COMPLETO', COL_POS.nombre + 5, yPos + 6, { width: COL_WIDTHS.nombre - 10, align: 'left' });
                doc.text('EMPRESA / ORGANIZACIÓN', COL_POS.empresa + 5, yPos + 6, { width: COL_WIDTHS.empresa - 10, align: 'left' });
                doc.text('MODALIDAD', COL_POS.modalidad + 5, yPos + 6, { width: COL_WIDTHS.modalidad - 10, align: 'center' });
                doc.text('CORREO ELECTRÓNICO', COL_POS.correo + 5, yPos + 6, { width: COL_WIDTHS.correo - 10, align: 'left' });
                doc.text('HORA QR', COL_POS.hora + 5, yPos + 6, { width: COL_WIDTHS.hora - 10, align: 'center' });

                return yPos + headerHeight;
            }

            // Iniciar dibujo de primera página
            let currentY = dibujarEncabezadoPagina(true);
            currentY = dibujarHeadersTabla(currentY);

            // Si no hay asistentes registrados
            if (asistentes.length === 0) {
                doc.rect(MARGIN, currentY, CONTENT_WIDTH, 40)
                   .fillAndStroke('#FFFFFF', COLOR_BORDER);
                doc.fontSize(9).font('Helvetica-Oblique').fillColor(COLOR_SLATE_MUTED)
                   .text('No hay participantes registrados en esta sesión.', MARGIN, currentY + 15, {
                       width: CONTENT_WIDTH,
                       align: 'center'
                   });
            } else {
                // Filas de asistentes
                const rowHeight = 20;

                asistentes.forEach((a, idx) => {
                    // Verificar si se necesita salto de página
                    if (currentY + rowHeight > PAGE_HEIGHT - 65) {
                        doc.addPage();
                        currentY = dibujarEncabezadoPagina(false);
                        currentY = dibujarHeadersTabla(currentY);
                    }

                    const isEven = idx % 2 === 0;
                    const rowBg = isEven ? '#FFFFFF' : COLOR_LIGHT_BG;

                    doc.rect(MARGIN, currentY, CONTENT_WIDTH, rowHeight)
                       .fillAndStroke(rowBg, COLOR_BORDER);

                    // Columna #
                    doc.fontSize(7.5).font('Helvetica').fillColor(COLOR_SLATE_MUTED)
                       .text(String(idx + 1), COL_POS.num + 5, currentY + 6, { width: COL_WIDTHS.num - 10, align: 'center' });

                    // Columna Nombre
                    doc.fontSize(8).font('Helvetica-Bold').fillColor(COLOR_NAVY)
                       .text(toTitleCase(a.nombre_usuario) || 'Sin nombre', COL_POS.nombre + 5, currentY + 6, { 
                           width: COL_WIDTHS.nombre - 10, 
                           ellipsis: true, 
                           align: 'left' 
                       });

                    // Columna Empresa
                    doc.fontSize(7.5).font('Helvetica').fillColor(COLOR_SLATE_DARK)
                       .text(a.empresa || '—', COL_POS.empresa + 5, currentY + 6, { 
                           width: COL_WIDTHS.empresa - 10, 
                           ellipsis: true, 
                           align: 'left' 
                       });

                    // Columna Modalidad
                    const esVirtual = (a.modalidad || '').toLowerCase() === 'virtual';
                    doc.fontSize(7.5).font('Helvetica-Bold').fillColor(esVirtual ? '#0369A1' : '#15803D')
                       .text(esVirtual ? 'Virtual' : 'Presencial', COL_POS.modalidad + 5, currentY + 6, { 
                           width: COL_WIDTHS.modalidad - 10, 
                           align: 'center' 
                       });

                    // Columna Correo
                    doc.fontSize(7.5).font('Helvetica').fillColor(COLOR_SLATE_MUTED)
                       .text(a.correo_usuario || '—', COL_POS.correo + 5, currentY + 6, { 
                           width: COL_WIDTHS.correo - 10, 
                           ellipsis: true, 
                           align: 'left' 
                       });

                    // Columna Hora Registro
                    const horaStr = formatearHora(a.fecha_registro);
                    doc.fontSize(7.5).font('Helvetica').fillColor(COLOR_NAVY)
                       .text(horaStr, COL_POS.hora + 5, currentY + 6, { 
                           width: COL_WIDTHS.hora - 10, 
                           align: 'center' 
                       });

                    currentY += rowHeight;
                });
            }

            // Pie de página en todas las páginas generadas (Paginación X de Y)
            const pages = doc.bufferedPageRange();
            for (let i = 0; i < pages.count; i++) {
                doc.switchToPage(i);

                const footerY = PAGE_HEIGHT - 35;

                // Línea separadora
                doc.rect(MARGIN, footerY, CONTENT_WIDTH, 0.5)
                   .fill(COLOR_BORDER);

                doc.fontSize(7).font('Helvetica').fillColor(COLOR_SLATE_MUTED)
                   .text('ONE Consulting • Control de Acreditación Oficial vía QR • Documento Digital Verificable', MARGIN, footerY + 8, {
                       width: CONTENT_WIDTH / 2,
                       align: 'left'
                   });

                doc.fontSize(7).font('Helvetica-Bold').fillColor(COLOR_SLATE_DARK)
                   .text(`Página ${i + 1} de ${pages.count}`, MARGIN + (CONTENT_WIDTH / 2), footerY + 8, {
                       width: CONTENT_WIDTH / 2,
                       align: 'right'
                   });
            }

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = {
    generarExcelConsolidado,
    generarPdfSesion
};
