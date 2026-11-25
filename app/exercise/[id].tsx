import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type Href, Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ChartPoint, LineChart } from '@/components/gym/line-chart';
import { EmptyState, Loading } from '@/components/gym/ui';
import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import { getExercise } from '@/db/exercises';
import { ExerciseHistoryEntry, getExerciseHistory } from '@/db/history';
import type { ExerciseSet, ExerciseWithMuscleGroup } from '@/db/types';
import { averageOneRepMax, groupSetsByIndex } from '@/lib/calc';
import {
  formatCardioSummary,
  formatClock,
  formatDate,
  formatDuration,
  formatHM,
  formatRest,
} from '@/lib/format';

export default function ExerciseDetailScreen() {
  const db = useSQLiteContext();
  const { id, activeSessionId, sessionExerciseId } = useLocalSearchParams<{
    id: string;
    activeSessionId?: string;
    sessionExerciseId?: string;
  }>();
  const exerciseId = Number(id);
  const parsedActiveSessionId = activeSessionId ? Number(activeSessionId) : null;
  const validActiveSessionId =
    parsedActiveSessionId != null && Number.isFinite(parsedActiveSessionId)
      ? parsedActiveSessionId
      : null;
  const { width } = useWindowDimensions();

  const [exercise, setExercise] = useState<ExerciseWithMuscleGroup | null>(null);
  const [history, setHistory] = useState<ExerciseHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(exerciseId)) {
      setLoading(false);
      return;
    }
    const ex = await getExercise(db, exerciseId);
    const hist = await getExerciseHistory(db, exerciseId, {
      includeActiveSessionId: validActiveSessionId,
    });
    setExercise(ex);
    setHistory(hist);
    setLoading(false);
  }, [db, exerciseId, validActiveSessionId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (loading) return <Loading />;

  const name = exercise?.name ?? 'Ejercicio';
  const canEdit = exercise != null && exercise.archived_at == null;
  const hasInProgress = history.some((h) => h.is_in_progress);
  const hasMetadataChips = Boolean(
    exercise?.muscle_group_name ||
      exercise?.is_unilateral === 1 ||
      exercise?.archived_at != null ||
      hasInProgress
  );

  const points: ChartPoint[] = history.map((h) => ({
    value: averageOneRepMax(h.sets, h.weight ?? 0, h.es_corporal === 1, h.user_weight ?? 0),
    label: shortDate(h.session_start_ts),
    highlightColor: h.is_in_progress ? GymTheme.active : undefined,
    tooltip: {
      title: h.is_in_progress
        ? `${formatDate(h.session_start_ts)} · En curso`
        : formatDate(h.session_start_ts),
      lines: historyPointLines(h),
    },
  }));
  const exerciseType = exercise?.exercise_type ?? history[0]?.exercise_type;
  const isCardio = exerciseType === 'cardio';
  const isHold = exerciseType === 'hold';

  // Registros más recientes primero.
  const records = [...history].reverse();

  return (
    <>
      <Stack.Screen
        options={{
          title: name,
          headerRight: canEdit
            ? () => (
                <Pressable
                  hitSlop={8}
                  style={styles.headerEditBtn}
                  onPress={() =>
                    router.push({
                      pathname: '/exercise-form',
                      params: sessionExerciseId
                        ? { id: String(exerciseId), sessionExerciseId }
                        : { id: String(exerciseId) },
                    } as unknown as Href)
                  }>
                  <MaterialCommunityIcons name="pencil-outline" size={22} color={GymTheme.text} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <ScrollView style={{ flex: 1, backgroundColor: GymTheme.background }}
        contentContainerStyle={styles.content}
        onTouchStart={() => setSelectedPoint(null)}>
        {history.length === 0 ? (
          <>
            {hasMetadataChips ? (
              <View style={styles.summaryCard}>
                <MetadataChips exercise={exercise} hasInProgress={false} />
              </View>
            ) : null}
            <EmptyState
              title="Sin registros todavía"
              subtitle="Cuando entrenes este ejercicio aparecerán aquí sus registros."
            />
          </>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <MaterialCommunityIcons name="repeat" size={20} color={GymTheme.primary} />
                <Text style={styles.summaryValue}>{history.length}</Text>
                <Text style={styles.summaryLabel}>
                  {history.length === 1 ? 'vez realizado' : 'veces realizado'}
                </Text>
              </View>
              {hasMetadataChips ? (
                <MetadataChips exercise={exercise} hasInProgress={hasInProgress} />
              ) : null}
            </View>
            {!isCardio && !isHold ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>1RM promedio</Text>
              <Text style={styles.cardSub}>Media del 1RM de todas las series de cada día.</Text>
              <LineChart points={points} width={width - Spacing.lg * 2 - Spacing.lg * 2}
                selectedIndex={selectedPoint} onSelectionChange={setSelectedPoint} />
            </View>
            ) : null}

            <Text style={styles.sectionLabel}>Registros</Text>
            {records.map((r) => (
              <RecordCard key={r.session_exercise_id} entry={r} name={name} />
            ))}
          </>
        )}
      </ScrollView>
    </>
  );
}

function MetadataChips({
  exercise,
  hasInProgress,
}: {
  exercise: ExerciseWithMuscleGroup | null;
  hasInProgress: boolean;
}) {
  return (
    <View style={styles.chipsRow}>
      {exercise?.muscle_group_name ? (
        <View style={styles.metaChip}>
          <MaterialCommunityIcons name="arm-flex-outline" size={13} color={GymTheme.textMuted} />
          <Text style={styles.metaChipText}>{exercise.muscle_group_name}</Text>
        </View>
      ) : null}
      {exercise?.is_unilateral === 1 ? (
        <View style={[styles.metaChip, styles.unilateralChip]}>
          <MaterialCommunityIcons name="swap-horizontal" size={13} color={GymTheme.primary} />
          <Text style={[styles.metaChipText, { color: GymTheme.primary }]}>Unilateral</Text>
        </View>
      ) : null}
      {hasInProgress ? (
        <View style={[styles.metaChip, styles.inProgressChip]}>
          <Text style={[styles.metaChipText, { color: GymTheme.active }]}>1 en curso</Text>
        </View>
      ) : null}
      {exercise?.archived_at != null ? (
        <View style={[styles.metaChip, styles.archivedChip]}>
          <Text style={[styles.metaChipText, { color: GymTheme.warning }]}>Archivado</Text>
        </View>
      ) : null}
    </View>
  );
}

function RecordCard({ entry, name }: { entry: ExerciseHistoryEntry; name: string }) {
  const cardStyle = [styles.record, entry.is_in_progress && styles.recordInProgress];
  const isUnilateral = entry.is_unilateral === 1;

  if (entry.exercise_type === 'cardio') {
    return (
      <View style={cardStyle}>
        <View style={styles.recordHeader}>
          <RecordDateHeader dateTs={entry.session_start_ts} isInProgress={entry.is_in_progress} />
          <Text style={styles.recordTime}>{formatHM(entry.end_ts)}</Text>
        </View>
        <Text style={styles.cardioResult}>
          {formatCardioSummary(entry.cardio_entry?.duration_seconds, entry.cardio_entry?.distance_km)}
        </Text>
        {entry.strava_name ? <Text style={styles.recordName}>{entry.strava_name} · Strava</Text> : null}
        {entry.cardio_entry?.notes ? <Text style={styles.recordName}>{entry.cardio_entry.notes}</Text> : null}
      </View>
    );
  }
  if (entry.exercise_type === 'hold') {
    const groups = isUnilateral ? groupSetsByIndex(entry.sets) : [];
    return (
      <View style={cardStyle}>
        <View style={styles.recordHeader}>
          <RecordDateHeader dateTs={entry.session_start_ts} isInProgress={entry.is_in_progress} />
          <Text style={styles.recordTime}>
            {formatHM(entry.start_ts)} - {formatHM(entry.end_ts)}
          </Text>
        </View>
        <Text style={styles.recordName}>
          {name} · Aguante{isUnilateral ? ' · Unilateral' : ''}
        </Text>
        <View style={styles.repsList}>
          {isUnilateral
            ? groups.map((group) => (
                <UnilateralSetPill
                  key={group.setIndex}
                  items={group.items}
                  globalWeight={entry.weight}
                  variableWeight={false}
                  isHold
                />
              ))
            : entry.sets.map((set) => (
                <View key={set.id} style={styles.repPill}>
                  <Text style={[styles.repValue, { color: GymTheme.hold }]}>
                    {formatClock(set.duration_seconds ?? 0)}
                  </Text>
                  <Text style={styles.repRest}>
                    {set.rest_seconds == null ? 'inicio' : `descanso ${formatRest(set.rest_seconds)}`}
                  </Text>
                </View>
              ))}
        </View>
      </View>
    );
  }
  const avg = averageOneRepMax(entry.sets, entry.weight ?? 0, entry.es_corporal === 1, entry.user_weight ?? 0);
  // ¿Alguna serie usa un peso distinto del global? Solo entonces detallamos el peso por serie.
  const variableWeight = entry.sets.some((s) => s.weight != null && s.weight !== entry.weight);
  const groups = isUnilateral ? groupSetsByIndex(entry.sets) : [];
  return (
    <View style={cardStyle}>
      <View style={styles.recordHeader}>
        <RecordDateHeader dateTs={entry.session_start_ts} isInProgress={entry.is_in_progress} />
        <Text style={styles.recordTime}>
          {formatHM(entry.start_ts)} - {formatHM(entry.end_ts)}
          {entry.start_ts && entry.end_ts ? (
            <Text style={styles.recordDuration}> · {formatDuration(entry.start_ts, entry.end_ts)}</Text>
          ) : null}
        </Text>
      </View>
      <View style={styles.recordSubHeader}>
        <Text style={styles.recordName}>
          {name}{isUnilateral ? ' · Unilateral' : ''}
        </Text>
        <Text style={styles.recordWeight}>
          {variableWeight ? 'pesos variables' : `${entry.weight ?? 0} kg`}
          {entry.es_corporal === 1 ? ` (+${Math.round(entry.user_weight ?? 0)} corp.)` : ''}
        </Text>
      </View>
      <View style={styles.repsList}>
        {isUnilateral
          ? groups.map((group) => (
              <UnilateralSetPill
                key={group.setIndex}
                items={group.items}
                globalWeight={entry.weight}
                variableWeight={variableWeight}
                isHold={false}
              />
            ))
          : entry.sets.map((s) => (
              <View key={s.id} style={styles.repPill}>
                <Text style={styles.repValue}>{s.reps}</Text>
                {variableWeight ? (
                  <Text style={styles.repWeight}>{s.weight ?? entry.weight ?? 0} kg</Text>
                ) : null}
                <Text style={styles.repRest}>{s.rest_seconds == null ? 'inicio' : formatRest(s.rest_seconds)}</Text>
              </View>
            ))}
      </View>
      <Text style={styles.recordAvg}>1RM medio: {avg.toFixed(1)} kg</Text>
    </View>
  );
}

function RecordDateHeader({ dateTs, isInProgress }: { dateTs: number; isInProgress: boolean }) {
  return (
    <View style={styles.recordDateRow}>
      <Text style={styles.recordDate}>{formatDate(dateTs)}</Text>
      {isInProgress ? (
        <View style={styles.inProgressBadge}>
          <Text style={styles.inProgressText}>En curso</Text>
        </View>
      ) : null}
    </View>
  );
}

function UnilateralSetPill({
  items,
  globalWeight,
  variableWeight,
  isHold,
}: {
  items: ExerciseSet[];
  globalWeight: number | null;
  variableWeight: boolean;
  isHold: boolean;
}) {
  const ordered = [...items].sort(
    (a, b) => (a.side_order ?? 0) - (b.side_order ?? 0) || a.id - b.id
  );
  const first = ordered[0];
  const second = ordered[1];
  const sideLabel = (side: ExerciseSet['side']) =>
    side === 'left' ? 'I' : side === 'right' ? 'D' : '—';
  const formatVal = (set: ExerciseSet) =>
    isHold ? formatClock(set.duration_seconds ?? 0) : String(set.reps);

  const sideRest = ordered.find((s) => s.side_rest_seconds != null)?.side_rest_seconds ?? null;
  const interSetRest = ordered.find((s) => s.rest_seconds != null)?.rest_seconds ?? null;
  const w1 = first ? (first.weight ?? globalWeight ?? 0) : 0;
  const w2 = second ? (second.weight ?? globalWeight ?? 0) : 0;
  const weightLabel = second
    ? w1 === w2
      ? `${w1} kg`
      : `${w1}/${w2} kg`
    : `${w1} kg`;

  return (
    <View style={[styles.repPill, styles.unilateralPill]}>
      <View style={styles.unilateralSidesRow}>
        {first ? (
          <View style={styles.unilateralSideItem}>
            <Text style={styles.sideLabel}>{sideLabel(first.side)}</Text>
            <Text style={[styles.repValue, isHold && { color: GymTheme.hold }]}>
              {formatVal(first)}
            </Text>
          </View>
        ) : null}
        {second ? (
          <>
            <Text style={styles.sideRestText}>
              {sideRest != null ? `· ${formatRest(sideRest)} ·` : '/'}
            </Text>
            <View style={styles.unilateralSideItem}>
              <Text style={styles.sideLabel}>{sideLabel(second.side)}</Text>
              <Text style={[styles.repValue, isHold && { color: GymTheme.hold }]}>
                {formatVal(second)}
              </Text>
            </View>
          </>
        ) : null}
      </View>
      {!isHold && variableWeight ? <Text style={styles.repWeight}>{weightLabel}</Text> : null}
      <Text style={styles.repRest}>
        {interSetRest == null
          ? 'inicio'
          : isHold
            ? `descanso ${formatRest(interSetRest)}`
            : formatRest(interSetRest)}
      </Text>
    </View>
  );
}

function shortDate(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function historyPointLines(entry: ExerciseHistoryEntry): string[] {
  const weights = entry.sets.map((set) => set.weight ?? entry.weight ?? 0);
  const uniqueWeights = [...new Set(weights)];

  if (entry.is_unilateral === 1) {
    const groups = groupSetsByIndex(entry.sets);
    const weightLine =
      uniqueWeights.length === 1
        ? `Peso: ${uniqueWeights[0]} kg${entry.es_corporal === 1 ? ` + ${Math.round(entry.user_weight ?? 0)} kg corporal` : ''}`
        : `Pesos: ${groups
            .map(({ items }) => {
              const left = items.find((s) => s.side === 'left');
              const right = items.find((s) => s.side === 'right');
              const lw = left ? (left.weight ?? entry.weight ?? 0) : null;
              const rw = right ? (right.weight ?? entry.weight ?? 0) : null;
              if (lw != null && rw != null && lw === rw) return `${lw} kg`;
              return `${lw != null ? `${lw} kg` : '—'}/${rw != null ? `${rw} kg` : '—'}`;
            })
            .join(' · ')}`;
    const repsLine = `Reps: ${groups
      .map(({ items }) => {
        const left = items.find((s) => s.side === 'left');
        const right = items.find((s) => s.side === 'right');
        return `${left ? left.reps : '—'}/${right ? right.reps : '—'}`;
      })
      .join(' · ')}`;
    return [weightLine, repsLine];
  }

  const weightLine = uniqueWeights.length === 1
    ? `Peso: ${uniqueWeights[0]} kg${entry.es_corporal === 1 ? ` + ${Math.round(entry.user_weight ?? 0)} kg corporal` : ''}`
    : `Pesos: ${entry.sets.map((_set, index) => `${weights[index]} kg`).join(' · ')}`;
  return [weightLine, `Repeticiones: ${entry.sets.map((set) => set.reps).join(' · ')}`];
}

const styles = StyleSheet.create({
  headerEditBtn: { paddingHorizontal: 4 },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  card: {
    backgroundColor: GymTheme.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: GymTheme.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  summaryCard: {
    backgroundColor: GymTheme.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: GymTheme.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  summaryValue: { color: GymTheme.primary, fontSize: 22, fontWeight: '900' },
  summaryLabel: { color: GymTheme.textMuted, fontSize: 14, fontWeight: '700' },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: GymTheme.surfaceAlt,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  unilateralChip: {
    borderColor: GymTheme.primaryDim,
  },
  inProgressChip: {
    backgroundColor: GymTheme.activeDim,
    borderColor: GymTheme.active,
  },
  archivedChip: {
    borderColor: GymTheme.warning,
  },
  metaChipText: {
    color: GymTheme.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  cardTitle: { color: GymTheme.text, fontSize: 17, fontWeight: '800' },
  cardSub: { color: GymTheme.textMuted, fontSize: 12 },
  sectionLabel: {
    color: GymTheme.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.sm,
  },
  record: {
    backgroundColor: GymTheme.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: GymTheme.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  recordInProgress: {
    borderColor: GymTheme.active,
    borderWidth: 1.5,
  },
  recordHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  recordDateRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexShrink: 1 },
  recordDate: { color: GymTheme.text, fontSize: 15, fontWeight: '800' },
  inProgressBadge: {
    backgroundColor: GymTheme.activeDim,
    borderColor: GymTheme.active,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  inProgressText: {
    color: GymTheme.active,
    fontSize: 11,
    fontWeight: '800',
  },
  recordTime: { color: GymTheme.textMuted, fontSize: 13 },
  recordDuration: { color: GymTheme.primary, fontSize: 13, fontWeight: '700' },
  recordSubHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  recordName: { color: GymTheme.textMuted, fontSize: 14, flexShrink: 1 },
  recordWeight: { color: GymTheme.primary, fontSize: 15, fontWeight: '800' },
  repsList: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  repPill: {
    backgroundColor: GymTheme.surfaceAlt,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    minWidth: 52,
  },
  unilateralPill: {
    minWidth: 76,
  },
  unilateralSidesRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  unilateralSideItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  sideLabel: {
    color: GymTheme.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  sideRestText: {
    color: GymTheme.textFaint,
    fontSize: 10,
  },
  repValue: { color: GymTheme.text, fontSize: 16, fontWeight: '800' },
  repWeight: { color: GymTheme.primary, fontSize: 11, fontWeight: '700', marginTop: 1 },
  repRest: { color: GymTheme.textFaint, fontSize: 10, marginTop: 2 },
  recordAvg: { color: GymTheme.textMuted, fontSize: 12, marginTop: 2 },
  cardioResult: { color: GymTheme.cardio, fontSize: 20, fontWeight: '900' },
});
