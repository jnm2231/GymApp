import type { SQLiteDatabase } from 'expo-sqlite';
import type { ExerciseWithMuscleGroup, TrainingType } from './types';

export interface ExerciseMutationOptions {
  isUnilateral?: boolean;
  muscleGroupId?: number | null;
}

function normalizeExerciseFlags(
  exerciseType: TrainingType,
  options?: ExerciseMutationOptions
): {
  esCorporal: number;
  trackingMode: 'reps' | 'hold';
  isUnilateral: number;
  muscleGroupId: number | null;
} {
  const isCardio = exerciseType === 'cardio';
  return {
    esCorporal: exerciseType === 'calisthenics' ? 1 : 0,
    trackingMode: exerciseType === 'hold' ? 'hold' : 'reps',
    isUnilateral: isCardio ? 0 : options?.isUnilateral ? 1 : 0,
    muscleGroupId: isCardio ? null : (options?.muscleGroupId ?? null),
  };
}

/** Catálogo global de ejercicios, ordenado alfabéticamente. */
export async function listExercises(
  db: SQLiteDatabase,
  options?: { includeArchived?: boolean }
): Promise<ExerciseWithMuscleGroup[]> {
  const where = options?.includeArchived ? '' : 'WHERE e.archived_at IS NULL';
  return db.getAllAsync<ExerciseWithMuscleGroup>(
    `SELECT e.*, mg.name AS muscle_group_name
       FROM exercises e
       LEFT JOIN muscle_groups mg ON mg.id = e.muscle_group_id
      ${where}
      ORDER BY e.name COLLATE NOCASE ASC`
  );
}

/** Obtiene un ejercicio por ID (incluye archivados para vistas históricas). */
export async function getExercise(
  db: SQLiteDatabase,
  id: number
): Promise<ExerciseWithMuscleGroup | null> {
  return db.getFirstAsync<ExerciseWithMuscleGroup>(
    `SELECT e.*, mg.name AS muscle_group_name
       FROM exercises e
       LEFT JOIN muscle_groups mg ON mg.id = e.muscle_group_id
      WHERE e.id = ?`,
    [id]
  );
}

