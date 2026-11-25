import type { SQLiteDatabase } from 'expo-sqlite';
import { averageOneRepMax } from '../lib/calc.ts';
import type {
  CardioEntry,
  CardioTracking,
  ExerciseSet,
  ExerciseTracking,
  SetSide,
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
  is_unilateral: number;
  is_in_progress: boolean;
  strava_name: string | null;
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

export interface ExerciseCatalogSummary {
  id: number;
  name: string;
  exerciseType: TrainingType;
  trackingMode: ExerciseTracking;
  esCorporal: number;
  isUnilateral: number;
  muscleGroupId: number | null;
  muscleGroupName: string | null;
  timesPerformed: number;
  bestOneRepMax: number;
}

export interface LastExerciseSetSummary {
  setIndex: number;
  reps: number;
  weight: number;
  side: SetSide | null;
  sideOrder: number | null;
}

export interface LastExerciseSummary {
  globalWeight: number | null;
  isUnilateral: boolean;
  sets: LastExerciseSetSummary[];
}

/** Todos los ejercicios activos del catálogo con sus métricas de sesiones finalizadas. */
export async function getExerciseCatalogSummaries(
  db: SQLiteDatabase
): Promise<ExerciseCatalogSummary[]> {
  const exercises = await db.getAllAsync<{
    id: number;
    name: string;
    exerciseType: TrainingType;
    trackingMode: ExerciseTracking;
    esCorporal: number;
    isUnilateral: number;
    muscleGroupId: number | null;
    muscleGroupName: string | null;
  }>(
    `SELECT e.id,
            e.name,
            e.exercise_type AS exerciseType,
            e.tracking_mode AS trackingMode,
            e.es_corporal AS esCorporal,
            e.is_unilateral AS isUnilateral,
            e.muscle_group_id AS muscleGroupId,
            mg.name AS muscleGroupName
       FROM exercises e
       LEFT JOIN muscle_groups mg ON mg.id = e.muscle_group_id
      WHERE e.archived_at IS NULL
      ORDER BY e.name COLLATE NOCASE ASC`
  );

  const results: ExerciseCatalogSummary[] = [];

  for (const ex of exercises) {
    const blocks = await db.getAllAsync<{
      id: number;
      weight: number | null;
      es_corporal: number;
      user_weight: number | null;
      exercise_type: TrainingType;
    }>(
      `SELECT se.id, se.weight, se.es_corporal, s.user_weight, se.exercise_type
         FROM session_exercises se
         JOIN sessions s ON s.id = se.session_id
        WHERE se.exercise_id = ?
          AND s.status = 'finished'
          AND (
            EXISTS (SELECT 1 FROM sets st WHERE st.session_exercise_id = se.id)
            OR EXISTS (SELECT 1 FROM cardio_entries ce WHERE ce.session_exercise_id = se.id)
          )`,
      [ex.id]
    );

    let bestOneRepMax = 0;
    for (const b of blocks) {
      if (b.exercise_type === 'cardio' || b.exercise_type === 'hold') continue;
      const sets = await db.getAllAsync<ExerciseSet>(
        'SELECT * FROM sets WHERE session_exercise_id = ? ORDER BY set_index ASC, COALESCE(side_order, 0) ASC, id ASC',
        [b.id]
      );
      const dayAvg = averageOneRepMax(
        sets,
        b.weight ?? 0,
        b.es_corporal === 1,
        b.user_weight ?? 0
      );
      if (dayAvg > bestOneRepMax) bestOneRepMax = dayAvg;
    }

    results.push({
      ...ex,
      timesPerformed: blocks.length,
      bestOneRepMax,
    });
  }

  return results;
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
            MAX(CASE WHEN se.exercise_type NOT IN ('cardio', 'hold') THEN COALESCE((
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
        AND (se.exercise_id IS NOT NULL OR NOT EXISTS (
          SELECT 1 FROM strava_activities sa WHERE sa.session_id = s.id
        ))
        AND (
          EXISTS (SELECT 1 FROM sets st WHERE st.session_exercise_id = se.id)
          OR EXISTS (SELECT 1 FROM cardio_entries ce WHERE ce.session_exercise_id = se.id)
        )
      GROUP BY COALESCE(CAST(se.exercise_id AS TEXT), 'deleted:' || LOWER(se.exercise_name))
      ORDER BY name COLLATE NOCASE ASC`
  );
}

/**
 * Histórico completo de un ejercicio (sesiones finalizadas y, opcionalmente,
 * el ejercicio ya marcado como terminado en una sesión en curso), ordenado
 * cronológicamente ascendente.
 */
export async function getExerciseHistory(
  db: SQLiteDatabase,
  exerciseId: number,
  options?: { includeActiveSessionId?: number | null }
): Promise<ExerciseHistoryEntry[]> {
  const activeSessionId = options?.includeActiveSessionId ?? null;
  const rows = await db.getAllAsync<
    Omit<ExerciseHistoryEntry, 'sets' | 'cardio_entry' | 'is_in_progress'> & {
      session_status: string;
    }
  >(
    `SELECT se.session_id            AS session_id,
            se.id                    AS session_exercise_id,
            s.day_name               AS day_name,
            s.start_ts               AS session_start_ts,
            s.status                 AS session_status,
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
            se.tracking_mode         AS tracking_mode,
            se.is_unilateral         AS is_unilateral,
            sa.name                  AS strava_name
       FROM session_exercises se
       JOIN sessions s ON s.id = se.session_id
       LEFT JOIN strava_activities sa ON sa.session_id = s.id
      WHERE se.exercise_id = ?
        AND (
          s.status = 'finished'
          OR (? IS NOT NULL AND s.id = ? AND s.status IN ('active', 'paused') AND se.status = 'done')
        )
        AND (
          EXISTS (SELECT 1 FROM sets st WHERE st.session_exercise_id = se.id)
          OR EXISTS (SELECT 1 FROM cardio_entries ce WHERE ce.session_exercise_id = se.id)
        )
      ORDER BY s.start_ts ASC`,
    [exerciseId, activeSessionId, activeSessionId]
  );

  const entries: ExerciseHistoryEntry[] = [];
  for (const r of rows) {
    const sets = await db.getAllAsync<ExerciseSet>(
      'SELECT * FROM sets WHERE session_exercise_id = ? ORDER BY set_index ASC, COALESCE(side_order, 0) ASC, id ASC',
      [r.session_exercise_id]
    );
    const cardioEntry = await db.getFirstAsync<CardioEntry>(
      'SELECT * FROM cardio_entries WHERE session_exercise_id = ?',
      [r.session_exercise_id]
    );
    const { session_status, ...rest } = r;
    entries.push({
      ...rest,
      is_in_progress: session_status !== 'finished',
      sets,
      cardio_entry: cardioEntry ?? null,
    });
  }
  return entries;
}

/**
 * Resumen del último día que se hizo este ejercicio (para la "Referencia del
 * Día Anterior"). Devuelve los pesos y repeticiones reales de cada serie/lado.
 * Se puede excluir la sesión actual con `excludeSessionId`.
 */
export async function getLastExerciseSummary(
  db: SQLiteDatabase,
  exerciseId: number,
  excludeSessionId?: number
): Promise<LastExerciseSummary | null> {
  const block = await db.getFirstAsync<{
    id: number;
    weight: number | null;
    is_unilateral: number;
  }>(
    `SELECT se.id AS id, se.weight AS weight, se.is_unilateral AS is_unilateral
       FROM session_exercises se
       JOIN sessions s ON s.id = se.session_id
      WHERE se.exercise_id = ?
        AND s.status = 'finished'
        AND (? IS NULL OR se.session_id != ?)
        AND se.exercise_type NOT IN ('cardio', 'hold')
        AND EXISTS (SELECT 1 FROM sets st WHERE st.session_exercise_id = se.id)
      ORDER BY s.start_ts DESC
      LIMIT 1`,
    [exerciseId, excludeSessionId ?? null, excludeSessionId ?? null]
  );
  if (!block) return null;

  const sets = await db.getAllAsync<{
    set_index: number;
    reps: number;
    weight: number | null;
    side: SetSide | null;
    side_order: number | null;
  }>(
    `SELECT set_index, reps, weight, side, side_order
       FROM sets
      WHERE session_exercise_id = ?
      ORDER BY set_index ASC, COALESCE(side_order, 0) ASC, id ASC`,
    [block.id]
  );

  return {
    globalWeight: block.weight,
    isUnilateral: block.is_unilateral === 1,
    sets: sets.map((s) => ({
      setIndex: s.set_index,
      reps: s.reps,
      weight: s.weight ?? block.weight ?? 0,
      side: s.side,
      sideOrder: s.side_order,
    })),
  };
}
