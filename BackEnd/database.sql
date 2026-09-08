-- =====================================================
-- Esquema de Base de Datos para Control de Asistencia QR
-- Motor: PostgreSQL
-- Arquitectura: Modelo de Identidad Unificada (Maestro-Detalle)
-- =====================================================

-- 1. Tabla de Capacitaciones / Actividades Principales
CREATE TABLE IF NOT EXISTS capacitaciones (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    descripcion TEXT,
    instructor VARCHAR(255),
    duracion VARCHAR(100),
    token VARCHAR(64) UNIQUE NOT NULL,
    activa BOOLEAN DEFAULT TRUE,
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

-- 3. Tabla de Participantes (Perfil Maestro Unificado)
-- Almacena una única identidad canónica por persona dentro de cada capacitación,
-- evitando duplicaciones causadas por errores tipográficos en dispositivos móviles.
CREATE TABLE IF NOT EXISTS participantes (
    id SERIAL PRIMARY KEY,
    capacitacion_id INTEGER NOT NULL REFERENCES capacitaciones(id) ON DELETE CASCADE,
    nombre VARCHAR(255) NOT NULL,
    email_principal VARCHAR(255) NOT NULL,
    empresa VARCHAR(255),
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabla de Asistencias (Historial Transaccional de Acreditación)
-- Cada registro representa la asistencia de un participante maestro a una sesión concreta.
CREATE TABLE IF NOT EXISTS asistencias (
    id SERIAL PRIMARY KEY,
    sesion_id INTEGER NOT NULL REFERENCES sesiones(id) ON DELETE CASCADE,
    participant_id INTEGER NOT NULL REFERENCES participantes(id) ON DELETE CASCADE,
    modalidad VARCHAR(50) DEFAULT 'Presencial',
    instructor VARCHAR(255),
    nombre_actividad VARCHAR(255),
    fecha_hora_registro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Columnas para auditoría y retrocompatibilidad operativa
    nombre_usuario VARCHAR(255),
    correo_usuario VARCHAR(255),
    empresa VARCHAR(255),
    fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- RESTRICCIÓN ÚNICA: Un participante maestro sólo puede registrarse una vez por sesión
    CONSTRAINT uq_sesion_participante UNIQUE (sesion_id, participant_id)
);

-- =====================================================
-- Índices para Rendimiento y Reglas de Integridad
-- =====================================================

-- Índices en Capacitaciones y Sesiones
CREATE INDEX IF NOT EXISTS idx_capacitaciones_token ON capacitaciones(token);
CREATE INDEX IF NOT EXISTS idx_sesiones_capacitacion ON sesiones(capacitacion_id);

-- Índices en Participantes (Búsqueda Inteligente de Identidad)
CREATE INDEX IF NOT EXISTS idx_participantes_capacitacion ON participantes(capacitacion_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_participante_capacitacion_email 
    ON participantes (capacitacion_id, LOWER(TRIM(email_principal)));
CREATE INDEX IF NOT EXISTS idx_participantes_capacitacion_nombre 
    ON participantes (capacitacion_id, LOWER(TRIM(nombre)));

-- Índices en Asistencias (Transaccional y Reportes)
CREATE INDEX IF NOT EXISTS idx_asistencias_sesion ON asistencias(sesion_id);
CREATE INDEX IF NOT EXISTS idx_asistencias_participant ON asistencias(participant_id);
CREATE INDEX IF NOT EXISTS idx_asistencias_fecha_hora ON asistencias(fecha_hora_registro);
CREATE UNIQUE INDEX IF NOT EXISTS idx_asistencia_unica_sesion_participante 
    ON asistencias (sesion_id, participant_id);
