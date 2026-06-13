import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { buildBackup, restoreBackup } from '@/db/backup';

/**
 * Exporta la BD a un archivo JSON y abre el diálogo de compartir para que el
 * usuario lo guarde donde quiera (Drive, Archivos, etc.).
 */
export async function exportBackup(db: SQLiteDatabase): Promise<string> {
  const backup = await buildBackup(db);
  const stamp = new Date(backup.exportedAt)
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, '-');
  const filename = `gymapp-backup-${stamp}.json`;

  const file = new File(Paths.document, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(backup, null, 2));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Guardar copia de seguridad de GymApp',
      UTI: 'public.json',
    });
  }
  return file.uri;
}

/**
 * Permite elegir un archivo .json del dispositivo y restaura la BD desde él.
 * Devuelve `false` si el usuario cancela.
 */
export async function importBackup(db: SQLiteDatabase): Promise<boolean> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.length) return false;

  const asset = result.assets[0];
  const file = new File(asset.uri);
  const content = await file.text();
  const data = JSON.parse(content);
  await restoreBackup(db, data);
  return true;
}
