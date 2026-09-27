import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { initDatabase } from '../db/schema.ts';
import {
  countPendingStravaActivities, getStoredStravaActivity, importStravaActivity,
  setStravaImportFloor, setStravaMapping, storeStravaActivity,
} from '../db/strava.ts';

const database = new DatabaseSync(':memory:');
const db = {
  execAsync: async (sql) => { database.exec(sql); },
  getFirstAsync: async (sql, params = []) => database.prepare(sql).get(...params) ?? null,
  getAllAsync: async (sql, params = []) => database.prepare(sql).all(...params),
  runAsync: async (sql, params = []) => {
    const result = database.prepare(sql).run(...params);
    return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
  },
  withTransactionAsync: async (action) => {
    database.exec('BEGIN');
    try { await action(); database.exec('COMMIT'); }
    catch (error) { database.exec('ROLLBACK'); throw error; }
  },
};

await initDatabase(db);
await setStravaImportFloor(db, 0);
const day = await db.runAsync(
  "INSERT INTO days (name, training_type, created_at) VALUES ('Montaña', 'cardio', 1)"
);
await setStravaMapping(db, 'Hike', day.lastInsertRowId);

const summary = {
  id: 154504250376823, name: 'Ruta de montaña', sport_type: 'Hike',
  start_date: '2026-09-25T07:00:00Z', moving_time: 3600,
  elapsed_time: 4200, distance: 7200,
};
await storeStravaActivity(db, summary, '123', false);
assert.equal(await importStravaActivity(db, String(summary.id)), false);
await storeStravaActivity(db, { ...summary, calories: 540, total_elevation_gain: 410 }, '123', true);
assert.equal(await importStravaActivity(db, String(summary.id)), true);
assert.equal(await importStravaActivity(db, String(summary.id)), false);
const stored = await getStoredStravaActivity(db, String(summary.id));
assert.equal(stored.detail_loaded, 1);
assert.ok(stored.session_id);
const session = await db.getFirstAsync('SELECT day_name, day_type, status FROM sessions WHERE id = ?', [stored.session_id]);
assert.deepEqual({ ...session }, { day_name: 'Montaña', day_type: 'cardio', status: 'finished' });
const entry = await db.getFirstAsync(
  'SELECT duration_seconds, distance_km FROM cardio_entries LIMIT 1'
);
assert.deepEqual({ ...entry }, { duration_seconds: 3600, distance_km: 7.2 });

await storeStravaActivity(db, { ...summary, id: 154504250376824, sport_type: 'TrailRun' }, '123', false);
assert.equal(await countPendingStravaActivities(db, '123'), 1);
assert.equal(await importStravaActivity(db, '154504250376824'), false);
await setStravaMapping(db, 'TrailRun', day.lastInsertRowId);
await storeStravaActivity(db, { ...summary, id: 154504250376824, sport_type: 'TrailRun', calories: 600 }, '123', true);
assert.equal(await importStravaActivity(db, '154504250376824'), true);
assert.equal(await countPendingStravaActivities(db, '123'), 0);
console.log('Strava SQL: importación, métricas, duplicados y actividades pendientes correctos.');
