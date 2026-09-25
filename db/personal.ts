import type { SQLiteDatabase } from 'expo-sqlite';

import { dateKey } from '@/lib/format';
import type { BodyMeasurement } from './types';

export interface TrainingActivityDay {
  date: string;
  workouts: number;
  minutes: number;
}

export async function getWeightEvolution(db: SQLiteDatabase): Promise<BodyMeasurement[]> {
  return db.getAllAsync<BodyMeasurement>(
    'SELECT * FROM body_measurements ORDER BY recorded_at ASC'
  );
}

/** Actividad de las últimas 53 semanas, agregada por día local. */
export async function getTrainingActivity(
  db: SQLiteDatabase,
  startTs: number
): Promise<TrainingActivityDay[]> {
  const sessions = await db.getAllAsync<{
    start_ts: number;
    activity_end_ts: number | null;
  }>(
    `SELECT s.start_ts,
            (SELECT MAX(activity_ts) FROM (
               SELECT st.ts AS activity_ts
                 FROM sets st
                 JOIN session_exercises se ON se.id = st.session_exercise_id
                WHERE se.session_id = s.id
               UNION ALL
               SELECT ce.ts AS activity_ts
                 FROM cardio_entries ce
                 JOIN session_exercises se ON se.id = ce.session_exercise_id
                WHERE se.session_id = s.id
             )) AS activity_end_ts
       FROM sessions s
      WHERE s.status = 'finished' AND s.start_ts >= ?
      ORDER BY s.start_ts ASC`,
    [startTs]
  );

  const days = new Map<string, TrainingActivityDay>();
  for (const session of sessions) {
    const key = dateKey(session.start_ts);
    const current = days.get(key) ?? { date: key, workouts: 0, minutes: 0 };
    current.workouts += 1;
    if (session.activity_end_ts != null) {
      current.minutes += Math.max(
        0,
        Math.round((session.activity_end_ts - session.start_ts) / 60000)
      );
    }
    days.set(key, current);
  }
  return [...days.values()];
}
