import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { buildBackup, restoreBackup } from '../db/backup.ts';
import { createDay, getDayExercises } from '../db/days.ts';
import {
  createExercise,
  deleteExercise,
  getExercise,
  listExercises,
  updateExerciseDuringSession,
} from '../db/exercises.ts';
import {
  getExerciseCatalogSummaries,
  getExerciseHistory,
  getLastExerciseSummary,
} from '../db/history.ts';
import {
  createMuscleGroup,
  deleteMuscleGroup,
  listMuscleGroups,
} from '../db/muscle-groups.ts';
import { DEFAULT_MUSCLE_GROUPS, initDatabase, SCHEMA_VERSION } from '../db/schema.ts';
import {
  addSet,
  addUnilateralSetSide,
  finishExercise,
  finishHoldSet,
  finishSession,
  getSessionExercisesWithSets,
  setExerciseWeight,
  startHoldSet,
  startSession,
  syncSessionWithDay,
} from '../db/sessions.ts';
import { averageOneRepMax, oneRepMax } from '../lib/calc.ts';
import {
  formatCollapsedHoldSets,
  formatCollapsedSets,
  formatElapsedClock,
  formatLastExerciseSummary,
} from '../lib/format.ts';

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

// 1. Inicialización limpia + grupos musculares por defecto
const db = createTestDatabase();
await initDatabase(db);
const versionRow = await db.getFirstAsync('PRAGMA user_version');
assert.equal(versionRow.user_version, SCHEMA_VERSION);

const groups = await listMuscleGroups(db);
assert.equal(groups.length, DEFAULT_MUSCLE_GROUPS.length);

const customGroupId = await createMuscleGroup(db, 'Trapecio');
const pechoGroup = groups.find((g) => g.name === 'Pecho');
assert.ok(pechoGroup);

// 2. Creación de ejercicios (bilateral, unilateral, cardio ignora flags)
const pressId = await createExercise(db, 'Press banca', 'strength', {
  muscleGroupId: pechoGroup.id,
});
const curlUniId = await createExercise(db, 'Curl mancuerna', 'strength', {
  isUnilateral: true,
  muscleGroupId: groups.find((g) => g.name === 'Bíceps').id,
});
const plankUniId = await createExercise(db, 'Plancha lateral', 'hold', {
  isUnilateral: true,
  muscleGroupId: groups.find((g) => g.name === 'Abdomen/Core').id,
});
const runId = await createExercise(db, 'Cinta', 'cardio', {
  isUnilateral: true,
  muscleGroupId: pechoGroup.id,
});
const runEx = await getExercise(db, runId);
assert.equal(runEx.is_unilateral, 0);
assert.equal(runEx.muscle_group_id, null);

// 3. Eliminar grupo muscular personalizado pasa ejercicios a NULL ("Sin definir")
const shrugsId = await createExercise(db, 'Encogimientos', 'strength', {
  muscleGroupId: customGroupId,
});
await deleteMuscleGroup(db, customGroupId);
assert.equal((await getExercise(db, shrugsId)).muscle_group_id, null);

// 4. Plantilla de día + sesión + pesos variables + último entrenamiento
const dayId = await createDay(db, 'Torso', [pressId, curlUniId, plankUniId]);
const session1Id = await startSession(db, dayId);
let blocks = await getSessionExercisesWithSets(db, session1Id);
const pressBlock1 = blocks.find((b) => b.exercise_id === pressId);
const curlBlock1 = blocks.find((b) => b.exercise_id === curlUniId);
const holdBlock1 = blocks.find((b) => b.exercise_id === plankUniId);

await setExerciseWeight(db, pressBlock1.id, 80);
await addSet(db, pressBlock1.id, 10, null); // hereda 80
await addSet(db, pressBlock1.id, 8, 90);
await addSet(db, pressBlock1.id, 6, 95);
await addSet(db, pressBlock1.id, 6, 95);
await finishExercise(db, pressBlock1.id);

// 5. Histórico en vivo durante sesión en curso
const liveHistory = await getExerciseHistory(db, pressId, { includeActiveSessionId: session1Id });
assert.equal(liveHistory.length, 1);
assert.equal(liveHistory[0].is_in_progress, true);
assert.equal((await getExerciseHistory(db, pressId)).length, 0);

// 6. Unilateral reps: derecha primero, izquierda después
await setExerciseWeight(db, curlBlock1.id, 14);
const s1r = await addUnilateralSetSide(db, curlBlock1.id, 1, 'right', 10, null);
assert.equal(s1r.side_order, 1);
assert.equal(s1r.rest_seconds, null);
assert.equal(s1r.side_rest_seconds, null);
const s1l = await addUnilateralSetSide(db, curlBlock1.id, 1, 'left', 10, null);
assert.equal(s1l.side_order, 2);
assert.equal(s1l.rest_seconds, null);
assert.ok(s1l.side_rest_seconds != null);

