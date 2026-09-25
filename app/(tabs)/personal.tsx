import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { ActivityHeatmap, activityRangeStart } from '@/components/gym/activity-heatmap';
import { useAlert } from '@/components/gym/alert';
import { LineChart } from '@/components/gym/line-chart';
import { SaveButton } from '@/components/gym/save-button';
import { Card, EmptyState, Screen, ScreenTitle } from '@/components/gym/ui';
import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import { getBodyProfile, recordBodyWeight, saveBodyProfile, setWeightReminderDay } from '@/db/body';
import { getTrainingActivity, getWeightEvolution } from '@/db/personal';
import type { TrainingActivityDay } from '@/db/personal';
import type { BodyMeasurement } from '@/db/types';
import { scheduleWeeklyWeightReminder } from '@/lib/body-notifications';

const WEEKDAYS = [
  { value: 1, label: 'L' }, { value: 2, label: 'M' }, { value: 3, label: 'X' },
  { value: 4, label: 'J' }, { value: 5, label: 'V' }, { value: 6, label: 'S' },
  { value: 0, label: 'D' },
];

export default function PersonalScreen() {
  const db = useSQLiteContext();
  const showAlert = useAlert();
  const { width } = useWindowDimensions();
  const [weights, setWeights] = useState<BodyMeasurement[]>([]);
  const [activity, setActivity] = useState<TrainingActivityDay[]>([]);
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [weighInDay, setWeighInDay] = useState(1);
  const [weightFormOpen, setWeightFormOpen] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);

  const load = useCallback(async () => {
    const [nextWeights, nextActivity, profile] = await Promise.all([
      getWeightEvolution(db), getTrainingActivity(db, activityRangeStart()), getBodyProfile(db),
    ]);
    setWeights(nextWeights);
    setActivity(nextActivity);
    setWeight(profile.weight ? String(profile.weight) : '');
    setHeight(profile.heightCm == null ? '' : String(profile.heightCm));
    setBirthDate(profile.birthDate ? isoToDisplayDate(profile.birthDate) : '');
    setReminderEnabled(profile.weeklyWeightReminder);
    setWeighInDay(profile.weightReminderDay);
  }, [db]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const registerWeight = async () => {
    const value = Number(weight.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      showAlert('Peso no válido', 'Introduce un peso mayor que cero.');
      return;
    }
    await recordBodyWeight(db, value);
    if (reminderEnabled) await scheduleWeeklyWeightReminder(weighInDay);
    setWeightFormOpen(false);
    await load();
  };

  const saveProfile = async () => {
    const heightCm = Number(height.replace(',', '.'));
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
    setProfileEditing(false);
    await load();
  };

  const selectWeighInDay = async (day: number) => {
    setWeighInDay(day);
    await setWeightReminderDay(db, day);
    if (reminderEnabled) await scheduleWeeklyWeightReminder(day);
  };

  const points = weights.map((entry) => ({ value: entry.weight, label: shortDate(entry.recorded_at) }));
  const latest = weights.at(-1);
  const change = latest && weights.length > 1 ? latest.weight - weights[0].weight : null;
  const birthDateIso = displayDateToIso(birthDate);

  return (
    <Screen>
      <ScreenTitle>Personal</ScreenTitle>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <SectionTitle icon="scale-bathroom" title="Registro corporal" />
          <View style={styles.dataRow}>
            <DataValue label="Peso" value={latest ? `${latest.weight} kg` : 'Sin registrar'} />
            <DataValue label="Altura" value={height ? `${height} cm` : 'Sin registrar'} />
            <DataValue label="Edad" value={birthDateIso ? `${ageFromIso(birthDateIso)} años` : 'Sin registrar'} />
          </View>

          <View style={styles.actionRow}>
            <Pressable style={styles.secondaryAction} onPress={() => setWeightFormOpen((open) => !open)}>
              <MaterialCommunityIcons name="scale-bathroom" size={17} color={GymTheme.primary} />
              <Text style={styles.secondaryActionText}>Registrar peso</Text>
            </Pressable>
            <Pressable style={styles.secondaryAction} onPress={() => setProfileEditing((editing) => !editing)}>
              <MaterialCommunityIcons name="pencil-outline" size={17} color={GymTheme.primary} />
              <Text style={styles.secondaryActionText}>{height || birthDate ? 'Editar datos' : 'Registrar datos'}</Text>
            </Pressable>
          </View>

          {weightFormOpen ? (
            <View style={styles.formPanel}>
              <Text style={styles.fieldLabel}>Nuevo peso</Text>
              <View style={styles.inlineField}>
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="0" placeholderTextColor={GymTheme.textFaint}
                  keyboardType="decimal-pad" value={weight} onChangeText={setWeight} onSubmitEditing={registerWeight} autoFocus />
                <Text style={styles.unit}>kg</Text>
                <SaveButton title="Guardar" onPress={registerWeight} />
              </View>
            </View>
          ) : null}

          {profileEditing ? (
            <View style={styles.formPanel}>
              <View style={styles.profileRow}>
                <View style={{ flex: 0.8 }}>
                  <Text style={styles.fieldLabel}>Altura</Text>
                  <View style={styles.inlineField}>
                    <TextInput style={[styles.input, { flex: 1, minWidth: 0 }]} placeholder="175"
                      placeholderTextColor={GymTheme.textFaint} keyboardType="decimal-pad" value={height} onChangeText={setHeight} />
                    <Text style={styles.unit}>cm</Text>
                  </View>
                </View>
                <View style={{ flex: 1.25 }}>
                  <Text style={styles.fieldLabel}>Fecha de nacimiento</Text>
                  <TextInput style={styles.input} placeholder="DD/MM/AAAA" placeholderTextColor={GymTheme.textFaint}
                    keyboardType="number-pad" value={birthDate}
                    onChangeText={(value) => setBirthDate(formatBirthDateInput(value))} maxLength={10} />
                </View>
              </View>
              <View style={styles.profileFooter}>
                <Pressable onPress={() => { setProfileEditing(false); void load(); }}><Text style={styles.cancelText}>Cancelar</Text></Pressable>
                <SaveButton title="Guardar datos" onPress={saveProfile} />
              </View>
            </View>
          ) : null}

          <View style={styles.divider} />
          <Text style={styles.fieldLabel}>Día habitual de pesaje</Text>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((day) => (
              <Pressable key={day.value} accessibilityRole="button"
                accessibilityState={{ selected: weighInDay === day.value }}
                style={[styles.dayChip, weighInDay === day.value && styles.dayChipActive]}
                onPress={() => void selectWeighInDay(day.value)}>
                <Text style={[styles.dayChipText, weighInDay === day.value && styles.dayChipTextActive]}>{day.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.statusText}>
            {reminderEnabled ? 'Recordatorio activo a las 09:00' : 'Activa el recordatorio desde Ajustes'}
          </Text>
        </Card>

        <Card style={styles.card}>
          <SectionTitle icon="chart-line" title="Evolución del peso" />
          <Text style={styles.summaryText}>
            {latest ? `${latest.weight} kg${change == null ? '' : ` · ${signed(change)} kg desde el primer registro`}` : 'Sin registros todavía'}
          </Text>
          {weights.length > 0 ? (
            <LineChart points={points} width={Math.max(240, width - Spacing.lg * 4)}
              color={GymTheme.primary} valueFormatter={(value) => value.toFixed(1)} />
          ) : <EmptyState title="Sin registros de peso" subtitle="Registra tu primer peso arriba." />}
        </Card>

        <Card style={styles.card}>
          <SectionTitle icon="calendar-check" title="Frecuencia de entrenamiento" active />
          <ActivityHeatmap activity={activity} />
        </Card>
      </ScrollView>
    </Screen>
  );
}

function SectionTitle({ icon, title, active = false }: {
  icon: 'scale-bathroom' | 'chart-line' | 'calendar-check'; title: string; active?: boolean;
}) {
  const color = active ? GymTheme.active : GymTheme.primary;
  return (
    <View style={styles.cardHeader}>
      <View style={[styles.iconBox, { backgroundColor: active ? GymTheme.activeDim : GymTheme.primaryDim }]}>
        <MaterialCommunityIcons name={icon} size={21} color={color} />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
    </View>
  );
}

function DataValue({ label, value }: { label: string; value: string }) {
  return <View style={styles.dataValue}><Text style={styles.dataLabel}>{label}</Text><Text style={styles.dataText}>{value}</Text></View>;
}

function shortDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function signed(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}

function displayDateToIso(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const day = Number(match[1]); const month = Number(match[2]); const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date.getTime() > Date.now()) return null;
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

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },
  card: { gap: Spacing.md, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconBox: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: GymTheme.text, fontSize: 18, fontWeight: '800' },
  fieldLabel: { color: GymTheme.textMuted, fontSize: 12, fontWeight: '700' },
  dataRow: { flexDirection: 'row', gap: Spacing.sm },
  dataValue: { flex: 1, backgroundColor: GymTheme.surfaceAlt, borderRadius: Radius.md, padding: Spacing.md, gap: 3 },
  dataLabel: { color: GymTheme.textFaint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  dataText: { color: GymTheme.text, fontSize: 14, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: Spacing.sm },
  secondaryAction: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: GymTheme.border, borderRadius: Radius.md, paddingVertical: 10, backgroundColor: GymTheme.surfaceAlt },
  secondaryActionText: { color: GymTheme.text, fontSize: 12, fontWeight: '800' },
  formPanel: { backgroundColor: GymTheme.surfaceAlt, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.md },
  inlineField: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  input: { backgroundColor: GymTheme.inputBg, borderWidth: 1, borderColor: GymTheme.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 11, color: GymTheme.text, fontSize: 15 },
  unit: { color: GymTheme.textMuted, fontSize: 14, fontWeight: '700' },
  profileRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.md },
  profileFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ageText: { color: GymTheme.primary, fontSize: 13, fontWeight: '700' },
  cancelText: { color: GymTheme.textMuted, fontSize: 13, fontWeight: '700' },
  divider: { height: 1, backgroundColor: GymTheme.border },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 },
  dayChip: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: GymTheme.border,
    backgroundColor: GymTheme.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  dayChipActive: { borderColor: GymTheme.primary, backgroundColor: GymTheme.primary },
  dayChipText: { color: GymTheme.textMuted, fontSize: 12, fontWeight: '800' },
  dayChipTextActive: { color: '#160B00' },
  statusText: { color: GymTheme.textFaint, fontSize: 11 },
  summaryText: { color: GymTheme.textMuted, fontSize: 13 },
});
