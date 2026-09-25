import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAlert } from '@/components/gym/alert';
import { CopyButton } from '@/components/gym/copy-button';
import { SaveButton } from '@/components/gym/save-button';
import { Button, ScreenTitle } from '@/components/gym/ui';
import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import { CURRENT_VERSION } from '@/constants/patch-notes';
import { useSession } from '@/context/session-context';
import { getBodyProfile, setWeeklyWeightReminder, setWeightReminderDay, setWeightReminderHour } from '@/db/body';
import { createExercise, deleteExercise, listExercises } from '@/db/exercises';
import { getDevNote, saveDevNote } from '@/db/notes';
import type { Exercise, TrainingType } from '@/db/types';
import { exportBackup, importBackup } from '@/lib/backup-io';
import { disableWeeklyWeightReminder, ensureWeeklyWeightReminder, scheduleWeeklyWeightReminder } from '@/lib/body-notifications';
import { getTrainingType, TRAINING_TYPES } from '@/lib/training-types';
import { useKeyboardHeight } from '@/lib/use-keyboard';
import { getTimerNotificationsEnabled, setTimerNotificationsEnabled } from '@/lib/workout-notifications';

const CATALOG_PREVIEW = 5;
const WEEKDAYS = [
  { value: 1, label: 'L' }, { value: 2, label: 'M' }, { value: 3, label: 'X' },
  { value: 4, label: 'J' }, { value: 5, label: 'V' }, { value: 6, label: 'S' },
  { value: 0, label: 'D' },
];
type InfoSection = 'notifications' | 'catalog' | 'days' | 'backup' | 'notes' | null;

