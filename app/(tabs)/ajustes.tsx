import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAlert } from '@/components/gym/alert';
import { CopyButton } from '@/components/gym/copy-button';
import { SaveButton } from '@/components/gym/save-button';
import { Button, ScreenTitle } from '@/components/gym/ui';
import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import { CURRENT_VERSION } from '@/constants/patch-notes';
import { useSession } from '@/context/session-context';
import {
  getBodyProfile,
  listBodyMeasurements,
  recordBodyWeight,
  saveBodyProfile,
  setWeeklyWeightReminder,
} from '@/db/body';
import {
  createExercise,
  deleteExercise,
  listExercises,
} from '@/db/exercises';
import { getDevNote, saveDevNote } from '@/db/notes';
import type {
  BodyMeasurement,
  Exercise,
  TrainingType,
} from '@/db/types';
import { exportBackup, importBackup } from '@/lib/backup-io';
import {
  disableWeeklyWeightReminder,
  ensureWeeklyWeightReminder,
  scheduleWeeklyWeightReminder,
} from '@/lib/body-notifications';
import { formatDate } from '@/lib/format';
import { getTrainingType, TRAINING_TYPES } from '@/lib/training-types';
import { useKeyboardHeight } from '@/lib/use-keyboard';
import {
  getTimerNotificationsEnabled,
  setTimerNotificationsEnabled,
} from '@/lib/workout-notifications';

const CATALOG_PREVIEW = 5; // ejercicios visibles antes de "Ver todos"

