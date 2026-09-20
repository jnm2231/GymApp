import type { SQLiteDatabase } from 'expo-sqlite';
import { getDayExercises } from './days';
import { getUserWeight } from './settings';
import type {
  CardioEntry,
  CardioTracking,
  Day,
  ExerciseSet,
  ExerciseTracking,
  Session,
  SessionExercise,
  SessionExerciseWithSets,
  TrainingType,
} from './types';

export interface DayDurationEstimate {
  averageMs: number;
  sampleSize: number;
}

/** Sesión en curso o pausada (sólo puede haber una a la vez). */
export async function getActiveSession(db: SQLiteDatabase): Promise<Session | null> {
  return db.getFirstAsync<Session>(
    `SELECT * FROM sessions
      WHERE status IN ('active', 'paused')
      ORDER BY start_ts DESC LIMIT 1`
  );
}

export async function getSession(db: SQLiteDatabase, id: number): Promise<Session | null> {
  return db.getFirstAsync<Session>('SELECT * FROM sessions WHERE id = ?', [id]);
}

/** Duración media real de las últimas 20 sesiones finalizadas del mismo día. */
export async function getAverageDayDuration(
  db: SQLiteDatabase,
  dayId: number
): Promise<DayDurationEstimate | null> {
  const result = await db.getFirstAsync<{ average_ms: number | null; sample_size: number }>(
    `SELECT AVG(duration_ms) AS average_ms, COUNT(*) AS sample_size
       FROM (
         SELECT (SELECT MAX(activity_ts) FROM (
                   SELECT st.ts AS activity_ts
                     FROM sets st
                     JOIN session_exercises se ON se.id = st.session_exercise_id
                    WHERE se.session_id = s.id
                   UNION ALL
                   SELECT ce.ts AS activity_ts
                     FROM cardio_entries ce
                     JOIN session_exercises se ON se.id = ce.session_exercise_id
                    WHERE se.session_id = s.id
                 )) - s.start_ts AS duration_ms
           FROM sessions s
          WHERE s.day_id = ?
            AND s.status = 'finished'
            AND EXISTS (
              SELECT 1 FROM session_exercises se
              WHERE se.session_id = s.id AND (
                EXISTS (SELECT 1 FROM sets st WHERE st.session_exercise_id = se.id)
                OR EXISTS (SELECT 1 FROM cardio_entries ce WHERE ce.session_exercise_id = se.id)
              )
            )
          ORDER BY s.start_ts DESC
          LIMIT 20
       ) recent
      WHERE duration_ms >= 0`,
    [dayId]
  );
  if (result?.average_ms == null || result.sample_size === 0) return null;
  return { averageMs: Math.round(result.average_ms), sampleSize: result.sample_size };
}

/**
 * Inicia una sesión a partir de una plantilla de día. Toma un snapshot del
 * peso del usuario y crea un bloque (`session_exercises`) por cada ejercicio.
 */
export async function startSession(db: SQLiteDatabase, dayId: number): Promise<number> {
  const day = await db.getFirstAsync<Day>('SELECT * FROM days WHERE id = ?', [dayId]);
  const exercises = await getDayExercises(db, dayId);
  const userWeight = await getUserWeight(db);
  const now = Date.now();

  let sessionId = 0;
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      `INSERT INTO sessions (day_id, day_name, start_ts, end_ts, user_weight, status, day_type)
       VALUES (?, ?, ?, NULL, ?, 'active', ?)`,
      [dayId, day?.name ?? 'Entrenamiento', now, userWeight, day?.training_type ?? 'strength']
    );
    sessionId = res.lastInsertRowId;

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      await db.runAsync(
        `INSERT INTO session_exercises
           (session_id, exercise_id, exercise_name, es_corporal, weight, position, is_additional,
            status, exercise_type, cardio_tracking, tracking_mode)
         VALUES (?, ?, ?, ?, NULL, ?, 0, 'pending', ?, ?, ?)`,
        [
          sessionId,
          ex.id,
          ex.name,
          ex.es_corporal,
          i,
          ex.exercise_type,
          ex.cardio_tracking,
          ex.tracking_mode,
        ]
      );
    }
  });
  return sessionId;
}

