import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Versión del esquema. Se guarda con PRAGMA user_version para futuras migraciones.
 */
export const SCHEMA_VERSION = 6;

/**
 * Definición de tablas (Paso 1).
 *
 * Decisiones de diseño clave:
 * - El PESO tiene un valor por defecto GLOBAL por ejercicio dentro de una sesión
 *   (`session_exercises.weight`), pero cada serie puede sobreescribirlo
 *   (`sets.weight`). Si `sets.weight` es NULL, la serie hereda el peso global del
 *   ejercicio. (v2)
 * - Cada serie guarda su timestamp (`ts`) y el descanso calculado respecto a la
 *   serie inmediatamente anterior (`rest_seconds`). La primera serie no tiene
 *   descanso (NULL).
 * - `es_corporal` vive en el catálogo (`exercises`) y se "fotografía" en cada
 *   `session_exercises` para que el histórico no cambie si luego se edita el
 *   catálogo. Para ejercicios corporales, el 1RM usa (peso_usuario + lastre).
 * - `sessions.user_weight` guarda el peso del usuario en el momento de la sesión
 *   (snapshot) para que los cálculos históricos sean correctos.
 * - `dev_notes` (Backlog) se excluye obligatoriamente de export/import.
 */
const CREATE_TABLES = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Catálogo global de ejercicios
CREATE TABLE IF NOT EXISTS exercises (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  es_corporal INTEGER NOT NULL DEFAULT 0,
  exercise_type TEXT NOT NULL DEFAULT 'strength',
  cardio_tracking TEXT NOT NULL DEFAULT 'both',
  tracking_mode TEXT NOT NULL DEFAULT 'reps',
  created_at  INTEGER NOT NULL
);

-- Plantillas de "tipo de día" (Pecho, Espalda, Pierna...)
CREATE TABLE IF NOT EXISTS days (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  training_type TEXT NOT NULL DEFAULT 'strength',
  created_at INTEGER NOT NULL
);

-- Ejercicios que componen una plantilla de día (ordenados)
CREATE TABLE IF NOT EXISTS day_exercises (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id      INTEGER NOT NULL,
  exercise_id INTEGER NOT NULL,
  position    INTEGER NOT NULL,
  FOREIGN KEY (day_id)      REFERENCES days(id)      ON DELETE CASCADE,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);

-- Sesión de entrenamiento (instancia real, con timestamps de inicio/fin)
CREATE TABLE IF NOT EXISTS sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id      INTEGER,
  day_name    TEXT    NOT NULL,
  start_ts    INTEGER NOT NULL,
  end_ts      INTEGER,
  user_weight REAL,
  status      TEXT    NOT NULL DEFAULT 'active',
  day_type    TEXT    NOT NULL DEFAULT 'strength',
  FOREIGN KEY (day_id) REFERENCES days(id) ON DELETE SET NULL
);

-- Bloque de ejercicio dentro de una sesión (peso global aquí)
CREATE TABLE IF NOT EXISTS session_exercises (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER NOT NULL,
  exercise_id   INTEGER,
  exercise_name TEXT    NOT NULL,
  es_corporal   INTEGER NOT NULL DEFAULT 0,
  weight        REAL,
  position      INTEGER NOT NULL,
  is_additional INTEGER NOT NULL DEFAULT 0,
  start_ts      INTEGER,
  end_ts        INTEGER,
  status        TEXT    NOT NULL DEFAULT 'pending',
  exercise_type TEXT    NOT NULL DEFAULT 'strength',
  cardio_tracking TEXT  NOT NULL DEFAULT 'both',
  tracking_mode TEXT    NOT NULL DEFAULT 'reps',
  timer_started_ts INTEGER,
  FOREIGN KEY (session_id)  REFERENCES sessions(id)  ON DELETE CASCADE,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE SET NULL
);

-- Series: repeticiones + timestamp + descanso calculado.
-- weight (v2): peso de ESA serie. NULL = hereda el peso global del ejercicio.
CREATE TABLE IF NOT EXISTS sets (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  session_exercise_id INTEGER NOT NULL,
  set_index           INTEGER NOT NULL,
  reps                INTEGER NOT NULL,
  ts                  INTEGER NOT NULL,
  rest_seconds        INTEGER,
  weight              REAL,
  duration_seconds    INTEGER,
  FOREIGN KEY (session_exercise_id) REFERENCES session_exercises(id) ON DELETE CASCADE
);

-- Ajustes / perfil (clave-valor). Incluye "user_weight".
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Histórico de registros de peso corporal.
CREATE TABLE IF NOT EXISTS body_measurements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  weight      REAL    NOT NULL,
  recorded_at INTEGER NOT NULL
);

-- Resultado de un ejercicio cardiovascular dentro de una sesión.
CREATE TABLE IF NOT EXISTS cardio_entries (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  session_exercise_id INTEGER NOT NULL UNIQUE,
  duration_seconds    INTEGER,
  distance_km         REAL,
  notes               TEXT,
  ts                  INTEGER NOT NULL,
  FOREIGN KEY (session_exercise_id) REFERENCES session_exercises(id) ON DELETE CASCADE
);

