import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting, setSetting, setUserWeight } from './settings';
import type { BodyMeasurement } from './types';

export interface BodyProfile {
  weight: number;
  heightCm: number | null;
  birthDate: string | null;
  weeklyWeightReminder: boolean;
}

export async function getBodyProfile(db: SQLiteDatabase): Promise<BodyProfile> {
  const weightValue = await getSetting(db, 'user_weight');
  const heightValue = await getSetting(db, 'user_height_cm');
  const birthDate = await getSetting(db, 'birth_date');
  const reminder = await getSetting(db, 'weekly_weight_reminder');
  const weight = Number(weightValue);
  const height = Number(heightValue);
  return {
    weight: Number.isFinite(weight) ? weight : 0,
    heightCm: Number.isFinite(height) && height > 0 ? height : null,
    birthDate: birthDate || null,
    weeklyWeightReminder: reminder === '1',
  };
}

export async function saveBodyProfile(
  db: SQLiteDatabase,
  heightCm: number | null,
  birthDate: string | null
): Promise<void> {
  await setSetting(db, 'user_height_cm', heightCm == null ? '' : String(heightCm));
  await setSetting(db, 'birth_date', birthDate ?? '');
}

export async function recordBodyWeight(db: SQLiteDatabase, weight: number): Promise<void> {
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await setUserWeight(db, weight);
    await db.runAsync('INSERT INTO body_measurements (weight, recorded_at) VALUES (?, ?)', [
      weight,
      now,
    ]);
  });
}

export async function listBodyMeasurements(
  db: SQLiteDatabase,
  limit = 8
): Promise<BodyMeasurement[]> {
  return db.getAllAsync<BodyMeasurement>(
    'SELECT * FROM body_measurements ORDER BY recorded_at DESC LIMIT ?',
    [limit]
  );
}

export async function setWeeklyWeightReminder(
  db: SQLiteDatabase,
  enabled: boolean
): Promise<void> {
  await setSetting(db, 'weekly_weight_reminder', enabled ? '1' : '0');
}
