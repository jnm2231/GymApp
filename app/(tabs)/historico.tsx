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
import { getDayType, getTrainingType } from '@/lib/training-types';

type HistorySort = 'name' | 'count' | 'oneRm';
type HistoryView = 'exercises' | 'days';

export default function HistoricoScreen() {
  const db = useSQLiteContext();
  const [view, setView] = useState<HistoryView>('exercises');
  const [days, setDays] = useState<DayWithCount[]>([]);
  const [dayExercises, setDayExercises] = useState<Record<number, Exercise[]>>({});
  const [expandedDays, setExpandedDays] = useState<number[]>([]);
  const [performed, setPerformed] = useState<PerformedExerciseSummary[]>([]);
  const [sort, setSort] = useState<HistorySort>('name');

  const load = useCallback(async () => {
    const nextDays = await listDaysWithCount(db);
    const exercisesByDay: Record<number, Exercise[]> = {};
    for (const day of nextDays) exercisesByDay[day.id] = await getDayExercises(db, day.id);
    setDays(nextDays);
    setDayExercises(exercisesByDay);
    setPerformed(await getPerformedExerciseSummaries(db));
  }, [db]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const sortedPerformed = [...performed].sort((a, b) => {
    if (sort === 'count') return b.timesPerformed - a.timesPerformed || a.name.localeCompare(b.name);
    if (sort === 'oneRm') return b.bestOneRepMax - a.bestOneRepMax || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });

  const toggleDay = (dayId: number) => {
    setExpandedDays((current) => current.includes(dayId)
      ? current.filter((id) => id !== dayId)
      : [...current, dayId]);
  };

  return (
    <Screen>
      <ScreenTitle>Histórico</ScreenTitle>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.viewSelector}>
          <ViewChip label="Por ejercicios" icon="dumbbell" active={view === 'exercises'} onPress={() => setView('exercises')} />
          <ViewChip label="Por días" icon="calendar-text" active={view === 'days'} onPress={() => setView('days')} />
        </View>

        {view === 'exercises' ? (
          <>
            <View style={styles.sortRow}>
              <SortChip label="Nombre" active={sort === 'name'} onPress={() => setSort('name')} />
              <SortChip label="Más realizados" active={sort === 'count'} onPress={() => setSort('count')} />
              <SortChip label="Mayor 1RM" active={sort === 'oneRm'} onPress={() => setSort('oneRm')} />
            </View>
            {sortedPerformed.length === 0 ? (
              <EmptyState title="Aún no hay datos" subtitle="Finaliza un entrenamiento para ver aquí tus ejercicios." />
            ) : sortedPerformed.map((exercise) => <ExerciseRow key={`${exercise.exerciseId ?? 'deleted'}-${exercise.name}`} exercise={exercise} />)}
          </>
        ) : days.length === 0 ? (
          <EmptyState title="No hay días creados" />
        ) : (
          days.map((day) => {
            const type = getDayType(day.training_type);
            const expanded = expandedDays.includes(day.id);
            const exercises = dayExercises[day.id] ?? [];
            return (
              <View key={day.id} style={[styles.dayGroup, { borderColor: type.color }]}>
                <Pressable style={[styles.dayHeader, { backgroundColor: type.dimColor }]} onPress={() => toggleDay(day.id)}>
                  <MaterialCommunityIcons name={type.icon} size={21} color={type.color} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dayTitle, { color: type.color }]}>{day.name}</Text>
                    <Text style={styles.rowSub}>{type.label} · {day.exercise_count} {day.exercise_count === 1 ? 'ejercicio' : 'ejercicios'}</Text>
                  </View>
                  <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={23} color={type.color} />
                </Pressable>
                {expanded ? (
                  <View style={styles.dayContent}>
                    {exercises.length === 0 ? <Text style={styles.emptyDay}>Este día no tiene ejercicios.</Text> : exercises.map((exercise) => {
                      const exerciseType = getTrainingType(exercise.exercise_type);
                      return (
                        <Pressable key={exercise.id} style={styles.exerciseInDay}
                          onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: String(exercise.id) } })}>
                          <MaterialCommunityIcons name={exerciseType.icon} size={19} color={exerciseType.color} />
                          <Text style={styles.rowText}>{exercise.name}</Text>
                          <MaterialCommunityIcons name="chevron-right" size={20} color={GymTheme.textFaint} />
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

function ExerciseRow({ exercise }: { exercise: PerformedExerciseSummary }) {
  const type = getTrainingType(exercise.exerciseType);
  return (
    <Pressable style={[styles.row, { borderColor: type.color }]} disabled={exercise.exerciseId == null}
      onPress={() => exercise.exerciseId != null && router.push({ pathname: '/exercise/[id]', params: { id: String(exercise.exerciseId) } })}>
      <MaterialCommunityIcons name={type.icon} size={20} color={type.color} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowText}>{exercise.name}</Text>
        <Text style={styles.rowSub}>
          {exercise.timesPerformed} {exercise.timesPerformed === 1 ? 'vez' : 'veces'} ·{' '}
          {exercise.exerciseType === 'cardio' ? 'Cardio' : exercise.exerciseType === 'hold' ? 'Aguante' : `Mejor 1RM ${exercise.bestOneRepMax.toFixed(1)} kg`}
        </Text>
      </View>
      {exercise.exerciseId != null ? <MaterialCommunityIcons name="chevron-right" size={22} color={GymTheme.textFaint} /> : null}
    </Pressable>
  );
}

function ViewChip({ label, icon, active, onPress }: {
  label: string; icon: 'dumbbell' | 'calendar-text'; active: boolean; onPress: () => void;
}) {
  return (
    <Pressable style={[styles.viewChip, active && styles.viewChipActive]} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={18} color={active ? '#0C0C0E' : GymTheme.textMuted} />
      <Text style={[styles.viewChipText, active && styles.viewChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function SortChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable style={[styles.sortChip, active && styles.sortChipActive]} onPress={onPress}>
    <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  viewSelector: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  viewChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderWidth: 1, borderColor: GymTheme.border, borderRadius: Radius.md, paddingVertical: 11, backgroundColor: GymTheme.surface },
  viewChipActive: { backgroundColor: GymTheme.primary, borderColor: GymTheme.primary },
  viewChipText: { color: GymTheme.textMuted, fontSize: 13, fontWeight: '800' },
  viewChipTextActive: { color: '#0C0C0E' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: GymTheme.surface,
    borderWidth: 1, borderColor: GymTheme.border, borderRadius: Radius.md, padding: Spacing.lg },
  rowText: { color: GymTheme.text, fontSize: 15, fontWeight: '700', flex: 1 },
  rowSub: { color: GymTheme.textMuted, fontSize: 12, marginTop: 2 },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.xs },
  sortChip: { borderWidth: 1, borderColor: GymTheme.border, borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md, paddingVertical: 7, backgroundColor: GymTheme.surface },
  sortChipActive: { backgroundColor: GymTheme.primary, borderColor: GymTheme.primary },
  sortChipText: { color: GymTheme.textMuted, fontSize: 12, fontWeight: '700' },
  sortChipTextActive: { color: '#0C0C0E' },
  dayGroup: { backgroundColor: GymTheme.surface, borderWidth: 1, borderRadius: Radius.md, overflow: 'hidden' },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  dayTitle: { fontSize: 16, fontWeight: '800' },
  dayContent: { padding: Spacing.sm, gap: Spacing.sm },
  exerciseInDay: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md,
    backgroundColor: GymTheme.surfaceAlt, borderRadius: Radius.md },
  emptyDay: { color: GymTheme.textMuted, fontSize: 13, padding: Spacing.md },
});