export default function AjustesScreen() {
  const db = useSQLiteContext();
  const showAlert = useAlert();
  const insets = useSafeAreaInsets();
  const { refresh } = useSession();
  const scrollRef = useRef<ScrollView>(null);
  const keyboardHeight = useKeyboardHeight();

  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [weeklyWeightReminder, setWeeklyWeightReminderState] = useState(false);
  const [timerNotifications, setTimerNotifications] = useState(false);
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [catalogExpanded, setCatalogExpanded] = useState(false);
  const [newName, setNewName] = useState('');
  const [newExerciseType, setNewExerciseType] = useState<TrainingType>('strength');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const profile = await getBodyProfile(db);
    const nextMeasurements = await listBodyMeasurements(db);
    const nextExercises = await listExercises(db);
    const devNote = await getDevNote(db);
    const timersEnabled = await getTimerNotificationsEnabled(db);
    setWeight(profile.weight ? String(profile.weight) : '');
    setHeight(profile.heightCm == null ? '' : String(profile.heightCm));
    setBirthDate(profile.birthDate ? isoToDisplayDate(profile.birthDate) : '');
    setWeeklyWeightReminderState(profile.weeklyWeightReminder);
    setTimerNotifications(timersEnabled);
    setMeasurements(nextMeasurements);
    setExercises(nextExercises);
    setNote(devNote?.content ?? '');
    if (profile.weeklyWeightReminder) void ensureWeeklyWeightReminder();
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleSaveWeight = async () => {
    const n = parseFloat(weight.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) {
      showAlert('Peso no válido', 'Introduce un peso mayor que cero.');
      return;
    }
    await recordBodyWeight(db, n);
    if (weeklyWeightReminder) await scheduleWeeklyWeightReminder();
    await load();
  };

  const handleSaveBodyProfile = async () => {
    const heightCm = parseFloat(height.replace(',', '.'));
    if (height.trim() && (!Number.isFinite(heightCm) || heightCm <= 0)) {
      showAlert('Altura no válida', 'Introduce la altura en centímetros.');
      return;
    }
    const birthDateIso = birthDate.trim() ? displayDateToIso(birthDate) : null;
    if (birthDate.trim() && !birthDateIso) {
      showAlert('Fecha no válida', 'Usa el formato DD/MM/AAAA.');
      return;
    }
    await saveBodyProfile(db, height.trim() ? heightCm : null, birthDateIso);
    await load();
  };

  const handleWeeklyReminderChange = async (enabled: boolean) => {
    setWeeklyWeightReminderState(enabled);
    await setWeeklyWeightReminder(db, enabled);
    if (enabled) await scheduleWeeklyWeightReminder();
    else await disableWeeklyWeightReminder();
  };

  const handleTimerNotificationsChange = async (enabled: boolean) => {
    const changed = await setTimerNotificationsEnabled(db, enabled);
    if (!changed) {
      setTimerNotifications(false);
      showAlert(
        'Notificaciones no disponibles',
        Constants.executionEnvironment === 'storeClient'
          ? 'Los cronómetros en notificaciones necesitan una versión instalada de la app; Expo Go no los incluye.'
          : 'Activa el permiso de notificaciones del sistema para usar esta función.'
      );
      return;
    }
    setTimerNotifications(enabled);
  };

  const handleAddExercise = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await createExercise(db, name, newExerciseType);
      setNewName('');
      await load();
    } catch {
      showAlert('Ya existe', `El ejercicio "${name}" ya está en el catálogo.`);
    }
  };

  const handleDeleteExercise = (ex: Exercise) => {
    showAlert(
      'Eliminar ejercicio',
      `¿Eliminar "${ex.name}" del catálogo? Se quitará de las plantillas de día. El histórico se conserva.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await deleteExercise(db, ex.id);
            await load();
          },
        },
      ]
    );
  };

  const handleExport = async () => {
    try {
      setBusy(true);
      await exportBackup(db);
    } catch (e) {
      showAlert('Error al exportar', e instanceof Error ? e.message : 'Error desconocido.');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = () => {
    showAlert(
      'Importar copia de seguridad',
      'Se SOBRESCRIBIRÁN todos los datos actuales (ejercicios, días, sesiones e histórico) con los del archivo. Las Notas de Desarrollo no se ven afectadas. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          style: 'destructive',
          onPress: async () => {
            try {
              setBusy(true);
              const ok = await importBackup(db);
              if (ok) {
                await load();
                await refresh();
                showAlert('Restauración completada', 'Los datos se han importado correctamente.');
              }
            } catch (e) {
              showAlert(
                'Error al importar',
                e instanceof Error ? e.message : 'No se han podido importar los datos.'
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const handleSaveNote = async () => {
    await saveDevNote(db, note);
  };

  const handleCopyNote = async (): Promise<boolean> => {
    if (!note.trim()) {
      showAlert('Nota vacía', 'No hay nada que copiar.');
      return false;
    }
    await Clipboard.setStringAsync(note);
    return true;
  };

  return (
    <View style={{ flex: 1, backgroundColor: GymTheme.background }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.sm, paddingBottom: Spacing.xxl + keyboardHeight },
        ]}
        keyboardShouldPersistTaps="handled">
        <ScreenTitle>Ajustes</ScreenTitle>

        {/* Perfil */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Registro corporal</Text>
          <Text style={styles.cardSub}>
            Registra tu peso, altura y fecha de nacimiento. El peso se usa en el 1RM de los ejercicios
            corporales.
          </Text>
          <Text style={styles.fieldLabel}>Peso actual</Text>
          <View style={styles.weightRow}>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={GymTheme.textFaint}
              keyboardType="decimal-pad"
              value={weight}
              onChangeText={setWeight}
              onSubmitEditing={handleSaveWeight}
              returnKeyType="done"
            />
            <Text style={styles.unit}>kg</Text>
            <SaveButton title="Registrar" onPress={handleSaveWeight} style={{ flex: 1 }} />
          </View>

          <View style={styles.profileGrid}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Altura</Text>
              <View style={styles.compactField}>
                <TextInput
                  style={[styles.input, { flex: 1, minWidth: 0 }]}
                  placeholder="175"
                  placeholderTextColor={GymTheme.textFaint}
                  keyboardType="decimal-pad"
                  value={height}
                  onChangeText={setHeight}
                />
                <Text style={styles.unit}>cm</Text>
              </View>
            </View>
            <View style={{ flex: 1.4 }}>
              <Text style={styles.fieldLabel}>Fecha de nacimiento</Text>
              <TextInput
                style={[styles.input, { width: '100%' }]}
                placeholder="DD/MM/AAAA"
                placeholderTextColor={GymTheme.textFaint}
                keyboardType="number-pad"
                value={birthDate}
                onChangeText={(value) => setBirthDate(formatBirthDateInput(value))}
                maxLength={10}
              />
              <Text style={styles.inputHint}>Escribe las 8 cifras; las barras se añaden solas.</Text>
            </View>
          </View>
          {displayDateToIso(birthDate) ? (
            <Text style={styles.ageText}>Edad actual: {ageFromIso(displayDateToIso(birthDate)!)} años</Text>
          ) : null}
          <SaveButton title="Guardar perfil" onPress={handleSaveBodyProfile} />

          <View style={styles.reminderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.reminderTitle}>Recordatorio semanal de peso</Text>
              <Text style={styles.cardSub}>Avisa siete días después del último registro.</Text>
            </View>
            <Switch
              value={weeklyWeightReminder}
              onValueChange={handleWeeklyReminderChange}
              trackColor={{ true: GymTheme.primary, false: GymTheme.disabled }}
              thumbColor={GymTheme.white}
            />
          </View>

          {measurements.length > 0 ? (
            <View style={styles.measurements}>
              <Text style={styles.fieldLabel}>Últimos registros</Text>
              {measurements.map((measurement) => (
                <View key={measurement.id} style={styles.measurementRow}>
                  <Text style={styles.measurementDate}>{formatDate(measurement.recorded_at)}</Text>
                  <Text style={styles.measurementWeight}>{measurement.weight} kg</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {/* Notificaciones de cronómetros */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cronómetros en notificaciones</Text>
          <Text style={styles.cardSub}>
            Muestra el tiempo transcurrido durante los descansos y los ejercicios de Aguante o
            Cardio. En Android el contador continúa aunque cierres la app.
          </Text>
          <View style={styles.reminderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.reminderTitle}>Mostrar cronómetro</Text>
              <Text style={styles.cardSub}>Puedes activarlo o desactivarlo cuando quieras.</Text>
            </View>
            <Switch
              value={timerNotifications}
              onValueChange={handleTimerNotificationsChange}
              trackColor={{ true: GymTheme.primary, false: GymTheme.disabled }}
              thumbColor={GymTheme.white}
            />
          </View>
        </View>

        {/* Catálogo de ejercicios */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Catálogo de ejercicios</Text>
          <Text style={styles.cardSub}>
            Ejercicios disponibles para componer tus días. Los ejercicios de tipo Corporal
            incluyen el peso propio; los de Aguante se registran con cronómetro.
          </Text>

          {(catalogExpanded ? exercises : exercises.slice(0, CATALOG_PREVIEW)).map((ex) => (
            <View key={ex.id} style={styles.exerciseRow}>
              {(() => {
                const type = getTrainingType(ex.exercise_type);
                return <MaterialCommunityIcons name={type.icon} size={20} color={type.color} />;
              })()}
              <Text style={styles.exerciseName}>{ex.name}</Text>
              <Text style={[styles.tag, { color: getTrainingType(ex.exercise_type).color }]}>
                {getTrainingType(ex.exercise_type).label}
              </Text>
              <Pressable hitSlop={8} onPress={() => handleDeleteExercise(ex)}>
                <MaterialCommunityIcons name="trash-can-outline" size={20} color={GymTheme.danger} />
              </Pressable>
            </View>
          ))}
          {exercises.length === 0 ? (
            <Text style={styles.muted}>Aún no hay ejercicios. Crea el primero abajo.</Text>
          ) : null}
          {exercises.length > CATALOG_PREVIEW ? (
            <Pressable style={styles.expandRow} onPress={() => setCatalogExpanded((v) => !v)}>
              <Text style={styles.expandText}>
                {catalogExpanded ? 'Ver menos' : `Ver todos (${exercises.length})`}
              </Text>
              <MaterialCommunityIcons
                name={catalogExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={GymTheme.primary}
              />
            </Pressable>
          ) : null}

          <View style={styles.divider} />
          <TextInput
            style={[styles.input, { width: '100%' }]}
            placeholder="Nuevo ejercicio (ej: Press banca)"
            placeholderTextColor={GymTheme.textFaint}
            value={newName}
            onChangeText={setNewName}
            onSubmitEditing={handleAddExercise}
            returnKeyType="done"
          />
          <View style={styles.typeSelector}>
            {TRAINING_TYPES.map((type) => (
              <Pressable
                key={type.value}
                style={[
                  styles.typeChip,
                  newExerciseType === type.value && {
                    borderColor: type.color,
                    backgroundColor: type.dimColor,
                  },
                ]}
                onPress={() => setNewExerciseType(type.value)}>
                <Text style={[styles.typeChipText, newExerciseType === type.value && { color: type.color }]}>
                  {type.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.corporalRow}>
            <Text style={styles.cardSub}>
              {newExerciseType === 'calisthenics'
                ? 'Los ejercicios corporales incluyen el peso propio.'
                : newExerciseType === 'hold'
                  ? 'Los ejercicios de aguante registran cada serie con un cronómetro.'
                : 'Se añadirá al catálogo global.'}
            </Text>
            <Button title="Añadir" onPress={handleAddExercise} />
          </View>
        </View>

        {/* Plantillas de día */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Días de entrenamiento</Text>
          <Text style={styles.cardSub}>
            Crea plantillas de día (Pecho, Espalda...) seleccionando ejercicios del catálogo.
          </Text>
          <Button
            title="Nuevo día"
            variant="surface"
            left={<MaterialCommunityIcons name="plus" size={18} color={GymTheme.text} />}
            onPress={() => router.push('/day-form')}
          />
        </View>

        {/* Copias de seguridad */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Copias de seguridad</Text>
          <Text style={styles.cardSub}>
            Exporta toda la base de datos a un archivo .json para guardarla o pasarla a otro móvil, e
            impórtala para restaurarla. Las Notas de Desarrollo quedan excluidas.
          </Text>
          <Button
            title="Exportar copia (.json)"
            variant="surface"
            loading={busy}
            left={<MaterialCommunityIcons name="export" size={18} color={GymTheme.text} />}
            onPress={handleExport}
          />
          <Button
            title="Importar copia"
            variant="surface"
            loading={busy}
            left={<MaterialCommunityIcons name="import" size={18} color={GymTheme.text} />}
            onPress={handleImport}
          />
        </View>

        {/* Notas de desarrollo */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Notas de desarrollo (Backlog)</Text>
          <Text style={styles.cardSub}>Ideas y pendientes. No se incluyen en las copias de seguridad.</Text>
          <TextInput
            style={styles.textarea}
            placeholder="Escribe aquí tus notas..."
            placeholderTextColor={GymTheme.textFaint}
            value={note}
            onChangeText={setNote}
            onBlur={handleSaveNote}
            onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150)}
            multiline
            textAlignVertical="top"
          />
          <View style={styles.noteActions}>
            <CopyButton onPress={handleCopyNote} style={{ flex: 1 }} />
            <SaveButton title="Guardar nota" onPress={handleSaveNote} style={{ flex: 1 }} />
          </View>
        </View>

        {/* Información */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Información</Text>
          <Text style={styles.cardSub}>Consulta las novedades y correcciones de cada versión.</Text>
          <Button
            title="Historial de versiones"
            variant="surface"
            left={<MaterialCommunityIcons name="history" size={18} color={GymTheme.text} />}
            onPress={() => router.push('/patch-notes')}
          />
        </View>

        <View style={styles.about}>
          <View style={styles.aboutRow}>
            <Ionicons name="barbell" size={16} color={GymTheme.textFaint} />
            <Text style={styles.version}>
              GymApp v{Constants.expoConfig?.version ?? CURRENT_VERSION} · datos sólo en este dispositivo
            </Text>
          </View>
          <Text style={styles.author}>Creado por jnm2231</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg },
  card: {
    backgroundColor: GymTheme.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: GymTheme.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  cardTitle: { color: GymTheme.text, fontSize: 17, fontWeight: '700' },
  cardSub: { color: GymTheme.textMuted, fontSize: 13, lineHeight: 18 },
  muted: { color: GymTheme.textFaint, fontSize: 14 },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  input: {
    backgroundColor: GymTheme.inputBg,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    color: GymTheme.text,
    fontSize: 16,
    minWidth: 90,
  },
  unit: { color: GymTheme.textMuted, fontSize: 16, fontWeight: '600' },
  fieldLabel: { color: GymTheme.textMuted, fontSize: 12, fontWeight: '700' },
  inputHint: { color: GymTheme.textFaint, fontSize: 10, lineHeight: 14, marginTop: 4 },
  profileGrid: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.md },
  compactField: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  ageText: { color: GymTheme.primary, fontSize: 13, fontWeight: '700' },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: GymTheme.border,
    paddingTop: Spacing.md,
  },
  reminderTitle: { color: GymTheme.text, fontSize: 14, fontWeight: '700' },
  measurements: { gap: Spacing.sm, borderTopWidth: 1, borderTopColor: GymTheme.border, paddingTop: Spacing.md },
  measurementRow: { flexDirection: 'row', justifyContent: 'space-between' },
  measurementDate: { color: GymTheme.textMuted, fontSize: 13 },
  measurementWeight: { color: GymTheme.text, fontSize: 14, fontWeight: '800' },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
  exerciseName: { color: GymTheme.text, fontSize: 15, flex: 1, fontWeight: '500' },
  tag: {
    color: GymTheme.active,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    backgroundColor: GymTheme.activeDim,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  divider: { height: 1, backgroundColor: GymTheme.border, marginVertical: Spacing.xs },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  expandText: { color: GymTheme.primary, fontSize: 14, fontWeight: '700' },
  corporalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  typeSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeChip: {
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    backgroundColor: GymTheme.surfaceAlt,
  },
  typeChipText: { color: GymTheme.textMuted, fontSize: 12, fontWeight: '700' },
  noteActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  textarea: {
    backgroundColor: GymTheme.inputBg,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    color: GymTheme.text,
    fontSize: 15,
    minHeight: 120,
  },
  about: { alignItems: 'center', gap: 4 },
  aboutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  version: { color: GymTheme.textFaint, fontSize: 12, textAlign: 'center' },
  author: { color: GymTheme.textMuted, fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
});

function displayDateToIso(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getTime() > Date.now()
  ) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatBirthDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function isoToDisplayDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function ageFromIso(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age--;
  return Math.max(0, age);
}
