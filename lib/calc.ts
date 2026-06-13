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
 * - Carga externa: el peso global tal cual.
 * - Corporal: peso del usuario + lastre añadido (puede ser 0 o negativo si asistido).
 */
export function effectiveWeight(
  globalWeight: number,
  esCorporal: boolean,
  userWeight: number
): number {
  return esCorporal ? userWeight + globalWeight : globalWeight;
}

/**
 * 1RM promedio del día = media del 1RM de todas las series:
 *   (1RM_1 + ... + 1RM_n) / nº de series
 */
export function averageOneRepMax(
  sets: Pick<ExerciseSet, 'reps'>[],
  effWeight: number
): number {
  if (sets.length === 0) return 0;
  const total = sets.reduce((acc, s) => acc + oneRepMax(effWeight, s.reps), 0);
  return total / sets.length;
}
