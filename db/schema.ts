import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Versión del esquema. Se guarda con PRAGMA user_version para futuras migraciones.
 */
export const SCHEMA_VERSION = 1;

/**
 * Definición de tablas (Paso 1).
 *
 * Decisiones de diseño clave:
 * - El PESO es GLOBAL por ejercicio dentro de una sesión: se guarda en
 *   `session_exercises.weight`, NO en cada serie (`sets`).
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
  created_at  INTEGER NOT NULL
);

-- Plantillas de "tipo de día" (Pecho, Espalda, Pierna...)
CREATE TABLE IF NOT EXISTS days (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
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
  FOREIGN KEY (session_id)  REFERENCES sessions(id)  ON DELETE CASCADE,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE SET NULL
);

-- Series: repeticiones + timestamp + descanso calculado (sin peso, es global)
CREATE TABLE IF NOT EXISTS sets (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  session_exercise_id INTEGER NOT NULL,
  set_index           INTEGER NOT NULL,
  reps                INTEGER NOT NULL,
  ts                  INTEGER NOT NULL,
  rest_seconds        INTEGER,
  FOREIGN KEY (session_exercise_id) REFERENCES session_exercises(id) ON DELETE CASCADE
);

-- Ajustes / perfil (clave-valor). Incluye "user_weight".
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
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
`;

/**
 * Inicializa el esquema. Pensado para `SQLiteProvider onInit`.
 * Idempotente: usa IF NOT EXISTS y controla PRAGMA user_version.
 */
export async function initDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(CREATE_TABLES);

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  if (current < SCHEMA_VERSION) {
    // (Futuras migraciones incrementales irían aquí.)
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }

  // Semilla del peso del usuario si no existe.
  await db.runAsync(
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('user_weight', '0')`
  );
}

export const DATABASE_NAME = 'gymapp.db';
