import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  CardioEntry,
  CardioTracking,
  ExerciseSet,
  ExerciseTracking,
  TrainingType,
} from './types';

export interface ExerciseHistoryEntry {
  session_id: number;
  session_exercise_id: number;
  day_name: string;
  session_start_ts: number;
  start_ts: number | null; // inicio del bloque (1ª serie)
  end_ts: number | null; // fin del bloque (Terminado)
  weight: number | null; // peso global / lastre
  es_corporal: number;
  user_weight: number | null; // snapshot del peso del usuario en esa sesión
  exercise_type: TrainingType;
  cardio_tracking: CardioTracking;
  tracking_mode: ExerciseTracking;
  sets: ExerciseSet[];
  cardio_entry: CardioEntry | null;
}

export interface PerformedExerciseSummary {
  exerciseId: number | null;
  name: string;
  timesPerformed: number;
  bestOneRepMax: number;
  exerciseType: TrainingType;
  trackingMode: ExerciseTracking;
}

/** Todos los ejercicios que aparecen al menos una vez en sesiones finalizadas. */
export async function getPerformedExerciseSummaries(
  db: SQLiteDatabase
): Promise<PerformedExerciseSummary[]> {
  return db.getAllAsync<PerformedExerciseSummary>(
    `SELECT se.exercise_id AS exerciseId,
            COALESCE(e.name, se.exercise_name) AS name,
            MAX(se.exercise_type) AS exerciseType,
            MAX(se.tracking_mode) AS trackingMode,
            COUNT(DISTINCT se.id) AS timesPerformed,
            MAX(CASE WHEN se.tracking_mode = 'reps' AND se.exercise_type != 'cardio' THEN COALESCE((
              SELECT MAX(
                (CASE WHEN se.es_corporal = 1
                      THEN COALESCE(s.user_weight, 0) + COALESCE(st.weight, se.weight, 0)
                      ELSE COALESCE(st.weight, se.weight, 0)
                 END) * (1 + st.reps / 30.0)
              ) FROM sets st WHERE st.session_exercise_id = se.id
            ), 0) ELSE 0 END) AS bestOneRepMax
       FROM session_exercises se
       JOIN sessions s ON s.id = se.session_id
       LEFT JOIN exercises e ON e.id = se.exercise_id
      WHERE s.status = 'finished'
        AND (
          EXISTS (SELECT 1 FROM sets st WHERE st.session_exercise_id = se.id)
          OR EXISTS (SELECT 1 FROM cardio_entries ce WHERE ce.session_exercise_id = se.id)
        )
      GROUP BY COALESCE(CAST(se.exercise_id AS TEXT), 'deleted:' || LOWER(se.exercise_name))
      ORDER BY name COLLATE NOCASE ASC`
  );
}

/**
 * Histórico completo de un ejercicio (todas las sesiones finalizadas en las que
 * se hizo y tuvo al menos una serie), ordenado cronológicamente ascendente.
 */
export async function getExerciseHistory(
  db: SQLiteDatabase,
  exerciseId: number
): Promise<ExerciseHistoryEntry[]> {
  const rows = await db.getAllAsync<Omit<ExerciseHistoryEntry, 'sets' | 'cardio_entry'>>(
    `SELECT se.session_id            AS session_id,
            se.id                    AS session_exercise_id,
            s.day_name               AS day_name,
            s.start_ts               AS session_start_ts,
            se.start_ts              AS start_ts,
            COALESCE((SELECT MAX(activity_ts) FROM (
                        SELECT st.ts AS activity_ts FROM sets st
                         WHERE st.session_exercise_id = se.id
                        UNION ALL
                        SELECT ce.ts AS activity_ts FROM cardio_entries ce
                         WHERE ce.session_exercise_id = se.id
                      )), se.end_ts) AS end_ts,
            se.weight                AS weight,
            se.es_corporal           AS es_corporal,
            s.user_weight            AS user_weight,
            se.exercise_type         AS exercise_type,
            se.cardio_tracking       AS cardio_tracking,
            se.tracking_mode         AS tracking_mode
       FROM session_exercises se
       JOIN sessions s ON s.id = se.session_id
      WHERE se.exercise_id = ?
        AND s.status = 'finished'
        AND (
          EXISTS (SELECT 1 FROM sets st WHERE st.session_exercise_id = se.id)
          OR EXISTS (SELECT 1 FROM cardio_entries ce WHERE ce.session_exercise_id = se.id)
        )
      ORDER BY s.start_ts ASC`,
    [exerciseId]
  );

  const entries: ExerciseHistoryEntry[] = [];
  for (const r of rows) {
    const sets = await db.getAllAsync<ExerciseSet>(
      'SELECT * FROM sets WHERE session_exercise_id = ? ORDER BY set_index ASC',
      [r.session_exercise_id]
    );
    const cardioEntry = await db.getFirstAsync<CardioEntry>(
      'SELECT * FROM cardio_entries WHERE session_exercise_id = ?',
      [r.session_exercise_id]
    );
    entries.push({ ...r, sets, cardio_entry: cardioEntry ?? null });
  }
  return entries;
}

/**
 * Resumen del último día que se hizo este ejercicio (para la "Referencia del
 * Día Anterior"). Devuelve peso y las repeticiones de aquella sesión.
 * Se puede excluir la sesión actual con `excludeSessionId`.
 */
export async function getLastExerciseSummary(
  db: SQLiteDatabase,
  exerciseId: number,
  excludeSessionId?: number
): Promise<{ weight: number | null; reps: number[] } | null> {
  const block = await db.getFirstAsync<{ id: number; weight: number | null }>(
    `SELECT se.id AS id, se.weight AS weight
       FROM session_exercises se
       JOIN sessions s ON s.id = se.session_id
      WHERE se.exercise_id = ?
        AND s.status = 'finished'
        AND (? IS NULL OR se.session_id != ?)
        AND se.tracking_mode = 'reps'
        AND EXISTS (SELECT 1 FROM sets st WHERE st.session_exercise_id = se.id)
      ORDER BY s.start_ts DESC
      LIMIT 1`,
    [exerciseId, excludeSessionId ?? null, excludeSessionId ?? null]
  );
  if (!block) return null;

  const sets = await db.getAllAsync<{ reps: number }>(
    'SELECT reps FROM sets WHERE session_exercise_id = ? ORDER BY set_index ASC',
    [block.id]
  );
  return { weight: block.weight, reps: sets.map((s) => s.reps) };
}
