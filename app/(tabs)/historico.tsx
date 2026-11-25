import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { EmptyState, Screen, ScreenTitle } from '@/components/gym/ui';
import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import { getDayExercises, listDaysWithCount } from '@/db/days';
import { getExerciseCatalogSummaries, type ExerciseCatalogSummary } from '@/db/history';
import { listMuscleGroups } from '@/db/muscle-groups';
import { listImportedStravaActivities, type ImportedStravaActivity } from '@/db/strava';
import type { DayWithCount, ExerciseWithMuscleGroup, MuscleGroup } from '@/db/types';
import { dateKey, formatDate, formatHM } from '@/lib/format';
import { subscribeToStravaUpdates } from '@/lib/strava-sync';
import { getDayType, getTrainingType } from '@/lib/training-types';

type ExerciseMode = 'name' | 'count' | 'oneRm' | 'muscle' | 'days';
type TopView = 'exercises' | 'strava';

function fallbackSummary(exercise: ExerciseWithMuscleGroup): ExerciseCatalogSummary {
  return {
    id: exercise.id,
    name: exercise.name,
    exerciseType: exercise.exercise_type,
    trackingMode: exercise.tracking_mode,
    esCorporal: exercise.es_corporal,
    isUnilateral: exercise.is_unilateral,
    muscleGroupId: exercise.muscle_group_id,
    muscleGroupName: exercise.muscle_group_name,
    timesPerformed: 0,
    bestOneRepMax: 0,
  };
}

