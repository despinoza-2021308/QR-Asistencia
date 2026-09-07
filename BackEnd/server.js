/**
 * ====================================================================
 * SERVIDOR BACKEND - SISTEMA DE CONTROL DE ASISTENCIA MULTI-SESIÓN QR
 * Tecnologías: Node.js, Express, PostgreSQL (pg), Crypto, CORS, Dotenv
 * ====================================================================
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const crypto = require('crypto');
const os = require('os');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { generarExcelConsolidado, generarPdfSesion } = require('./services/reportesService');

const app = express();
const PORT = process.env.PORT || 4000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

// Validación estricta de seguridad para JWT_SECRET
if (IS_PRODUCTION && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
    console.error('❌ ERROR FATAL DE SEGURIDAD: En producción, JWT_SECRET es obligatorio y debe tener al menos 32 caracteres.');
    process.exit(1);
}

// Clave secreta para firma y verificación de JWT (en desarrollo local genera advertencia si usa fallback)
const JWT_SECRET = process.env.JWT_SECRET || (
    IS_PRODUCTION 
        ? null 
        : 'one-consulting-dev-secret-key-do-not-use-in-production-2026'
);

if (!process.env.JWT_SECRET && !IS_PRODUCTION) {
    console.warn('⚠️ AVISO DE SEGURIDAD: JWT_SECRET no está definido en el entorno. Usando clave efímera para desarrollo local.');
}

// Obtener la dirección IP local de la máquina en la red Wi-Fi/Ethernet
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

const LOCAL_IP = getLocalIpAddress();
// URL base para Códigos QR
const FRONTEND_URL = process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost')
    ? process.env.FRONTEND_URL
    : `http://${LOCAL_IP}:5173`;

// --------------------------------------------------------------------
// 1. Configuración de Middlewares de Seguridad y Red
// --------------------------------------------------------------------

// Cabeceras de seguridad HTTP con Helmet (oculta x-powered-by, previene clickjacking, etc.)
app.use(helmet({
    contentSecurityPolicy: false, // Permitir estilos inline de Tailwind y scripts de Vite
    crossOriginEmbedderPolicy: false
}));

// Configuración de Orígenes Permitidos para CORS (Protegido contra accesos no autorizados)
const allowedOrigins = [
    process.env.FRONTEND_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    !IS_PRODUCTION ? 'http://localhost:5173' : null,
    !IS_PRODUCTION ? 'http://localhost:3000' : null,
    !IS_PRODUCTION ? 'http://127.0.0.1:5173' : null,
    !IS_PRODUCTION ? `http://${LOCAL_IP}:5173` : null
].filter(Boolean);

function isAllowedOrigin(origin) {
    // Permitir peticiones sin origen (apps móviles nativas, curl, server-to-server)
    if (!origin) return true;

    const cleanOrigin = origin.replace(/\/$/, '');

    for (const allowed of allowedOrigins) {
        if (allowed && cleanOrigin === allowed.replace(/\/$/, '')) {
            return true;
        }
    }

    // Permitir subdominios de preview específicos de este mismo proyecto en Vercel
    if (process.env.VERCEL && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
        const baseProjectName = process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\.vercel\.app$/, '');
        const previewRegex = new RegExp(`^https:\\/\\/${baseProjectName}(-[a-z0-9-]+)?\\.vercel\\.app$`, 'i');
        if (previewRegex.test(cleanOrigin)) {
            return true;
        }
    }

    return false;
}

app.use(cors({
    origin: function (origin, callback) {
        if (isAllowedOrigin(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Bloqueado por política de seguridad CORS.'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition']
}));

app.use(express.json({ limit: '500kb' }));

// --------------------------------------------------------------------
// 2. Limitadores de Tasa (Rate Limiting contra ataques de DoS y Fuerza Bruta)
// --------------------------------------------------------------------
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 1500, // Aumentado a 1500 para permitir auto-actualización en vivo cada 3.5s sin bloqueos
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Por favor intenta de nuevo en unos minutos.' }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10, // máximo 10 intentos fallidos
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos de acceso. Por seguridad, espera 15 minutos.' }
});

const registroLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 30, // máximo 30 registros por minuto por IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes de registro. Por favor espera un minuto.' }
});

// Aplicar limitador general a la API
app.use('/api', apiLimiter);

// --------------------------------------------------------------------
// 3. Funciones Criptográficas y Middleware de Autenticación
// --------------------------------------------------------------------

/**
 * Limpia y sanitiza cadenas de texto para evitar caracteres de control no imprimibles,
 * inyecciones de código HTML/XSS y espacios múltiples innecesarios.
 */
function cleanString(str, maxLength = 255) {
    if (typeof str !== 'string') return '';
    // 1. Eliminar etiquetas HTML
    let sanitized = str.replace(/<[^>]*>?/gm, '');
    // 2. Eliminar caracteres de control no imprimibles excepto saltos de línea estándar (\n, \r)
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    // 3. Colapsar espacios múltiples en un solo espacio y hacer trim
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    return sanitized.substring(0, maxLength);
}

