import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import {
  finishExercise,
  finishHoldSet,
  reopenExercise,
  startHoldSet,
  updateSetDuration,
} from '@/db/sessions';
import type { SessionExerciseWithSets } from '@/db/types';
import { formatClock, formatHM, formatRest } from '@/lib/format';
import { cancelWorkoutReminder, scheduleWorkoutReminder } from '@/lib/workout-notifications';

interface Props {
  block: SessionExerciseWithSets;
  isCurrent: boolean;
  sessionId: number;
  canFocus: boolean;
  onFocus: () => void;
  onPostpone: () => void;
  onChanged: () => Promise<void>;
  onOpenHistory: (exerciseId: number) => void;
}

export function HoldExerciseBlock({
  block,
  isCurrent,
  sessionId,
  canFocus,
  onFocus,
  onPostpone,
  onChanged,
  onOpenHistory,
}: Props) {
  const db = useSQLiteContext();
  const done = block.status === 'done';
  const running = block.timer_started_ts != null;
  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState(false);
  const [editedDurations, setEditedDurations] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!isCurrent || done || (!running && block.sets.length === 0)) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [block.sets.length, done, isCurrent, running]);

  const startSet = async () => {
    await startHoldSet(db, block.id);
    await cancelWorkoutReminder(sessionId);
    await onChanged();
  };

  const stopSet = async () => {
    await finishHoldSet(db, block.id);
    await scheduleWorkoutReminder(db, sessionId);
    await onChanged();
  };

  const finish = async () => {
    await finishExercise(db, block.id);
    await onChanged();
  };

  const continueExercise = async () => {
    await reopenExercise(db, block.id);
    setEditing(false);
    onFocus();
    await onChanged();
  };

  const toggleEditing = async () => {
    if (!editing) {
      setEditedDurations(
        Object.fromEntries(block.sets.map((set) => [set.id, String(set.duration_seconds ?? 0)]))
      );
      setEditing(true);
      return;
    }

    for (const set of block.sets) {
      const seconds = Number.parseInt(
        editedDurations[set.id] ?? String(set.duration_seconds ?? 0),
        10
      );
      if (Number.isInteger(seconds) && seconds > 0 && seconds !== set.duration_seconds) {
        await updateSetDuration(db, set.id, seconds);
      }
    }
    setEditing(false);
    await onChanged();
  };

  const elapsedSeconds = running
    ? Math.max(0, Math.floor((now - block.timer_started_ts!) / 1000))
    : 0;
  const summary = block.sets.map((set) => formatClock(set.duration_seconds ?? 0)).join(' · ');

  if (!isCurrent && !done) {
    return (
      <View style={[styles.card, !canFocus && styles.waiting]}>
        <View style={styles.header}>
          <MaterialCommunityIcons name="timer-outline" size={22} color={GymTheme.active} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{block.exercise_name}</Text>
            <Text style={styles.sub}>{summary || 'Aguante · Sin empezar'}</Text>
          </View>
          {canFocus ? (
            <Pressable style={styles.primaryButton} onPress={onFocus}>
              <MaterialCommunityIcons name="play" size={16} color="#06210F" />
              <Text style={styles.primaryText}>{block.sets.length > 0 ? 'Seguir' : 'Empezar'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, isCurrent && !done && styles.current]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="timer-outline" size={23} color={GymTheme.active} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{block.exercise_name}</Text>
          <Text style={styles.sub}>
            Aguante
            {block.start_ts ? ` · Inicio ${formatHM(block.start_ts)}` : ''}
          </Text>
        </View>
      </View>

      {done && !editing ? (
        <View style={styles.summary}>
          <MaterialCommunityIcons name="check-circle" size={18} color={GymTheme.active} />
          <Text style={styles.summaryText}>{summary}</Text>
        </View>
      ) : (
        <View style={styles.sets}>
          {block.sets.map((set) => (
            <View key={set.id} style={styles.setRow}>
              <Text style={styles.setIndex}>Serie {set.set_index}</Text>
              {editing ? (
                <View style={styles.editDuration}>
                  <TextInput
                    style={styles.durationInput}
                    keyboardType="number-pad"
                    value={editedDurations[set.id] ?? String(set.duration_seconds ?? 0)}
                    onChangeText={(value) =>
                      setEditedDurations((current) => ({ ...current, [set.id]: value }))
                    }
                  />
                  <Text style={styles.unit}>seg</Text>
                </View>
              ) : (
                <Text style={styles.duration}>{formatClock(set.duration_seconds ?? 0)}</Text>
              )}
              <Text style={styles.rest}>
                {set.rest_seconds == null ? 'inicio' : `descanso ${formatRest(set.rest_seconds)}`}
              </Text>
            </View>
          ))}

          {isCurrent && !done ? (
            <View style={[styles.setRow, styles.nextSet]}>
              <Text style={styles.setIndex}>Serie {block.sets.length + 1}</Text>
              {running ? (
                <>
                  <Text style={styles.liveClock}>{formatClock(elapsedSeconds)}</Text>
                  <Pressable style={styles.stopButton} onPress={stopSet}>
                    <MaterialCommunityIcons name="stop" size={16} color={GymTheme.white} />
                    <Text style={styles.stopText}>Terminar</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable style={styles.primaryButton} onPress={startSet}>
                  <MaterialCommunityIcons name="play" size={16} color="#06210F" />
                  <Text style={styles.primaryText}>Empezar</Text>
                </Pressable>
              )}
            </View>
          ) : null}

          {isCurrent && !done && block.sets.length > 0 && !running ? (
            <Text style={styles.restLive}>
              Descanso actual ·{' '}
              {formatClock(
                Math.floor((now - block.sets[block.sets.length - 1].ts) / 1000)
              )}
            </Text>
          ) : null}
        </View>
      )}

      <View style={styles.actions}>
        {block.exercise_id != null ? (
          <Pressable style={styles.iconButton} onPress={() => onOpenHistory(block.exercise_id!)}>
            <MaterialCommunityIcons name="chart-line" size={20} color={GymTheme.textMuted} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }} />
        {done ? (
          <>
            <Pressable style={styles.editButton} onPress={toggleEditing}>
              <MaterialCommunityIcons
                name={editing ? 'check' : 'pencil'}
                size={16}
                color={GymTheme.active}
              />
              <Text style={styles.editText}>{editing ? 'Listo' : 'Editar'}</Text>
            </Pressable>
            {editing ? (
              <Pressable style={styles.primaryButton} onPress={continueExercise}>
                <MaterialCommunityIcons name="play" size={16} color="#06210F" />
                <Text style={styles.primaryText}>Seguir ejercicio</Text>
              </Pressable>
            ) : null}
          </>
        ) : isCurrent ? (
          <>
            {!running ? (
              <Pressable style={styles.secondaryButton} onPress={onPostpone}>
                <Text style={styles.secondaryText}>Posponer</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={[
                styles.finishButton,
                (block.sets.length === 0 || running) && styles.disabled,
              ]}
              disabled={block.sets.length === 0 || running}
              onPress={finish}>
              <MaterialCommunityIcons name="flag-checkered" size={16} color="#0C0C0E" />
              <Text style={styles.primaryText}>Terminado</Text>
            </Pressable>
          </>
        ) : null}
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
  current: { borderColor: GymTheme.active, borderWidth: 2 },
  waiting: { opacity: 0.5 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  name: { color: GymTheme.text, fontSize: 18, fontWeight: '800' },
  sub: { color: GymTheme.textMuted, fontSize: 12, marginTop: 2 },
  sets: { gap: Spacing.sm },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  nextSet: { borderTopWidth: 1, borderTopColor: GymTheme.border, paddingTop: Spacing.md },
  setIndex: { color: GymTheme.textMuted, fontSize: 13, fontWeight: '700', width: 58 },
  duration: { color: GymTheme.active, fontSize: 17, fontWeight: '900', width: 64 },
  rest: { color: GymTheme.textFaint, fontSize: 11, flex: 1, textAlign: 'right' },
  liveClock: {
    color: GymTheme.active,
    fontSize: 25,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    flex: 1,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: GymTheme.active,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
  },
  primaryText: { color: '#06210F', fontSize: 13, fontWeight: '800' },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: GymTheme.danger,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
  },
  stopText: { color: GymTheme.white, fontSize: 13, fontWeight: '800' },
  restLive: { color: GymTheme.textMuted, fontSize: 12, textAlign: 'center' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  summaryText: { color: GymTheme.text, fontSize: 17, fontWeight: '800' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: GymTheme.border,
    paddingTop: Spacing.md,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
    backgroundColor: GymTheme.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 7 },
  editText: { color: GymTheme.active, fontSize: 13, fontWeight: '700' },
  secondaryButton: { backgroundColor: GymTheme.surfaceElevated, borderRadius: Radius.md, padding: 10 },
  secondaryText: { color: GymTheme.text, fontWeight: '700', fontSize: 13 },
  finishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: GymTheme.active,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
  },
  disabled: { opacity: 0.4 },
  editDuration: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  durationInput: {
    backgroundColor: GymTheme.inputBg,
    borderWidth: 1,
    borderColor: GymTheme.active,
    borderRadius: Radius.sm,
    color: GymTheme.text,
    paddingHorizontal: 8,
    paddingVertical: 5,
    width: 62,
    textAlign: 'center',
  },
  unit: { color: GymTheme.textMuted, fontSize: 11 },
});
