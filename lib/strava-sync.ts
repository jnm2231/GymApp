import type { SQLiteDatabase } from 'expo-sqlite';

import {
  getLastStravaSync, getStoredStravaActivity, getStravaImportFloor, getStravaMappings,
  importStravaActivity, listPendingMappedActivities, setLastStravaSync, storeStravaActivity,
  type StravaActivity,
} from '@/db/strava';
import { getStravaSession, refreshStravaSession, type StravaSession } from './strava-auth';

const PAGE_SIZE = 50;
const OVERLAP_SECONDS = 7 * 86400;
let running: Promise<number> | null = null;
const updateListeners = new Set<() => void>();

export function subscribeToStravaUpdates(listener: () => void): () => void {
  updateListeners.add(listener);
  return () => { updateListeners.delete(listener); };
}

class StravaHttpError extends Error {
  constructor(readonly status: number) {
    super(status === 429 ? 'Strava ha limitado temporalmente las consultas. Vuelve a sincronizar más tarde.'
      : status === 401 ? 'La conexión con Strava ha caducado. Vuelve a vincular la cuenta.'
        : 'No se pudieron descargar las actividades de Strava.');
  }
}

async function requestJson<T>(path: string, session: StravaSession): Promise<T> {
  let current = await getStravaSession() ?? session;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`https://www.strava.com/api/v3${path}`, {
      headers: { Authorization: `Bearer ${current.accessToken}` },
    });
    if (response.status === 401 && attempt === 0) {
      current = await refreshStravaSession(true);
      continue;
    }
    if (!response.ok) throw new StravaHttpError(response.status);
    return response.json() as Promise<T>;
  }
  throw new StravaHttpError(401);
}

async function importPending(db: SQLiteDatabase, session: StravaSession): Promise<number> {
  let imported = 0;
  for (const stored of await listPendingMappedActivities(db, session.athleteId)) {
    if (!stored.detail_loaded) {
      const detail = await requestJson<StravaActivity>(`/activities/${encodeURIComponent(stored.activity_id)}`, session);
      await storeStravaActivity(db, detail, session.athleteId, true);
    }
    if (await importStravaActivity(db, stored.activity_id)) imported++;
  }
  return imported;
}

async function performSync(db: SQLiteDatabase): Promise<number> {
  const existing = await getStravaSession();
  if (!existing) return 0;
  const session = await refreshStravaSession();
  let imported = await importPending(db, session);
  const mappings = new Set((await getStravaMappings(db)).map((item) => item.sport_type));
  const lastSync = await getLastStravaSync(db);
  const floor = await getStravaImportFloor(db);
  const after = Math.max(0, (lastSync ?? floor) - (lastSync == null ? 0 : OVERLAP_SECONDS));
  const syncStart = Math.floor(Date.now() / 1000);
  let page = 1;
  while (true) {
    const query = new URLSearchParams({
      after: String(after), before: String(syncStart + 1),
      page: String(page), per_page: String(PAGE_SIZE),
    });
    const activities = await requestJson<StravaActivity[]>(`/athlete/activities?${query.toString()}`, session);
    if (!Array.isArray(activities)) throw new Error('Strava devolvió una lista de actividades inválida.');
    for (const summary of activities) {
      const id = String(summary.id);
      const stored = await getStoredStravaActivity(db, id);
      if (stored?.session_id != null) continue;
      const sportType = summary.sport_type || summary.type || 'Unknown';
      await storeStravaActivity(db, summary, session.athleteId, false);
      if (!mappings.has(sportType)) continue;
      if (!stored?.detail_loaded) {
        const detail = await requestJson<StravaActivity>(`/activities/${encodeURIComponent(id)}`, session);
        await storeStravaActivity(db, detail, session.athleteId, true);
      }
      if (await importStravaActivity(db, id)) imported++;
    }
    if (activities.length < PAGE_SIZE) break;
    page++;
  }
  // El cursor avanza únicamente cuando se han procesado todas las páginas.
  await setLastStravaSync(db, syncStart);
  return imported;
}

export function syncStrava(db: SQLiteDatabase): Promise<number> {
  if (running) return running;
  running = performSync(db).then((count) => {
    if (count > 0) for (const listener of updateListeners) listener();
    return count;
  }).finally(() => { running = null; });
  return running;
}
