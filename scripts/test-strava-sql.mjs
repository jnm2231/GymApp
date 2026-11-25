import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { buildBackup, restoreBackup } from '../db/backup.ts';
import { createExercise } from '../db/exercises.ts';
import { getPerformedExerciseSummaries, getExerciseHistory } from '../db/history.ts';
import { initDatabase } from '../db/schema.ts';
import {
  countPendingStravaActivities, getStoredStravaActivity, getStravaMappings,
  importStravaActivity, setStravaImportFloor, setStravaMapping, storeStravaActivity,
} from '../db/strava.ts';

function createTestDatabase() {
  const database = new DatabaseSync(':memory:');
  return {
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
}

const db = createTestDatabase();
await initDatabase(db);
await setStravaImportFloor(db, 0);
const runId = await createExercise(db, 'Correr', 'cardio');
const hikeId = await createExercise(db, 'Montaña', 'cardio');
await setStravaMapping(db, 'Run', runId);
assert.equal((await db.getAllAsync('SELECT id FROM days')).length, 0);

const run = {
  id: 154504250376823, name: 'Carrera matinal', sport_type: 'Run',
  start_date: '2026-09-25T07:00:00Z', moving_time: 3600,
  elapsed_time: 4200, distance: 7200,
};
await storeStravaActivity(db, run, '123', false);
assert.equal(await importStravaActivity(db, String(run.id)), false);
await storeStravaActivity(db, { ...run, total_elevation_gain: 40 }, '123', true);
assert.equal(await importStravaActivity(db, String(run.id)), true);
assert.equal(await importStravaActivity(db, String(run.id)), false);
const first = await getStoredStravaActivity(db, String(run.id));
assert.equal(first.detail_loaded, 1);
const firstSession = await db.getFirstAsync(
  'SELECT day_id, day_name, day_type, status FROM sessions WHERE id = ?', [first.session_id]
);
assert.deepEqual(
  { day_name: firstSession.day_name, day_type: firstSession.day_type, status: firstSession.status },
  { day_name: 'Correr', day_type: 'cardio', status: 'finished' }
);
const firstBlock = await db.getFirstAsync(
  'SELECT exercise_id, exercise_name, is_additional FROM session_exercises WHERE session_id = ?',
  [first.session_id]
);
assert.deepEqual({ ...firstBlock }, { exercise_id: runId, exercise_name: 'Correr', is_additional: 0 });
const firstEntry = await db.getFirstAsync(
  'SELECT duration_seconds, distance_km FROM cardio_entries LIMIT 1'
);
assert.deepEqual({ ...firstEntry }, { duration_seconds: 3600, distance_km: 7.2 });

await storeStravaActivity(db, { ...run, id: 154504250376824 }, '123', true);
assert.equal(await importStravaActivity(db, '154504250376824'), true);
assert.equal((await db.getAllAsync("SELECT id FROM days WHERE name = 'Correr'")).length, 1);
assert.equal((await getPerformedExerciseSummaries(db)).find((item) => item.exerciseId === runId)?.timesPerformed, 2);
const runHistory = await getExerciseHistory(db, runId);
assert.equal(runHistory.length, 2);
assert.equal(runHistory[0].strava_name, 'Carrera matinal');

const hike = { ...run, id: 154504250376825, name: 'Ruta de montaña', sport_type: 'Hike' };
await storeStravaActivity(db, hike, '123', false);
assert.equal(await countPendingStravaActivities(db, '123'), 1);
assert.equal(await importStravaActivity(db, String(hike.id)), false);
await setStravaMapping(db, 'Hike', hikeId);
await storeStravaActivity(db, hike, '123', true);
assert.equal(await importStravaActivity(db, String(hike.id)), true);
assert.equal(await countPendingStravaActivities(db, '123'), 0);
assert.equal((await db.getAllAsync("SELECT id FROM days WHERE name = 'Montaña'")).length, 1);

await setStravaMapping(db, 'Run', hikeId);
assert.equal((await getExerciseHistory(db, runId)).length, 0);
assert.equal((await getExerciseHistory(db, hikeId)).length, 3);
assert.equal((await db.getAllAsync(
  "SELECT id FROM sessions WHERE day_name = 'Montaña' AND day_id = ?", [firstSession.day_id]
)).length, 0);

// Migración de asignaciones por día y actividades ya importadas en la v9.
const legacyDb = createTestDatabase();
await initDatabase(legacyDb);
const legacyExerciseId = await createExercise(legacyDb, 'Senderismo', 'cardio');
const legacyDay = await legacyDb.runAsync(
  "INSERT INTO days (name, training_type, created_at) VALUES ('Cardio antiguo', 'cardio', 1)"
);
await legacyDb.runAsync(
  'INSERT INTO day_exercises (day_id, exercise_id, position) VALUES (?, ?, 0)',
  [legacyDay.lastInsertRowId, legacyExerciseId]
);
await legacyDb.execAsync('DROP TABLE strava_mappings');
await legacyDb.execAsync(
  'CREATE TABLE strava_mappings (sport_type TEXT PRIMARY KEY, day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE)'
);
await legacyDb.runAsync(
  "INSERT INTO strava_mappings (sport_type, day_id) VALUES ('Hike', ?)", [legacyDay.lastInsertRowId]
);
const otherExerciseId = await createExercise(legacyDb, 'Correr en montaña', 'cardio');
const ambiguousDay = await legacyDb.runAsync(
  "INSERT INTO days (name, training_type, created_at) VALUES ('Mixto', 'cardio', 2)"
);
await legacyDb.runAsync(
  'INSERT INTO day_exercises (day_id, exercise_id, position) VALUES (?, ?, 0)',
  [ambiguousDay.lastInsertRowId, legacyExerciseId]
);
await legacyDb.runAsync(
  'INSERT INTO day_exercises (day_id, exercise_id, position) VALUES (?, ?, 1)',
  [ambiguousDay.lastInsertRowId, otherExerciseId]
);
await legacyDb.runAsync(
  "INSERT INTO strava_mappings (sport_type, day_id) VALUES ('TrailRun', ?)",
  [ambiguousDay.lastInsertRowId]
);
const legacySession = await legacyDb.runAsync(
  `INSERT INTO sessions (day_id, day_name, start_ts, end_ts, status, day_type)
   VALUES (?, 'Cardio antiguo', 1000, 2000, 'finished', 'cardio')`, [legacyDay.lastInsertRowId]
);
const legacyBlock = await legacyDb.runAsync(
  `INSERT INTO session_exercises (session_id, exercise_name, position, is_additional,
    start_ts, end_ts, status, exercise_type)
   VALUES (?, 'Ruta antigua', 0, 1, 1000, 2000, 'done', 'cardio')`,
  [legacySession.lastInsertRowId]
);
await legacyDb.runAsync(
  'INSERT INTO cardio_entries (session_exercise_id, duration_seconds, distance_km, ts) VALUES (?, 60, 1, 2000)',
  [legacyBlock.lastInsertRowId]
);
await legacyDb.runAsync(
  `INSERT INTO strava_activities (activity_id, athlete_id, sport_type, name, start_ts,
    session_id, detail_loaded, raw_json) VALUES ('old-hike', '123', 'Hike', 'Ruta antigua',
    1000, ?, 1, ?)`,
  [legacySession.lastInsertRowId, JSON.stringify({ ...hike, id: 'old-hike' })]
);
await legacyDb.execAsync('PRAGMA user_version = 9');
await initDatabase(legacyDb);
assert.deepEqual((await getStravaMappings(legacyDb)).map((item) => ({ ...item })), [
  { sport_type: 'Hike', exercise_id: legacyExerciseId },
]);
const migrated = await legacyDb.getFirstAsync(
  `SELECT s.day_name, se.exercise_id, se.exercise_name, se.is_additional
     FROM sessions s JOIN session_exercises se ON se.session_id = s.id WHERE s.id = ?`,
  [legacySession.lastInsertRowId]
);
assert.deepEqual({ ...migrated }, {
  day_name: 'Senderismo', exercise_id: legacyExerciseId,
  exercise_name: 'Senderismo', is_additional: 0,
});

// Las copias antiguas contienen day_id; restaurarlas convierte la asignación.
const oldBackup = await buildBackup(legacyDb);
oldBackup.schemaVersion = 9;
oldBackup.tables.strava_mappings = [
  { sport_type: 'Hike', day_id: legacyDay.lastInsertRowId },
];
await restoreBackup(legacyDb, oldBackup);
assert.equal((await getStravaMappings(legacyDb))[0]?.exercise_id, legacyExerciseId);
assert.equal((await getExerciseHistory(legacyDb, legacyExerciseId)).length, 1);

console.log('Strava: ejercicios, días automáticos, histórico, pendientes y migración v9 correctos.');
