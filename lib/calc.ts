import type { ExerciseSet } from '@/db/types';

/**
 * 1RM de una serie (fórmula Epley):  1RM = Peso * (1 + Reps/30)
 * Para ejercicios corporales, el "Peso" efectivo es (peso_usuario + lastre).
 */
export function oneRepMax(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

/**
 * Peso efectivo para los cálculos de fuerza.
 * - Carga externa: el peso tal cual.
 * - Corporal: peso del usuario + lastre añadido (puede ser 0 o negativo si asistido).
 */
export function effectiveWeight(
  weight: number,
  esCorporal: boolean,
  userWeight: number
): number {
  return esCorporal ? userWeight + weight : weight;
}

/**
 * Peso efectivo de UNA serie: usa el override de la serie (`set.weight`) si
 * existe; si es NULL, hereda el peso global del ejercicio. Después aplica el
 * peso corporal si procede.
 */
export function setEffectiveWeight(
  set: Pick<ExerciseSet, 'weight'>,
  globalWeight: number,
  esCorporal: boolean,
  userWeight: number
): number {
  return effectiveWeight(set.weight ?? globalWeight, esCorporal, userWeight);
}

/**
 * 1RM promedio del día = media del 1RM de todas las series:
 *   (1RM_1 + ... + 1RM_n) / nº de series
 * Cada serie usa su propio peso (override o global heredado).
 */
export function averageOneRepMax(
  sets: Pick<ExerciseSet, 'reps' | 'weight'>[],
  globalWeight: number,
  esCorporal: boolean,
  userWeight: number
): number {
  if (sets.length === 0) return 0;
  const total = sets.reduce(
    (acc, s) => acc + oneRepMax(setEffectiveWeight(s, globalWeight, esCorporal, userWeight), s.reps),
    0
  );
  return total / sets.length;
}
