import type { SQLiteDatabase } from 'expo-sqlite';
import { SCHEMA_VERSION } from './schema';

/**
 * Tablas incluidas en la copia de seguridad.
 * IMPORTANTE: `dev_notes` (Backlog) se excluye deliberadamente.
 * El orden importa para la restauración (padres antes que hijos).
 */
const BACKUP_TABLES = [
  'settings',
  'exercises',
  'days',
  'day_exercises',
  'sessions',
  'session_exercises',
  'sets',
] as const;

type BackupTable = (typeof BACKUP_TABLES)[number];

export interface BackupFile {
  app: 'GymApp';
  schemaVersion: number;
  exportedAt: number;
  tables: Record<BackupTable, Record<string, unknown>[]>;
}

/** Serializa toda la BD (menos notas) a un objeto JSON-serializable. */
export async function buildBackup(db: SQLiteDatabase): Promise<BackupFile> {
  const tables = {} as Record<BackupTable, Record<string, unknown>[]>;
  for (const t of BACKUP_TABLES) {
    tables[t] = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${t}`);
  }
  return {
    app: 'GymApp',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    tables,
  };
}

function isValidBackup(data: unknown): data is BackupFile {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return d.app === 'GymApp' && typeof d.tables === 'object' && d.tables !== null;
}

/**
 * Restaura una copia de seguridad SOBRESCRIBIENDO los datos actuales.
 * No toca `dev_notes`. Todo se hace en una transacción: si algo falla, no se
 * corrompe la BD.
 */
export async function restoreBackup(db: SQLiteDatabase, data: unknown): Promise<void> {
  if (!isValidBackup(data)) {
    throw new Error('El archivo no es una copia de seguridad válida de GymApp.');
  }

  await db.withTransactionAsync(async () => {
    // Borrado de hijos a padres.
    for (const t of [...BACKUP_TABLES].reverse()) {
      await db.runAsync(`DELETE FROM ${t}`);
    }

    // Inserción de padres a hijos, preservando los IDs originales.
    for (const t of BACKUP_TABLES) {
      const rows = data.tables[t] ?? [];
      for (const row of rows) {
        const cols = Object.keys(row);
        if (cols.length === 0) continue;
        const placeholders = cols.map(() => '?').join(', ');
        const values = cols.map((c) => (row as Record<string, unknown>)[c] as never);
        await db.runAsync(
          `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${placeholders})`,
          values
        );
      }
    }
  });
}
