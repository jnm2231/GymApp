import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, Screen, ScreenTitle } from '@/components/gym/ui';
import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import { getDayExercises, listDaysWithCount } from '@/db/days';
import { getPerformedExerciseSummaries } from '@/db/history';
import type { PerformedExerciseSummary } from '@/db/history';
import type { DayWithCount, Exercise } from '@/db/types';
import { getTrainingType } from '@/lib/training-types';

type HistorySort = 'name' | 'count' | 'oneRm';

export default function HistoricoScreen() {
  const db = useSQLiteContext();
  const [days, setDays] = useState<DayWithCount[]>([]);
  const [selectedDay, setSelectedDay] = useState<DayWithCount | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [performed, setPerformed] = useState<PerformedExerciseSummary[]>([]);
  const [sort, setSort] = useState<HistorySort>('name');

  const load = useCallback(async () => {
    const nextDays = await listDaysWithCount(db);
    const nextPerformed = await getPerformedExerciseSummaries(db);
    setDays(nextDays);
    setPerformed(nextPerformed);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openDay = async (day: DayWithCount) => {
    // Cargamos los ejercicios ANTES de cambiar de nivel, para no mostrar por un
    // frame los del día seleccionado anteriormente (flash).
    const ex = await getDayExercises(db, day.id);
    setExercises(ex);
    setSelectedDay(day);
  };

  const sortedPerformed = [...performed].sort((a, b) => {
    if (sort === 'count') return b.timesPerformed - a.timesPerformed || a.name.localeCompare(b.name);
    if (sort === 'oneRm') return b.bestOneRepMax - a.bestOneRepMax || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });

  // Nivel 2: ejercicios del día seleccionado
  if (selectedDay) {
    return (
      <Screen>
        <View style={styles.backHeader}>
          <Pressable onPress={() => setSelectedDay(null)} hitSlop={8} style={styles.backBtn}>
            <MaterialCommunityIcons name="chevron-left" size={26} color={GymTheme.text} />
          </Pressable>
          <Text style={styles.backTitle}>{selectedDay.name}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {exercises.length === 0 ? (
            <EmptyState title="Este día no tiene ejercicios" />
          ) : (
            exercises.map((ex) => {
              const type = getTrainingType(ex.exercise_type);
              return (
                <Pressable
                  key={ex.id}
                  style={[styles.row, { borderColor: type.color }]}
                  onPress={() =>
                    router.push({ pathname: '/exercise/[id]', params: { id: String(ex.id) } })
                  }>
                  <MaterialCommunityIcons name={type.icon} size={20} color={type.color} />
                  <Text style={styles.rowText}>{ex.name}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={GymTheme.textFaint} />
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </Screen>
    );
  }

  // Nivel 1: tipos de día
  return (
    <Screen>
      <ScreenTitle>Histórico</ScreenTitle>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>Ejercicios realizados</Text>
        <View style={styles.sortRow}>
          <SortChip label="Nombre" active={sort === 'name'} onPress={() => setSort('name')} />
          <SortChip label="Más realizados" active={sort === 'count'} onPress={() => setSort('count')} />
          <SortChip label="Mayor 1RM" active={sort === 'oneRm'} onPress={() => setSort('oneRm')} />
        </View>

        {sortedPerformed.length === 0 ? (
          <EmptyState
            title="Aún no hay datos"
            subtitle="Finaliza un entrenamiento con series para ver aquí tus ejercicios."
          />
        ) : (
          sortedPerformed.map((exercise) => {
            const type = getTrainingType(exercise.exerciseType);
            return (
              <Pressable
                key={`${exercise.exerciseId ?? 'deleted'}-${exercise.name}`}
                style={[styles.row, { borderColor: type.color }]}
                disabled={exercise.exerciseId == null}
                onPress={() =>
                  exercise.exerciseId != null &&
                  router.push({ pathname: '/exercise/[id]', params: { id: String(exercise.exerciseId) } })
                }>
                <MaterialCommunityIcons name={type.icon} size={20} color={type.color} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowText}>{exercise.name}</Text>
                  <Text style={styles.rowSub}>
                    {exercise.timesPerformed} {exercise.timesPerformed === 1 ? 'vez' : 'veces'} ·{' '}
                    {exercise.exerciseType === 'cardio'
                      ? 'Cardio'
                      : `Mejor 1RM ${exercise.bestOneRepMax.toFixed(1)} kg`}
                  </Text>
                </View>
                {exercise.exerciseId != null ? (
                  <MaterialCommunityIcons name="chevron-right" size={22} color={GymTheme.textFaint} />
                ) : null}
              </Pressable>
            );
          })
        )}

        {days.length > 0 ? <Text style={[styles.sectionLabel, { marginTop: Spacing.md }]}>Explorar por día</Text> : null}
        {days.map((day) => {
          const type = getTrainingType(day.training_type);
          return (
            <Pressable
              key={day.id}
              style={[styles.row, { borderColor: type.color }]}
              onPress={() => openDay(day)}>
              <MaterialCommunityIcons name={type.icon} size={20} color={type.color} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowText}>{day.name}</Text>
                <Text style={styles.rowSub}>
                  {day.exercise_count} {day.exercise_count === 1 ? 'ejercicio' : 'ejercicios'}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={GymTheme.textFaint} />
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

function SortChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.sortChip, active && styles.sortChipActive]} onPress={onPress}>
      <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, gap: Spacing.sm },
  backHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  backBtn: { padding: 2 },
  backTitle: { color: GymTheme.text, fontSize: 24, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: GymTheme.surface,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.md,
    padding: Spacing.lg,
  },
  rowText: { color: GymTheme.text, fontSize: 16, fontWeight: '700', flex: 1 },
  rowSub: { color: GymTheme.textMuted, fontSize: 13, marginTop: 2 },
  sectionLabel: {
    color: GymTheme.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.xs },
  sortChip: {
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    backgroundColor: GymTheme.surface,
  },
  sortChipActive: { backgroundColor: GymTheme.primary, borderColor: GymTheme.primary },
  sortChipText: { color: GymTheme.textMuted, fontSize: 12, fontWeight: '700' },
  sortChipTextActive: { color: '#0C0C0E' },
});
