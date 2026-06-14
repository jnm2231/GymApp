import type { SQLiteDatabase } from 'expo-sqlite';
import { getDayExercises } from './days';
import { getUserWeight } from './settings';
import type {
  ExerciseSet,
  Session,
  SessionExercise,
  SessionExerciseWithSets,
} from './types';

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

/**
 * Inicia una sesión a partir de una plantilla de día. Toma un snapshot del
 * peso del usuario y crea un bloque (`session_exercises`) por cada ejercicio.
 */
export async function startSession(db: SQLiteDatabase, dayId: number): Promise<number> {
  const day = await db.getFirstAsync<{ name: string }>('SELECT name FROM days WHERE id = ?', [
    dayId,
  ]);
  const exercises = await getDayExercises(db, dayId);
  const userWeight = await getUserWeight(db);
  const now = Date.now();

  let sessionId = 0;
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      `INSERT INTO sessions (day_id, day_name, start_ts, end_ts, user_weight, status)
       VALUES (?, ?, ?, NULL, ?, 'active')`,
      [dayId, day?.name ?? 'Entrenamiento', now, userWeight]
    );
    sessionId = res.lastInsertRowId;

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      await db.runAsync(
        `INSERT INTO session_exercises
           (session_id, exercise_id, exercise_name, es_corporal, weight, position, is_additional, status)
         VALUES (?, ?, ?, ?, NULL, ?, 0, 'pending')`,
        [sessionId, ex.id, ex.name, ex.es_corporal, i]
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
    result.push({ ...b, sets });
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
  esCorporal: boolean
): Promise<number> {
  const row = await db.getFirstAsync<{ maxPos: number | null }>(
    'SELECT MAX(position) AS maxPos FROM session_exercises WHERE session_id = ?',
    [sessionId]
  );
  const position = (row?.maxPos ?? -1) + 1;
  const res = await db.runAsync(
    `INSERT INTO session_exercises
       (session_id, exercise_id, exercise_name, es_corporal, weight, position, is_additional, status)
     VALUES (?, ?, ?, ?, NULL, ?, 1, 'pending')`,
    [sessionId, exerciseId, exerciseName, esCorporal ? 1 : 0, position]
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
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    // Cierra cualquier ejercicio que tuviera series pero no se marcó terminado.
    await db.runAsync(
      `UPDATE session_exercises
          SET end_ts = COALESCE(end_ts, ?), status = 'done'
        WHERE session_id = ? AND start_ts IS NOT NULL AND status != 'done'`,
      [now, sessionId]
    );
    await db.runAsync("UPDATE sessions SET end_ts = ?, status = 'finished' WHERE id = ?", [
      now,
      sessionId,
    ]);
  });
}

/** Cancela/descarta una sesión sin guardarla en el histórico. */
export async function discardSession(db: SQLiteDatabase, sessionId: number): Promise<void> {
  await db.runAsync('DELETE FROM sessions WHERE id = ?', [sessionId]);
}