export async function createExercise(
  db: SQLiteDatabase,
  name: string,
  exerciseType: TrainingType = 'strength',
  options?: ExerciseMutationOptions
): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Escribe un nombre para el ejercicio.');
  }
  const flags = normalizeExerciseFlags(exerciseType, options);

  const existing = await db.getFirstAsync<{ id: number; archived_at: number | null }>(
    'SELECT id, archived_at FROM exercises WHERE name = ? COLLATE NOCASE',
    [trimmed]
  );
  if (existing) {
    if (existing.archived_at == null) {
      throw new Error(`El ejercicio "${trimmed}" ya está en el catálogo.`);
    }
    await db.runAsync(
      `UPDATE exercises
          SET name = ?, es_corporal = ?, exercise_type = ?, cardio_tracking = ?,
              tracking_mode = ?, is_unilateral = ?, muscle_group_id = ?, archived_at = NULL
        WHERE id = ?`,
      [
        trimmed,
        flags.esCorporal,
        exerciseType,
        'both',
        flags.trackingMode,
        flags.isUnilateral,
        flags.muscleGroupId,
        existing.id,
      ]
    );
    return existing.id;
  }

  const res = await db.runAsync(
    `INSERT INTO exercises
       (name, es_corporal, exercise_type, cardio_tracking, tracking_mode, is_unilateral, muscle_group_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      trimmed,
      flags.esCorporal,
      exerciseType,
      'both',
      flags.trackingMode,
      flags.isUnilateral,
      flags.muscleGroupId,
      Date.now(),
    ]
  );
  return res.lastInsertRowId;
}

export async function updateExercise(
  db: SQLiteDatabase,
  id: number,
  name: string,
  exerciseType: TrainingType = 'strength',
  options?: ExerciseMutationOptions
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Escribe un nombre para el ejercicio.');
  }
  const duplicate = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM exercises WHERE name = ? COLLATE NOCASE AND id != ? AND archived_at IS NULL',
    [trimmed, id]
  );
  if (duplicate) {
    throw new Error(`Ya existe otro ejercicio llamado "${trimmed}".`);
  }

  const flags = normalizeExerciseFlags(exerciseType, options);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE exercises
          SET name = ?, es_corporal = ?, exercise_type = ?, cardio_tracking = ?,
              tracking_mode = ?, is_unilateral = ?, muscle_group_id = ?
        WHERE id = ?`,
      [
        trimmed,
        flags.esCorporal,
        exerciseType,
        'both',
        flags.trackingMode,
        flags.isUnilateral,
        flags.muscleGroupId,
        id,
      ]
    );

    // Sincroniza el nombre en sesiones activas/pausadas sin tocar sesiones finalizadas.
    await db.runAsync(
      `UPDATE session_exercises
          SET exercise_name = ?
        WHERE exercise_id = ?
          AND session_id IN (SELECT id FROM sessions WHERE status IN ('active', 'paused'))`,
      [trimmed, id]
    );

    // Si hay bloques sin actividad en sesiones activas/pausadas, actualiza también sus propiedades.
    await db.runAsync(
      `UPDATE session_exercises
          SET es_corporal = ?, exercise_type = ?, cardio_tracking = ?, tracking_mode = ?, is_unilateral = ?
        WHERE exercise_id = ?
          AND session_id IN (SELECT id FROM sessions WHERE status IN ('active', 'paused'))
          AND timer_started_ts IS NULL
          AND NOT EXISTS (SELECT 1 FROM sets st WHERE st.session_exercise_id = session_exercises.id)
          AND NOT EXISTS (SELECT 1 FROM cardio_entries ce WHERE ce.session_exercise_id = session_exercises.id)`,
      [flags.esCorporal, exerciseType, 'both', flags.trackingMode, flags.isUnilateral, id]
    );
  });
}

/**
 * Edita un ejercicio desde la sesión activa manteniendo consistencia:
 * - Nombre y grupo muscular siempre se pueden modificar.
 * - Si ya hay series/cardio/cronómetro en curso, no permite cambiar el tipo ni pasar de unilateral a bilateral.
 * - Si pasa de bilateral a unilateral con series ya realizadas, desdobla cada serie a ambos lados.
 */
