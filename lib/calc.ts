import type { ExerciseSet, SetSide } from '@/db/types';

export interface GroupedSet<T> {
  setIndex: number;
  items: T[];
}

/** Agrupa elementos de serie por `set_index` manteniendo su orden relativo. */
export function groupSetsByIndex<T extends { set_index: number }>(sets: T[]): GroupedSet<T>[] {
  const groups = new Map<number, T[]>();
  for (const s of sets) {
    const arr = groups.get(s.set_index);
    if (arr) arr.push(s);
    else groups.set(s.set_index, [s]);
  }
  return [...groups.entries()].map(([setIndex, items]) => ({ setIndex, items }));
}

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
 * 1RM promedio del día:
 * - En ejercicios bilaterales: media del 1RM de todas las series.
 * - En ejercicios unilaterales: media de ambos lados por serie, promediada entre series.
 */
export function averageOneRepMax(
  sets: (Pick<ExerciseSet, 'reps' | 'weight'> & {
    set_index?: number;
    side?: SetSide | null;
  })[],
  globalWeight: number,
  esCorporal: boolean,
  userWeight: number
): number {
  if (sets.length === 0) return 0;

  const hasSides = sets.some((s) => s.side != null && s.set_index != null);
  if (!hasSides) {
    const total = sets.reduce(
      (acc, s) =>
        acc + oneRepMax(setEffectiveWeight(s, globalWeight, esCorporal, userWeight), s.reps),
      0
    );
    return total / sets.length;
  }

  const bySet = new Map<number, number[]>();
  for (let i = 0; i < sets.length; i++) {
    const s = sets[i];
    const key = s.set_index ?? i + 1;
    const rm = oneRepMax(setEffectiveWeight(s, globalWeight, esCorporal, userWeight), s.reps);
    const list = bySet.get(key);
    if (list) list.push(rm);
    else bySet.set(key, [rm]);
  }

  let sum = 0;
  for (const rms of bySet.values()) {
    const setAvg = rms.reduce((a, b) => a + b, 0) / rms.length;
    sum += setAvg;
  }
  return sum / bySet.size;
}
