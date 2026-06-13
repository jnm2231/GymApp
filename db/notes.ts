import type { SQLiteDatabase } from 'expo-sqlite';
import type { DevNote } from './types';

/**
 * Notas de Desarrollo (Backlog). Esta tabla NO se incluye en export/import.
 * Se usa una única nota libre (la más reciente) como área de texto.
 */
export async function getDevNote(db: SQLiteDatabase): Promise<DevNote | null> {
  return db.getFirstAsync<DevNote>('SELECT * FROM dev_notes ORDER BY id ASC LIMIT 1');
}

export async function saveDevNote(db: SQLiteDatabase, content: string): Promise<void> {
  const existing = await getDevNote(db);
  const now = Date.now();
  if (existing) {
    await db.runAsync('UPDATE dev_notes SET content = ?, updated_at = ? WHERE id = ?', [
      content,
      now,
      existing.id,
    ]);
  } else {
    await db.runAsync(
      'INSERT INTO dev_notes (content, created_at, updated_at) VALUES (?, ?, ?)',
      [content, now, now]
    );
  }
}