export async function getSessionExercises(
  db: SQLiteDatabase,
  sessionId: number
): Promise<SessionExercise[]> {
  return db.getAllAsync<SessionExercise>(
    'SELECT * FROM session_exercises WHERE session_id = ? ORDER BY position ASC',
    [sessionId]
  );
}

export async function getSessionExercisesWithSets(
  db: SQLiteDatabase,
  sessionId: number
): Promise<SessionExerciseWithSets[]> {
  const blocks = await getSessionExercises(db, sessionId);
  const result: SessionExerciseWithSets[] = [];
  for (const b of blocks) {
    const sets = await db.getAllAsync<ExerciseSet>(
      'SELECT * FROM sets WHERE session_exercise_id = ? ORDER BY set_index ASC',
      [b.id]
    );
    const cardioEntry = await db.getFirstAsync<CardioEntry>(
      'SELECT * FROM cardio_entries WHERE session_exercise_id = ?',
      [b.id]
    );
    result.push({ ...b, sets, cardio_entry: cardioEntry ?? null });
  }
  return result;
}

/** Confirma (modo lectura) el peso global del bloque antes de registrar series. */
export async function setExerciseWeight(
  db: SQLiteDatabase,
  sessionExerciseId: number,
  weight: number | null
): Promise<void> {
  await db.runAsync('UPDATE session_exercises SET weight = ? WHERE id = ?', [
    weight,
    sessionExerciseId,
  ]);
}

/**
 * Registra una nueva serie (tick verde). Calcula el descanso respecto a la
 * serie inmediatamente anterior. La primera serie no tiene descanso y fija la
 * hora de inicio del ejercicio.
 */