/**
 * Valida si un valor es un número entero positivo válido (> 0)
 */
function isValidInteger(val) {
    if (val === undefined || val === null || val === '') return false;
    const num = Number(val);
    return Number.isInteger(num) && num > 0;
}

/**
 * Comparación segura contra ataques de tiempo (Timing Attacks)
 */
function safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const hashA = crypto.createHash('sha256').update(a).digest();
    const hashB = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Derivación criptográfica de contraseña usando algoritmo scrypt nativo
 */
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

/**
 * Verificación segura de contraseñas contra hash scrypt o comparación constante
 */
function verifyPassword(inputPassword, storedHashOrPassword) {
    if (typeof inputPassword !== 'string' || typeof storedHashOrPassword !== 'string') return false;

    // Formato hash seguro: scrypt$<salt>$<hexKey>
    if (storedHashOrPassword.startsWith('scrypt$')) {
        const parts = storedHashOrPassword.split('$');
        if (parts.length !== 3) return false;
        const salt = parts[1];
        const keyHex = parts[2];
        const derivedKey = crypto.scryptSync(inputPassword, salt, 64);
        const keyBuffer = Buffer.from(keyHex, 'hex');
        if (derivedKey.length !== keyBuffer.length) return false;
        return crypto.timingSafeEqual(derivedKey, keyBuffer);
    }

    // Fallback seguro usando comparación a prueba de timing attacks
    return safeCompare(inputPassword, storedHashOrPassword);
}

/**
 * Middleware para proteger rutas administrativas con JWT
 */
function requireAdminAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'Acceso no autorizado: Token no proporcionado.' });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return res.status(401).json({ error: 'Formato de autorización inválido. Se espera Bearer <token>' });
    }

    const token = parts[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.', expired: true });
        }
        return res.status(401).json({ error: 'Token de acceso no válido o revocado.' });
    }
}


// --------------------------------------------------------------------
// 2. Configuración del Pool de Conexión a PostgreSQL (Local o Supabase)
// --------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;

const pool = new Pool(
    DATABASE_URL
        ? {
            connectionString: DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000
        }
        : {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432', 10),
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'Onecon',
            database: process.env.DB_NAME || 'postgres',
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        }
);

// Comprobar la conexión inicial con la base de datos y asegurar esquema
pool.connect(async (err, client, release) => {
    if (err) {
        console.error('❌ Error crítico al conectar con PostgreSQL:', err.message);
        if (!DATABASE_URL) {
            console.error('💡 AYUDA: No se detectó DATABASE_URL en las variables de entorno. Verifica que el archivo .env exista o configura DATABASE_URL en Vercel/Render.');
        }
    } else {
        const dbName = DATABASE_URL ? 'Supabase Cloud PostgreSQL' : (process.env.DB_NAME || 'postgres');
        console.log('✅ Conexión exitosa a PostgreSQL en:', dbName);
        try {
            // Asegurar columna activa en capacitaciones para control de ciclo de vida
            await client.query('ALTER TABLE capacitaciones ADD COLUMN IF NOT EXISTS activa BOOLEAN DEFAULT TRUE;');
            // Asegurar índice único por sesión y correo normalizado para evitar duplicados por condiciones de carrera
            await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_asistencia_unica_sesion_correo ON asistencias (sesion_id, LOWER(TRIM(correo_usuario)));');
        } catch (schemaErr) {
            console.warn('Aviso sobre esquema en PostgreSQL:', schemaErr.message);
        } finally {
            release();
        }
    }
});

// --------------------------------------------------------------------
// 3. ENDPOINTS DE LA API
// --------------------------------------------------------------------

/**
 * @route   GET /api/health
 * @desc    Verificar el estado del servidor
 */
app.get(['/api/health', '/api'], (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Servidor operativo' });
});

/**
 * @route   POST /api/login
 * @desc    Autenticación de administrador de ONE Consulting (Protegido con Hashing, Anti-Fuerza Bruta y Timing Attacks)
 * @body    { username, password }
 */