const s2l = await addUnilateralSetSide(db, curlBlock1.id, 2, 'left', 9, 16);
assert.equal(s2l.side_order, 1);
assert.ok(s2l.rest_seconds != null);
await addUnilateralSetSide(db, curlBlock1.id, 2, 'right', 8, 16);
await finishExercise(db, curlBlock1.id);

blocks = await getSessionExercisesWithSets(db, session1Id);
const curlDone = blocks.find((b) => b.id === curlBlock1.id);
assert.equal(formatCollapsedSets(curlDone.sets, true), '10/10 - 9/8');

// Cálculo 1RM unilateral = media de ambos lados por serie, luego media entre series
const set1Rm = (oneRepMax(14, 10) + oneRepMax(14, 10)) / 2;
const set2Rm = (oneRepMax(16, 9) + oneRepMax(16, 8)) / 2;
const expectedAvg = (set1Rm + set2Rm) / 2;
assert.ok(Math.abs(averageOneRepMax(curlDone.sets, 14, false, 0) - expectedAvg) < 1e-9);

// 7. Aguante unilateral
await startHoldSet(db, holdBlock1.id, 'left');
const h1 = await finishHoldSet(db, holdBlock1.id);
assert.equal(h1.side, 'left');
assert.equal(h1.side_order, 1);
await startHoldSet(db, holdBlock1.id, 'right');
const h2 = await finishHoldSet(db, holdBlock1.id);
assert.equal(h2.side, 'right');
assert.equal(h2.side_order, 2);
await finishExercise(db, holdBlock1.id);
blocks = await getSessionExercisesWithSets(db, session1Id);
const holdDone = blocks.find((b) => b.id === holdBlock1.id);
assert.ok(formatCollapsedHoldSets(holdDone.sets, true).includes('/'));

// Finalizar sesión 1: el histórico pasa a ser normal (is_in_progress = false)
await finishSession(db, session1Id);
const finishedHistory = await getExerciseHistory(db, pressId, { includeActiveSessionId: session1Id });
assert.equal(finishedHistory.length, 1);
assert.equal(finishedHistory[0].is_in_progress, false);

// 8. Referencia último entreno con pesos variables y unilateral
const pressSummary = await getLastExerciseSummary(db, pressId);
assert.equal(
  formatLastExerciseSummary(pressSummary),
  '80kg×10 · 90kg×8 · 95kg×6 · 95kg×6'
);
const curlSummary = await getLastExerciseSummary(db, curlUniId);
assert.equal(
  formatLastExerciseSummary(curlSummary),
  '14kg×10/10 · 16kg×9/8'
);

// 9. Formato MM:SS > 60 minutos
assert.equal(formatElapsedClock(0, (65 * 60 + 12) * 1000), '65:12');

// 10. Edición en curso: syncSessionWithDay preserva ejercicios con actividad + conversión bilateral->unilateral
const session2Id = await startSession(db, dayId);
let s2Blocks = await getSessionExercisesWithSets(db, session2Id);
const s2Press = s2Blocks.find((b) => b.exercise_id === pressId);
await setExerciseWeight(db, s2Press.id, 85);
await addSet(db, s2Press.id, 8, null);

// Intentar quitar press (ya tiene serie) y curl (pendiente), reordenar y añadir shrugs
const syncRes = await syncSessionWithDay(db, session2Id, dayId, 'Torso Editado', 'strength', [
  shrugsId,
  plankUniId,
]);
assert.deepEqual(syncRes.preservedRemovedNames, ['Press banca']);
assert.deepEqual((await getDayExercises(db, dayId)).map((e) => e.id), [shrugsId, plankUniId]);
s2Blocks = await getSessionExercisesWithSets(db, session2Id);
assert.ok(s2Blocks.some((b) => b.exercise_id === pressId));
assert.ok(!s2Blocks.some((b) => b.exercise_id === curlUniId));
assert.ok(s2Blocks.some((b) => b.exercise_id === shrugsId));

// Bloqueo de cambio de tipo si ya hay series, y desdoble bilateral -> unilateral
await assert.rejects(
  updateExerciseDuringSession(db, s2Press.id, {
    name: 'Press banca',
    exerciseType: 'cardio',
    isUnilateral: false,
    muscleGroupId: pechoGroup.id,
  })
);
await updateExerciseDuringSession(db, s2Press.id, {
  name: 'Press con mancuernas',
  exerciseType: 'strength',
  isUnilateral: true,
  muscleGroupId: pechoGroup.id,
});
s2Blocks = await getSessionExercisesWithSets(db, session2Id);
const converted = s2Blocks.find((b) => b.id === s2Press.id);
assert.equal(converted.is_unilateral, 1);
assert.equal(converted.sets.length, 2);
assert.deepEqual(converted.sets.map((s) => s.side), ['left', 'right']);
assert.deepEqual(converted.sets.map((s) => s.reps), [8, 8]);

