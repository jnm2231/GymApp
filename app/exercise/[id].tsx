import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ChartPoint, LineChart } from '@/components/gym/line-chart';
import { EmptyState, Loading } from '@/components/gym/ui';
import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import { ExerciseHistoryEntry, getExerciseHistory } from '@/db/history';
import { averageOneRepMax } from '@/lib/calc';
import { formatDate, formatDuration, formatHM, formatRest } from '@/lib/format';

export default function ExerciseDetailScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const exerciseId = Number(id);
  const { width } = useWindowDimensions();

  const [name, setName] = useState('Ejercicio');
  const [history, setHistory] = useState<ExerciseHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const ex = await db.getFirstAsync<{ name: string }>(
        'SELECT name FROM exercises WHERE id = ?',
        [exerciseId]
      );
      if (ex) setName(ex.name);
      setHistory(await getExerciseHistory(db, exerciseId));
      setLoading(false);
    })();
  }, [db, exerciseId]);

  if (loading) return <Loading />;

  const points: ChartPoint[] = history.map((h) => ({
    value: averageOneRepMax(h.sets, h.weight ?? 0, h.es_corporal === 1, h.user_weight ?? 0),
    label: shortDate(h.session_start_ts),
  }));

  // Registros más recientes primero.
  const records = [...history].reverse();

  return (
    <>
      <Stack.Screen options={{ title: name }} />
      <ScrollView style={{ flex: 1, backgroundColor: GymTheme.background }} contentContainerStyle={styles.content}>
        {history.length === 0 ? (
          <EmptyState
            title="Sin registros todavía"
            subtitle="Cuando entrenes este ejercicio aparecerá aquí tu progreso de 1RM."
          />
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>1RM promedio</Text>
              <Text style={styles.cardSub}>Media del 1RM de todas las series de cada día.</Text>
              <LineChart points={points} width={width - Spacing.lg * 2 - Spacing.lg * 2} />
            </View>

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

function RecordCard({ entry, name }: { entry: ExerciseHistoryEntry; name: string }) {
  const avg = averageOneRepMax(entry.sets, entry.weight ?? 0, entry.es_corporal === 1, entry.user_weight ?? 0);
  // ¿Alguna serie usa un peso distinto del global? Solo entonces detallamos el peso por serie.
  const variableWeight = entry.sets.some((s) => s.weight != null && s.weight !== entry.weight);
  return (
    <View style={styles.record}>
      <View style={styles.recordHeader}>
        <Text style={styles.recordDate}>{formatDate(entry.session_start_ts)}</Text>
        <Text style={styles.recordTime}>
          {formatHM(entry.start_ts)} - {formatHM(entry.end_ts)}
          {entry.start_ts && entry.end_ts ? (
            <Text style={styles.recordDuration}> · {formatDuration(entry.start_ts, entry.end_ts)}</Text>
          ) : null}
        </Text>
      </View>
      <View style={styles.recordSubHeader}>
        <Text style={styles.recordName}>{name}</Text>
        <Text style={styles.recordWeight}>
          {variableWeight ? 'pesos variables' : `${entry.weight ?? 0} kg`}
          {entry.es_corporal === 1 ? ` (+${Math.round(entry.user_weight ?? 0)} corp.)` : ''}
        </Text>
      </View>
      <View style={styles.repsList}>
        {entry.sets.map((s) => (
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

function shortDate(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  card: {
    backgroundColor: GymTheme.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: GymTheme.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
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
  recordHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recordDate: { color: GymTheme.text, fontSize: 15, fontWeight: '800' },
  recordTime: { color: GymTheme.textMuted, fontSize: 13 },
  recordDuration: { color: GymTheme.primary, fontSize: 13, fontWeight: '700' },
  recordSubHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recordName: { color: GymTheme.textMuted, fontSize: 14 },
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
  repValue: { color: GymTheme.text, fontSize: 16, fontWeight: '800' },
  repWeight: { color: GymTheme.primary, fontSize: 11, fontWeight: '700', marginTop: 1 },
  repRest: { color: GymTheme.textFaint, fontSize: 10, marginTop: 2 },
  recordAvg: { color: GymTheme.textMuted, fontSize: 12, marginTop: 2 },
});