app.post('/api/login', loginLimiter, (req, res) => {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USER || (IS_PRODUCTION ? null : 'soporteone');
    const adminPassOrHash = process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD || (IS_PRODUCTION ? null : 'OneCon2026');

    if (!username || !password) {
        return res.status(400).json({ error: 'Por favor ingresa usuario y contraseña.' });
    }

    if (!adminUser || !adminPassOrHash) {
        console.error('❌ Error de seguridad: Las credenciales de administrador no están configuradas en el entorno de producción.');
        return res.status(500).json({ error: 'Error de configuración del servidor. Contacta al soporte técnico.' });
    }

    const isUserValid = safeCompare(username.trim(), adminUser);
    const isPassValid = verifyPassword(password, adminPassOrHash);

    if (isUserValid && isPassValid) {
        // Generar token criptográfico firmado JWT (vigencia de 2 horas por seguridad)
        const expiresIn = process.env.JWT_EXPIRES_IN || '2h';
        const token = jwt.sign(
            { username: adminUser, role: 'admin' },
            JWT_SECRET,
            { expiresIn }
        );

        return res.status(200).json({
            success: true,
            message: 'Acceso autorizado',
            token: token,
            usuario: {
                username: adminUser,
                nombre: 'Administrador ONE Consulting'
            }
        });
    }

    return res.status(401).json({ error: 'Usuario o contraseña incorrectos. Verifica tus credenciales.' });
});

/**
 * @route   POST /api/logout
 * @desc    Cierre seguro de sesión de administrador
 */
app.post('/api/logout', (req, res) => {
    res.status(200).json({ success: true, message: 'Sesión finalizada correctamente.' });
});

/**
 * @route   GET /api/capacitaciones
 * @desc    Listar todas las actividades con total de sesiones y asistencias (Protegida)
 */
app.get('/api/capacitaciones', requireAdminAuth, async (req, res) => {
    try {
        const query = `
            SELECT 
                c.id, 
                c.titulo, 
                c.descripcion, 
                c.instructor, 
                c.duracion, 
                c.token, 
                COALESCE(c.activa, TRUE) AS activa,
                c.fecha_creacion,
                COUNT(DISTINCT s.id)::int AS total_sesiones,
                COUNT(DISTINCT a.id)::int AS total_asistencias
            FROM capacitaciones c
            LEFT JOIN sesiones s ON c.id = s.capacitacion_id
            LEFT JOIN asistencias a ON s.id = a.sesion_id
            GROUP BY c.id
            ORDER BY c.id DESC;
        `;
        const result = await pool.query(query);

        // Añadir qr_url para cada capacitación
        const capacitacionesConUrl = result.rows.map(cap => ({
            ...cap,
            qr_url: `${FRONTEND_URL}/?token=${cap.token}`
        }));

        res.status(200).json(capacitacionesConUrl);
    } catch (error) {
        console.error('Error al obtener capacitaciones:', error);
        res.status(500).json({ error: 'Error interno al consultar capacitaciones' });
    }
});

/**
 * @route   POST /api/capacitaciones
 * @desc    Crear nueva actividad, generar su token único de QR y crear automáticamente N sesiones (Protegida)
 * @body    { titulo, cantidad_sesiones, descripcion, instructor, duracion }
 */