export async function addSet(
  db: SQLiteDatabase,
  sessionExerciseId: number,
  reps: number,
  weight: number | null = null
): Promise<ExerciseSet> {
  const now = Date.now();
  const prev = await db.getFirstAsync<ExerciseSet>(
    'SELECT * FROM sets WHERE session_exercise_id = ? ORDER BY set_index DESC LIMIT 1',
    [sessionExerciseId]
  );

  const setIndex = prev ? prev.set_index + 1 : 1;
  const rest = prev ? Math.round((now - prev.ts) / 1000) : null;

  const res = await db.runAsync(
    `INSERT INTO sets (session_exercise_id, set_index, reps, ts, rest_seconds, weight)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionExerciseId, setIndex, reps, now, rest, weight]
  );

  // La primera serie marca el inicio del ejercicio y lo activa.
  if (!prev) {
    await db.runAsync(
      "UPDATE session_exercises SET start_ts = ?, status = 'active' WHERE id = ?",
      [now, sessionExerciseId]
    );
  }

  return {
    id: res.lastInsertRowId,
    session_exercise_id: sessionExerciseId,
    set_index: setIndex,
    reps,
    ts: now,
    rest_seconds: rest,
    weight,
    duration_seconds: null,
  };
}

/** Edita las repeticiones de una serie SIN tocar timestamps ni descansos. */
export async function updateSetReps(
  db: SQLiteDatabase,
  setId: number,
  reps: number
): Promise<void> {
  await db.runAsync('UPDATE sets SET reps = ? WHERE id = ?', [reps, setId]);
}

/**
 * Edita el peso de UNA serie. `weight` NULL hace que la serie vuelva a heredar el
 * peso global del ejercicio. No toca timestamps ni descansos.
 */
export async function updateSetWeight(
  db: SQLiteDatabase,
  setId: number,
  weight: number | null
): Promise<void> {
  await db.runAsync('UPDATE sets SET weight = ? WHERE id = ?', [weight, setId]);
}

export async function deleteSet(db: SQLiteDatabase, setId: number): Promise<void> {
  await db.runAsync('DELETE FROM sets WHERE id = ?', [setId]);
}

/** Inicia el cronómetro de la siguiente serie de aguante. */
export async function startHoldSet(
  db: SQLiteDatabase,
  sessionExerciseId: number
): Promise<void> {
  const now = Date.now();
  await db.runAsync(
    `UPDATE session_exercises
        SET timer_started_ts = ?, start_ts = COALESCE(start_ts, ?), status = 'active'
      WHERE id = ? AND timer_started_ts IS NULL`,
    [now, now, sessionExerciseId]
  );
}

/** Termina una serie de aguante y calcula tanto su duración como el descanso. */
export async function finishHoldSet(
  db: SQLiteDatabase,
  sessionExerciseId: number
): Promise<ExerciseSet | null> {
  let created: ExerciseSet | null = null;
  await db.withTransactionAsync(async () => {
    const block = await db.getFirstAsync<{ timer_started_ts: number | null }>(
      'SELECT timer_started_ts FROM session_exercises WHERE id = ?',
      [sessionExerciseId]
    );
    if (!block?.timer_started_ts) return;

    const previous = await db.getFirstAsync<ExerciseSet>(
      'SELECT * FROM sets WHERE session_exercise_id = ? ORDER BY set_index DESC LIMIT 1',
      [sessionExerciseId]
    );
    const now = Date.now();
    const durationSeconds = Math.max(1, Math.round((now - block.timer_started_ts) / 1000));
    const restSeconds = previous
      ? Math.max(0, Math.round((block.timer_started_ts - previous.ts) / 1000))
      : null;
    const setIndex = previous ? previous.set_index + 1 : 1;

    const result = await db.runAsync(
      `INSERT INTO sets
         (session_exercise_id, set_index, reps, ts, rest_seconds, weight, duration_seconds)
       VALUES (?, ?, 0, ?, ?, NULL, ?)`,
      [sessionExerciseId, setIndex, now, restSeconds, durationSeconds]
    );
    await db.runAsync(
      'UPDATE session_exercises SET timer_started_ts = NULL WHERE id = ?',
      [sessionExerciseId]
    );
    created = {
      id: result.lastInsertRowId,
      session_exercise_id: sessionExerciseId,
      set_index: setIndex,
      reps: 0,
      ts: now,
      rest_seconds: restSeconds,
      weight: null,
      duration_seconds: durationSeconds,
    };
  });
  return created;
}

export async function updateSetDuration(
  db: SQLiteDatabase,
  setId: number,
  durationSeconds: number
): Promise<void> {
  await db.runAsync('UPDATE sets SET duration_seconds = ? WHERE id = ?', [durationSeconds, setId]);
}

export async function completeCardioExercise(
  db: SQLiteDatabase,
  sessionExerciseId: number,
  durationSeconds: number | null,
  distanceKm: number | null,
  notes: string | null
): Promise<void> {
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO cardio_entries
         (session_exercise_id, duration_seconds, distance_km, notes, ts)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(session_exercise_id) DO UPDATE SET
         duration_seconds = excluded.duration_seconds,
         distance_km = excluded.distance_km,
         notes = excluded.notes,
         ts = excluded.ts`,
      [sessionExerciseId, durationSeconds, distanceKm, notes, now]
    );
    await db.runAsync(
      `UPDATE session_exercises
          SET start_ts = COALESCE(start_ts, ?), end_ts = ?, status = 'done'
        WHERE id = ?`,
      [now, now, sessionExerciseId]
    );
  });
}

export async function updateCardioEntry(
  db: SQLiteDatabase,
  sessionExerciseId: number,
  durationSeconds: number | null,
  distanceKm: number | null,
  notes: string | null
): Promise<void> {
  await db.runAsync(
    `UPDATE cardio_entries
        SET duration_seconds = ?, distance_km = ?, notes = ?
      WHERE session_exercise_id = ?`,
    [durationSeconds, distanceKm, notes, sessionExerciseId]
  );
}

/** Botón "Terminado": fija hora de fin y bloquea el bloque. */
export async function finishExercise(
  db: SQLiteDatabase,
  sessionExerciseId: number
): Promise<void> {
  await db.runAsync(
    "UPDATE session_exercises SET end_ts = ?, status = 'done' WHERE id = ?",
    [Date.now(), sessionExerciseId]
  );
}

