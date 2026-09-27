import type { SQLiteDatabase } from 'expo-sqlite';

export interface StravaActivity {
  id: number | string;
  name: string;
  sport_type?: string;
  type?: string;
  start_date: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  total_elevation_gain?: number;
  average_speed?: number;
  max_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  calories?: number;
  description?: string;
  device_name?: string;
  athlete?: { id?: number | string };
  [key: string]: unknown;
}

export interface StoredStravaActivity {
  activity_id: string;
  athlete_id: string;
  sport_type: string;
  name: string;
  start_ts: number;
  session_id: number | null;
  detail_loaded: number;
  raw_json: string;
}

export interface StravaMapping {
  sport_type: string;
  day_id: number;
}

export interface ImportedStravaActivity {
  activity_id: string;
  session_id: number;
  name: string;
  sport_type: string;
  start_ts: number;
  day_name: string;
}

export async function listImportedStravaActivities(db: SQLiteDatabase): Promise<ImportedStravaActivity[]> {
  return db.getAllAsync<ImportedStravaActivity>(
    `SELECT a.activity_id, a.session_id, a.name, a.sport_type, a.start_ts, s.day_name
       FROM strava_activities a JOIN sessions s ON s.id = a.session_id
      WHERE s.status = 'finished' ORDER BY a.start_ts DESC`
  );
}

export async function getLastStravaSync(db: SQLiteDatabase): Promise<number | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'strava_last_sync'"
  );
  return row ? Number(row.value) : null;
}

export async function setLastStravaSync(db: SQLiteDatabase, value: number): Promise<void> {
  await db.runAsync(
    "INSERT INTO settings (key, value) VALUES ('strava_last_sync', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [String(value)]
  );
}

export async function getStravaImportFloor(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'strava_import_floor'"
  );
  return row ? Number(row.value) : Math.floor(Date.now() / 1000) - 90 * 86400;
}

export async function setStravaImportFloor(db: SQLiteDatabase, value: number): Promise<void> {
  await db.runAsync(
    "INSERT INTO settings (key, value) VALUES ('strava_import_floor', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [String(value)]
  );
  await db.runAsync("DELETE FROM settings WHERE key = 'strava_last_sync'");
}

export async function getStravaMappings(db: SQLiteDatabase): Promise<StravaMapping[]> {
  return db.getAllAsync<StravaMapping>('SELECT sport_type, day_id FROM strava_mappings ORDER BY sport_type');
}

export async function setStravaMapping(db: SQLiteDatabase, sportType: string, dayId: number | null): Promise<void> {
  if (dayId == null) {
    await db.runAsync('DELETE FROM strava_mappings WHERE sport_type = ?', [sportType]);
    return;
  }
  const day = await db.getFirstAsync<{ training_type: string }>(
    'SELECT training_type FROM days WHERE id = ?', [dayId]
  );
  if (day?.training_type !== 'cardio') throw new Error('Selecciona un día de cardio.');
  await db.runAsync(
    'INSERT INTO strava_mappings (sport_type, day_id) VALUES (?, ?) ON CONFLICT(sport_type) DO UPDATE SET day_id = excluded.day_id',
    [sportType, dayId]
  );
}

export async function getSeenSportTypes(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ sport_type: string }>(
    'SELECT DISTINCT sport_type FROM strava_activities ORDER BY sport_type'
  );
  return rows.map((row) => row.sport_type);
}

export async function countPendingStravaActivities(db: SQLiteDatabase, athleteId: string): Promise<number> {
  const floor = await getStravaImportFloor(db);
  const row = await db.getFirstAsync<{ total: number }>(
    'SELECT COUNT(*) AS total FROM strava_activities WHERE session_id IS NULL AND athlete_id = ? AND start_ts >= ?',
    [athleteId, floor * 1000]
  );
  return row?.total ?? 0;
}

export async function listPendingMappedActivities(db: SQLiteDatabase, athleteId: string): Promise<StoredStravaActivity[]> {
  const floor = await getStravaImportFloor(db);
  return db.getAllAsync<StoredStravaActivity>(
    `SELECT a.* FROM strava_activities a
       JOIN strava_mappings m ON m.sport_type = a.sport_type
       JOIN days d ON d.id = m.day_id AND d.training_type = 'cardio'
      WHERE a.session_id IS NULL AND a.athlete_id = ? AND a.start_ts >= ? ORDER BY a.start_ts ASC`,
    [athleteId, floor * 1000]
  );
}

