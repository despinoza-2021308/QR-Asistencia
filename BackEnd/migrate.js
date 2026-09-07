require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'Onecon',
    database: process.env.DB_NAME || 'postgres'
});

async function migrate() {
    try {
        console.log('Iniciando migración...');
        await pool.query(`ALTER TABLE capacitaciones ADD COLUMN IF NOT EXISTS instructor VARCHAR(255);`);
        await pool.query(`ALTER TABLE capacitaciones ADD COLUMN IF NOT EXISTS duracion VARCHAR(100);`);
        await pool.query(`ALTER TABLE capacitaciones ADD COLUMN IF NOT EXISTS token VARCHAR(64);`);
        await pool.query(`ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS numero_sesion INTEGER DEFAULT 1;`);
        await pool.query(`ALTER TABLE asistencias ADD COLUMN IF NOT EXISTS empresa VARCHAR(255);`);

        // Asignar tokens a capacitaciones existentes que no lo tengan
        const caps = await pool.query(`SELECT id, token FROM capacitaciones WHERE token IS NULL`);
        for (const row of caps.rows) {
            const tok = crypto.randomBytes(32).toString('hex');
            await pool.query(`UPDATE capacitaciones SET token = $1 WHERE id = $2`, [tok, row.id]);
        }

        await pool.query(`CREATE INDEX IF NOT EXISTS idx_capacitaciones_token ON capacitaciones(token);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_asistencias_empresa ON asistencias(empresa);`);
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_asistencia_unica_sesion_correo ON asistencias (sesion_id, LOWER(TRIM(correo_usuario)));`);

        console.log('✅ Migración completada con éxito!');

        process.exit(0);
    } catch (err) {
        console.error('❌ Error en migración:', err);
        process.exit(1);
    }
}

migrate();
