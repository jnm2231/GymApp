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
import type { ExerciseSet, SessionExerciseWithSets, SetSide } from '@/db/types';
import { groupSetsByIndex } from '@/lib/calc';
import { formatClock, formatCollapsedHoldSets, formatHM, formatRest } from '@/lib/format';
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
  onOpenHistory: (exerciseId: number) => void;
  onEditExercise: (exerciseId: number, sessionExerciseId: number) => void;
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
  onEditExercise,
}: Props) {
  const db = useSQLiteContext();
  const done = block.status === 'done';
  const running = block.timer_started_ts != null;
  const isUnilateral = block.is_unilateral === 1;
  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState(false);
  const [editedDurations, setEditedDurations] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!isCurrent || done || (!running && block.sets.length === 0)) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [block.sets.length, done, isCurrent, running]);

  const groups = groupSetsByIndex(block.sets);
  const lastGroup = groups[groups.length - 1];
  const inProgressGroup =
    isUnilateral && lastGroup && lastGroup.items.length === 1 ? lastGroup : null;
  const completedGroups = isUnilateral
    ? inProgressGroup
      ? groups.slice(0, -1)
      : groups
    : [];
  const currentSetIndex = inProgressGroup ? inProgressGroup.setIndex : (lastGroup?.setIndex ?? 0) + 1;

  const startSet = async (side: SetSide | null = null) => {
    const startedAt = await startHoldSet(db, block.id, side);
    await cancelWorkoutReminder(sessionId);
    const sideSuffix = side ? ` (${side === 'left' ? 'Izq' : 'Der'})` : '';
    await showTimerNotification(
      db,
      sessionId,
      'hold',
      `${block.exercise_name}${sideSuffix}`,
      startedAt
    );
    await onChanged();
  };

  const stopSet = async () => {
    const createdSet = await finishHoldSet(db, block.id);
    await cancelTimerNotification(sessionId);
    if (createdSet && (!isUnilateral || createdSet.side_order === 2)) {
      await showTimerNotification(db, sessionId, 'rest', block.exercise_name, createdSet.ts);
    }
    await scheduleWorkoutReminder(db, sessionId);
    await onChanged();
  };

  const finish = async () => {
    await finishExercise(db, block.id);
    await cancelTimerNotification(sessionId);
    await onChanged();
  };

  const continueExercise = async () => {
    await reopenExercise(db, block.id);
    setEditing(false);
    onFocus();
    const lastSet = block.sets[block.sets.length - 1];
    if (lastSet && (!isUnilateral || inProgressGroup == null)) {
      await showTimerNotification(db, sessionId, 'rest', block.exercise_name, lastSet.ts);
    }
    await onChanged();
  };

  const postpone = async () => {
    await cancelTimerNotification(sessionId);
    onPostpone();
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
  const summary =
    block.sets.length > 0 ? formatCollapsedHoldSets(block.sets, isUnilateral) : '';

  const renderSideDuration = (set: ExerciseSet) => (
    <View style={styles.uniSideRow}>
      <View style={styles.sideBadge}>
        <Text style={styles.sideBadgeText}>{set.side === 'left' ? 'Izq' : 'Der'}</Text>
      </View>
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
    </View>
  );

  const renderUnilateralGroup = (setIndex: number, items: ExerciseSet[]) => {
    const ordered = [...items].sort((a, b) => (a.side_order ?? 0) - (b.side_order ?? 0));
    const first = ordered[0];
    const second = ordered[1];
    return (
      <View key={setIndex} style={styles.uniSetBox}>
        <View style={styles.uniSetHeader}>
          <Text style={styles.uniSetTitle}>Serie {setIndex}</Text>
          {first?.rest_seconds != null ? (
            <View style={styles.restPill}>
              <Text style={styles.restPillText}>{formatRest(first.rest_seconds)}</Text>
            </View>
          ) : null}
        </View>
        {first ? renderSideDuration(first) : null}
        {second?.side_rest_seconds != null ? (
          <Text style={styles.sideRestText}>
            Entre lados · {formatRest(second.side_rest_seconds)}
          </Text>
        ) : null}
        {second ? renderSideDuration(second) : null}
      </View>
    );
  };

  if (!isCurrent && !done) {
    return (
      <View style={[styles.card, !canFocus && styles.waiting]}>
        <View style={styles.header}>
          <MaterialCommunityIcons name="timer-outline" size={22} color={GymTheme.hold} />
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{block.exercise_name}</Text>
              {isUnilateral ? <Text style={styles.uniTag}>I/D</Text> : null}
            </View>
            <Text style={styles.sub}>{summary || 'Aguante · Sin empezar'}</Text>
          </View>
          {canFocus ? (
            <Pressable style={styles.primaryButton} onPress={onFocus}>
              <MaterialCommunityIcons name="play" size={16} color="#160B24" />
              <Text style={styles.primaryText}>{block.sets.length > 0 ? 'Seguir' : 'Empezar'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  const displayedCompletedGroups = isUnilateral
    ? done && inProgressGroup
      ? groups
      : completedGroups
    : [];

  return (
    <View style={[styles.card, isCurrent && !done && styles.current]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="timer-outline" size={23} color={GymTheme.hold} />
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{block.exercise_name}</Text>
            {isUnilateral ? <Text style={styles.uniTag}>I/D</Text> : null}
          </View>
          <Text style={styles.sub}>
            Aguante
            {block.start_ts ? ` · Inicio ${formatHM(block.start_ts)}` : ''}
          </Text>
        </View>
      </View>

      {done && !editing ? (
        <View style={styles.summary}>
          <MaterialCommunityIcons name="check-circle" size={18} color={GymTheme.hold} />
          <Text style={styles.summaryText}>{summary}</Text>
        </View>
      ) : (
        <View style={styles.sets}>
          {isUnilateral ? (
            <>
              {displayedCompletedGroups.map((g) => renderUnilateralGroup(g.setIndex, g.items))}

              {isCurrent && !done && block.sets.length > 0 && !running && inProgressGroup == null ? (
                <View style={styles.restClock}>
                  <MaterialCommunityIcons name="timer-sand-complete" size={15} color={GymTheme.hold} />
                  <Text style={styles.restClockText}>
                    {formatClock(Math.floor((now - block.sets[block.sets.length - 1].ts) / 1000))}
                  </Text>
                  <Text style={styles.restClockLabel}>de descanso</Text>
                </View>
              ) : null}

              {isCurrent && !done ? (
                <View style={styles.uniSetBox}>
                  <View style={styles.uniSetHeader}>
                    <Text style={styles.uniSetTitle}>Serie {currentSetIndex}</Text>
                    {inProgressGroup?.items[0]?.rest_seconds != null ? (
                      <View style={styles.restPill}>
                        <Text style={styles.restPillText}>
                          {formatRest(inProgressGroup.items[0].rest_seconds)}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {inProgressGroup ? (
                    (() => {
                      const confirmed = inProgressGroup.items[0];
                      const remainingSide: SetSide = confirmed.side === 'left' ? 'right' : 'left';
                      const sideRestText =
                        running && block.timer_started_ts != null
                          ? `Entre lados · ${formatRest(
                              Math.max(0, Math.round((block.timer_started_ts - confirmed.ts) / 1000))
                            )}`
                          : `Entre lados · ${formatClock(
                              Math.max(0, Math.floor((now - confirmed.ts) / 1000))
                            )}`;

                      return (
                        <>
                          {renderSideDuration(confirmed)}
                          <Text style={styles.sideRestText}>{sideRestText}</Text>
                          <View style={styles.uniSideRow}>
                            <View style={styles.sideBadge}>
                              <Text style={styles.sideBadgeText}>
                                {remainingSide === 'left' ? 'Izq' : 'Der'}
                              </Text>
                            </View>
                            {running ? (
                              <>
                                <Text style={styles.liveClock}>{formatClock(elapsedSeconds)}</Text>
                                <Pressable style={styles.stopButton} onPress={stopSet}>
                                  <MaterialCommunityIcons name="stop" size={16} color={GymTheme.white} />
                                  <Text style={styles.stopText}>Terminar</Text>
                                </Pressable>
                              </>
                            ) : (
                              <Pressable
                                style={styles.primaryButton}
                                onPress={() => startSet(remainingSide)}>
                                <MaterialCommunityIcons name="play" size={16} color="#160B24" />
                                <Text style={styles.primaryText}>Empezar</Text>
                              </Pressable>
                            )}
                          </View>
                        </>
                      );
                    })()
                  ) : (
                    (['left', 'right'] as SetSide[]).map((side) => {
                      const isThisSideRunning = running && (block.timer_side ?? 'left') === side;
                      return (
                        <View key={side} style={styles.uniSideRow}>
                          <View style={styles.sideBadge}>
                            <Text style={styles.sideBadgeText}>
                              {side === 'left' ? 'Izq' : 'Der'}
                            </Text>
                          </View>
                          {isThisSideRunning ? (
                            <>
                              <Text style={styles.liveClock}>{formatClock(elapsedSeconds)}</Text>
                              <Pressable style={styles.stopButton} onPress={stopSet}>
                                <MaterialCommunityIcons name="stop" size={16} color={GymTheme.white} />
                                <Text style={styles.stopText}>Terminar</Text>
                              </Pressable>
                            </>
                          ) : (
                            <Pressable
                              style={[styles.primaryButton, running && styles.disabled]}
                              disabled={running}
                              onPress={() => startSet(side)}>
                              <MaterialCommunityIcons name="play" size={16} color="#160B24" />
                              <Text style={styles.primaryText}>Empezar</Text>
                            </Pressable>
                          )}
                        </View>
                      );
                    })
                  )}
                </View>
              ) : null}
            </>
          ) : (
            <>
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
                  {set.rest_seconds == null ? (
                    <Text style={styles.restEmpty}>inicio</Text>
                  ) : (
                    <View style={styles.restPill}>
                      <Text style={styles.restPillText}>{formatRest(set.rest_seconds)}</Text>
                    </View>
                  )}
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
                    <Pressable style={styles.primaryButton} onPress={() => startSet(null)}>
                      <MaterialCommunityIcons name="play" size={16} color="#160B24" />
                      <Text style={styles.primaryText}>Empezar</Text>
                    </Pressable>
                  )}
                </View>
              ) : null}

              {isCurrent && !done && block.sets.length > 0 && !running ? (
                <View style={styles.restClock}>
                  <MaterialCommunityIcons name="timer-sand-complete" size={15} color={GymTheme.hold} />
                  <Text style={styles.restClockText}>
                    {formatClock(Math.floor((now - block.sets[block.sets.length - 1].ts) / 1000))}
                  </Text>
                  <Text style={styles.restClockLabel}>de descanso</Text>
                </View>
              ) : null}
            </>
          )}
        </View>
      )}

      <View style={styles.actions}>
        {block.exercise_id != null ? (
          <>
            <Pressable style={styles.iconButton} onPress={() => onOpenHistory(block.exercise_id!)}>
              <MaterialCommunityIcons name="chart-line" size={20} color={GymTheme.textMuted} />
            </Pressable>
            <Pressable
              style={styles.iconButton}
              onPress={() => onEditExercise(block.exercise_id!, block.id)}>
              <MaterialCommunityIcons name="tune" size={20} color={GymTheme.textMuted} />
            </Pressable>
          </>
        ) : null}
        <View style={{ flex: 1 }} />
        {done ? (
          <>
            <Pressable style={styles.editButton} onPress={toggleEditing}>
              <MaterialCommunityIcons
                name={editing ? 'check' : 'pencil'}
                size={16}
                color={GymTheme.hold}
              />
              <Text style={styles.editText}>{editing ? 'Listo' : 'Editar'}</Text>
            </Pressable>
            {editing ? (
              <Pressable style={styles.primaryButton} onPress={continueExercise}>
                <MaterialCommunityIcons name="play" size={16} color="#160B24" />
                <Text style={styles.primaryText}>Seguir ejercicio</Text>
              </Pressable>
            ) : null}
          </>
        ) : isCurrent ? (
          <>
            {!running ? (
              <Pressable style={styles.secondaryButton} onPress={postpone}>
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
  current: { borderColor: GymTheme.hold, borderWidth: 2 },
  waiting: { opacity: 0.5 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  name: { color: GymTheme.text, fontSize: 18, fontWeight: '800' },
  uniTag: {
    color: GymTheme.hold,
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: GymTheme.holdDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  sub: { color: GymTheme.textMuted, fontSize: 12, marginTop: 2 },
  sets: { gap: Spacing.sm },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  uniSetBox: {
    backgroundColor: GymTheme.surfaceAlt,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: GymTheme.border,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  uniSetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  uniSetTitle: { color: GymTheme.textMuted, fontSize: 13, fontWeight: '700' },
  uniSideRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 2 },
  sideBadge: {
    backgroundColor: GymTheme.surfaceElevated,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 38,
    alignItems: 'center',
  },
  sideBadgeText: { color: GymTheme.textMuted, fontSize: 12, fontWeight: '800' },
  sideRestText: {
    color: GymTheme.textMuted,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    paddingLeft: 46,
  },
  nextSet: { borderTopWidth: 1, borderTopColor: GymTheme.border, paddingTop: Spacing.md },
  setIndex: { color: GymTheme.textMuted, fontSize: 13, fontWeight: '700', width: 58 },
  duration: { color: GymTheme.hold, fontSize: 17, fontWeight: '900', width: 64 },
  restEmpty: { color: GymTheme.textFaint, fontSize: 11, flex: 1, textAlign: 'right' },
  restPill: { marginLeft: 'auto', backgroundColor: GymTheme.holdDim, borderRadius: Radius.pill,
    paddingHorizontal: 9, paddingVertical: 4 },
  restPillText: { color: GymTheme.hold, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  liveClock: {
    color: GymTheme.hold,
    fontSize: 25,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    flex: 1,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: GymTheme.hold,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
  },
  primaryText: { color: '#160B24', fontSize: 13, fontWeight: '800' },
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
  restClock: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6,
    backgroundColor: GymTheme.holdDim, borderRadius: Radius.pill, paddingHorizontal: 12,
    paddingVertical: 5, marginTop: Spacing.xs },
  restClockText: { color: GymTheme.hold, fontSize: 16, fontWeight: '800',
    fontVariant: ['tabular-nums'], letterSpacing: 0.5 },
  restClockLabel: { color: GymTheme.textMuted, fontSize: 12, fontWeight: '600' },
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
  editText: { color: GymTheme.hold, fontSize: 13, fontWeight: '700' },
  secondaryButton: { backgroundColor: GymTheme.surfaceElevated, borderRadius: Radius.md, padding: 10 },
  secondaryText: { color: GymTheme.text, fontWeight: '700', fontSize: 13 },
  finishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: GymTheme.hold,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
  },
  disabled: { opacity: 0.4 },
  editDuration: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  durationInput: {
    backgroundColor: GymTheme.inputBg,
    borderWidth: 1,
    borderColor: GymTheme.hold,
    borderRadius: Radius.sm,
    color: GymTheme.text,
    paddingHorizontal: 8,
    paddingVertical: 5,
    width: 62,
    textAlign: 'center',
  },
  unit: { color: GymTheme.textMuted, fontSize: 11 },
});
