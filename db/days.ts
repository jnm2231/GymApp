import type { SQLiteDatabase } from 'expo-sqlite';
import type { Day, DayWithCount, Exercise } from './types';

/** Lista de plantillas de día con el nº de ejercicios que las componen. */
export async function listDaysWithCount(db: SQLiteDatabase): Promise<DayWithCount[]> {
  return db.getAllAsync<DayWithCount>(
    `SELECT d.*, COUNT(de.id) AS exercise_count
       FROM days d
       LEFT JOIN day_exercises de ON de.day_id = d.id
      GROUP BY d.id
      ORDER BY d.created_at ASC`
  );
}

export async function getDay(db: SQLiteDatabase, id: number): Promise<Day | null> {
  return db.getFirstAsync<Day>('SELECT * FROM days WHERE id = ?', [id]);
}

/** Ejercicios de una plantilla, en orden. */
export async function getDayExercises(db: SQLiteDatabase, dayId: number): Promise<Exercise[]> {
  return db.getAllAsync<Exercise>(
    `SELECT e.*
       FROM day_exercises de
       JOIN exercises e ON e.id = de.exercise_id
      WHERE de.day_id = ?
      ORDER BY de.position ASC`,
    [dayId]
  );
}

async function replaceDayExercises(
  db: SQLiteDatabase,
  dayId: number,
  exerciseIds: number[]
): Promise<void> {
  await db.runAsync('DELETE FROM day_exercises WHERE day_id = ?', [dayId]);
  for (let i = 0; i < exerciseIds.length; i++) {
    await db.runAsync(
      'INSERT INTO day_exercises (day_id, exercise_id, position) VALUES (?, ?, ?)',
      [dayId, exerciseIds[i], i]
    );
  }
}

export async function createDay(
  db: SQLiteDatabase,
  name: string,
  exerciseIds: number[]
): Promise<number> {
  let dayId = 0;
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync('INSERT INTO days (name, created_at) VALUES (?, ?)', [
      name.trim(),
      Date.now(),
    ]);
    dayId = res.lastInsertRowId;
    await replaceDayExercises(db, dayId, exerciseIds);
  });
  return dayId;
}

export async function updateDay(
  db: SQLiteDatabase,
  id: number,
  name: string,
  exerciseIds: number[]
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE days SET name = ? WHERE id = ?', [name.trim(), id]);
    await replaceDayExercises(db, id, exerciseIds);
  });
}

export async function deleteDay(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM days WHERE id = ?', [id]);
}
