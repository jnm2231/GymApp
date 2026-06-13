import type { SQLiteDatabase } from 'expo-sqlite';
import type { Exercise } from './types';

/** Catálogo global de ejercicios, ordenado alfabéticamente. */
export async function listExercises(db: SQLiteDatabase): Promise<Exercise[]> {
  return db.getAllAsync<Exercise>('SELECT * FROM exercises ORDER BY name COLLATE NOCASE ASC');
}

export async function createExercise(
  db: SQLiteDatabase,
  name: string,
  esCorporal: boolean
): Promise<number> {
  const res = await db.runAsync(
    'INSERT INTO exercises (name, es_corporal, created_at) VALUES (?, ?, ?)',
    [name.trim(), esCorporal ? 1 : 0, Date.now()]
  );
  return res.lastInsertRowId;
}

export async function updateExercise(
  db: SQLiteDatabase,
  id: number,
  name: string,
  esCorporal: boolean
): Promise<void> {
  await db.runAsync('UPDATE exercises SET name = ?, es_corporal = ? WHERE id = ?', [
    name.trim(),
    esCorporal ? 1 : 0,
    id,
  ]);
}

export async function deleteExercise(db: SQLiteDatabase, id: number): Promise<void> {
  // ON DELETE CASCADE limpia day_exercises; el histórico (session_exercises) usa
  // SET NULL y conserva el snapshot del nombre.
  await db.runAsync('DELETE FROM exercises WHERE id = ?', [id]);
}
