import type { SQLiteDatabase } from 'expo-sqlite';

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [key]
  );
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

export async function getUserWeight(db: SQLiteDatabase): Promise<number> {
  const v = await getSetting(db, 'user_weight');
  const n = v ? parseFloat(v) : 0;
  return Number.isFinite(n) ? n : 0;
}

export async function setUserWeight(db: SQLiteDatabase, weight: number): Promise<void> {
  await setSetting(db, 'user_weight', String(weight));
}
