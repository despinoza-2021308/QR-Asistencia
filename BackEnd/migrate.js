require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;

const pool = new Pool(
    DATABASE_URL
        ? {
            connectionString: DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        }
        : {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432', 10),
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'Onecon',
            database: process.env.DB_NAME || 'postgres'
        }
);

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('🚀 [MIGRACIÓN] Iniciando actualización al Modelo de Identidad Unificada (Maestro-Detalle)...');
        await client.query('BEGIN');

        // 1. Columnas base en Capacitaciones y Sesiones
        await client.query(`ALTER TABLE capacitaciones ADD COLUMN IF NOT EXISTS instructor VARCHAR(255);`);
        await client.query(`ALTER TABLE capacitaciones ADD COLUMN IF NOT EXISTS duracion VARCHAR(100);`);
        await client.query(`ALTER TABLE capacitaciones ADD COLUMN IF NOT EXISTS token VARCHAR(64);`);
        await client.query(`ALTER TABLE capacitaciones ADD COLUMN IF NOT EXISTS activa BOOLEAN DEFAULT TRUE;`);
        await client.query(`ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS numero_sesion INTEGER DEFAULT 1;`);
        await client.query(`ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS activa BOOLEAN DEFAULT TRUE;`);

        // Asignar tokens a capacitaciones existentes que no lo tengan
        const caps = await client.query(`SELECT id, token FROM capacitaciones WHERE token IS NULL`);
        for (const row of caps.rows) {
            const tok = crypto.randomBytes(32).toString('hex');
            await client.query(`UPDATE capacitaciones SET token = $1 WHERE id = $2`, [tok, row.id]);
        }

        // 2. Crear Tabla Maestra: participantes
        console.log('📦 [MIGRACIÓN] Verificando / creando tabla maestra "participantes"...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS participantes (
                id SERIAL PRIMARY KEY,
                capacitacion_id INTEGER NOT NULL REFERENCES capacitaciones(id) ON DELETE CASCADE,
                nombre VARCHAR(255) NOT NULL,
                email_principal VARCHAR(255) NOT NULL,
                empresa VARCHAR(255),
                fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 3. Crear o actualizar Tabla Transaccional: asistencias
        console.log('📦 [MIGRACIÓN] Verificando columnas en tabla transaccional "asistencias"...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS asistencias (
                id SERIAL PRIMARY KEY,
                sesion_id INTEGER NOT NULL REFERENCES sesiones(id) ON DELETE CASCADE,
                nombre_usuario VARCHAR(255),
                correo_usuario VARCHAR(255),
                empresa VARCHAR(255),
                modalidad VARCHAR(50) DEFAULT 'Presencial',
                instructor VARCHAR(255),
                nombre_actividad VARCHAR(255),
                fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`ALTER TABLE asistencias ADD COLUMN IF NOT EXISTS participant_id INTEGER REFERENCES participantes(id) ON DELETE CASCADE;`);
        await client.query(`ALTER TABLE asistencias ADD COLUMN IF NOT EXISTS fecha_hora_registro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`);

        // Sincronizar fecha_hora_registro con fecha_registro previa si existe
        await client.query(`
            UPDATE asistencias 
            SET fecha_hora_registro = fecha_registro 
            WHERE fecha_hora_registro IS NULL AND fecha_registro IS NOT NULL;
        `);

        // 4. Migración de Datos Históricos:
        // Asignar participant_id a todas las asistencias existentes que aún no tengan uno
        const asistenciasPendientes = await client.query(`
            SELECT a.id, a.sesion_id, a.nombre_usuario, a.correo_usuario, a.empresa, s.capacitacion_id
            FROM asistencias a
            JOIN sesiones s ON a.sesion_id = s.id
            WHERE a.participant_id IS NULL AND a.correo_usuario IS NOT NULL;
        `);

        if (asistenciasPendientes.rows.length > 0) {
            console.log(`🔄 [MIGRACIÓN] Migrando ${asistenciasPendientes.rows.length} registros históricos hacia el perfil maestro...`);

            for (const asis of asistenciasPendientes.rows) {
                const correoNorm = (asis.correo_usuario || '').trim().toLowerCase();
                const nombreNorm = (asis.nombre_usuario || '').trim();
                const capId = asis.capacitacion_id;

                if (!correoNorm && !nombreNorm) continue;

                // Buscar si ya existe el maestro por correo en la capacitación
                let partRes = await client.query(`
                    SELECT id FROM participantes 
                    WHERE capacitacion_id = $1 AND LOWER(TRIM(email_principal)) = LOWER(TRIM($2))
                    LIMIT 1;
                `, [capId, correoNorm]);

                // Si no existe por correo, buscar por nombre exacto en la misma capacitación
                if (partRes.rows.length === 0 && nombreNorm) {
                    partRes = await client.query(`
                        SELECT id FROM participantes 
                        WHERE capacitacion_id = $1 AND LOWER(TRIM(nombre)) = LOWER(TRIM($2))
                        LIMIT 1;
                    `, [capId, nombreNorm]);
                }

                let participantId;
                if (partRes.rows.length > 0) {
                    participantId = partRes.rows[0].id;
                } else {
                    // Crear nuevo participante maestro
                    const nuevoPart = await client.query(`
                        INSERT INTO participantes (capacitacion_id, nombre, email_principal, empresa)
                        VALUES ($1, $2, $3, $4)
                        RETURNING id;
                    `, [capId, nombreNorm || 'Participante', correoNorm || 'sin-correo@asistencia.local', asis.empresa || null]);
                    participantId = nuevoPart.rows[0].id;
                }

                // Vincular asistencia al maestro
                await client.query(`
                    UPDATE asistencias 
                    SET participant_id = $1 
                    WHERE id = $2;
                `, [participantId, asis.id]);
            }
        }

        // 5. Limpieza de duplicados previos por sesión y participante antes de aplicar índice único
        await client.query(`
            DELETE FROM asistencias a
            USING asistencias b
            WHERE a.id > b.id 
              AND a.sesion_id = b.sesion_id 
              AND a.participant_id IS NOT NULL 
              AND a.participant_id = b.participant_id;
        `);

        // 6. Creación y actualización de Índices y Restricciones
        console.log('⚡ [MIGRACIÓN] Generando índices y restricciones de integridad...');
        await client.query(`CREATE INDEX IF NOT EXISTS idx_capacitaciones_token ON capacitaciones(token);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_sesiones_capacitacion ON sesiones(capacitacion_id);`);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_participantes_capacitacion ON participantes(capacitacion_id);`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_participante_capacitacion_email ON participantes (capacitacion_id, LOWER(TRIM(email_principal)));`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_participantes_capacitacion_nombre ON participantes (capacitacion_id, LOWER(TRIM(nombre)));`);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_asistencias_sesion ON asistencias(sesion_id);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_asistencias_participant ON asistencias(participant_id);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_asistencias_fecha_hora ON asistencias(fecha_hora_registro);`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_asistencia_unica_sesion_participante ON asistencias (sesion_id, participant_id);`);

        await client.query('COMMIT');
        console.log('✅ [MIGRACIÓN] ¡Migración completada con éxito! Modelo Maestro-Detalle listo.');
        process.exit(0);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ [MIGRACIÓN] Error fatal durante la migración:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
