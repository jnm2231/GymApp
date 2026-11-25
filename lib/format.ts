import type { LastExerciseSetSummary, LastExerciseSummary } from '@/db/history';
import type { ExerciseSet } from '@/db/types';
import { groupSetsByIndex } from './calc.ts';

// Utilidades de formato de fecha/hora y de series.

/** Hora corta "HH:MM" a partir de un timestamp en ms. */
export function formatHM(ts: number | null | undefined): string {
  if (!ts) return '--:--';
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Fecha "DD/MM/YYYY". */
export function formatDate(ts: number): string {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Clave de día local "YYYY-MM-DD" (para agrupar por jornada en el calendario). */
export function dateKey(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Descanso legible: "1:30" (min:seg) o "45s". */
export function formatRest(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Duración total legible entre dos timestamps: "1h 05m" o "42m" o "30s". */
export function formatDuration(startTs: number | null, endTs: number | null): string {
  if (!startTs || !endTs) return '—';
  const totalSec = Math.max(0, Math.round((endTs - startTs) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** Resumen de repeticiones colapsado: [12,12,12,10] -> "12-12-12-10". */
export function repsSummary(reps: number[]): string {
  return reps.join('-');
}

/**
 * Resumen colapsado de series terminadas (soporta bilaterales y unilaterales):
 * - Bilateral: "12-12-10"
 * - Unilateral: "10/10 - 10/9 - 8/8"
 */
export function formatCollapsedSets(sets: ExerciseSet[], isUnilateral: boolean): string {
  if (!isUnilateral) {
    return repsSummary(sets.map((s) => s.reps));
  }
  const groups = groupSetsByIndex(sets);
  return groups
    .map(({ items }) => {
      const left = items.find((s) => s.side === 'left');
      const right = items.find((s) => s.side === 'right');
      return `${left ? left.reps : '—'}/${right ? right.reps : '—'}`;
    })
    .join(' - ');
}

/**
 * Resumen colapsado de series de aguante terminadas:
 * - Bilateral: "0:45 · 0:40"
 * - Unilateral: "0:45/0:42 · 0:40/0:40"
 */
export function formatCollapsedHoldSets(sets: ExerciseSet[], isUnilateral: boolean): string {
  if (!isUnilateral) {
    return sets.map((s) => formatClock(s.duration_seconds ?? 0)).join(' · ');
  }
  const groups = groupSetsByIndex(sets);
  return groups
    .map(({ items }) => {
      const left = items.find((s) => s.side === 'left');
      const right = items.find((s) => s.side === 'right');
      const lText = left ? formatClock(left.duration_seconds ?? 0) : '—';
      const rText = right ? formatClock(right.duration_seconds ?? 0) : '—';
      return `${lText}/${rText}`;
    })
    .join(' · ');
}

/**
 * Formatea la referencia del último entrenamiento reflejando pesos variables
 * y series unilaterales de forma compacta.
 */
export function formatLastExerciseSummary(summary: LastExerciseSummary): string {
  if (summary.sets.length === 0) return '';

  const weights = summary.sets.map((s) => s.weight);
  const allSameWeight = weights.every((w) => w === weights[0]);

  if (!summary.isUnilateral) {
    if (allSameWeight) {
      return `${weights[0]}kg: ${repsSummary(summary.sets.map((s) => s.reps))}`;
    }
    return summary.sets.map((s) => `${s.weight}kg×${s.reps}`).join(' · ');
  }

  const bySet = new Map<number, LastExerciseSetSummary[]>();
  for (const s of summary.sets) {
    const arr = bySet.get(s.setIndex);
    if (arr) arr.push(s);
    else bySet.set(s.setIndex, [s]);
  }
  const groups = [...bySet.values()];

  if (allSameWeight) {
    const formattedGroups = groups
      .map((items) => {
        const left = items.find((s) => s.side === 'left');
        const right = items.find((s) => s.side === 'right');
        return `${left ? left.reps : '—'}/${right ? right.reps : '—'}`;
      })
      .join(' - ');
    return `${weights[0]}kg: ${formattedGroups}`;
  }

  return groups
    .map((items) => {
      const left = items.find((s) => s.side === 'left');
      const right = items.find((s) => s.side === 'right');
      if (left && right && left.weight === right.weight) {
        return `${left.weight}kg×${left.reps}/${right.reps}`;
      }
      const lText = left ? `${left.weight}kg×${left.reps}` : '—';
      const rText = right ? `${right.weight}kg×${right.reps}` : '—';
      return `${lText}/${rText}`;
    })
    .join(' · ');
}

/** Cronómetro en vivo "M:SS" (cuenta ascendente, sin horas). */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Cronómetro de duración de sesión "MM:SS" (supera 59 min como 65:12). */
export function formatElapsedClock(startTs: number, nowTs = Date.now()): string {
  const safe = Math.max(0, Math.floor((nowTs - startTs) / 1000));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatCardioSummary(
  durationSeconds: number | null | undefined,
  distanceKm: number | null | undefined
): string {
  const parts: string[] = [];
  if (durationSeconds != null) parts.push(formatClock(durationSeconds));
  if (distanceKm != null) parts.push(`${distanceKm.toFixed(2)} km`);
  if (durationSeconds != null && distanceKm != null && distanceKm > 0) {
    parts.push(formatPace(durationSeconds, distanceKm));
  }
  return parts.join(' · ') || 'Sin métricas';
}

/** Ritmo medio de cardio en minutos por kilómetro. */
export function formatPace(
  durationSeconds: number,
  distanceKm: number | null | undefined
): string {
  if (!distanceKm || distanceKm <= 0 || durationSeconds <= 0) return '—';
  const secondsPerKm = Math.round(durationSeconds / distanceKm);
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = secondsPerKm % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')} min/km`;
}