/** Lápiz (editar): reabre el bloque para corregir SIN alterar las horas guardadas. */
export async function reopenExercise(
  db: SQLiteDatabase,
  sessionExerciseId: number
): Promise<void> {
  await db.runAsync("UPDATE session_exercises SET status = 'active' WHERE id = ?", [
    sessionExerciseId,
  ]);
}

/** Añade un ejercicio extra a la sesión sin tocar la plantilla del día. */
export async function addAdditionalExercise(
  db: SQLiteDatabase,
  sessionId: number,
  exerciseId: number,
  exerciseName: string,
  esCorporal: boolean,
  exerciseType: TrainingType = 'strength',
  cardioTracking: CardioTracking = 'both',
  trackingMode: ExerciseTracking = 'reps'
): Promise<number> {
  const row = await db.getFirstAsync<{ maxPos: number | null }>(
    'SELECT MAX(position) AS maxPos FROM session_exercises WHERE session_id = ?',
    [sessionId]
  );
  const position = (row?.maxPos ?? -1) + 1;
  const res = await db.runAsync(
    `INSERT INTO session_exercises
       (session_id, exercise_id, exercise_name, es_corporal, weight, position, is_additional,
        status, exercise_type, cardio_tracking, tracking_mode)
     VALUES (?, ?, ?, ?, NULL, ?, 1, 'pending', ?, ?, ?)`,
    [
      sessionId,
      exerciseId,
      exerciseName,
      esCorporal ? 1 : 0,
      position,
      exerciseType,
      cardioTracking,
      trackingMode,
    ]
  );
  return res.lastInsertRowId;
}

/** "Guardar": pausa la sesión para retomarla luego. */
export async function pauseSession(db: SQLiteDatabase, sessionId: number): Promise<void> {
  await db.runAsync("UPDATE sessions SET status = 'paused' WHERE id = ?", [sessionId]);
}

/** Reanuda una sesión pausada. */
export async function resumeSession(db: SQLiteDatabase, sessionId: number): Promise<void> {
  await db.runAsync("UPDATE sessions SET status = 'active' WHERE id = ?", [sessionId]);
}

/** "Fin": cierra la sesión por completo y guarda la hora de finalización. */
export async function finishSession(db: SQLiteDatabase, sessionId: number): Promise<void> {
  const runningHoldSets = await db.getAllAsync<{ id: number }>(
    'SELECT id FROM session_exercises WHERE session_id = ? AND timer_started_ts IS NOT NULL',
    [sessionId]
  );
  for (const block of runningHoldSets) await finishHoldSet(db, block.id);

  const now = Date.now();
  const lastSet = await db.getFirstAsync<{ last_ts: number | null }>(
    `SELECT MAX(activity_ts) AS last_ts FROM (
       SELECT st.ts AS activity_ts
         FROM sets st
         JOIN session_exercises se ON se.id = st.session_exercise_id
        WHERE se.session_id = ?
       UNION ALL
       SELECT ce.ts AS activity_ts
         FROM cardio_entries ce
         JOIN session_exercises se ON se.id = ce.session_exercise_id
        WHERE se.session_id = ?
     )`,
    [sessionId, sessionId]
  );
  const sessionEnd = lastSet?.last_ts ?? now;
  await db.withTransactionAsync(async () => {
    // Cierra cualquier ejercicio que tuviera series pero no se marcó terminado.
    await db.runAsync(
      `UPDATE session_exercises
          SET end_ts = COALESCE(end_ts, ?), status = 'done'
        WHERE session_id = ? AND start_ts IS NOT NULL AND status != 'done'`,
      [now, sessionId]
    );
    await db.runAsync("UPDATE sessions SET end_ts = ?, status = 'finished' WHERE id = ?", [
      sessionEnd,
      sessionId,
    ]);
  });
}

/** Cancela/descarta una sesión sin guardarla en el histórico. */
export async function discardSession(db: SQLiteDatabase, sessionId: number): Promise<void> {
  await db.runAsync('DELETE FROM sessions WHERE id = ?', [sessionId]);
}
