import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, Loading } from '@/components/gym/ui';
import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import { CalendarDayBlock, getDayDetail } from '@/db/calendar';
import type { StravaActivity } from '@/db/strava';
import type { ExerciseSet } from '@/db/types';
import { groupSetsByIndex } from '@/lib/calc';
import {
  formatCardioSummary,
  formatClock,
  formatDate,
  formatDuration,
  formatHM,
  formatRest,
} from '@/lib/format';
import { getDayType, getTrainingType } from '@/lib/training-types';

export default function DayDetailScreen() {
  const db = useSQLiteContext();
  const { date, sessionId } = useLocalSearchParams<{ date: string; sessionId?: string }>();

  const [blocks, setBlocks] = useState<CalendarDayBlock[]>([]);
  const [selected, setSelected] = useState<CalendarDayBlock | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [y, m, d] = date.split('-').map(Number);
      const start = new Date(y, m - 1, d).getTime();
      const end = new Date(y, m - 1, d + 1).getTime();
      const data = await getDayDetail(db, start, end);
      setBlocks(data);
      // Cambio 1: si la jornada tiene un solo tipo de día, saltamos el nivel 1
      // y mostramos directamente sus ejercicios (nivel 2).
      if (sessionId) setSelected(data.find((block) => block.session_id === Number(sessionId)) ?? null);
      else if (data.length === 1) setSelected(data[0]);
      setLoading(false);
    })();
  }, [db, date, sessionId]);

  // Cuando hay varios tipos de día, el "atrás" del nivel 2 debe volver al nivel 1
  // (no al calendario). Interceptamos el botón físico de Android.
  const multi = blocks.length > 1;
  useEffect(() => {
    if (!(selected && multi)) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelected(null);
      return true;
    });
    return () => sub.remove();
  }, [selected, multi]);

  const title = (() => {
    const [y, m, d] = date.split('-').map(Number);
    return formatDate(new Date(y, m - 1, d).getTime());
  })();

  if (loading) return <Loading />;

  // Nivel 2: ejercicios del tipo de día seleccionado
  if (selected) {
    return (
      <>
        <Stack.Screen
          options={{
            title: selected.day_name,
            // Si hay varios tipos de día, la flecha del header vuelve al nivel 1.
            // Si solo hay uno (auto-seleccionado), deja el comportamiento normal
            // (volver al calendario) y se permite el gesto de deslizar atrás.
            gestureEnabled: !multi,
            headerLeft: multi
              ? () => (
                  <Pressable onPress={() => setSelected(null)} hitSlop={8} style={styles.headerBack}>
                    <MaterialCommunityIcons name="chevron-left" size={26} color={GymTheme.text} />
                  </Pressable>
                )
              : undefined,
          }}
        />
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
          {multi ? (
            <Pressable style={styles.backRow} onPress={() => setSelected(null)}>
              <MaterialCommunityIcons name="chevron-left" size={20} color={GymTheme.textMuted} />
              <Text style={styles.backText}>Volver a la jornada</Text>
            </Pressable>
          ) : null}

          <View style={styles.blockHeader}>
            <Text style={styles.blockTitle}>{selected.day_name}</Text>
            <Text style={styles.blockTime}>
              <Text style={styles.blockDuration}>{formatDuration(selected.start_ts, selected.end_ts)}</Text>
              {'  ·  '}
              {formatHM(selected.start_ts)} - {formatHM(selected.end_ts)}
            </Text>
          </View>

          {selected.strava_activity ? <StravaMetrics activity={JSON.parse(selected.strava_activity.raw_json) as StravaActivity} /> : null}

          {selected.exercises.map((ex) => {
            const variableWeight = ex.sets.some((s) => s.weight != null && s.weight !== ex.weight);
            const exerciseType = getTrainingType(ex.exercise_type);
            const isUnilateral = ex.is_unilateral === 1;
            const groups = isUnilateral ? groupSetsByIndex(ex.sets) : [];
            const holdSetCount = isUnilateral ? groups.length : ex.sets.length;
            return (
            <Pressable
              key={ex.session_exercise_id}
              style={[styles.exCard, { borderColor: exerciseType.color }]}
              disabled={ex.exercise_id == null}
              onPress={() =>
                ex.exercise_id != null &&
                router.push({ pathname: '/exercise/[id]', params: { id: String(ex.exercise_id) } })
              }>
              <View style={styles.exHeader}>
                <Text style={styles.exName}>{ex.exercise_name}</Text>
                <Text style={[styles.exWeight, { color: exerciseType.color }]}>
                  {ex.exercise_type === 'cardio'
                    ? formatCardioSummary(ex.cardio_entry?.duration_seconds, ex.cardio_entry?.distance_km)
                    : ex.exercise_type === 'hold'
                      ? `${holdSetCount} ${holdSetCount === 1 ? 'serie' : 'series'}`
                    : variableWeight
                      ? 'pesos variables'
                      : `${ex.weight ?? 0} kg`}
                </Text>
              </View>
              <Text style={styles.exTimes}>
                ({formatHM(ex.start_ts)} - {formatHM(ex.end_ts)})
                {isUnilateral && ex.exercise_type !== 'cardio' ? ' · Unilateral' : ''}
              </Text>
              {ex.exercise_type !== 'cardio' ? (
                <View style={styles.repsList}>
                  {isUnilateral
                    ? groups.map((group) => (
                        <UnilateralSetPill
                          key={group.setIndex}
                          items={group.items}
                          globalWeight={ex.weight}
                          variableWeight={variableWeight}
                          isHold={ex.exercise_type === 'hold'}
                        />
                      ))
                    : ex.sets.map((s) => (
                        <View key={s.id} style={styles.repPill}>
                          <Text style={styles.repValue}>
                            {ex.exercise_type === 'hold' ? formatClock(s.duration_seconds ?? 0) : s.reps}
                          </Text>
                          {ex.exercise_type !== 'hold' && variableWeight ? (
                            <Text style={styles.repWeight}>{s.weight ?? ex.weight ?? 0} kg</Text>
                          ) : null}
                          <Text style={styles.repRest}>
                            {s.rest_seconds == null ? 'inicio' : formatRest(s.rest_seconds)}
                          </Text>
                        </View>
                      ))}
                </View>
              ) : ex.cardio_entry?.notes ? (
                <Text style={styles.exTimes}>{ex.cardio_entry.notes}</Text>
              ) : null}
              {ex.exercise_id != null ? (
                <View style={styles.linkRow}>
                  <MaterialCommunityIcons name="chart-line" size={14} color={GymTheme.primary} />
                  <Text style={styles.linkText}>Ver histórico</Text>
                </View>
              ) : null}
            </Pressable>
            );
          })}
        </ScrollView>
      </>
    );
  }

  // Nivel 1: tipos de día de la jornada.
  // Reseteamos headerLeft/gestureEnabled a su valor por defecto: el Stack.Screen
  // mergea opciones, así que si no lo hacemos se conservaría el headerLeft
  // personalizado del nivel 2 y la flecha del header no volvería al calendario.
  return (
    <>
      <Stack.Screen options={{ title, headerLeft: undefined, gestureEnabled: true }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {blocks.length === 0 ? (
          <EmptyState title="Sin entrenamientos ese día" />
        ) : (
          blocks.map((b) => {
            const type = getDayType(b.day_type);
            return (
            <Pressable key={b.session_id} style={[styles.dayBlock, { borderColor: type.color }]} onPress={() => setSelected(b)}>
              <View style={[styles.dayIcon, { backgroundColor: type.dimColor }]}>
                <MaterialCommunityIcons name={type.icon} size={22} color={type.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dayBlockTitle}>{b.day_name}</Text>
                <Text style={styles.dayBlockTime}>
                  {formatHM(b.start_ts)} - {formatHM(b.end_ts)} · {b.exercises.length}{' '}
                  {b.exercises.length === 1 ? 'ejercicio' : 'ejercicios'}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={GymTheme.textFaint} />
            </Pressable>
            );
          })
        )}
      </ScrollView>
    </>
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
            <Text style={styles.repValue}>{formatVal(first)}</Text>
          </View>
        ) : null}
        {second ? (
          <>
            <Text style={styles.sideRestText}>
              {sideRest != null ? `· ${formatRest(sideRest)} ·` : '/'}
            </Text>
            <View style={styles.unilateralSideItem}>
              <Text style={styles.sideLabel}>{sideLabel(second.side)}</Text>
              <Text style={styles.repValue}>{formatVal(second)}</Text>
            </View>
          </>
        ) : null}
      </View>
      {!isHold && variableWeight ? <Text style={styles.repWeight}>{weightLabel}</Text> : null}
      <Text style={styles.repRest}>
        {interSetRest == null ? 'inicio' : formatRest(interSetRest)}
      </Text>
    </View>
  );
}

