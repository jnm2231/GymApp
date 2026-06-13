import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, Loading } from '@/components/gym/ui';
import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import { CalendarDayBlock, getDayDetail } from '@/db/calendar';
import { formatDate, formatHM, formatRest } from '@/lib/format';

export default function DayDetailScreen() {
  const db = useSQLiteContext();
  const { date } = useLocalSearchParams<{ date: string }>();

  const [blocks, setBlocks] = useState<CalendarDayBlock[]>([]);
  const [selected, setSelected] = useState<CalendarDayBlock | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [y, m, d] = date.split('-').map(Number);
      const start = new Date(y, m - 1, d).getTime();
      const end = new Date(y, m - 1, d + 1).getTime();
      setBlocks(await getDayDetail(db, start, end));
      setLoading(false);
    })();
  }, [db, date]);

  const title = (() => {
    const [y, m, d] = date.split('-').map(Number);
    return formatDate(new Date(y, m - 1, d).getTime());
  })();

  if (loading) return <Loading />;

  // Nivel 2: ejercicios del tipo de día seleccionado
  if (selected) {
    return (
      <>
        <Stack.Screen options={{ title: selected.day_name }} />
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
          <Pressable style={styles.backRow} onPress={() => setSelected(null)}>
            <MaterialCommunityIcons name="chevron-left" size={20} color={GymTheme.textMuted} />
            <Text style={styles.backText}>Volver a la jornada</Text>
          </Pressable>

          <View style={styles.blockHeader}>
            <Text style={styles.blockTitle}>Bloque {selected.day_name.toUpperCase()}</Text>
            <Text style={styles.blockTime}>
              {formatHM(selected.start_ts)} - {formatHM(selected.end_ts)}
            </Text>
          </View>

          {selected.exercises.map((ex) => (
            <Pressable
              key={ex.session_exercise_id}
              style={styles.exCard}
              disabled={ex.exercise_id == null}
              onPress={() =>
                ex.exercise_id != null &&
                router.push({ pathname: '/exercise/[id]', params: { id: String(ex.exercise_id) } })
              }>
              <View style={styles.exHeader}>
                <Text style={styles.exName}>{ex.exercise_name}</Text>
                <Text style={styles.exWeight}>{ex.weight ?? 0} kg</Text>
              </View>
              <Text style={styles.exTimes}>
                ({formatHM(ex.start_ts)} - {formatHM(ex.end_ts)})
              </Text>
              <View style={styles.repsList}>
                {ex.sets.map((s) => (
                  <View key={s.id} style={styles.repPill}>
                    <Text style={styles.repValue}>{s.reps}</Text>
                    <Text style={styles.repRest}>
                      {s.rest_seconds == null ? 'inicio' : formatRest(s.rest_seconds)}
                    </Text>
                  </View>
                ))}
              </View>
              {ex.exercise_id != null ? (
                <View style={styles.linkRow}>
                  <MaterialCommunityIcons name="chart-line" size={14} color={GymTheme.primary} />
                  <Text style={styles.linkText}>Ver histórico</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      </>
    );
  }

  // Nivel 1: tipos de día de la jornada
  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {blocks.length === 0 ? (
          <EmptyState title="Sin entrenamientos ese día" />
        ) : (
          blocks.map((b) => (
            <Pressable key={b.session_id} style={styles.dayBlock} onPress={() => setSelected(b)}>
              <View style={styles.dayIcon}>
                <MaterialCommunityIcons name="dumbbell" size={22} color={GymTheme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dayBlockTitle}>Bloque {b.day_name.toUpperCase()}</Text>
                <Text style={styles.dayBlockTime}>
                  {formatHM(b.start_ts)} - {formatHM(b.end_ts)} · {b.exercises.length}{' '}
                  {b.exercises.length === 1 ? 'ejercicio' : 'ejercicios'}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={GymTheme.textFaint} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: GymTheme.background },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing.xs },
  backText: { color: GymTheme.textMuted, fontSize: 14, fontWeight: '600' },
  blockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  blockTitle: { color: GymTheme.text, fontSize: 20, fontWeight: '800' },
  blockTime: { color: GymTheme.textMuted, fontSize: 14 },
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
  repValue: { color: GymTheme.text, fontSize: 16, fontWeight: '800' },
  repRest: { color: GymTheme.textFaint, fontSize: 10, marginTop: 2 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  linkText: { color: GymTheme.primary, fontSize: 12, fontWeight: '700' },
});
