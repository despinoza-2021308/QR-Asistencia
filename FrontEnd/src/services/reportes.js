/**
 * ====================================================================
 * SERVICIO DE DESCARGA DE REPORTES BINARIOS (EXCEL & PDF)
 * Cliente FrontEnd - ONE Consulting
 * ====================================================================
 */

import axios, { API_BASE_URL } from './api';

/**
 * Helper para extraer el nombre del archivo de la cabecera Content-Disposition
 */
function extraerNombreArchivo(disposition, fallbackName) {
    if (!disposition) return fallbackName;
    const match = disposition.match(/filename="?([^";]+)"?/i);
    return match && match[1] ? match[1].trim() : fallbackName;
}

/**
 * Helper para disparar la descarga de un Blob en el navegador
 */
function dispararDescargaBlob(blob, filename) {
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
    }, 10000);
}

/**
 * Helper para procesar posibles errores que vienen como Blob (cuando responseType es 'blob')
 */
async function extraerMensajeErrorBlob(error, mensajePorDefecto) {
    if (error.response && error.response.data instanceof Blob) {
        try {
            const texto = await error.response.data.text();
            const json = JSON.parse(texto);
            if (json && json.error) return json.error;
        } catch {
            // No era JSON, usar default
        }
    }
    return error.response?.data?.error || error.message || mensajePorDefecto;
}

/**
 * 1. Descargar Reporte Consolidado Total en Excel (.xlsx)
 *
 * @param {number|string} capacitacionId - ID de la capacitación
 * @param {string} [titulo] - Título para nombre de archivo de respaldo
 * @returns {Promise<{ success: boolean, filename: string }>}
 */
export async function descargarExcelConsolidado(capacitacionId, titulo = 'Capacitacion') {
    try {
        const response = await axios.get(`${API_BASE_URL}/reportes/consolidado/${capacitacionId}`, {
            responseType: 'blob'
        });

        const tituloSeguro = String(titulo).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
        const fallbackName = `Consolidado_Asistencia_${tituloSeguro}.xlsx`;
        const filename = extraerNombreArchivo(response.headers['content-disposition'], fallbackName);

        const blob = new Blob([response.data], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });

        dispararDescargaBlob(blob, filename);
        return { success: true, filename };
    } catch (error) {
        const mensaje = await extraerMensajeErrorBlob(error, 'Error al descargar el reporte en Excel.');
        throw new Error(mensaje);
    }
}

/**
 * 2. Descargar Reporte de Sesión Individual en PDF (.pdf)
 *
 * @param {number|string} sesionId - ID de la sesión
 * @param {string} [nombreSesion] - Nombre de la sesión para respaldo
 * @returns {Promise<{ success: boolean, filename: string }>}
 */
export async function descargarPdfSesion(sesionId, nombreSesion = 'Sesion') {
    try {
        const response = await axios.get(`${API_BASE_URL}/reportes/sesion/${sesionId}`, {
            responseType: 'blob'
        });

        const sesionSegura = String(nombreSesion).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
        const fallbackName = `Lista_Asistencia_${sesionSegura}.pdf`;
        const filename = extraerNombreArchivo(response.headers['content-disposition'], fallbackName);

        const blob = new Blob([response.data], {
            type: 'application/pdf'
        });

        dispararDescargaBlob(blob, filename);
        return { success: true, filename };
    } catch (error) {
        const mensaje = await extraerMensajeErrorBlob(error, 'Error al descargar el reporte en PDF.');
        throw new Error(mensaje);
    }
}
