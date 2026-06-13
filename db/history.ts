import type { SQLiteDatabase } from 'expo-sqlite';
import type { ExerciseSet } from './types';

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
  sets: ExerciseSet[];
}

/**
 * Histórico completo de un ejercicio (todas las sesiones finalizadas en las que
 * se hizo y tuvo al menos una serie), ordenado cronológicamente ascendente.
 */
export async function getExerciseHistory(
  db: SQLiteDatabase,
  exerciseId: number
): Promise<ExerciseHistoryEntry[]> {
  const rows = await db.getAllAsync<Omit<ExerciseHistoryEntry, 'sets'>>(
    `SELECT se.session_id            AS session_id,
            se.id                    AS session_exercise_id,
            s.day_name               AS day_name,
            s.start_ts               AS session_start_ts,
            se.start_ts              AS start_ts,
            se.end_ts                AS end_ts,
            se.weight                AS weight,
            se.es_corporal           AS es_corporal,
            s.user_weight            AS user_weight
       FROM session_exercises se
       JOIN sessions s ON s.id = se.session_id
      WHERE se.exercise_id = ?
        AND s.status = 'finished'
        AND EXISTS (SELECT 1 FROM sets st WHERE st.session_exercise_id = se.id)
      ORDER BY s.start_ts ASC`,
    [exerciseId]
  );

  const entries: ExerciseHistoryEntry[] = [];
  for (const r of rows) {
    const sets = await db.getAllAsync<ExerciseSet>(
      'SELECT * FROM sets WHERE session_exercise_id = ? ORDER BY set_index ASC',
      [r.session_exercise_id]
    );
    entries.push({ ...r, sets });
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