export default function HistoricoScreen() {
  const db = useSQLiteContext();
  const [view, setView] = useState<TopView>('exercises');
  const [mode, setMode] = useState<ExerciseMode>('name');
  const [nameAsc, setNameAsc] = useState(true);
  const [search, setSearch] = useState('');

  const [summaries, setSummaries] = useState<ExerciseCatalogSummary[]>([]);
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>([]);
  const [days, setDays] = useState<DayWithCount[]>([]);
  const [dayExercises, setDayExercises] = useState<Record<number, ExerciseWithMuscleGroup[]>>({});
  const [expandedDays, setExpandedDays] = useState<number[]>([]);
  const [expandedMuscles, setExpandedMuscles] = useState<string[]>([]);
  const [stravaActivities, setStravaActivities] = useState<ImportedStravaActivity[]>([]);

  const load = useCallback(async () => {
    const nextSummaries = await getExerciseCatalogSummaries(db);
    const nextGroups = await listMuscleGroups(db);
    const nextDays = await listDaysWithCount(db);
    const exercisesByDay: Record<number, ExerciseWithMuscleGroup[]> = {};
    for (const day of nextDays) {
      exercisesByDay[day.id] = await getDayExercises(db, day.id);
    }
    const nextStrava = await listImportedStravaActivities(db);

    setSummaries(nextSummaries);
    setMuscleGroups(nextGroups);
    setDays(nextDays);
    setDayExercises(exercisesByDay);
    setStravaActivities(nextStrava);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );
  useEffect(() => subscribeToStravaUpdates(() => { void load(); }), [load]);

  const normalizedQuery = search.trim().toLowerCase();

  const summaryById = useMemo(() => {
    const map = new Map<number, ExerciseCatalogSummary>();
    for (const item of summaries) map.set(item.id, item);
    return map;
  }, [summaries]);

  const filteredExercises = useMemo(() => {
    if (!normalizedQuery) return summaries;
    return summaries.filter((item) => item.name.toLowerCase().includes(normalizedQuery));
  }, [summaries, normalizedQuery]);

  const sortedExercises = useMemo(() => {
    return [...filteredExercises].sort((a, b) => {
      if (mode === 'count') {
        return b.timesPerformed - a.timesPerformed || a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
      }
      if (mode === 'oneRm') {
        return b.bestOneRepMax - a.bestOneRepMax || a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
      }
      return nameAsc
        ? a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
        : b.name.localeCompare(a.name, 'es', { sensitivity: 'base' });
    });
  }, [filteredExercises, mode, nameAsc]);

  const muscleSections = useMemo(() => {
    const sections = muscleGroups
      .map((group) => ({
        key: String(group.id),
        title: group.name,
        exercises: filteredExercises.filter((ex) => ex.muscleGroupId === group.id),
      }))
      .filter((section) => !normalizedQuery || section.exercises.length > 0);

    const undefinedExercises = filteredExercises.filter((ex) => ex.muscleGroupId == null);
    if (undefinedExercises.length > 0) {
      sections.push({
        key: 'undefined',
        title: 'Sin definir',
        exercises: undefinedExercises,
      });
    }
    return sections;
  }, [muscleGroups, filteredExercises, normalizedQuery]);

  const daySections = useMemo(() => {
    return days
      .map((day) => {
        const items = (dayExercises[day.id] ?? []).map(
          (ex) => summaryById.get(ex.id) ?? fallbackSummary(ex)
        );
        const matching = normalizedQuery
          ? items.filter((ex) => ex.name.toLowerCase().includes(normalizedQuery))
          : items;
        return { day, exercises: matching };
      })
      .filter((section) => !normalizedQuery || section.exercises.length > 0);
  }, [days, dayExercises, summaryById, normalizedQuery]);

  const handlePressNameChip = () => {
    if (mode === 'name') {
      setNameAsc((asc) => !asc);
    } else {
      setMode('name');
      setNameAsc(true);
    }
  };

  const toggleDay = (dayId: number) => {
    setExpandedDays((current) =>
      current.includes(dayId) ? current.filter((id) => id !== dayId) : [...current, dayId]
    );
  };

  const toggleMuscle = (key: string) => {
    setExpandedMuscles((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    );
  };

  return (
    <Screen>
      <ScreenTitle
        right={
          view === 'exercises' ? (
            <Pressable style={styles.newButton} onPress={() => router.push('/exercise-form' as Href)}>
              <Text style={styles.newButtonText}>+ Nuevo</Text>
            </Pressable>
          ) : undefined
        }>
        Ejercicios
      </ScreenTitle>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.viewSelector}>
          <ViewChip
            label="Ejercicios"
            icon="dumbbell"
            active={view === 'exercises'}
            onPress={() => setView('exercises')}
          />
          <ViewChip
            label="Strava"
            icon="run"
            active={view === 'strava'}
            onPress={() => setView('strava')}
          />
        </View>

        <Animated.View key={view} entering={FadeIn.duration(160)} style={styles.results}>
          {view === 'exercises' ? (
            <>
              <View style={styles.searchBox}>
                <MaterialCommunityIcons name="magnify" size={20} color={GymTheme.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Buscar ejercicio..."
                  placeholderTextColor={GymTheme.textFaint}
                  value={search}
                  onChangeText={setSearch}
                  returnKeyType="search"
                />
                {search.length > 0 ? (
                  <Pressable hitSlop={8} onPress={() => setSearch('')}>
                    <MaterialCommunityIcons name="close-circle" size={18} color={GymTheme.textMuted} />
                  </Pressable>
                ) : null}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.sortRow}>
                <SortChip
                  label="Nombre"
                  icon={nameAsc ? 'arrow-up' : 'arrow-down'}
                  active={mode === 'name'}
                  onPress={handlePressNameChip}
                />
                <SortChip
                  label="Más realizados"
                  active={mode === 'count'}
                  onPress={() => setMode('count')}
                />
                <SortChip
                  label="Mayor 1RM"
                  active={mode === 'oneRm'}
                  onPress={() => setMode('oneRm')}
                />
                <SortChip
                  label="Por músculo"
                  active={mode === 'muscle'}
                  onPress={() => setMode('muscle')}
                />
                <SortChip
                  label="Por día"
                  active={mode === 'days'}
                  onPress={() => setMode('days')}
                />
              </ScrollView>

              {mode === 'muscle' ? (
                muscleSections.length === 0 ? (
                  <EmptyState
                    title={normalizedQuery ? 'Sin resultados' : 'No hay ejercicios ni grupos'}
                    subtitle={
                      normalizedQuery
                        ? 'Ningún ejercicio coincide con tu búsqueda.'
                        : 'Crea un ejercicio o añade grupos musculares desde "+ Nuevo".'
                    }
                  />
                ) : (
                  muscleSections.map((section) => {
                    const expanded = expandedMuscles.includes(section.key);
                    const count = section.exercises.length;
                    return (
                      <View key={section.key} style={styles.groupCard}>
                        <Pressable style={styles.groupHeader} onPress={() => toggleMuscle(section.key)}>
                          <View style={styles.groupIcon}>
                            <MaterialCommunityIcons
                              name="arm-flex-outline"
                              size={20}
                              color={GymTheme.primary}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.groupTitle}>{section.title}</Text>
                            <Text style={styles.rowSub}>
                              {count} {count === 1 ? 'ejercicio' : 'ejercicios'}
                            </Text>
                          </View>
                          <MaterialCommunityIcons
                            name={expanded ? 'chevron-up' : 'chevron-down'}
                            size={23}
                            color={GymTheme.textMuted}
                          />
                        </Pressable>
                        {expanded ? (
                          <View style={styles.groupContent}>
                            {section.exercises.length === 0 ? (
                              <Text style={styles.emptyGroup}>No hay ejercicios en este grupo.</Text>
                            ) : (
                              section.exercises.map((exercise) => (
                                <ExerciseRow key={exercise.id} exercise={exercise} nested />
                              ))
                            )}
                          </View>
                        ) : null}
                      </View>
                    );
                  })
                )
              ) : mode === 'days' ? (
                days.length === 0 ? (
                  <EmptyState title="No hay días creados" />
                ) : daySections.length === 0 ? (
                  <EmptyState
                    title="Sin resultados"
                    subtitle="Ningún ejercicio coincide con tu búsqueda."
                  />
                ) : (
                  daySections.map(({ day, exercises }) => {
                    const type = getDayType(day.training_type);
                    const expanded = expandedDays.includes(day.id);
                    const displayCount = normalizedQuery ? exercises.length : day.exercise_count;
                    return (
                      <View key={day.id} style={[styles.dayGroup, { borderColor: type.color }]}>
                        <Pressable
                          style={[styles.dayHeader, { backgroundColor: type.dimColor }]}
                          onPress={() => toggleDay(day.id)}>
                          <MaterialCommunityIcons name={type.icon} size={21} color={type.color} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.dayTitle, { color: type.color }]}>{day.name}</Text>
                            <Text style={styles.rowSub}>
                              {type.label} · {displayCount}{' '}
                              {displayCount === 1 ? 'ejercicio' : 'ejercicios'}
                            </Text>
                          </View>
                          <MaterialCommunityIcons
                            name={expanded ? 'chevron-up' : 'chevron-down'}
                            size={23}
                            color={type.color}
                          />
                        </Pressable>
                        {expanded ? (
                          <View style={styles.groupContent}>
                            {exercises.length === 0 ? (
                              <Text style={styles.emptyGroup}>Este día no tiene ejercicios.</Text>
                            ) : (
                              exercises.map((exercise) => (
                                <ExerciseRow key={exercise.id} exercise={exercise} nested />
                              ))
                            )}
                          </View>
                        ) : null}
                      </View>
                    );
                  })
                )
              ) : sortedExercises.length === 0 ? (
                <EmptyState
                  title={normalizedQuery ? 'Sin resultados' : 'No hay ejercicios'}
                  subtitle={
                    normalizedQuery
                      ? 'Ningún ejercicio coincide con tu búsqueda.'
                      : 'Pulsa "+ Nuevo" arriba para crear tu primer ejercicio.'
                  }
                />
              ) : (
                sortedExercises.map((exercise) => (
                  <ExerciseRow key={exercise.id} exercise={exercise} />
                ))
              )}
            </>
          ) : stravaActivities.length === 0 ? (
            <EmptyState
              title="Sin actividades de Strava"
              subtitle="Vincula Strava desde Ajustes y asigna sus deportes a un ejercicio de cardio."
            />
          ) : (
            stravaActivities.map((activity) => (
              <Pressable
                key={activity.activity_id}
                style={[styles.stravaRow, { borderColor: getDayType('cardio').color }]}
                onPress={() =>
                  router.push({
                    pathname: '/day-detail/[date]',
                    params: { date: dateKey(activity.start_ts), sessionId: String(activity.session_id) },
                  })
                }>
                <MaterialCommunityIcons name="run" size={20} color={getDayType('cardio').color} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowText}>{activity.name}</Text>
                  <Text style={styles.rowSub}>
                    {formatDate(activity.start_ts)} · {formatHM(activity.start_ts)} · {activity.sport_type} ·{' '}
                    {activity.day_name}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={GymTheme.textFaint} />
              </Pressable>
            ))
          )}
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

