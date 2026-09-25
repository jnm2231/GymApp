import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import {
  completeCardioExercise,
  reopenExercise,
  startCardioExercise,
  updateCardioEntry,
} from '@/db/sessions';
import type { SessionExerciseWithSets } from '@/db/types';
import { formatCardioSummary, formatClock, formatPace } from '@/lib/format';
import {
  cancelTimerNotification,
  cancelWorkoutReminder,
  scheduleWorkoutReminder,
  showTimerNotification,
} from '@/lib/workout-notifications';

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
  const running = block.timer_started_ts != null;
  const entry = block.cardio_entry;
  const [now, setNow] = useState(() => Date.now());
  const [distance, setDistance] = useState(entry?.distance_km == null ? '' : String(entry.distance_km));
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [running]);

  const elapsedSeconds = running
    ? Math.max(0, Math.floor((now - block.timer_started_ts!) / 1000))
    : 0;
  const totalSeconds = (entry?.duration_seconds ?? 0) + elapsedSeconds;

  const parsedDistance = () => {
    const value = Number.parseFloat(distance.replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? value : null;
  };

  const start = async () => {
    onFocus();
    const startedAt = await startCardioExercise(db, block.id);
    await cancelWorkoutReminder(sessionId);
    await showTimerNotification(db, sessionId, 'cardio', block.exercise_name, startedAt);
    await onChanged();
  };

  const complete = async () => {
    if (!running) return;
    await completeCardioExercise(db, block.id, parsedDistance(), notes.trim() || null);
    await cancelTimerNotification(sessionId);
    await scheduleWorkoutReminder(db, sessionId);
    await onChanged();
  };

  const saveEdit = async () => {
    await updateCardioEntry(db, block.id, parsedDistance(), notes.trim() || null);
    setEditing(false);
    await onChanged();
  };

  const continueExercise = async () => {
    await updateCardioEntry(db, block.id, parsedDistance(), notes.trim() || null);
    await reopenExercise(db, block.id);
    setEditing(false);
    onFocus();
    const startedAt = await startCardioExercise(db, block.id);
    await cancelWorkoutReminder(sessionId);
    await showTimerNotification(db, sessionId, 'cardio', block.exercise_name, startedAt);
    await onChanged();
  };

  const postpone = async () => {
    await cancelTimerNotification(sessionId);
    onPostpone();
  };

  if (!isCurrent && !done) {
    return (
      <View style={[styles.card, canFocus ? null : styles.waiting]}>
        <View style={styles.header}>
          <MaterialCommunityIcons name="run-fast" size={22} color={GymTheme.cardio} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{block.exercise_name}</Text>
            <Text style={styles.sub}>Cardio · tiempo automático</Text>
          </View>
          {canFocus ? (
            <Pressable style={styles.startBtn} onPress={start}>
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
          <Text style={styles.sub}>Tiempo automático · distancia opcional</Text>
        </View>
      </View>

      {done && !editing ? (
        <View style={styles.summary}>
          <MaterialCommunityIcons name="check-circle" size={18} color={GymTheme.active} />
          <Text style={styles.summaryText}>
            {formatCardioSummary(entry?.duration_seconds, entry?.distance_km)}
          </Text>
        </View>
      ) : (
        <View style={styles.fields}>
          <View style={styles.timerBox}>
            <MaterialCommunityIcons
              name={running || editing ? 'timer-outline' : 'timer-off-outline'}
              size={20}
              color={GymTheme.cardio}
            />
            <Text style={styles.liveClock}>{formatClock(totalSeconds)}</Text>
            <Text style={styles.timerLabel}>
              {running ? 'en curso' : editing ? 'tiempo registrado' : 'pulsa Empezar'}
            </Text>
          </View>

          <View style={styles.metricField}>
            <Text style={styles.label}>Distancia opcional</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                placeholder="Sin distancia"
                placeholderTextColor={GymTheme.textFaint}
                value={distance}
                onChangeText={setDistance}
              />
              <Text style={styles.unit}>km</Text>
            </View>
          </View>

          {parsedDistance() != null && totalSeconds > 0 ? (
            <Text style={styles.pace}>Ritmo medio · {formatPace(totalSeconds, parsedDistance())}</Text>
          ) : null}

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
        ) : running ? (
          <Pressable style={styles.finishBtn} onPress={complete}>
            <MaterialCommunityIcons name="flag-checkered" size={16} color="#07162B" />
            <Text style={styles.startText}>Terminado</Text>
          </Pressable>
        ) : (
          <>
            <Pressable style={styles.postponeBtn} onPress={postpone}>
              <Text style={styles.postponeText}>Posponer</Text>
            </Pressable>
            <Pressable style={styles.startBtn} onPress={start}>
              <MaterialCommunityIcons name="play" size={16} color="#07162B" />
              <Text style={styles.startText}>Empezar</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
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
  summaryText: { color: GymTheme.text, fontSize: 17, fontWeight: '800', flex: 1 },
  fields: { gap: Spacing.md },
  timerBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: GymTheme.cardioDim, borderRadius: Radius.md, padding: Spacing.md,
  },
  liveClock: { color: GymTheme.cardio, fontSize: 27, fontWeight: '900', fontVariant: ['tabular-nums'] },
  timerLabel: { color: GymTheme.textMuted, fontSize: 12, flex: 1 },
  metricField: { gap: 5 },
  label: { color: GymTheme.textMuted, fontSize: 12, fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  input: {
    flex: 1, backgroundColor: GymTheme.inputBg, borderWidth: 1, borderColor: GymTheme.cardio,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10,
    color: GymTheme.text, fontSize: 16,
  },
  unit: { color: GymTheme.textMuted, fontWeight: '700' },
  pace: { color: GymTheme.cardio, fontSize: 13, fontWeight: '800' },
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
});
