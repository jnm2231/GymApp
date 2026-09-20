import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import {
  completeCardioExercise,
  reopenExercise,
  updateCardioEntry,
} from '@/db/sessions';
import type { SessionExerciseWithSets } from '@/db/types';
import { formatCardioSummary } from '@/lib/format';
import { scheduleWorkoutReminder } from '@/lib/workout-notifications';

interface Props {
  block: SessionExerciseWithSets;
  isCurrent: boolean;
  sessionId: number;
  canFocus: boolean;
  onFocus: () => void;
  onPostpone: () => void;
  onChanged: () => Promise<void>;
}

export function CardioExerciseBlock({
  block,
  isCurrent,
  sessionId,
  canFocus,
  onFocus,
  onPostpone,
  onChanged,
}: Props) {
  const db = useSQLiteContext();
  const done = block.status === 'done';
  const entry = block.cardio_entry;
  const [minutes, setMinutes] = useState(
    entry?.duration_seconds == null ? '' : String(Math.round(entry.duration_seconds / 60))
  );
  const [distance, setDistance] = useState(entry?.distance_km == null ? '' : String(entry.distance_km));
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [editing, setEditing] = useState(false);

  const tracksDuration = block.cardio_tracking !== 'distance';
  const tracksDistance = block.cardio_tracking !== 'duration';

  const parsedValues = () => {
    const parsedMinutes = parseFloat(minutes.replace(',', '.'));
    const parsedDistance = parseFloat(distance.replace(',', '.'));
    return {
      durationSeconds: Number.isFinite(parsedMinutes) && parsedMinutes > 0 ? Math.round(parsedMinutes * 60) : null,
      distanceKm: Number.isFinite(parsedDistance) && parsedDistance > 0 ? parsedDistance : null,
    };
  };

  const isValid = () => {
    const values = parsedValues();
    if (block.cardio_tracking === 'duration') return values.durationSeconds != null;
    if (block.cardio_tracking === 'distance') return values.distanceKm != null;
    return values.durationSeconds != null || values.distanceKm != null;
  };

  const complete = async () => {
    if (!isValid()) return;
    const values = parsedValues();
    await completeCardioExercise(
      db,
      block.id,
      values.durationSeconds,
      values.distanceKm,
      notes.trim() || null
    );
    await scheduleWorkoutReminder(db, sessionId);
    await onChanged();
  };

  const saveEdit = async () => {
    if (!isValid()) return;
    const values = parsedValues();
    await updateCardioEntry(
      db,
      block.id,
      values.durationSeconds,
      values.distanceKm,
      notes.trim() || null
    );
    setEditing(false);
    await onChanged();
  };

  const continueExercise = async () => {
    await reopenExercise(db, block.id);
    setEditing(false);
    onFocus();
    await onChanged();
  };

  if (!isCurrent && !done) {
    return (
      <View style={[styles.card, canFocus ? null : styles.waiting]}>
        <View style={styles.header}>
          <MaterialCommunityIcons name="run-fast" size={22} color={GymTheme.cardio} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{block.exercise_name}</Text>
            <Text style={styles.sub}>Cardio · {trackingLabel(block.cardio_tracking)}</Text>
          </View>
          {canFocus ? (
            <Pressable style={styles.startBtn} onPress={onFocus}>
              <MaterialCommunityIcons name="play" size={16} color="#07162B" />
              <Text style={styles.startText}>Empezar</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, isCurrent && !done && styles.current]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="run-fast" size={23} color={GymTheme.cardio} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{block.exercise_name}</Text>
          <Text style={styles.sub}>{trackingLabel(block.cardio_tracking)}</Text>
        </View>
      </View>

      {done && !editing ? (
        <View style={styles.summary}>
          <MaterialCommunityIcons name="check-circle" size={18} color={GymTheme.active} />
          <Text style={styles.summaryText}>{formatCardioSummary(entry?.duration_seconds, entry?.distance_km)}</Text>
        </View>
      ) : (
        <View style={styles.fields}>
          <View style={styles.metricRow}>
            {tracksDuration ? (
              <View style={styles.metricField}>
                <Text style={styles.label}>Tiempo</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={GymTheme.textFaint}
                    value={minutes}
                    onChangeText={setMinutes}
                  />
                  <Text style={styles.unit}>min</Text>
                </View>
              </View>
            ) : null}
            {tracksDistance ? (
              <View style={styles.metricField}>
                <Text style={styles.label}>Distancia</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={GymTheme.textFaint}
                    value={distance}
                    onChangeText={setDistance}
                  />
                  <Text style={styles.unit}>km</Text>
                </View>
              </View>
            ) : null}
          </View>
          <TextInput
            style={styles.notes}
            placeholder="Notas opcionales"
            placeholderTextColor={GymTheme.textFaint}
            value={notes}
            onChangeText={setNotes}
          />
        </View>
      )}

      <View style={styles.actions}>
        <View style={{ flex: 1 }} />
        {done ? (
          <>
            <Pressable style={styles.editBtn} onPress={editing ? saveEdit : () => setEditing(true)}>
              <MaterialCommunityIcons name={editing ? 'check' : 'pencil'} size={16} color={GymTheme.cardio} />
              <Text style={styles.editText}>{editing ? 'Listo' : 'Editar'}</Text>
            </Pressable>
            {editing ? (
              <Pressable style={styles.continueBtn} onPress={continueExercise}>
                <MaterialCommunityIcons name="play" size={16} color="#07162B" />
                <Text style={styles.startText}>Seguir ejercicio</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <>
            <Pressable style={styles.postponeBtn} onPress={onPostpone}>
              <Text style={styles.postponeText}>Posponer</Text>
            </Pressable>
            <Pressable style={[styles.finishBtn, !isValid() && styles.disabled]} onPress={complete} disabled={!isValid()}>
              <MaterialCommunityIcons name="flag-checkered" size={16} color="#07162B" />
              <Text style={styles.startText}>Terminado</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function trackingLabel(tracking: SessionExerciseWithSets['cardio_tracking']) {
  if (tracking === 'duration') return 'Registro por tiempo';
  if (tracking === 'distance') return 'Registro por distancia';
  return 'Tiempo y distancia';
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: GymTheme.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: GymTheme.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  current: { borderColor: GymTheme.cardio, borderWidth: 2 },
  waiting: { opacity: 0.5 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  name: { color: GymTheme.text, fontSize: 18, fontWeight: '800' },
  sub: { color: GymTheme.textMuted, fontSize: 12, marginTop: 2 },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: GymTheme.cardio,
    borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 8,
  },
  startText: { color: '#07162B', fontSize: 13, fontWeight: '800' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  summaryText: { color: GymTheme.text, fontSize: 17, fontWeight: '800' },
  fields: { gap: Spacing.md },
  metricRow: { flexDirection: 'row', gap: Spacing.md },
  metricField: { flex: 1, gap: 5 },
  label: { color: GymTheme.textMuted, fontSize: 12, fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  input: {
    flex: 1, backgroundColor: GymTheme.inputBg, borderWidth: 1, borderColor: GymTheme.cardio,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10,
    color: GymTheme.text, fontSize: 16,
  },
  unit: { color: GymTheme.textMuted, fontWeight: '700' },
  notes: {
    backgroundColor: GymTheme.inputBg, borderWidth: 1, borderColor: GymTheme.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, color: GymTheme.text,
  },
  actions: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderTopWidth: 1,
    borderTopColor: GymTheme.border, paddingTop: Spacing.md,
  },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 7 },
  editText: { color: GymTheme.cardio, fontSize: 13, fontWeight: '700' },
  continueBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: GymTheme.cardio,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10,
  },
  postponeBtn: { backgroundColor: GymTheme.surfaceElevated, borderRadius: Radius.md, padding: 10 },
  postponeText: { color: GymTheme.text, fontWeight: '700', fontSize: 13 },
  finishBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: GymTheme.cardio,
    borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: 10,
  },
  disabled: { opacity: 0.4 },
});