export default function AjustesScreen() {
  const db = useSQLiteContext();
  const showAlert = useAlert();
  const insets = useSafeAreaInsets();
  const { refresh } = useSession();
  const scrollRef = useRef<ScrollView>(null);
  const keyboardHeight = useKeyboardHeight();
  const [weeklyWeightReminder, setWeeklyWeightReminderState] = useState(false);
  const [weightReminderDay, setWeightReminderDayState] = useState(1);
  const [weightReminderHour, setWeightReminderHourState] = useState(9);
  const [timerNotifications, setTimerNotifications] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [catalogExpanded, setCatalogExpanded] = useState(false);
  const [newName, setNewName] = useState('');
  const [newExerciseType, setNewExerciseType] = useState<TrainingType>('strength');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<InfoSection>(null);

  const load = useCallback(async () => {
    const profile = await getBodyProfile(db);
    const nextExercises = await listExercises(db);
    const devNote = await getDevNote(db);
    const timersEnabled = await getTimerNotificationsEnabled(db);
    setWeeklyWeightReminderState(profile.weeklyWeightReminder);
    setWeightReminderDayState(profile.weightReminderDay);
    setWeightReminderHourState(profile.weightReminderHour);
    setTimerNotifications(timersEnabled);
    setExercises(nextExercises);
    setNote(devNote?.content ?? '');
    if (profile.weeklyWeightReminder) void ensureWeeklyWeightReminder(profile.weightReminderDay, profile.weightReminderHour);
  }, [db]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const handleWeeklyReminderChange = async (enabled: boolean) => {
    setWeeklyWeightReminderState(enabled);
    await setWeeklyWeightReminder(db, enabled);
    if (enabled) await scheduleWeeklyWeightReminder(weightReminderDay, weightReminderHour);
    else await disableWeeklyWeightReminder();
  };

  const changeReminderDay = async (day: number) => {
    setWeightReminderDayState(day);
    await setWeightReminderDay(db, day);
    await scheduleWeeklyWeightReminder(day, weightReminderHour);
  };

  const changeReminderHour = async (delta: number) => {
    const hour = (weightReminderHour + delta + 24) % 24;
    setWeightReminderHourState(hour);
    await setWeightReminderHour(db, hour);
    await scheduleWeeklyWeightReminder(weightReminderDay, hour);
  };

  const handleTimerNotificationsChange = async (enabled: boolean) => {
    setTimerNotifications(enabled);
    const changed = await setTimerNotificationsEnabled(db, enabled);
    if (!changed) setTimerNotifications(false);
  };

  const handleAddExercise = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await createExercise(db, name, newExerciseType);
      setNewName('');
      setExercises(await listExercises(db));
    } catch {
      showAlert('Ya existe', `El ejercicio "${name}" ya está en el catálogo.`);
    }
  };

  const handleDeleteExercise = (exercise: Exercise) => {
    showAlert('Eliminar ejercicio', `¿Eliminar "${exercise.name}" del catálogo? El histórico se conserva.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        await deleteExercise(db, exercise.id);
        setExercises(await listExercises(db));
      } },
    ]);
  };

  const handleExport = async () => {
    try { setBusy(true); await exportBackup(db); }
    catch (error) { showAlert('Error al exportar', error instanceof Error ? error.message : 'Error desconocido.'); }
    finally { setBusy(false); }
  };

  const handleImport = () => {
    showAlert('Importar copia', 'Se sustituirán los datos actuales por los del archivo. ¿Continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Importar', style: 'destructive', onPress: async () => {
        try {
          setBusy(true);
          if (await importBackup(db)) { await load(); await refresh(); }
        } catch (error) {
          showAlert('Error al importar', error instanceof Error ? error.message : 'No se ha podido importar.');
        } finally { setBusy(false); }
      } },
    ]);
  };

  const handleCopyNote = async (): Promise<boolean> => {
    if (!note.trim()) return false;
    await Clipboard.setStringAsync(note);
    return true;
  };

  return (
    <View style={styles.screen}>
      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.sm, paddingBottom: Spacing.xxl + keyboardHeight }]}>
        <ScreenTitle>Ajustes</ScreenTitle>

        <View style={styles.card}>
          <SectionHeader icon="bell-outline" title="Notificaciones" section="notifications" info={info} setInfo={setInfo} />
          {info === 'notifications' ? <InfoText>Configura los avisos semanales de peso y los cronómetros visibles durante descansos, Aguante y Cardio.</InfoText> : null}
          <SettingRow icon="scale-bathroom" title="Recordatorio de peso"
            subtitle="Aviso semanal de pesaje" value={weeklyWeightReminder} onChange={handleWeeklyReminderChange} />
          {weeklyWeightReminder ? (
            <View style={styles.reminderSchedule}>
              <Text style={styles.scheduleLabel}>Día del pesaje</Text>
              <View style={styles.weekRow}>
                {WEEKDAYS.map((day) => (
                  <Pressable key={day.value} style={[styles.dayChip, weightReminderDay === day.value && styles.dayChipActive]}
                    onPress={() => void changeReminderDay(day.value)}>
                    <Text style={[styles.dayChipText, weightReminderDay === day.value && styles.dayChipTextActive]}>{day.label}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.hourRow}>
                <Text style={styles.scheduleLabel}>Hora del aviso</Text>
                <View style={styles.hourControl}>
                  <Pressable style={styles.hourButton} onPress={() => void changeReminderHour(-1)}>
                    <MaterialCommunityIcons name="minus" size={18} color={GymTheme.text} />
                  </Pressable>
                  <Text style={styles.hourText}>{String(weightReminderHour).padStart(2, '0')}:00</Text>
                  <Pressable style={styles.hourButton} onPress={() => void changeReminderHour(1)}>
                    <MaterialCommunityIcons name="plus" size={18} color={GymTheme.text} />
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
          <SettingRow icon="timer-outline" title="Cronómetros"
            subtitle="Descansos, Aguante y Cardio" value={timerNotifications} onChange={handleTimerNotificationsChange} />
        </View>

        <View style={styles.card}>
          <SectionHeader icon="format-list-bulleted" title="Ejercicios" section="catalog" info={info} setInfo={setInfo} />
          {info === 'catalog' ? <InfoText>Catálogo disponible al crear un día. Corporal incluye el peso propio y Aguante registra tiempo.</InfoText> : null}
          {(catalogExpanded ? exercises : exercises.slice(0, CATALOG_PREVIEW)).map((exercise) => {
            const type = getTrainingType(exercise.exercise_type);
            return (
              <View key={exercise.id} style={styles.exerciseRow}>
                <MaterialCommunityIcons name={type.icon} size={19} color={type.color} />
                <Text style={styles.exerciseName}>{exercise.name}</Text>
                <Text style={[styles.tag, { color: type.color }]}>{type.label}</Text>
                <Pressable hitSlop={8} onPress={() => handleDeleteExercise(exercise)}>
                  <MaterialCommunityIcons name="trash-can-outline" size={19} color={GymTheme.danger} />
                </Pressable>
              </View>
            );
          })}
          {exercises.length > CATALOG_PREVIEW ? (
            <Pressable style={styles.expandRow} onPress={() => setCatalogExpanded((value) => !value)}>
              <Text style={styles.expandText}>{catalogExpanded ? 'Ver menos' : `Ver todos (${exercises.length})`}</Text>
              <MaterialCommunityIcons name={catalogExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={GymTheme.primary} />
            </Pressable>
          ) : null}
          <View style={styles.divider} />
          <TextInput style={styles.input} placeholder="Nombre del ejercicio" placeholderTextColor={GymTheme.textFaint}
            value={newName} onChangeText={setNewName} onSubmitEditing={handleAddExercise} />
          <View style={styles.typeSelector}>
            {TRAINING_TYPES.map((type) => (
              <Pressable key={type.value} onPress={() => setNewExerciseType(type.value)}
                style={[styles.typeChip, newExerciseType === type.value && { borderColor: type.color, backgroundColor: type.dimColor }]}>
                <Text style={[styles.typeChipText, newExerciseType === type.value && { color: type.color }]}>{type.label}</Text>
              </Pressable>
            ))}
          </View>
          <Button title="Añadir ejercicio" onPress={handleAddExercise} />
        </View>

        <View style={styles.card}>
          <SectionHeader icon="calendar-edit" title="Días de entrenamiento" section="days" info={info} setInfo={setInfo} />
          {info === 'days' ? <InfoText>Crea plantillas de Musculación, Cardio o Calistenia y combina ejercicios de cualquier tipo.</InfoText> : null}
          <Button title="Nuevo día" variant="surface" left={<MaterialCommunityIcons name="plus" size={18} color={GymTheme.text} />}
            onPress={() => router.push('/day-form')} />
        </View>

        <View style={styles.card}>
          <SectionHeader icon="database-outline" title="Copias de seguridad" section="backup" info={info} setInfo={setInfo} />
          {info === 'backup' ? <InfoText>Exporta o restaura todos los datos en un archivo JSON. Las notas de desarrollo no se incluyen.</InfoText> : null}
          <View style={styles.actionRow}>
            <Button title="Exportar" variant="surface" loading={busy} style={{ flex: 1 }} onPress={handleExport} />
            <Button title="Importar" variant="surface" loading={busy} style={{ flex: 1 }} onPress={handleImport} />
          </View>
        </View>

        <View style={styles.card}>
          <SectionHeader icon="notebook-edit-outline" title="Notas de desarrollo" section="notes" info={info} setInfo={setInfo} />
          {info === 'notes' ? <InfoText>Espacio local para ideas y pendientes. No se incluye en las copias de seguridad.</InfoText> : null}
          <TextInput style={styles.textarea} placeholder="Ideas y pendientes" placeholderTextColor={GymTheme.textFaint}
            value={note} onChangeText={setNote} onBlur={() => void saveDevNote(db, note)}
            onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150)} multiline textAlignVertical="top" />
          <View style={styles.actionRow}>
            <CopyButton onPress={handleCopyNote} style={{ flex: 1 }} />
            <SaveButton title="Guardar" onPress={() => saveDevNote(db, note)} style={{ flex: 1 }} />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}><MaterialCommunityIcons name="information-outline" size={20} color={GymTheme.primary} /></View>
            <Text style={styles.cardTitle}>Información</Text>
          </View>
          <Button title="Historial de versiones" variant="surface" left={<MaterialCommunityIcons name="history" size={18} color={GymTheme.text} />}
            onPress={() => router.push('/patch-notes')} />
        </View>

        <View style={styles.about}>
          <View style={styles.aboutRow}><Ionicons name="barbell" size={16} color={GymTheme.textFaint} />
            <Text style={styles.version}>GymApp v{Constants.expoConfig?.version ?? CURRENT_VERSION}</Text></View>
          <Text style={styles.author}>Creado por jnm2231</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function SectionHeader({ icon, title, section, info, setInfo }: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; section: Exclude<InfoSection, null>;
  info: InfoSection; setInfo: (section: InfoSection) => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}><MaterialCommunityIcons name={icon} size={20} color={GymTheme.primary} /></View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Pressable accessibilityLabel={`Información sobre ${title}`} hitSlop={8} onPress={() => setInfo(info === section ? null : section)}>
        <MaterialCommunityIcons name={info === section ? 'close-circle' : 'information-outline'} size={21} color={GymTheme.textMuted} />
      </Pressable>
    </View>
  );
}

function InfoText({ children }: { children: string }) { return <Text style={styles.infoText}>{children}</Text>; }

function SettingRow({ icon, title, subtitle, value, onChange }: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; subtitle: string; value: boolean;
  onChange: (value: boolean) => void | Promise<void>;
}) {
  return (
    <View style={styles.settingRow}>
      <MaterialCommunityIcons name={icon} size={21} color={GymTheme.textMuted} />
      <View style={{ flex: 1 }}><Text style={styles.settingTitle}>{title}</Text><Text style={styles.settingSub}>{subtitle}</Text></View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: GymTheme.primary, false: GymTheme.disabled }} thumbColor={GymTheme.white} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: GymTheme.background },
  content: { padding: Spacing.lg, gap: Spacing.md },
  card: { backgroundColor: GymTheme.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: GymTheme.border, padding: Spacing.lg, gap: Spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: GymTheme.primaryDim, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: GymTheme.text, fontSize: 17, fontWeight: '800', flex: 1 },
  infoText: { color: GymTheme.textMuted, fontSize: 12, lineHeight: 17, backgroundColor: GymTheme.surfaceAlt, borderRadius: Radius.md, padding: Spacing.md },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 4 },
  settingTitle: { color: GymTheme.text, fontSize: 14, fontWeight: '700' },
  settingSub: { color: GymTheme.textFaint, fontSize: 11, marginTop: 2 },
  reminderSchedule: { backgroundColor: GymTheme.surfaceAlt, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm },
  scheduleLabel: { color: GymTheme.textMuted, fontSize: 12, fontWeight: '700' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 },
  dayChip: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: GymTheme.border,
    backgroundColor: GymTheme.surface, alignItems: 'center', justifyContent: 'center' },
  dayChipActive: { backgroundColor: GymTheme.primary, borderColor: GymTheme.primary },
  dayChipText: { color: GymTheme.textMuted, fontSize: 12, fontWeight: '800' },
  dayChipTextActive: { color: '#160B00' },
  hourRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hourControl: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  hourButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: GymTheme.surface,
    borderWidth: 1, borderColor: GymTheme.border, alignItems: 'center', justifyContent: 'center' },
  hourText: { color: GymTheme.text, fontSize: 15, fontWeight: '800', minWidth: 48, textAlign: 'center' },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 5 },
  exerciseName: { color: GymTheme.text, fontSize: 14, flex: 1, fontWeight: '600' },
  tag: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', backgroundColor: GymTheme.surfaceAlt, paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.sm },
  divider: { height: 1, backgroundColor: GymTheme.border },
  expandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  expandText: { color: GymTheme.primary, fontSize: 13, fontWeight: '700' },
  input: { width: '100%', backgroundColor: GymTheme.inputBg, borderWidth: 1, borderColor: GymTheme.border, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 11, color: GymTheme.text, fontSize: 15 },
  typeSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeChip: { borderWidth: 1, borderColor: GymTheme.border, borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: 7, backgroundColor: GymTheme.surfaceAlt },
  typeChipText: { color: GymTheme.textMuted, fontSize: 12, fontWeight: '700' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  textarea: { backgroundColor: GymTheme.inputBg, borderWidth: 1, borderColor: GymTheme.border, borderRadius: Radius.md, padding: Spacing.md, color: GymTheme.text, fontSize: 14, minHeight: 110 },
  about: { alignItems: 'center', gap: 4, marginTop: Spacing.sm },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  version: { color: GymTheme.textFaint, fontSize: 12 },
  author: { color: GymTheme.textMuted, fontSize: 13, fontWeight: '700' },
});