function StravaMetrics({ activity }: { activity: StravaActivity }) {
  const sport = activity.sport_type || activity.type || '';
  const usesPace = /^(Run|TrailRun|VirtualRun|Walk|Hike)$/.test(sport);
  const pace = usesPace &&
    typeof activity.average_speed === 'number' && activity.average_speed > 0
    ? Math.round(1000 / activity.average_speed) : null;
  const metrics = [
    pace != null ? `Ritmo medio ${formatClock(pace)} min/km` : null,
    typeof activity.total_elevation_gain === 'number' ? `Desnivel +${Math.round(activity.total_elevation_gain)} m` : null,
    typeof activity.moving_time === 'number' ? `En movimiento ${formatClock(activity.moving_time)}` : null,
    typeof activity.elapsed_time === 'number' ? `Tiempo total ${formatClock(activity.elapsed_time)}` : null,
    typeof activity.average_heartrate === 'number' ? `Pulso medio ${Math.round(activity.average_heartrate)} ppm` : null,
    typeof activity.max_heartrate === 'number' ? `Pulso máximo ${Math.round(activity.max_heartrate)} ppm` : null,
    !usesPace && typeof activity.average_speed === 'number' ? `Velocidad media ${(activity.average_speed * 3.6).toFixed(1)} km/h` : null,
    !usesPace && typeof activity.max_speed === 'number' ? `Velocidad máxima ${(activity.max_speed * 3.6).toFixed(1)} km/h` : null,
  ].filter(Boolean);
  return (
    <View style={{ backgroundColor: GymTheme.surface, borderColor: GymTheme.border, borderWidth: 1,
      borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.xs }}>
      <Text style={{ color: GymTheme.primary, fontWeight: '800' }}>Strava · {activity.sport_type || activity.type}</Text>
      <Text style={{ color: GymTheme.text }}>{activity.name}</Text>
      {activity.device_name ? <Text style={{ color: GymTheme.textMuted }}>Registrado con {activity.device_name}</Text> : null}
      {metrics.map((metric) => <Text key={metric} style={{ color: GymTheme.text }}>{metric}</Text>)}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: GymTheme.background },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  headerBack: { paddingHorizontal: 4 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing.xs },
  backText: { color: GymTheme.textMuted, fontSize: 14, fontWeight: '600' },
  blockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  blockTitle: { color: GymTheme.text, fontSize: 20, fontWeight: '800', flexShrink: 1 },
  blockTime: { color: GymTheme.textMuted, fontSize: 14, marginLeft: Spacing.sm },
  blockDuration: { color: GymTheme.primary, fontWeight: '800' },
  dayBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: GymTheme.surface,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  dayIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: GymTheme.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBlockTitle: { color: GymTheme.text, fontSize: 16, fontWeight: '800' },
  dayBlockTime: { color: GymTheme.textMuted, fontSize: 13, marginTop: 2 },
  exCard: {
    backgroundColor: GymTheme.surface,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  exHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exName: { color: GymTheme.text, fontSize: 16, fontWeight: '800', flex: 1 },
  exWeight: { color: GymTheme.primary, fontSize: 15, fontWeight: '800' },
  exTimes: { color: GymTheme.textMuted, fontSize: 12 },
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
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  linkText: { color: GymTheme.primary, fontSize: 12, fontWeight: '700' },
});
