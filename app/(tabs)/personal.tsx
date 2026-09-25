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
import { getBodyProfile, recordBodyWeight, saveBodyProfile } from '@/db/body';
import { getTrainingActivity, getWeightEvolution } from '@/db/personal';
import type { TrainingActivityDay } from '@/db/personal';
import type { BodyMeasurement } from '@/db/types';

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
  const [weightFormOpen, setWeightFormOpen] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);

  const load = useCallback(async () => {
    const nextWeights = await getWeightEvolution(db);
    const nextActivity = await getTrainingActivity(db, activityRangeStart());
    const profile = await getBodyProfile(db);
    setWeights(nextWeights);
    setActivity(nextActivity);
    setWeight(profile.weight ? String(profile.weight) : '');
    setHeight(profile.heightCm == null ? '' : String(profile.heightCm));
    setBirthDate(profile.birthDate ? isoToDisplayDate(profile.birthDate) : '');
    setReminderEnabled(profile.weeklyWeightReminder);
  }, [db]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const registerWeight = async () => {
    const value = Number(weight.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      showAlert('Peso no válido', 'Introduce un peso mayor que cero.');
      return;
    }
    await recordBodyWeight(db, value);
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

  const points = weights.map((entry) => ({ value: entry.weight, label: shortDate(entry.recorded_at) }));
  const latest = weights.at(-1);
  const change = latest && weights.length > 1 ? latest.weight - weights[0].weight : null;
  const birthDateIso = displayDateToIso(birthDate);

  return (
    <Screen>
      <ScreenTitle>Personal</ScreenTitle>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.iconBox}><MaterialCommunityIcons name="chart-line" size={21} color={GymTheme.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Evolución del peso</Text>
              <Text style={styles.summaryText}>
                {latest ? `${latest.weight} kg${change == null ? '' : ` · ${signed(change)} kg desde el inicio`}` : 'Sin registros todavía'}
              </Text>
            </View>
            <View style={[styles.bell, reminderEnabled && styles.bellActive]}>
              <MaterialCommunityIcons name={reminderEnabled ? 'bell' : 'bell-outline'} size={20}
                color={reminderEnabled ? '#160B00' : GymTheme.textFaint} />
            </View>
          </View>

          {weights.length > 0 ? (
            <LineChart points={points} width={Math.max(240, width - Spacing.lg * 4)}
              color={GymTheme.primary} valueFormatter={(value) => value.toFixed(1)} />
          ) : <EmptyState title="Sin registros de peso" subtitle="Pulsa Registrar para añadir el primero." />}

          <View style={styles.divider} />
          <View style={styles.profileHeader}>
            <View style={styles.profileValues}>
              <DataValue label="Edad" value={birthDateIso ? `${ageFromIso(birthDateIso)} años` : 'Sin registrar'} />
              <DataValue label="Altura" value={height ? `${height} cm` : 'Sin registrar'} />
            </View>
            <Pressable style={styles.editButton} onPress={() => setProfileEditing((editing) => !editing)}>
              <MaterialCommunityIcons name="pencil-outline" size={17} color={GymTheme.textMuted} />
            </Pressable>
          </View>

          <View style={styles.weightRow}>
            <View>
              <Text style={styles.dataLabel}>ÚLTIMO PESO REGISTRADO</Text>
              <Text style={styles.weightValue}>{latest ? `${latest.weight} kg` : 'Sin registrar'}</Text>
            </View>
            <Pressable style={[styles.registerButton, reminderEnabled && styles.registerButtonActive]}
              onPress={() => setWeightFormOpen((open) => !open)}>
              <Text style={[styles.registerButtonText, reminderEnabled && styles.registerButtonTextActive]}>Registrar</Text>
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
              <View style={styles.profileEditRow}>
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
              <View style={styles.formActions}>
                <Pressable onPress={() => { setProfileEditing(false); void load(); }}><Text style={styles.cancelText}>Cancelar</Text></Pressable>
                <SaveButton title="Guardar datos" onPress={saveProfile} />
              </View>
            </View>
          ) : null}
        </Card>

        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconBox, { backgroundColor: GymTheme.activeDim }]}>
              <MaterialCommunityIcons name="calendar-check" size={21} color={GymTheme.active} />
            </View>
            <Text style={styles.cardTitle}>Frecuencia de entrenamiento</Text>
          </View>
          <ActivityHeatmap activity={activity} />
        </Card>
      </ScrollView>
    </Screen>
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
  iconBox: { width: 42, height: 42, borderRadius: 13, backgroundColor: GymTheme.primaryDim, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: GymTheme.text, fontSize: 18, fontWeight: '800' },
  summaryText: { color: GymTheme.textMuted, fontSize: 12, marginTop: 2 },
  bell: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: GymTheme.border,
    backgroundColor: GymTheme.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  bellActive: { backgroundColor: GymTheme.primary, borderColor: GymTheme.primary },
  divider: { height: 1, backgroundColor: GymTheme.border },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  profileValues: { flex: 1, flexDirection: 'row', gap: Spacing.sm },
  dataValue: { flex: 1, backgroundColor: GymTheme.surfaceAlt, borderRadius: Radius.md, padding: Spacing.md, gap: 3 },
  dataLabel: { color: GymTheme.textFaint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  dataText: { color: GymTheme.text, fontSize: 14, fontWeight: '800' },
  editButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: GymTheme.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: GymTheme.surfaceAlt },
  weightRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: GymTheme.surfaceAlt, borderRadius: Radius.md, padding: Spacing.md },
  weightValue: { color: GymTheme.text, fontSize: 20, fontWeight: '900', marginTop: 2 },
  registerButton: { backgroundColor: GymTheme.disabled, borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: 10 },
  registerButtonActive: { backgroundColor: GymTheme.primary },
  registerButtonText: { color: GymTheme.text, fontSize: 13, fontWeight: '800' },
  registerButtonTextActive: { color: '#160B00' },
  formPanel: { backgroundColor: GymTheme.surfaceAlt, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.md },
  fieldLabel: { color: GymTheme.textMuted, fontSize: 12, fontWeight: '700' },
  inlineField: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  input: { backgroundColor: GymTheme.inputBg, borderWidth: 1, borderColor: GymTheme.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 11, color: GymTheme.text, fontSize: 15 },
  unit: { color: GymTheme.textMuted, fontSize: 14, fontWeight: '700' },
  profileEditRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.md },
  formActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cancelText: { color: GymTheme.textMuted, fontSize: 13, fontWeight: '700' },
});
