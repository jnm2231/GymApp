import type { SQLiteDatabase } from 'expo-sqlite';
import { reconcileAllImportedStravaActivities, resolveLegacyStravaExerciseId } from './strava.ts';

/**
 * Versión del esquema. Se guarda con PRAGMA user_version para futuras migraciones.
 */
export const SCHEMA_VERSION = 11;

export const DEFAULT_MUSCLE_GROUPS = [
  'Pecho',
  'Espalda',
  'Hombros',
  'Bíceps',
  'Tríceps',
  'Antebrazo',
  'Cuádriceps',
  'Isquiotibiales',
  'Glúteos',
  'Gemelos',
  'Abdomen/Core',
  'Aductores/Abductores',
  'Cuerpo completo',
] as const;

export async function seedDefaultMuscleGroups(db: SQLiteDatabase): Promise<void> {
  const now = Date.now();
  for (const name of DEFAULT_MUSCLE_GROUPS) {
    await db.runAsync('INSERT OR IGNORE INTO muscle_groups (name, created_at) VALUES (?, ?)', [
      name,
      now,
    ]);
  }
}

/**
 * Definición de tablas.
 *
 * Decisiones de diseño clave:
 * - El PESO tiene un valor por defecto GLOBAL por ejercicio dentro de una sesión
 *   (`session_exercises.weight`), pero cada serie puede sobreescribirlo
 *   (`sets.weight`). Si `sets.weight` es NULL, la serie hereda el peso global del
 *   ejercicio. (v2)
 * - Cada serie guarda su timestamp (`ts`) y el descanso calculado respecto a la
 *   serie inmediatamente anterior (`rest_seconds`). La primera serie no tiene
 *   descanso (NULL).
 * - En ejercicios unilaterales (`is_unilateral = 1`), cada serie (`set_index`)
 *   agrupa los lados `left` y `right` con `side_order` (1 o 2) y
 *   `side_rest_seconds` entre ambos lados.
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

-- Grupos musculares personalizables para clasificar ejercicios
CREATE TABLE IF NOT EXISTS muscle_groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  created_at INTEGER NOT NULL
);

-- Catálogo global de ejercicios
CREATE TABLE IF NOT EXISTS exercises (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL UNIQUE,
  es_corporal     INTEGER NOT NULL DEFAULT 0,
  exercise_type   TEXT    NOT NULL DEFAULT 'strength',
  cardio_tracking TEXT    NOT NULL DEFAULT 'both',
  tracking_mode   TEXT    NOT NULL DEFAULT 'reps',
  is_unilateral   INTEGER NOT NULL DEFAULT 0,
  muscle_group_id INTEGER REFERENCES muscle_groups(id) ON DELETE SET NULL,
  archived_at     INTEGER,
  created_at      INTEGER NOT NULL
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
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id       INTEGER NOT NULL,
  exercise_id      INTEGER,
  exercise_name    TEXT    NOT NULL,
  es_corporal      INTEGER NOT NULL DEFAULT 0,
  weight           REAL,
  position         INTEGER NOT NULL,
  is_additional    INTEGER NOT NULL DEFAULT 0,
  start_ts         INTEGER,
  end_ts           INTEGER,
  status           TEXT    NOT NULL DEFAULT 'pending',
  exercise_type    TEXT    NOT NULL DEFAULT 'strength',
  cardio_tracking  TEXT    NOT NULL DEFAULT 'both',
  tracking_mode    TEXT    NOT NULL DEFAULT 'reps',
  timer_started_ts INTEGER,
  is_unilateral    INTEGER NOT NULL DEFAULT 0,
  timer_side       TEXT,
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
  side                TEXT,
  side_order          INTEGER,
  side_rest_seconds   INTEGER,
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

-- Actividades externas y su asignación a ejercicios de cardio.
CREATE TABLE IF NOT EXISTS strava_mappings (
  sport_type TEXT PRIMARY KEY,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS strava_activities (
  activity_id TEXT PRIMARY KEY,
  athlete_id TEXT NOT NULL,
  sport_type TEXT NOT NULL,
  name TEXT NOT NULL,
  start_ts INTEGER NOT NULL,
  session_id INTEGER UNIQUE REFERENCES sessions(id) ON DELETE SET NULL,
  detail_loaded INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL
);

-- Notas de Desarrollo (Backlog). EXCLUIDA de export/import.
CREATE TABLE IF NOT EXISTS dev_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  content    TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Índices para consultas frecuentes (histórico, referencia día anterior...)
CREATE INDEX IF NOT EXISTS idx_day_exercises_day         ON day_exercises(day_id);
CREATE INDEX IF NOT EXISTS idx_sess_ex_session           ON session_exercises(session_id);
CREATE INDEX IF NOT EXISTS idx_sess_ex_exercise          ON session_exercises(exercise_id);
CREATE INDEX IF NOT EXISTS idx_sets_sess_ex              ON sets(session_exercise_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status           ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_start            ON sessions(start_ts);
CREATE INDEX IF NOT EXISTS idx_body_measurements_date    ON body_measurements(recorded_at);
CREATE INDEX IF NOT EXISTS idx_cardio_entries_exercise   ON cardio_entries(session_exercise_id);
CREATE INDEX IF NOT EXISTS idx_strava_activities_pending ON strava_activities(session_id, sport_type);
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

    await db.execAsync(
      "UPDATE exercises SET exercise_type = 'calisthenics' WHERE es_corporal = 1;" +
      "UPDATE session_exercises SET exercise_type = 'calisthenics' WHERE es_corporal = 1;"
    );
  }

  if (current < 6) {
    await db.execAsync(
      "UPDATE exercises SET exercise_type = 'hold', es_corporal = 0 WHERE tracking_mode = 'hold';" +
      "UPDATE session_exercises SET exercise_type = 'hold', es_corporal = 0 WHERE tracking_mode = 'hold';"
    );
  }

  if (current < 7) {
    await db.execAsync(
      "UPDATE exercises SET cardio_tracking = 'both' WHERE exercise_type = 'cardio';" +
      "UPDATE session_exercises SET cardio_tracking = 'both' WHERE exercise_type = 'cardio';"
    );
  }

  if (current < 8) {
    await db.execAsync(
      "UPDATE days SET training_type = 'calisthenics' WHERE training_type = 'hold';" +
      "UPDATE sessions SET day_type = 'calisthenics' WHERE day_type = 'hold';"
    );
  }

  if (current < 10) {
    const mappingCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(strava_mappings)');
    if (mappingCols.some((column) => column.name === 'day_id')) {
      const legacy = await db.getAllAsync<{ sport_type: string; day_id: number }>(
        'SELECT sport_type, day_id FROM strava_mappings'
      );
      const resolved: { sportType: string; exerciseId: number }[] = [];
      for (const mapping of legacy) {
        const exerciseId = await resolveLegacyStravaExerciseId(db, mapping.day_id);
        if (exerciseId != null) resolved.push({ sportType: mapping.sport_type, exerciseId });
      }
      await db.withTransactionAsync(async () => {
        await db.execAsync(
          `CREATE TABLE strava_mappings_v10 (
             sport_type TEXT PRIMARY KEY,
             exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE
           )`
        );
        for (const mapping of resolved) {
          await db.runAsync(
            'INSERT INTO strava_mappings_v10 (sport_type, exercise_id) VALUES (?, ?)',
            [mapping.sportType, mapping.exerciseId]
          );
        }
        await db.execAsync('DROP TABLE strava_mappings');
        await db.execAsync('ALTER TABLE strava_mappings_v10 RENAME TO strava_mappings');
      });
    }
    await reconcileAllImportedStravaActivities(db);
  }

  if (current < 11) {
    const exerciseCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(exercises)');
    if (!exerciseCols.some((c) => c.name === 'is_unilateral')) {
      await db.execAsync('ALTER TABLE exercises ADD COLUMN is_unilateral INTEGER NOT NULL DEFAULT 0');
    }
    if (!exerciseCols.some((c) => c.name === 'muscle_group_id')) {
      await db.execAsync(
        'ALTER TABLE exercises ADD COLUMN muscle_group_id INTEGER REFERENCES muscle_groups(id) ON DELETE SET NULL'
      );
    }
    if (!exerciseCols.some((c) => c.name === 'archived_at')) {
      await db.execAsync('ALTER TABLE exercises ADD COLUMN archived_at INTEGER');
    }

    const sessionExerciseCols = await db.getAllAsync<{ name: string }>(
      'PRAGMA table_info(session_exercises)'
    );
    if (!sessionExerciseCols.some((c) => c.name === 'is_unilateral')) {
      await db.execAsync(
        'ALTER TABLE session_exercises ADD COLUMN is_unilateral INTEGER NOT NULL DEFAULT 0'
      );
    }
    if (!sessionExerciseCols.some((c) => c.name === 'timer_side')) {
      await db.execAsync('ALTER TABLE session_exercises ADD COLUMN timer_side TEXT');
    }

    const setsCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(sets)');
    if (!setsCols.some((c) => c.name === 'side')) {
      await db.execAsync('ALTER TABLE sets ADD COLUMN side TEXT');
    }
    if (!setsCols.some((c) => c.name === 'side_order')) {
      await db.execAsync('ALTER TABLE sets ADD COLUMN side_order INTEGER');
    }
    if (!setsCols.some((c) => c.name === 'side_rest_seconds')) {
      await db.execAsync('ALTER TABLE sets ADD COLUMN side_rest_seconds INTEGER');
    }

    await db.execAsync(
      'CREATE INDEX IF NOT EXISTS idx_exercises_muscle_group ON exercises(muscle_group_id);' +
      'CREATE INDEX IF NOT EXISTS idx_exercises_archived ON exercises(archived_at);'
    );

    await seedDefaultMuscleGroups(db);
  }

  if (current < SCHEMA_VERSION) await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);

  // Semilla del peso del usuario si no existe.
  await db.runAsync(
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('user_weight', '0')`
  );
  await db.runAsync(
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('timer_notifications_enabled', '0')`
  );
  await db.runAsync(
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('weekly_weight_day', '1')`
  );
  await db.runAsync(
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('weekly_weight_hour', '9')`
  );
  await db.runAsync(
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('weekly_weight_minute', '0')`
  );
  await db.runAsync(
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('weekly_weight_tracking_enabled', '1')`
  );
}

export const DATABASE_NAME = 'gymapp.db';
