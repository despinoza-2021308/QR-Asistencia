-- =====================================================
-- Esquema de Base de Datos para Control de Asistencia QR
-- Motor: PostgreSQL
-- =====================================================

-- 1. Tabla de Capacitaciones / Actividades Principales
CREATE TABLE IF NOT EXISTS capacitaciones (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    descripcion TEXT,
    instructor VARCHAR(255),
    duracion VARCHAR(100),
    token VARCHAR(64) UNIQUE NOT NULL,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Sesiones (Cada módulo o jornada de la actividad)
CREATE TABLE IF NOT EXISTS sesiones (
    id SERIAL PRIMARY KEY,
    capacitacion_id INTEGER NOT NULL REFERENCES capacitaciones(id) ON DELETE CASCADE,
    nombre_sesion VARCHAR(255) NOT NULL,
    numero_sesion INTEGER DEFAULT 1,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    activa BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla de Asistencias (Registros individuales de participantes)
CREATE TABLE IF NOT EXISTS asistencias (
    id SERIAL PRIMARY KEY,
    sesion_id INTEGER NOT NULL REFERENCES sesiones(id) ON DELETE CASCADE,
    nombre_usuario VARCHAR(255) NOT NULL,
    empresa VARCHAR(255),
    correo_usuario VARCHAR(255) NOT NULL,
    modalidad VARCHAR(50) DEFAULT 'Presencial',
    instructor VARCHAR(255),
    nombre_actividad VARCHAR(255),
    fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- RESTRICCIÓN ÚNICA: Evita que el mismo correo registre asistencia dos veces en la misma sesión
    CONSTRAINT uq_sesion_correo UNIQUE (sesion_id, correo_usuario)
);

-- Índices recomendados para optimización de consultas
CREATE INDEX IF NOT EXISTS idx_capacitaciones_token ON capacitaciones(token);
CREATE INDEX IF NOT EXISTS idx_sesiones_capacitacion ON sesiones(capacitacion_id);
CREATE INDEX IF NOT EXISTS idx_asistencias_sesion ON asistencias(sesion_id);
CREATE INDEX IF NOT EXISTS idx_asistencias_correo ON asistencias(correo_usuario);
CREATE INDEX IF NOT EXISTS idx_asistencias_empresa ON asistencias(empresa);
CREATE INDEX IF NOT EXISTS idx_asistencias_modalidad ON asistencias(modalidad);