export async function updateExerciseDuringSession(
  db: SQLiteDatabase,
  sessionExerciseId: number,
  updates: {
    name: string;
    exerciseType: TrainingType;
    isUnilateral: boolean;
    muscleGroupId: number | null;
  }
): Promise<void> {
  const trimmed = updates.name.trim();
  if (!trimmed) {
    throw new Error('Escribe un nombre para el ejercicio.');
  }

  const block = await db.getFirstAsync<{
    id: number;
    session_id: number;
    exercise_id: number | null;
    exercise_type: TrainingType;
    is_unilateral: number;
    timer_started_ts: number | null;
  }>(
    `SELECT id, session_id, exercise_id, exercise_type, is_unilateral, timer_started_ts
       FROM session_exercises
      WHERE id = ?`,
    [sessionExerciseId]
  );
  if (!block || block.exercise_id == null) {
    throw new Error('No se encontró el ejercicio en la sesión.');
  }

  const duplicate = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM exercises WHERE name = ? COLLATE NOCASE AND id != ? AND archived_at IS NULL',
    [trimmed, block.exercise_id]
  );
  if (duplicate) {
    throw new Error(`Ya existe otro ejercicio llamado "${trimmed}".`);
  }

  const setsCountRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM sets WHERE session_exercise_id = ?',
    [sessionExerciseId]
  );
  const cardioCountRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM cardio_entries WHERE session_exercise_id = ?',
    [sessionExerciseId]
  );
  const hasRecords =
    (setsCountRow?.count ?? 0) > 0 ||
    (cardioCountRow?.count ?? 0) > 0 ||
    block.timer_started_ts != null;

  const flags = normalizeExerciseFlags(updates.exerciseType, {
    isUnilateral: updates.isUnilateral,
    muscleGroupId: updates.muscleGroupId,
  });

  if (hasRecords) {
    if (updates.exerciseType !== block.exercise_type) {
      throw new Error(
        'No se puede cambiar el tipo de ejercicio cuando ya hay registros en esta sesión.'
      );
    }
    if (block.is_unilateral === 1 && flags.isUnilateral === 0) {
      throw new Error(
        'Ya hay series por lado en esta sesión; cámbialo desde el catálogo para próximos entrenamientos.'
      );
    }
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE exercises
          SET name = ?, es_corporal = ?, exercise_type = ?, cardio_tracking = ?,
              tracking_mode = ?, is_unilateral = ?, muscle_group_id = ?
        WHERE id = ?`,
      [
        trimmed,
        flags.esCorporal,
        updates.exerciseType,
        'both',
        flags.trackingMode,
        flags.isUnilateral,
        flags.muscleGroupId,
        block.exercise_id,
      ]
    );

    if (!hasRecords) {
      await db.runAsync(
        `UPDATE session_exercises
            SET exercise_name = ?, es_corporal = ?, exercise_type = ?, cardio_tracking = ?,
                tracking_mode = ?, is_unilateral = ?
          WHERE id = ?`,
        [
          trimmed,
          flags.esCorporal,
          updates.exerciseType,
          'both',
          flags.trackingMode,
          flags.isUnilateral,
          sessionExerciseId,
        ]
      );
      return;
    }

    await db.runAsync(
      'UPDATE session_exercises SET exercise_name = ?, is_unilateral = ? WHERE id = ?',
      [trimmed, flags.isUnilateral, sessionExerciseId]
    );

    // Bilateral -> Unilateral con series ya registradas: desdobla cada serie a Izquierda y Derecha.
    if (block.is_unilateral === 0 && flags.isUnilateral === 1 && block.exercise_type !== 'cardio') {
      const existingSets = await db.getAllAsync<{
        id: number;
        set_index: number;
        reps: number;
        ts: number;
        weight: number | null;
        duration_seconds: number | null;
      }>(
        'SELECT id, set_index, reps, ts, weight, duration_seconds FROM sets WHERE session_exercise_id = ? ORDER BY set_index ASC, id ASC',
        [sessionExerciseId]
      );

      for (const s of existingSets) {
        await db.runAsync(
          "UPDATE sets SET side = 'left', side_order = 1, side_rest_seconds = NULL WHERE id = ?",
          [s.id]
        );
        await db.runAsync(
          `INSERT INTO sets
             (session_exercise_id, set_index, reps, ts, rest_seconds, weight, duration_seconds, side, side_order, side_rest_seconds)
           VALUES (?, ?, ?, ?, NULL, ?, ?, 'right', 2, NULL)`,
          [sessionExerciseId, s.set_index, s.reps, s.ts, s.weight, s.duration_seconds]
        );
      }
    }
  });
}

/**
 * Elimina un ejercicio del catálogo. Si aparece en sesiones registradas, realiza
 * borrado lógico (`archived_at`) para mantener intactos el histórico, las gráficas
 * y la navegación hacia su ficha.
 */
export async function deleteExercise(db: SQLiteDatabase, id: number): Promise<void> {
  const used = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM session_exercises WHERE exercise_id = ? LIMIT 1',
    [id]
  );
  if (!used) {
    await db.runAsync('DELETE FROM exercises WHERE id = ?', [id]);
    return;
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM day_exercises WHERE exercise_id = ?', [id]);
    await db.runAsync('DELETE FROM strava_mappings WHERE exercise_id = ?', [id]);
    await db.runAsync('UPDATE exercises SET archived_at = ? WHERE id = ?', [Date.now(), id]);
  });
}