function ExerciseRow({
  exercise,
  nested = false,
}: {
  exercise: ExerciseCatalogSummary;
  nested?: boolean;
}) {
  const type = getTrainingType(exercise.exerciseType);
  const metricLabel =
    exercise.exerciseType === 'cardio'
      ? 'Cardio'
      : exercise.exerciseType === 'hold'
        ? 'Aguante'
        : `Mejor 1RM ${exercise.bestOneRepMax.toFixed(1)} kg`;

  const subtitleParts =
    exercise.timesPerformed === 0
      ? ['Sin registros']
      : [
          `${exercise.timesPerformed} ${exercise.timesPerformed === 1 ? 'vez' : 'veces'}`,
          metricLabel,
        ];
  if (exercise.muscleGroupName) {
    subtitleParts.push(exercise.muscleGroupName);
  }

  return (
    <View style={[styles.row, nested && styles.nestedRow, { borderColor: type.color }]}>
      <Pressable
        style={styles.rowMain}
        onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: String(exercise.id) } })}>
        <MaterialCommunityIcons name={type.icon} size={20} color={type.color} />
        <View style={{ flex: 1 }}>
          <View style={styles.rowTitleLine}>
            <Text style={styles.rowText} numberOfLines={1}>
              {exercise.name}
            </Text>
            {exercise.isUnilateral === 1 ? (
              <View style={styles.uniBadge}>
                <Text style={styles.uniBadgeText}>I/D</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.rowSub} numberOfLines={1}>
            {subtitleParts.join(' · ')}
          </Text>
        </View>
      </Pressable>
      <Pressable
        hitSlop={8}
        style={styles.editButton}
        accessibilityLabel={`Editar ${exercise.name}`}
        onPress={() => router.push(`/exercise-form?id=${exercise.id}` as Href)}>
        <MaterialCommunityIcons name="pencil-outline" size={19} color={GymTheme.textMuted} />
      </Pressable>
    </View>
  );
}

