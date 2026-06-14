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

/** Cronómetro en vivo "M:SS" (cuenta ascendente, sin horas). */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