-- Notas de Desarrollo (Backlog). EXCLUIDA de export/import.
CREATE TABLE IF NOT EXISTS dev_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  content    TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Índices para consultas frecuentes (histórico, referencia día anterior...)
CREATE INDEX IF NOT EXISTS idx_day_exercises_day      ON day_exercises(day_id);
CREATE INDEX IF NOT EXISTS idx_sess_ex_session         ON session_exercises(session_id);
CREATE INDEX IF NOT EXISTS idx_sess_ex_exercise        ON session_exercises(exercise_id);
CREATE INDEX IF NOT EXISTS idx_sets_sess_ex            ON sets(session_exercise_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status         ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_start          ON sessions(start_ts);
CREATE INDEX IF NOT EXISTS idx_body_measurements_date  ON body_measurements(recorded_at);
CREATE INDEX IF NOT EXISTS idx_cardio_entries_exercise ON cardio_entries(session_exercise_id);
`;

/**
 * Inicializa el esquema. Pensado para `SQLiteProvider onInit`.
 * Idempotente: usa IF NOT EXISTS y controla PRAGMA user_version.
 */
export async function initDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(CREATE_TABLES);

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  if (current < 2) {
    // Migración v1 -> v2: peso por serie. En instalaciones existentes la tabla
    // `sets` ya existe sin la columna `weight`, así que la añadimos con ALTER
    // (idempotente: solo si aún no está). Los datos previos quedan con NULL =
    // hereda el peso global, preservando el comportamiento anterior.
    const setsCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(sets)');
    if (!setsCols.some((c) => c.name === 'weight')) {
      await db.execAsync('ALTER TABLE sets ADD COLUMN weight REAL');
    }

  }

  if (current < 4) {
    const exerciseCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(exercises)');
    if (!exerciseCols.some((c) => c.name === 'exercise_type')) {
      await db.execAsync("ALTER TABLE exercises ADD COLUMN exercise_type TEXT NOT NULL DEFAULT 'strength'");
    }
    if (!exerciseCols.some((c) => c.name === 'cardio_tracking')) {
      await db.execAsync("ALTER TABLE exercises ADD COLUMN cardio_tracking TEXT NOT NULL DEFAULT 'both'");
    }

    const dayCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(days)');
    if (!dayCols.some((c) => c.name === 'training_type')) {
      await db.execAsync("ALTER TABLE days ADD COLUMN training_type TEXT NOT NULL DEFAULT 'strength'");
    }

    const sessionCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(sessions)');
    if (!sessionCols.some((c) => c.name === 'day_type')) {
      await db.execAsync("ALTER TABLE sessions ADD COLUMN day_type TEXT NOT NULL DEFAULT 'strength'");
    }

    const sessionExerciseCols = await db.getAllAsync<{ name: string }>(
      'PRAGMA table_info(session_exercises)'
    );
    if (!sessionExerciseCols.some((c) => c.name === 'exercise_type')) {
      await db.execAsync(
        "ALTER TABLE session_exercises ADD COLUMN exercise_type TEXT NOT NULL DEFAULT 'strength'"
      );
    }
    if (!sessionExerciseCols.some((c) => c.name === 'cardio_tracking')) {
      await db.execAsync(
        "ALTER TABLE session_exercises ADD COLUMN cardio_tracking TEXT NOT NULL DEFAULT 'both'"
      );
    }
  }

  if (current < 5) {
    const exerciseCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(exercises)');
    if (!exerciseCols.some((c) => c.name === 'tracking_mode')) {
      await db.execAsync("ALTER TABLE exercises ADD COLUMN tracking_mode TEXT NOT NULL DEFAULT 'reps'");
    }

    const sessionExerciseCols = await db.getAllAsync<{ name: string }>(
      'PRAGMA table_info(session_exercises)'
    );
    if (!sessionExerciseCols.some((c) => c.name === 'tracking_mode')) {
      await db.execAsync(
        "ALTER TABLE session_exercises ADD COLUMN tracking_mode TEXT NOT NULL DEFAULT 'reps'"
      );
    }
    if (!sessionExerciseCols.some((c) => c.name === 'timer_started_ts')) {
      await db.execAsync('ALTER TABLE session_exercises ADD COLUMN timer_started_ts INTEGER');
    }

    const setsCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(sets)');
    if (!setsCols.some((c) => c.name === 'duration_seconds')) {
      await db.execAsync('ALTER TABLE sets ADD COLUMN duration_seconds INTEGER');
    }

    // El antiguo indicador "corporal" pasa a ser una categoría de ejercicio.
    // Los snapshots históricos se actualizan también para que se muestren con
    // el nuevo nombre, sin alterar pesos, series ni cálculos previos.
    await db.execAsync(
      "UPDATE exercises SET exercise_type = 'calisthenics' WHERE es_corporal = 1;" +
      "UPDATE session_exercises SET exercise_type = 'calisthenics' WHERE es_corporal = 1;"
    );
  }

  if (current < 6) {
    // Aguante deja de ser un modo secundario de los ejercicios corporales y
    // pasa a ser un cuarto tipo independiente. Se conservan intactas todas las
    // series, duraciones, descansos y marcas de tiempo ya registradas.
    await db.execAsync(
      "UPDATE exercises SET exercise_type = 'hold', es_corporal = 0 WHERE tracking_mode = 'hold';" +
      "UPDATE session_exercises SET exercise_type = 'hold', es_corporal = 0 WHERE tracking_mode = 'hold';"
    );
  }

  if (current < SCHEMA_VERSION) await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);

  // Semilla del peso del usuario si no existe.
  await db.runAsync(
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('user_weight', '0')`
  );
}

export const DATABASE_NAME = 'gymapp.db';
