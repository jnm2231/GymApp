import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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
      const data = await getDayDetail(db, start, end);
      setBlocks(data);
      // Cambio 1: si la jornada tiene un solo tipo de día, saltamos el nivel 1
      // y mostramos directamente sus ejercicios (nivel 2).
      if (data.length === 1) setSelected(data[0]);
      setLoading(false);
    })();
  }, [db, date]);

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
              {formatHM(selected.start_ts)} - {formatHM(selected.end_ts)}
            </Text>
          </View>

          {selected.exercises.map((ex) => {
            const variableWeight = ex.sets.some((s) => s.weight != null && s.weight !== ex.weight);
            return (
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
                <Text style={styles.exWeight}>{variableWeight ? 'pesos variables' : `${ex.weight ?? 0} kg`}</Text>
              </View>
              <Text style={styles.exTimes}>
                ({formatHM(ex.start_ts)} - {formatHM(ex.end_ts)})
              </Text>
              <View style={styles.repsList}>
                {ex.sets.map((s) => (
                  <View key={s.id} style={styles.repPill}>
                    <Text style={styles.repValue}>{s.reps}</Text>
                    {variableWeight ? (
                      <Text style={styles.repWeight}>{s.weight ?? ex.weight ?? 0} kg</Text>
                    ) : null}
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
          blocks.map((b) => (
            <Pressable key={b.session_id} style={styles.dayBlock} onPress={() => setSelected(b)}>
              <View style={styles.dayIcon}>
                <MaterialCommunityIcons name="dumbbell" size={22} color={GymTheme.primary} />
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
          ))
        )}
      </ScrollView>
    </>
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
  repWeight: { color: GymTheme.primary, fontSize: 11, fontWeight: '700', marginTop: 1 },
  repRest: { color: GymTheme.textFaint, fontSize: 10, marginTop: 2 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  linkText: { color: GymTheme.primary, fontSize: 12, fontWeight: '700' },
});
