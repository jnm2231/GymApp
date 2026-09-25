import type { SQLiteDatabase } from 'expo-sqlite';
import type { CardioTracking, Exercise, TrainingType } from './types';

/** Catálogo global de ejercicios, ordenado alfabéticamente. */
export async function listExercises(db: SQLiteDatabase): Promise<Exercise[]> {
  return db.getAllAsync<Exercise>('SELECT * FROM exercises ORDER BY name COLLATE NOCASE ASC');
}

export async function createExercise(
  db: SQLiteDatabase,
  name: string,
  exerciseType: TrainingType = 'strength',
  cardioTracking: CardioTracking = 'both'
): Promise<number> {
  const res = await db.runAsync(
    `INSERT INTO exercises
       (name, es_corporal, exercise_type, cardio_tracking, tracking_mode, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      name.trim(),
      exerciseType === 'calisthenics' ? 1 : 0,
      exerciseType,
      cardioTracking,
      exerciseType === 'hold' ? 'hold' : 'reps',
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
  cardioTracking: CardioTracking = 'both'
): Promise<void> {
  await db.runAsync(
    `UPDATE exercises
        SET name = ?, es_corporal = ?, exercise_type = ?, cardio_tracking = ?, tracking_mode = ?
      WHERE id = ?`,
    [
    name.trim(),
    exerciseType === 'calisthenics' ? 1 : 0,
    exerciseType,
    cardioTracking,
    exerciseType === 'hold' ? 'hold' : 'reps',
    id,
    ]
  );
}

export async function deleteExercise(db: SQLiteDatabase, id: number): Promise<void> {
  // ON DELETE CASCADE limpia day_exercises; el histórico (session_exercises) usa
  // SET NULL y conserva el snapshot del nombre.
  await db.runAsync('DELETE FROM exercises WHERE id = ?', [id]);
}