// Bloqueo de unilateral -> bilateral con series registradas
await assert.rejects(
  updateExerciseDuringSession(db, s2Press.id, {
    name: 'Press con mancuernas',
    exerciseType: 'strength',
    isUnilateral: false,
    muscleGroupId: pechoGroup.id,
  })
);

// 11. Borrado lógico preserva histórico
await deleteExercise(db, curlUniId);
assert.ok(!(await listExercises(db)).some((e) => e.id === curlUniId));
assert.equal((await getExerciseHistory(db, curlUniId)).length, 1);
const catalogSummaries = await getExerciseCatalogSummaries(db);
assert.ok(catalogSummaries.some((c) => c.id === shrugsId && c.timesPerformed === 0));

// 12. Backup / Restore v11 y migración desde v10
const backup = await buildBackup(db);
const restoredDb = createTestDatabase();
await initDatabase(restoredDb);
await restoreBackup(restoredDb, backup);
assert.equal((await getExerciseHistory(restoredDb, pressId)).length, 1);
assert.equal((await listMuscleGroups(restoredDb)).length, DEFAULT_MUSCLE_GROUPS.length);

// Migración v10 -> v11
const v10Db = createTestDatabase();
await v10Db.execAsync(`
  CREATE TABLE exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    es_corporal INTEGER NOT NULL DEFAULT 0,
    exercise_type TEXT NOT NULL DEFAULT 'strength',
    cardio_tracking TEXT NOT NULL DEFAULT 'both',
    tracking_mode TEXT NOT NULL DEFAULT 'reps',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE days (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, training_type TEXT NOT NULL DEFAULT 'strength', created_at INTEGER NOT NULL);
  CREATE TABLE day_exercises (id INTEGER PRIMARY KEY AUTOINCREMENT, day_id INTEGER NOT NULL, exercise_id INTEGER NOT NULL, position INTEGER NOT NULL);
  CREATE TABLE sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, day_id INTEGER, day_name TEXT NOT NULL, start_ts INTEGER NOT NULL, end_ts INTEGER, user_weight REAL, status TEXT NOT NULL DEFAULT 'active', day_type TEXT NOT NULL DEFAULT 'strength');
  CREATE TABLE session_exercises (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL, exercise_id INTEGER, exercise_name TEXT NOT NULL, es_corporal INTEGER NOT NULL DEFAULT 0, weight REAL, position INTEGER NOT NULL, is_additional INTEGER NOT NULL DEFAULT 0, start_ts INTEGER, end_ts INTEGER, status TEXT NOT NULL DEFAULT 'pending', exercise_type TEXT NOT NULL DEFAULT 'strength', cardio_tracking TEXT NOT NULL DEFAULT 'both', tracking_mode TEXT NOT NULL DEFAULT 'reps', timer_started_ts INTEGER);
  CREATE TABLE sets (id INTEGER PRIMARY KEY AUTOINCREMENT, session_exercise_id INTEGER NOT NULL, set_index INTEGER NOT NULL, reps INTEGER NOT NULL, ts INTEGER NOT NULL, rest_seconds INTEGER, weight REAL, duration_seconds INTEGER);
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE body_measurements (id INTEGER PRIMARY KEY AUTOINCREMENT, weight REAL NOT NULL, recorded_at INTEGER NOT NULL);
  CREATE TABLE cardio_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, session_exercise_id INTEGER NOT NULL UNIQUE, duration_seconds INTEGER, distance_km REAL, notes TEXT, ts INTEGER NOT NULL);
  CREATE TABLE strava_mappings (sport_type TEXT PRIMARY KEY, exercise_id INTEGER NOT NULL);
  CREATE TABLE strava_activities (activity_id TEXT PRIMARY KEY, athlete_id TEXT NOT NULL, sport_type TEXT NOT NULL, name TEXT NOT NULL, start_ts INTEGER NOT NULL, session_id INTEGER UNIQUE, detail_loaded INTEGER NOT NULL DEFAULT 0, raw_json TEXT NOT NULL);
  CREATE TABLE dev_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  INSERT INTO exercises (name, created_at) VALUES ('Sentadilla', 1000);
  PRAGMA user_version = 10;
`);
await initDatabase(v10Db);
const v10Migrated = await listExercises(v10Db);
assert.equal(v10Migrated[0].name, 'Sentadilla');
assert.equal(v10Migrated[0].muscle_group_id, null);
assert.equal(v10Migrated[0].is_unilateral, 0);
assert.equal((await listMuscleGroups(v10Db)).length, DEFAULT_MUSCLE_GROUPS.length);

console.log('Tests v1.5 (esquema v11, unilaterales, grupos, borrado lógico, sync, histórico en vivo): OK.');
