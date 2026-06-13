// Tipos del dominio, espejo del esquema SQLite (ver db/schema.ts).

export interface Exercise {
  id: number;
  name: string;
  es_corporal: number; // 0 = carga externa, 1 = peso corporal (+ lastre)
  created_at: number;
}

export interface Day {
  id: number;
  name: string;
  created_at: number;
}

export interface DayExercise {
  id: number;
  day_id: number;
  exercise_id: number;
  position: number;
}

export type SessionStatus = 'active' | 'paused' | 'finished';

export interface Session {
  id: number;
  day_id: number | null;
  day_name: string;
  start_ts: number; // ms
  end_ts: number | null; // ms
  user_weight: number | null; // snapshot del peso del usuario
  status: SessionStatus;
}

export type SessionExerciseStatus = 'pending' | 'active' | 'done';

export interface SessionExercise {
  id: number;
  session_id: number;
  exercise_id: number | null;
  exercise_name: string;
  es_corporal: number;
  weight: number | null; // PESO GLOBAL del ejercicio en la sesión (kg). Lastre si es corporal.
  position: number;
  is_additional: number;
  start_ts: number | null;
  end_ts: number | null;
  status: SessionExerciseStatus;
}

export interface ExerciseSet {
  id: number;
  session_exercise_id: number;
  set_index: number; // 1, 2, 3...
  reps: number;
  ts: number; // ms al confirmar el tick
  rest_seconds: number | null; // descanso respecto a la serie anterior (NULL en la 1ª)
}

export interface DevNote {
  id: number;
  content: string;
  created_at: number;
  updated_at: number;
}

// Tipos compuestos para la UI
export interface DayWithCount extends Day {
  exercise_count: number;
}

export interface SessionExerciseWithSets extends SessionExercise {
  sets: ExerciseSet[];
}
