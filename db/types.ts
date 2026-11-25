// Tipos del dominio, espejo del esquema SQLite (ver db/schema.ts).

export type TrainingType = 'strength' | 'cardio' | 'calisthenics' | 'hold';
// Campo legado conservado en SQLite para poder restaurar copias antiguas.
// Desde v7 todo cardio cronometra el tiempo y admite distancia opcional.
export type CardioTracking = 'both';
export type ExerciseTracking = 'reps' | 'hold';
export type SetSide = 'left' | 'right';

export interface MuscleGroup {
  id: number;
  name: string;
  created_at: number;
}

export interface Exercise {
  id: number;
  name: string;
  es_corporal: number; // 0 = carga externa, 1 = peso corporal (+ lastre)
  exercise_type: TrainingType;
  cardio_tracking: CardioTracking;
  tracking_mode: ExerciseTracking;
  is_unilateral: number; // 0 = bilateral, 1 = unilateral (izq/der)
  muscle_group_id: number | null;
  archived_at: number | null;
  created_at: number;
}

export interface ExerciseWithMuscleGroup extends Exercise {
  muscle_group_name: string | null;
}

export interface Day {
  id: number;
  name: string;
  training_type: TrainingType;
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
  day_type: TrainingType;
}

export type SessionExerciseStatus = 'pending' | 'active' | 'done';

export interface SessionExercise {
  id: number;
  session_id: number;
  exercise_id: number | null;
  exercise_name: string;
  es_corporal: number;
  weight: number | null; // peso por defecto del ejercicio en la sesión (kg). Cada serie puede sobreescribirlo. Lastre si es corporal.
  position: number;
  is_additional: number;
  start_ts: number | null;
  end_ts: number | null;
  status: SessionExerciseStatus;
  exercise_type: TrainingType;
  cardio_tracking: CardioTracking;
  tracking_mode: ExerciseTracking;
  timer_started_ts: number | null;
  is_unilateral: number;
  timer_side: SetSide | null;
}

export interface ExerciseSet {
  id: number;
  session_exercise_id: number;
  set_index: number; // 1, 2, 3...
  reps: number;
  ts: number; // ms al confirmar el tick
  rest_seconds: number | null; // descanso respecto a la serie anterior (NULL en la 1ª y en el 2º lado de una serie unilateral)
  weight: number | null; // peso de ESTA serie (kg). NULL = hereda el peso global del ejercicio.
  duration_seconds: number | null; // duración de una serie de aguante; NULL para repeticiones
  side: SetSide | null; // 'left' | 'right' para ejercicios unilaterales; NULL para bilaterales
  side_order: number | null; // 1 = primer lado completado, 2 = segundo lado completado
  side_rest_seconds: number | null; // descanso entre el primer y segundo lado dentro de una serie unilateral
}

export interface CardioEntry {
  id: number;
  session_exercise_id: number;
  duration_seconds: number | null;
  distance_km: number | null;
  notes: string | null;
  ts: number;
}

export interface DevNote {
  id: number;
  content: string;
  created_at: number;
  updated_at: number;
}

export interface BodyMeasurement {
  id: number;
  weight: number;
  recorded_at: number;
}

// Tipos compuestos para la UI
export interface DayWithCount extends Day {
  exercise_count: number;
}

export interface SessionExerciseWithSets extends SessionExercise {
  sets: ExerciseSet[];
  cardio_entry: CardioEntry | null;
}
