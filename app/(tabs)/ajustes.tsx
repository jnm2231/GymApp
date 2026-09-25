import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
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
  setWeeklyWeightReminder,
  setWeeklyWeightTracking,
  setWeightReminderDay,
  setWeightReminderHour,
  setWeightReminderMinute,
} from '@/db/body';
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
type InfoSection = 'body' | 'notifications' | 'catalog' | 'days' | 'backup' | 'notes' | null;

export default function AjustesScreen() {
  const db = useSQLiteContext();
  const showAlert = useAlert();
  const insets = useSafeAreaInsets();
  const { refresh } = useSession();
  const scrollRef = useRef<ScrollView>(null);
  const keyboardHeight = useKeyboardHeight();
  const [weeklyWeightTracking, setWeeklyWeightTrackingState] = useState(true);
  const [weeklyWeightReminder, setWeeklyWeightReminderState] = useState(false);
  const [weightReminderDay, setWeightReminderDayState] = useState(1);
  const [weightReminderHour, setWeightReminderHourState] = useState(9);
  const [weightReminderMinute, setWeightReminderMinuteState] = useState(0);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [draftReminderTime, setDraftReminderTime] = useState(() => new Date(2000, 0, 1, 9, 0));
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
    setWeeklyWeightTrackingState(profile.weeklyWeightTracking);
    setWeeklyWeightReminderState(profile.weeklyWeightTracking && profile.weeklyWeightReminder);
    setWeightReminderDayState(profile.weightReminderDay);
    setWeightReminderHourState(profile.weightReminderHour);
    setWeightReminderMinuteState(profile.weightReminderMinute);
    setTimerNotifications(timersEnabled);
    setExercises(nextExercises);
    setNote(devNote?.content ?? '');
    if (profile.weeklyWeightTracking && profile.weeklyWeightReminder) {
      void ensureWeeklyWeightReminder(
        profile.weightReminderDay,
        profile.weightReminderHour,
        profile.weightReminderMinute
      );
    }
  }, [db]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const handleWeeklyTrackingChange = async (enabled: boolean) => {
    setWeeklyWeightTrackingState(enabled);
    await setWeeklyWeightTracking(db, enabled);
    if (!enabled) {
      setWeeklyWeightReminderState(false);
      await setWeeklyWeightReminder(db, false);
      await disableWeeklyWeightReminder();
    }
  };

  const handleWeeklyReminderChange = async (enabled: boolean) => {
    setWeeklyWeightReminderState(enabled);
    await setWeeklyWeightReminder(db, enabled);
    if (enabled) {
      await scheduleWeeklyWeightReminder(
        weightReminderDay,
        weightReminderHour,
        weightReminderMinute
      );
    }
    else await disableWeeklyWeightReminder();
  };

  const changeReminderDay = async (day: number) => {
    setWeightReminderDayState(day);
    await setWeightReminderDay(db, day);
    await scheduleWeeklyWeightReminder(day, weightReminderHour, weightReminderMinute);
  };

  const changeReminderTime = async (date: Date) => {
    const hour = date.getHours();
    const minute = date.getMinutes();
    setWeightReminderHourState(hour);
    setWeightReminderMinuteState(minute);
    await setWeightReminderHour(db, hour);
    await setWeightReminderMinute(db, minute);
    await scheduleWeeklyWeightReminder(weightReminderDay, hour, minute);
  };

  const openTimePicker = () => {
    const value = new Date(2000, 0, 1, weightReminderHour, weightReminderMinute);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'time',
        is24Hour: true,
        onChange: (event, selectedDate) => {
          if (event.type === 'set' && selectedDate) void changeReminderTime(selectedDate);
        },
      });
      return;
    }
    setDraftReminderTime(value);
    setTimePickerOpen(true);
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
          <SectionHeader icon="scale-bathroom" title="Registro corporal" section="body" info={info} setInfo={setInfo} />
          {info === 'body' ? <InfoText>Controla si quieres registrar tu peso semanalmente y consultar su evolución en Personal.</InfoText> : null}
          <SettingRow icon="chart-line" title="Seguimiento de peso"
            subtitle="Gráfica y registro semanal" value={weeklyWeightTracking} onChange={handleWeeklyTrackingChange} />
        </View>

        <View style={styles.card}>
          <SectionHeader icon="bell-outline" title="Notificaciones" section="notifications" info={info} setInfo={setInfo} />
          {info === 'notifications' ? <InfoText>Configura el aviso semanal de peso y los cronómetros de descansos, Aguante y Cardio.</InfoText> : null}
          {weeklyWeightTracking ? (
            <>
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
                    <Pressable style={styles.timePickerButton} onPress={openTimePicker}>
                      <MaterialCommunityIcons name="clock-outline" size={18} color={GymTheme.primary} />
                      <Text style={styles.hourText}>
                        {formatReminderTime(weightReminderHour, weightReminderMinute)}
                      </Text>
                      <MaterialCommunityIcons name="chevron-right" size={18} color={GymTheme.textFaint} />
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </>
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

      <Modal transparent animationType="fade" visible={timePickerOpen}
        onRequestClose={() => setTimePickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setTimePickerOpen(false)}>
          <Pressable style={styles.timeModal} onPress={(event) => event.stopPropagation()}>
            <View style={styles.timeModalHeader}>
              <Text style={styles.timeModalTitle}>Hora del recordatorio</Text>
              <Text style={styles.timeModalValue}>
                {formatReminderTime(draftReminderTime.getHours(), draftReminderTime.getMinutes())}
              </Text>
            </View>
            {Platform.OS === 'ios' ? (
              <DateTimePicker value={draftReminderTime} mode="time" display="spinner" is24Hour
                onChange={(_, date) => { if (date) setDraftReminderTime(date); }} />
            ) : (
              <View style={styles.webTimeFields}>
                <TimeField label="Hora" value={draftReminderTime.getHours()} max={23}
                  onChange={(value) => setDraftReminderTime(withTimePart(draftReminderTime, 'hour', value))} />
                <Text style={styles.timeSeparator}>:</Text>
                <TimeField label="Minutos" value={draftReminderTime.getMinutes()} max={59}
                  onChange={(value) => setDraftReminderTime(withTimePart(draftReminderTime, 'minute', value))} />
              </View>
            )}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setTimePickerOpen(false)}><Text style={styles.modalCancel}>Cancelar</Text></Pressable>
              <Pressable style={styles.modalConfirm} onPress={() => {
                setTimePickerOpen(false);
                void changeReminderTime(draftReminderTime);
              }}><Text style={styles.modalConfirmText}>Guardar hora</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function TimeField({ label, value, max, onChange }: {
  label: string; value: number; max: number; onChange: (value: number) => void;
}) {
  return (
    <View style={styles.timeField}>
      <Text style={styles.scheduleLabel}>{label}</Text>
      <TextInput style={styles.timeFieldInput} value={String(value).padStart(2, '0')}
        keyboardType="number-pad" maxLength={2} selectTextOnFocus
        onChangeText={(text) => onChange(Math.min(max, Math.max(0, Number(text) || 0)))} />
    </View>
  );
}

function formatReminderTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function withTimePart(date: Date, part: 'hour' | 'minute', value: number): Date {
  const next = new Date(date);
  if (part === 'hour') next.setHours(value);
  else next.setMinutes(value);
  return next;
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
  timePickerButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: GymTheme.surface, borderWidth: 1, borderColor: GymTheme.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 9 },
  hourText: { color: GymTheme.text, fontSize: 15, fontWeight: '800', minWidth: 48, textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center',
    justifyContent: 'center', padding: Spacing.xl },
  timeModal: { width: '100%', maxWidth: 380, backgroundColor: GymTheme.surfaceElevated,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: GymTheme.border,
    padding: Spacing.lg, gap: Spacing.lg },
  timeModalHeader: { gap: 4 },
  timeModalTitle: { color: GymTheme.text, fontSize: 18, fontWeight: '800' },
  timeModalValue: { color: GymTheme.primary, fontSize: 32, fontWeight: '900',
    fontVariant: ['tabular-nums'] },
  webTimeFields: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.md },
  timeField: { gap: 6 },
  timeFieldInput: { width: 86, backgroundColor: GymTheme.inputBg, borderWidth: 1,
    borderColor: GymTheme.primary, borderRadius: Radius.md, color: GymTheme.text,
    fontSize: 28, fontWeight: '800', textAlign: 'center', paddingVertical: 10 },
  timeSeparator: { color: GymTheme.textMuted, fontSize: 30, fontWeight: '800', paddingBottom: 10 },
  modalActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    gap: Spacing.lg },
  modalCancel: { color: GymTheme.textMuted, fontSize: 14, fontWeight: '700' },
  modalConfirm: { backgroundColor: GymTheme.primary, borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg, paddingVertical: 11 },
  modalConfirmText: { color: '#160B00', fontSize: 14, fontWeight: '800' },
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
