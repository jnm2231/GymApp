import type { SQLiteDatabase } from 'expo-sqlite';
import { dateKey } from '@/lib/format';
import type { ExerciseSet } from './types';

export interface CalendarSession {
  session_id: number;
  day_name: string;
  start_ts: number;
  end_ts: number | null;
}

export interface CalendarDayDetailExercise {
  session_exercise_id: number;
  exercise_id: number | null;
  exercise_name: string;
  es_corporal: number;
  weight: number | null;
  start_ts: number | null;
  end_ts: number | null;
  sets: ExerciseSet[];
}

export interface CalendarDayBlock extends CalendarSession {
  exercises: CalendarDayDetailExercise[];
}

/**
 * Sesiones finalizadas dentro de un rango [startTs, endTs), agrupadas por día
 * local ("YYYY-MM-DD") para pintar los marcadores del calendario.
 */
export async function getMonthSessions(
  db: SQLiteDatabase,
  startTs: number,
  endTs: number
): Promise<Record<string, CalendarSession[]>> {
  const rows = await db.getAllAsync<CalendarSession>(
    `SELECT id AS session_id, day_name, start_ts,
            COALESCE((SELECT MAX(st.ts)
                        FROM sets st
                        JOIN session_exercises se ON se.id = st.session_exercise_id
                       WHERE se.session_id = sessions.id), end_ts) AS end_ts
       FROM sessions
      WHERE status = 'finished' AND start_ts >= ? AND start_ts < ?
      ORDER BY start_ts ASC`,
    [startTs, endTs]
  );

  const map: Record<string, CalendarSession[]> = {};
  for (const r of rows) {
    const key = dateKey(r.start_ts);
    (map[key] ??= []).push(r);
  }
  return map;
}

/**
 * Detalle de una jornada: cada sesión (tipo de día) con sus bloques de
 * ejercicio y series. Si ese día se hicieron dos tipos de día, devuelve dos
 * bloques.
 */
export async function getDayDetail(
  db: SQLiteDatabase,
  startTs: number,
  endTs: number
): Promise<CalendarDayBlock[]> {
  const sessions = await db.getAllAsync<CalendarSession>(
    `SELECT id AS session_id, day_name, start_ts,
            COALESCE((SELECT MAX(st.ts)
                        FROM sets st
                        JOIN session_exercises se ON se.id = st.session_exercise_id
                       WHERE se.session_id = sessions.id), end_ts) AS end_ts
       FROM sessions
      WHERE status = 'finished' AND start_ts >= ? AND start_ts < ?
      ORDER BY start_ts ASC`,
    [startTs, endTs]
  );

  const blocks: CalendarDayBlock[] = [];
  for (const s of sessions) {
    const exercises = await db.getAllAsync<Omit<CalendarDayDetailExercise, 'sets'>>(
      `SELECT se.id AS session_exercise_id, se.exercise_id, se.exercise_name, se.es_corporal,
              se.weight, se.start_ts,
              COALESCE((SELECT MAX(st.ts) FROM sets st
                         WHERE st.session_exercise_id = se.id), se.end_ts) AS end_ts
         FROM session_exercises AS se
         WHERE se.session_id = ? AND se.start_ts IS NOT NULL
        ORDER BY se.start_ts ASC, se.position ASC`,
      [s.session_id]
    );
    const withSets: CalendarDayDetailExercise[] = [];
    for (const e of exercises) {
      const sets = await db.getAllAsync<ExerciseSet>(
        'SELECT * FROM sets WHERE session_exercise_id = ? ORDER BY set_index ASC',
        [e.session_exercise_id]
      );
      withSets.push({ ...e, sets });
    }
    blocks.push({ ...s, exercises: withSets });
  }
  return blocks;
}
