import type { SQLiteDatabase } from 'expo-sqlite';
import type { MuscleGroup } from './types';

/** Lista todos los grupos musculares ordenados alfabéticamente. */
export async function listMuscleGroups(db: SQLiteDatabase): Promise<MuscleGroup[]> {
  return db.getAllAsync<MuscleGroup>('SELECT * FROM muscle_groups ORDER BY name COLLATE NOCASE ASC');
}

/** Crea un nuevo grupo muscular personalizado. */
export async function createMuscleGroup(db: SQLiteDatabase, name: string): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Escribe un nombre para el grupo muscular.');
  }
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM muscle_groups WHERE name = ? COLLATE NOCASE',
    [trimmed]
  );
  if (existing) {
    throw new Error(`El grupo muscular "${trimmed}" ya existe.`);
  }
  const res = await db.runAsync('INSERT INTO muscle_groups (name, created_at) VALUES (?, ?)', [
    trimmed,
    Date.now(),
  ]);
  return res.lastInsertRowId;
}

/**
 * Elimina un grupo muscular. Los ejercicios que lo tenían asignado pasan a
 * "Sin definir" (`muscle_group_id = NULL`).
 */
export async function deleteMuscleGroup(db: SQLiteDatabase, id: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE exercises SET muscle_group_id = NULL WHERE muscle_group_id = ?', [id]);
    await db.runAsync('DELETE FROM muscle_groups WHERE id = ?', [id]);
  });
}