export async function getStoredStravaActivity(db: SQLiteDatabase, id: string): Promise<StoredStravaActivity | null> {
  return db.getFirstAsync<StoredStravaActivity>('SELECT * FROM strava_activities WHERE activity_id = ?', [id]);
}

export async function storeStravaActivity(
  db: SQLiteDatabase, activity: StravaActivity, athleteId: string, detailed: boolean
): Promise<void> {
  const sportType = activity.sport_type || activity.type || 'Unknown';
  const startTs = Date.parse(activity.start_date);
  if (!Number.isFinite(startTs)) throw new Error('Strava devolvió una actividad sin fecha válida.');
  const id = String(activity.id);
  await db.runAsync(
    `INSERT INTO strava_activities
       (activity_id, athlete_id, sport_type, name, start_ts, detail_loaded, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(activity_id) DO UPDATE SET
       name = excluded.name,
       sport_type = excluded.sport_type,
       detail_loaded = CASE WHEN excluded.detail_loaded = 1 THEN 1 ELSE strava_activities.detail_loaded END,
       raw_json = CASE WHEN excluded.detail_loaded = 1 OR strava_activities.detail_loaded = 0
                       THEN excluded.raw_json ELSE strava_activities.raw_json END`,
    [id, athleteId, sportType, activity.name || sportType, startTs, detailed ? 1 : 0, JSON.stringify(activity)]
  );
}

export async function importStravaActivity(db: SQLiteDatabase, id: string): Promise<boolean> {
  let imported = false;
  await db.withTransactionAsync(async () => {
    const activity = await getStoredStravaActivity(db, id);
    if (!activity || activity.session_id != null || !activity.detail_loaded) return;
    const day = await db.getFirstAsync<{ id: number; name: string }>(
      `SELECT d.id, d.name FROM strava_mappings m
         JOIN days d ON d.id = m.day_id AND d.training_type = 'cardio'
        WHERE m.sport_type = ?`, [activity.sport_type]
    );
    if (!day) return;
    const raw = JSON.parse(activity.raw_json) as StravaActivity;
    const duration = Math.max(0, Number(raw.moving_time ?? raw.elapsed_time ?? 0));
    const elapsed = Math.max(duration, Number(raw.elapsed_time ?? duration));
    const endTs = activity.start_ts + elapsed * 1000;
    const session = await db.runAsync(
      `INSERT INTO sessions (day_id, day_name, start_ts, end_ts, user_weight, status, day_type)
       VALUES (?, ?, ?, ?, NULL, 'finished', 'cardio')`,
      [day.id, day.name, activity.start_ts, endTs]
    );
    const block = await db.runAsync(
      `INSERT INTO session_exercises
       (session_id, exercise_id, exercise_name, position, is_additional, start_ts, end_ts,
        status, exercise_type, cardio_tracking, tracking_mode)
       VALUES (?, NULL, ?, 0, 1, ?, ?, 'done', 'cardio', 'both', 'reps')`,
      [session.lastInsertRowId, activity.name, activity.start_ts, endTs]
    );
    const distanceKm = typeof raw.distance === 'number' ? raw.distance / 1000 : null;
    await db.runAsync(
      `INSERT INTO cardio_entries (session_exercise_id, duration_seconds, distance_km, notes, ts)
       VALUES (?, ?, ?, ?, ?)`,
      [block.lastInsertRowId, duration, distanceKm, raw.description || null, endTs]
    );
    await db.runAsync('UPDATE strava_activities SET session_id = ? WHERE activity_id = ?', [
      session.lastInsertRowId, id,
    ]);
    imported = true;
  });
  return imported;
}

export async function getStravaActivityForSession(
  db: SQLiteDatabase, sessionId: number
): Promise<StoredStravaActivity | null> {
  return db.getFirstAsync<StoredStravaActivity>(
    'SELECT * FROM strava_activities WHERE session_id = ?', [sessionId]
  );
}