app.post('/api/capacitaciones', requireAdminAuth, async (req, res) => {
    const { titulo, cantidad_sesiones, descripcion, instructor, duracion } = req.body;

    const tituloLimpio = cleanString(titulo, 200);
    const descLimpia = descripcion ? cleanString(descripcion, 1000) : null;
    const instructorLimpio = instructor ? cleanString(instructor, 120) : null;
    const duracionLimpia = duracion ? cleanString(duracion, 60) : null;

    if (!tituloLimpio) {
        return res.status(400).json({ error: 'El nombre de la actividad es obligatorio y no puede estar vacío.' });
    }

    const numSesiones = parseInt(cantidad_sesiones, 10) || 1;
    if (numSesiones < 1 || numSesiones > 50) {
        return res.status(400).json({ error: 'La cantidad de sesiones debe ser entre 1 y 50.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Generar token criptográfico único para el QR del Evento
        const token = crypto.randomBytes(32).toString('hex');

        // 2. Insertar Actividad (Activa por defecto)
        const capQuery = `
            INSERT INTO capacitaciones (titulo, descripcion, instructor, duracion, token, activa)
            VALUES ($1, $2, $3, $4, $5, TRUE)
            RETURNING *;
        `;
        const capResult = await client.query(capQuery, [
            tituloLimpio,
            descLimpia,
            instructorLimpio,
            duracionLimpia,
            token
        ]);
        const nuevaCapacitacion = capResult.rows[0];

        // 3. Crear automáticamente las N sesiones asociadas (Sesión 1 activa por defecto, las demás cerradas)
        const sesionesCreadas = [];
        for (let i = 1; i <= numSesiones; i++) {
            const estaActiva = i === 1; // Solo la primera sesión queda abierta inicialmente
            const sesionQuery = `
                INSERT INTO sesiones (capacitacion_id, nombre_sesion, numero_sesion, fecha, activa)
                VALUES ($1, $2, $3, CURRENT_DATE, $4)
                RETURNING *;
            `;
            const nombreSesion = numSesiones === 1 ? 'Sesión Única' : `Sesión ${i}`;
            const sRes = await client.query(sesionQuery, [nuevaCapacitacion.id, nombreSesion, i, estaActiva]);
            sesionesCreadas.push(sRes.rows[0]);
        }

        await client.query('COMMIT');

        const qrUrl = `${FRONTEND_URL}/?token=${token}`;

        res.status(201).json({
            message: 'Actividad creada exitosamente',
            capacitacion: {
                ...nuevaCapacitacion,
                qr_url: qrUrl,
                total_sesiones: numSesiones,
                sesiones: sesionesCreadas
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al crear capacitación:', error);
        res.status(500).json({ error: 'Error interno al registrar la actividad' });
    } finally {
        client.release();
    }
});

/**
 * @route   PUT /api/capacitaciones/:id/toggle
 * @desc    Activar o cerrar/finalizar una capacitación completa (Protegida)
 */
app.put('/api/capacitaciones/:id/toggle', requireAdminAuth, async (req, res) => {
    const { id } = req.params;
    if (!isValidInteger(id)) {
        return res.status(400).json({ error: 'El ID de la capacitación debe ser un número entero válido.' });
    }
    try {
        const result = await pool.query(
            'UPDATE capacitaciones SET activa = NOT COALESCE(activa, TRUE) WHERE id = $1 RETURNING *',
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Capacitación no encontrada.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error al alternar estado de capacitación:', error);
        res.status(500).json({ error: 'Error al actualizar el estado de la actividad' });
    }
});

/**
 * @route   GET /api/sesiones/capacitacion/:capacitacionId
 * @desc    Obtener todas las sesiones de una capacitación dada con conteo de asistentes (Protegida)
 */
app.get('/api/sesiones/capacitacion/:capacitacionId', requireAdminAuth, async (req, res) => {
    const { capacitacionId } = req.params;
    if (!isValidInteger(capacitacionId)) {
        return res.status(400).json({ error: 'El ID de la capacitación debe ser un número entero válido.' });
    }

    try {
        const query = `
            SELECT 
                s.id, 
                s.capacitacion_id, 
                s.nombre_sesion, 
                s.numero_sesion, 
                s.fecha, 
                s.activa, 
                s.fecha_creacion,
                COUNT(a.id)::int AS total_asistentes
            FROM sesiones s
            LEFT JOIN asistencias a ON s.id = a.sesion_id
            WHERE s.capacitacion_id = $1
            GROUP BY s.id
            ORDER BY s.numero_sesion ASC, s.id ASC;
        `;
        const result = await pool.query(query, [capacitacionId]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error al listar sesiones:', error);
        res.status(500).json({ error: 'Error al consultar las sesiones' });
    }
});

/**
 * @route   GET /api/sesiones/:id/asistencias
 * @desc    Obtener lista detallada de asistentes de una sesión específica (Protegida)
 */
app.get('/api/sesiones/:id/asistencias', requireAdminAuth, async (req, res) => {
    const { id } = req.params;
    if (!isValidInteger(id)) {
        return res.status(400).json({ error: 'El ID de la sesión debe ser un número entero válido.' });
    }

    try {
        // 1. Obtener datos de la sesión
        const sesionRes = await pool.query(
            `SELECT s.id, s.nombre_sesion, s.numero_sesion, s.fecha, s.activa, c.id AS capacitacion_id, c.titulo AS capacitacion_titulo
             FROM sesiones s
             JOIN capacitaciones c ON s.capacitacion_id = c.id
             WHERE s.id = $1`,
            [id]
        );

        if (sesionRes.rows.length === 0) {
            return res.status(404).json({ error: 'Sesión no encontrada.' });
        }

        const sesion = sesionRes.rows[0];

        // 2. Obtener lista de asistentes de esa sesión
        const asistenciasRes = await pool.query(
            `SELECT id, sesion_id, nombre_usuario, empresa, correo_usuario, modalidad, instructor, nombre_actividad, fecha_registro
             FROM asistencias
             WHERE sesion_id = $1
             ORDER BY fecha_registro DESC`,
            [id]
        );

        res.status(200).json({
            sesion: sesion,
            total_asistentes: asistenciasRes.rows.length,
            asistentes: asistenciasRes.rows
        });
    } catch (error) {
        console.error('Error al consultar asistentes de la sesión:', error);
        res.status(500).json({ error: 'Error interno al consultar asistentes de la sesión.' });
    }
});

/**
 * @route   POST /api/capacitaciones/:id/sesiones
 * @desc    Añadir una nueva sesión a una capacitación existente (Protegida)
 */
app.post('/api/capacitaciones/:id/sesiones', requireAdminAuth, async (req, res) => {
    const { id } = req.params;
    if (!isValidInteger(id)) {
        return res.status(400).json({ error: 'El ID de la capacitación debe ser un número entero válido.' });
    }
    const { nombre_sesion, fecha } = req.body;

    try {
        const lastSesionRes = await pool.query(
            'SELECT COALESCE(MAX(numero_sesion), 0) + 1 AS next_num FROM sesiones WHERE capacitacion_id = $1',
            [id]
        );
        const nextNum = lastSesionRes.rows[0].next_num;
        const nombreFinal = nombre_sesion && nombre_sesion.trim() !== '' 
            ? nombre_sesion.trim() 
            : `Sesión ${nextNum}`;

        const insertQuery = `
            INSERT INTO sesiones (capacitacion_id, nombre_sesion, numero_sesion, fecha, activa)
            VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), TRUE)
            RETURNING *;
        `;
        const result = await pool.query(insertQuery, [id, nombreFinal, nextNum, fecha || null]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error al agregar sesión:', error);
        res.status(500).json({ error: 'Error al agregar la sesión' });
    }
});

/**
 * @route   DELETE /api/sesiones/:id
 * @desc    Eliminar una sesión específica y sus asistencias asociadas (Protegida)
 */
app.delete('/api/sesiones/:id', requireAdminAuth, async (req, res) => {
    const { id } = req.params;
    if (!isValidInteger(id)) {
        return res.status(400).json({ error: 'El ID de la sesión debe ser un número entero válido.' });
    }
    try {
        const result = await pool.query('DELETE FROM sesiones WHERE id = $1 RETURNING id, nombre_sesion, capacitacion_id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Sesión no encontrada.' });
        }
        res.status(200).json({ message: 'Sesión eliminada exitosamente', sesion: result.rows[0] });
    } catch (error) {
        console.error('Error al eliminar sesión:', error);
        res.status(500).json({ error: 'Error al eliminar la sesión' });
    }
});

/**
 * @route   PUT /api/sesiones/:id/toggle
 * @desc    Activar o desactivar una sesión (Protegida)
 */
app.put('/api/sesiones/:id/toggle', requireAdminAuth, async (req, res) => {
    const { id } = req.params;
    if (!isValidInteger(id)) {
        return res.status(400).json({ error: 'El ID de la sesión debe ser un número entero válido.' });
    }
    try {
        const result = await pool.query(
            'UPDATE sesiones SET activa = NOT activa WHERE id = $1 RETURNING *',
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Sesión no encontrada.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error al alternar estado de sesión:', error);
        res.status(500).json({ error: 'Error al actualizar sesión' });
    }
});

/**
 * @route   DELETE /api/capacitaciones/:id
 * @desc    Eliminar una actividad completa y todas sus sesiones y asistencias asociadas (Protegida)
 */
app.delete('/api/capacitaciones/:id', requireAdminAuth, async (req, res) => {
    const { id } = req.params;
    if (!isValidInteger(id)) {
        return res.status(400).json({ error: 'El ID de la capacitación debe ser un número entero válido.' });
    }
    try {
        const result = await pool.query('DELETE FROM capacitaciones WHERE id = $1 RETURNING id, titulo', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Actividad no encontrada.' });
        }
        res.status(200).json({ message: 'Actividad eliminada exitosamente', capacitacion: result.rows[0] });
    } catch (error) {
        console.error('Error al eliminar actividad:', error);
        res.status(500).json({ error: 'Error al eliminar actividad' });
    }
});

/**
 * @route   GET /api/evento-info/:token
 * @desc    Obtener datos completos del evento y todas sus sesiones para la vista de Registro
 */
app.get(['/api/evento-info/:token', '/api/sesion-info/:token'], async (req, res) => {
    const { token } = req.params;

    try {
        const capQuery = `
            SELECT id, titulo, descripcion, instructor, duracion, token, COALESCE(activa, TRUE) AS activa, fecha_creacion
            FROM capacitaciones
            WHERE token = $1;
        `;
        const capResult = await pool.query(capQuery, [token]);

        if (capResult.rows.length > 0) {
            const capacitacion = capResult.rows[0];

            if (!capacitacion.activa) {
                return res.status(200).json({
                    tipo: 'evento',
                    id: capacitacion.id,
                    titulo: capacitacion.titulo,
                    descripcion: capacitacion.descripcion,
                    instructor: capacitacion.instructor,
                    duracion: capacitacion.duracion,
                    token: capacitacion.token,
                    activa: false,
                    mensaje_cierre: 'Esta actividad de capacitación ha concluido y ya no admite nuevos registros.',
                    sesiones: []
                });
            }

            const sesionesQuery = `
                SELECT id, nombre_sesion, numero_sesion, fecha, activa
                FROM sesiones
                WHERE capacitacion_id = $1
                ORDER BY numero_sesion ASC, id ASC;
            `;
            const sesionesResult = await pool.query(sesionesQuery, [capacitacion.id]);

            return res.status(200).json({
                tipo: 'evento',
                id: capacitacion.id,
                titulo: capacitacion.titulo,
                descripcion: capacitacion.descripcion,
                instructor: capacitacion.instructor,
                duracion: capacitacion.duracion,
                token: capacitacion.token,
                activa: true,
                sesiones: sesionesResult.rows
            });
        }

        return res.status(404).json({ error: 'El código QR escaneado no es válido o no existe.' });

    } catch (error) {
        console.error('Error al consultar info del evento:', error);
        res.status(500).json({ error: 'Error interno al validar el código QR' });
    }
});

/**
 * @route   POST /api/registrar-asistencia
 * @desc    Registrar la asistencia con Nombre, Empresa, Correo, Modalidad, Instructor y Sesión (Protegido contra IDOR)
 * @body    { token, sesion_id, nombre, empresa, correo, modalidad, instructor, nombre_actividad }
 */
app.post('/api/registrar-asistencia', registroLimiter, async (req, res) => {
    const { token, sesion_id, nombre, empresa, correo, modalidad, instructor, nombre_actividad, _hp_verificacion } = req.body;

    // 0. Trampa Honeypot contra Bots y Scripts de Scraping/Spam
    if (_hp_verificacion && typeof _hp_verificacion === 'string' && _hp_verificacion.trim() !== '') {
        console.warn('🤖 Intento de bot detectado y neutralizado mediante trampa Honeypot.');
        return res.status(200).json({
            message: '¡Asistencia registrada con éxito!',
            registro: {
                id: 0,
                nombre_usuario: 'Participante',
                nombre_sesion: 'Sesión',
                capacitacion_titulo: 'Capacitación'
            }
        });
    }

    // 1. Validaciones y sanitización con longitudes máximas
    const tokenLimpio = cleanString(token, 64);
    const nombreLimpio = cleanString(nombre, 120);
    const empresaLimpia = cleanString(empresa, 120);
    const correoLimpio = cleanString(correo, 120).toLowerCase();
    const modalidadLimpia = modalidad && modalidad.trim().toLowerCase() === 'virtual' ? 'Virtual' : 'Presencial';
    const instructorLimpio = instructor ? cleanString(instructor, 120) : null;
    const actividadLimpia = nombre_actividad ? cleanString(nombre_actividad, 200) : null;

    const errores = {};

    if (!tokenLimpio) {
        errores.token = 'El código QR o token de la actividad es obligatorio.';
    }

    if (!isValidInteger(sesion_id)) {
        errores.sesion_id = 'Debes seleccionar una sesión válida.';
    }

    if (!nombreLimpio || nombreLimpio.length < 3) {
        errores.nombre = 'Tu nombre completo debe tener al menos 3 caracteres.';
    } else if (!/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(nombreLimpio)) {
        errores.nombre = 'El nombre debe contener letras válidas (no solo números o símbolos).';
    }

    if (!empresaLimpia || empresaLimpia.length < 2) {
        errores.empresa = 'El nombre de la empresa u organización debe tener al menos 2 caracteres.';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!correoLimpio) {
        errores.correo = 'El correo electrónico es obligatorio.';
    } else if (!emailRegex.test(correoLimpio)) {
        errores.correo = 'El formato de correo electrónico no es válido.';
    }

    if (Object.keys(errores).length > 0) {
        return res.status(422).json({
            error: 'Por favor corrige los datos del formulario.',
            campos: errores
        });
    }

    try {
        // 2. Validar que la sesión exista, pertenezca a la capacitación con este token QR, esté activa y la capacitación no haya sido cerrada
        const sesionQuery = `
            SELECT s.id, s.nombre_sesion, s.numero_sesion, s.activa, c.id AS capacitacion_id, c.titulo AS capacitacion_titulo, COALESCE(c.activa, TRUE) AS capacitacion_activa
            FROM sesiones s
            JOIN capacitaciones c ON s.capacitacion_id = c.id
            WHERE s.id = $1 AND c.token = $2;
        `;
        const sesionResult = await pool.query(sesionQuery, [sesion_id, tokenLimpio]);

        if (sesionResult.rows.length === 0) {
            return res.status(404).json({ error: 'La sesión seleccionada no es válida para este código QR o no existe.' });
        }

        const sesion = sesionResult.rows[0];

        if (!sesion.capacitacion_activa) {
            return res.status(400).json({
                error: 'Esta actividad de capacitación ha sido finalizada y cerrada por el organizador. Ya no admite nuevos registros.'
            });
        }

        if (!sesion.activa) {
            return res.status(400).json({
                error: `La ${sesion.nombre_sesion} se encuentra cerrada y ya no admite registros.`
            });
        }

        // 3. Validar si ya existe un registro en esta sesión por Correo O por Nombre
        const duplicadoCheck = await pool.query(
            `SELECT id, nombre_usuario, correo_usuario, empresa, modalidad, instructor, fecha_registro 
             FROM asistencias 
             WHERE sesion_id = $1 
               AND (
                   LOWER(TRIM(correo_usuario)) = LOWER(TRIM($2)) 
                   OR LOWER(TRIM(nombre_usuario)) = LOWER(TRIM($3))
               )
             LIMIT 1;`,
            [sesion.id, correoLimpio, nombreLimpio]
        );

        if (duplicadoCheck.rows.length > 0) {
            const d = duplicadoCheck.rows[0];
            const esMismoNombre = d.nombre_usuario.trim().toLowerCase() === nombreLimpio.toLowerCase();
            const motivo = esMismoNombre 
                ? `el nombre "${d.nombre_usuario}"` 
                : `el correo "${d.correo_usuario}"`;

            return res.status(409).json({
                error: `⚠️ Ya existe una asistencia registrada en la ${sesion.nombre_sesion} con ${motivo}. No está permitido registrarse dos veces a la misma sesión.`,
                yaRegistrado: true,
                registro: {
                    ...d,
                    nombre_sesion: sesion.nombre_sesion,
                    capacitacion_titulo: actividadLimpia || sesion.capacitacion_titulo
                }
            });
        }

        // 4. Insertar asistencia
        const insertQuery = `
            INSERT INTO asistencias (sesion_id, nombre_usuario, empresa, correo_usuario, modalidad, instructor, nombre_actividad)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, sesion_id, nombre_usuario, empresa, correo_usuario, modalidad, instructor, nombre_actividad, fecha_registro;
        `;
        const insertResult = await pool.query(insertQuery, [
            sesion.id, 
            nombreLimpio, 
            empresaLimpia, 
            correoLimpio, 
            modalidadLimpia, 
            instructorLimpio, 
            actividadLimpia || sesion.capacitacion_titulo
        ]);

        res.status(201).json({
            message: '¡Asistencia registrada con éxito!',
            registro: {
                ...insertResult.rows[0],
                nombre_sesion: sesion.nombre_sesion,
                capacitacion_titulo: actividadLimpia || sesion.capacitacion_titulo
            }
        });

    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({
                error: 'Ya has registrado tu asistencia en esta sesión anteriormente.'
            });
        }

        console.error('Error al registrar asistencia:', error);
        res.status(500).json({ error: 'Error interno del servidor al procesar el registro.' });
    }
});

/**
 * @route   GET /api/reporte/capacitacion/:capacitacionId
 * @desc    Obtener reporte consolidado de asistencia (Protegida)
 */
app.get('/api/reporte/capacitacion/:capacitacionId', requireAdminAuth, async (req, res) => {
    const { capacitacionId } = req.params;
    if (!isValidInteger(capacitacionId)) {
        return res.status(400).json({ error: 'El ID de la capacitación debe ser un número entero válido.' });
    }

    try {
        const capInfoQuery = `
            SELECT id, titulo, descripcion, instructor, duracion, token
            FROM capacitaciones
            WHERE id = $1;
        `;
        const capInfoResult = await pool.query(capInfoQuery, [capacitacionId]);

        if (capInfoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Actividad no encontrada.' });
        }

        const capacitacion = capInfoResult.rows[0];

        const sesionesListQuery = `
            SELECT id, nombre_sesion, numero_sesion, fecha, activa,
                   (SELECT COUNT(*)::int FROM asistencias a WHERE a.sesion_id = s.id) AS total_asistentes
            FROM sesiones s
            WHERE s.capacitacion_id = $1
            ORDER BY s.numero_sesion ASC, s.id ASC;
        `;
        const sesionesListResult = await pool.query(sesionesListQuery, [capacitacionId]);
        const totalSesiones = sesionesListResult.rows.length;

        const reporteQuery = `
            SELECT 
                a.correo_usuario,
                a.nombre_usuario,
                MAX(a.empresa) AS empresa,
                MAX(a.modalidad) AS modalidad,
                MAX(a.instructor) AS instructor,
                COUNT(DISTINCT a.sesion_id)::int AS total_sesiones_asistidas,
                json_agg(
                    json_build_object(
                        'sesion_id', s.id,
                        'nombre_sesion', s.nombre_sesion,
                        'numero_sesion', s.numero_sesion,
                        'fecha_sesion', s.fecha,
                        'modalidad', a.modalidad,
                        'instructor', a.instructor,
                        'fecha_registro', a.fecha_registro
                    ) ORDER BY s.numero_sesion ASC, s.id ASC
                ) AS detalle_sesiones
            FROM asistencias a
            JOIN sesiones s ON a.sesion_id = s.id
            WHERE s.capacitacion_id = $1
            GROUP BY a.correo_usuario, a.nombre_usuario
            ORDER BY total_sesiones_asistidas DESC, a.nombre_usuario ASC;
        `;
        const reporteResult = await pool.query(reporteQuery, [capacitacionId]);

        const participantes = reporteResult.rows.map(user => {
            const porcentaje = totalSesiones > 0 
                ? Number(((user.total_sesiones_asistidas / totalSesiones) * 100).toFixed(1)) 
                : 0;

            const asistenciasSet = new Set(user.detalle_sesiones.map(d => d.sesion_id));

            return {
                nombre_usuario: user.nombre_usuario,
                empresa: user.empresa || 'No especificada',
                modalidad: user.modalidad || 'Presencial',
                instructor: user.instructor || 'No especificado',
                correo_usuario: user.correo_usuario,
                total_sesiones_asistidas: user.total_sesiones_asistidas,
                total_sesiones_capacitacion: totalSesiones,
                porcentaje_asistencia: porcentaje,
                cumplio_totalidad: user.total_sesiones_asistidas === totalSesiones && totalSesiones > 0,
                detalle_sesiones: user.detalle_sesiones,
                asistencias_por_sesion: sesionesListResult.rows.map(s => ({
                    sesion_id: s.id,
                    asistio: asistenciasSet.has(s.id)
                }))
            };
        });

        res.status(200).json({
            capacitacion: {
                ...capacitacion,
                total_sesiones: totalSesiones
            },
            sesiones: sesionesListResult.rows,
            total_participantes: participantes.length,
            participantes: participantes
        });

    } catch (error) {
        console.error('Error al generar reporte:', error);
        res.status(500).json({ error: 'Error interno al generar el reporte' });
    }
});

/**
 * @route   GET /api/reportes/consolidado/:capacitacionId
 * @desc    Descargar Reporte Consolidado Total en Excel (.xlsx) con matriz ejecutiva cruzada (Protegida)
 */
app.get('/api/reportes/consolidado/:capacitacionId', requireAdminAuth, async (req, res) => {
    const { capacitacionId } = req.params;
    if (!isValidInteger(capacitacionId)) {
        return res.status(400).json({ error: 'El ID de la capacitación debe ser un número entero válido.' });
    }

    try {
        const buffer = await generarExcelConsolidado(capacitacionId, pool);

        // Obtener título para el nombre de archivo amigable
        const capRes = await pool.query('SELECT titulo FROM capacitaciones WHERE id = $1', [capacitacionId]);
        const tituloSeguro = capRes.rows[0]?.titulo 
            ? capRes.rows[0].titulo.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50) 
            : `Capacitacion_${capacitacionId}`;

        const nombreArchivo = `Consolidado_Asistencia_${tituloSeguro}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
        res.setHeader('Content-Length', buffer.length);

        return res.status(200).send(buffer);
    } catch (error) {
        console.error('Error al generar Excel consolidado:', error);
        if (error.message === 'Capacitación no encontrada') {
            return res.status(404).json({ error: 'Capacitación no encontrada.' });
        }
        return res.status(500).json({ 
            error: 'Error interno al generar el reporte en Excel.',
            detalle: error.message || String(error)
        });
    }
});

/**
 * @route   GET /api/reportes/sesion/:sessionId
 * @desc    Descargar Reporte de Sesión Individual en PDF (.pdf) formal con lista de acreditados y horas (Protegida)
 */
app.get('/api/reportes/sesion/:sessionId', requireAdminAuth, async (req, res) => {
    const { sessionId } = req.params;
    if (!isValidInteger(sessionId)) {
        return res.status(400).json({ error: 'El ID de la sesión debe ser un número entero válido.' });
    }

    try {
        const buffer = await generarPdfSesion(sessionId, pool);

        // Obtener nombre de sesión para el archivo
        const sesRes = await pool.query('SELECT nombre_sesion FROM sesiones WHERE id = $1', [sessionId]);
        const nombreSeguro = sesRes.rows[0]?.nombre_sesion 
            ? sesRes.rows[0].nombre_sesion.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40) 
            : `Sesion_${sessionId}`;

        const nombreArchivo = `Lista_Asistencia_${nombreSeguro}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
        res.setHeader('Content-Length', buffer.length);

        return res.status(200).send(buffer);
    } catch (error) {
        console.error('Error al generar PDF de sesión:', error);
        if (error.message === 'Sesión no encontrada') {
            return res.status(404).json({ error: 'Sesión no encontrada.' });
        }
        return res.status(500).json({ 
            error: 'Error interno al generar el reporte en PDF.',
            detalle: error.message || String(error)
        });
    }
});

// --------------------------------------------------------------------
// 4. Manejo de Errores Global Seguro
// --------------------------------------------------------------------
app.use((err, req, res, next) => {
    if (err && err.message && err.message.includes('CORS')) {
        return res.status(403).json({ error: 'Acceso denegado por política de seguridad de origen (CORS).' });
    }
    console.error('⚠️ Error procesado en middleware:', err.message || err);
    res.status(err.status || 500).json({ error: 'Ha ocurrido un error en el servidor. Inténtalo de nuevo más tarde.' });
});

// --------------------------------------------------------------------
// 5. Inicio del Servidor y Exportación para Vercel
// --------------------------------------------------------------------
if (require.main === module || !process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Servidor ejecutándose en: http://localhost:${PORT} y http://${LOCAL_IP}:${PORT}`);
        console.log(`📡 URL base configurada para QR: ${FRONTEND_URL}`);
    });
}

module.exports = app;