function ViewChip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: 'dumbbell' | 'run';
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.viewChip, active && styles.viewChipActive]} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={18} color={active ? '#0C0C0E' : GymTheme.textMuted} />
      <Text style={[styles.viewChipText, active && styles.viewChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function SortChip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon?: 'arrow-up' | 'arrow-down';
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.sortChip, active && styles.sortChipActive]} onPress={onPress}>
      <View style={styles.sortChipInner}>
        <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{label}</Text>
        {icon ? (
          <MaterialCommunityIcons
            name={icon}
            size={14}
            color={active ? '#0C0C0E' : GymTheme.textMuted}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  results: { gap: Spacing.sm },
  newButton: {
    backgroundColor: GymTheme.primary,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
  },
  newButtonText: { color: '#0C0C0E', fontSize: 13, fontWeight: '800' },
  viewSelector: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.xs },
  viewChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.md,
    paddingVertical: 11,
    backgroundColor: GymTheme.surface,
  },
  viewChipActive: { backgroundColor: GymTheme.primary, borderColor: GymTheme.primary },
  viewChipText: { color: GymTheme.textMuted, fontSize: 13, fontWeight: '800' },
  viewChipTextActive: { color: '#0C0C0E' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: GymTheme.inputBg,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
  },
  searchInput: {
    flex: 1,
    color: GymTheme.text,
    fontSize: 15,
    paddingVertical: 2,
  },
  sortRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.xs },
  sortChip: {
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    backgroundColor: GymTheme.surface,
  },
  sortChipActive: { backgroundColor: GymTheme.primary, borderColor: GymTheme.primary },
  sortChipInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortChipText: { color: GymTheme.textMuted, fontSize: 12, fontWeight: '700' },
  sortChipTextActive: { color: '#0C0C0E' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GymTheme.surface,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  nestedRow: {
    backgroundColor: GymTheme.surfaceAlt,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.sm,
  },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rowText: { color: GymTheme.text, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  rowSub: { color: GymTheme.textMuted, fontSize: 12, marginTop: 2 },
  uniBadge: {
    backgroundColor: GymTheme.surfaceElevated,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  uniBadgeText: { color: GymTheme.textMuted, fontSize: 10, fontWeight: '800' },
  editButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stravaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: GymTheme.surface,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.md,
    padding: Spacing.lg,
  },
  groupCard: {
    backgroundColor: GymTheme.surface,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  groupIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    backgroundColor: GymTheme.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitle: { color: GymTheme.text, fontSize: 16, fontWeight: '800' },
  dayGroup: {
    backgroundColor: GymTheme.surface,
    borderWidth: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  dayTitle: { fontSize: 16, fontWeight: '800' },
  groupContent: { padding: Spacing.sm, gap: Spacing.sm },
  emptyGroup: { color: GymTheme.textMuted, fontSize: 13, padding: Spacing.md },
});
