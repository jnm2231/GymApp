import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, Screen, ScreenTitle } from '@/components/gym/ui';
import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import { getDayExercises, listDaysWithCount } from '@/db/days';
import type { DayWithCount, Exercise } from '@/db/types';

export default function HistoricoScreen() {
  const db = useSQLiteContext();
  const [days, setDays] = useState<DayWithCount[]>([]);
  const [selectedDay, setSelectedDay] = useState<DayWithCount | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);

  const load = useCallback(async () => {
    setDays(await listDaysWithCount(db));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openDay = async (day: DayWithCount) => {
    setSelectedDay(day);
    setExercises(await getDayExercises(db, day.id));
  };

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
            exercises.map((ex) => (
              <Pressable
                key={ex.id}
                style={styles.row}
                onPress={() =>
                  router.push({ pathname: '/exercise/[id]', params: { id: String(ex.id) } })
                }>
                <MaterialCommunityIcons name="chart-line" size={20} color={GymTheme.primary} />
                <Text style={styles.rowText}>{ex.name}</Text>
                <MaterialCommunityIcons name="chevron-right" size={22} color={GymTheme.textFaint} />
              </Pressable>
            ))
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
        {days.length === 0 ? (
          <EmptyState
            title="Aún no hay datos"
            subtitle="Crea días de entrenamiento y registra sesiones para ver tu progreso."
          />
        ) : (
          days.map((day) => (
            <Pressable key={day.id} style={styles.row} onPress={() => openDay(day)}>
              <MaterialCommunityIcons name="calendar-text" size={20} color={GymTheme.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowText}>{day.name}</Text>
                <Text style={styles.rowSub}>
                  {day.exercise_count} {day.exercise_count === 1 ? 'ejercicio' : 'ejercicios'}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={GymTheme.textFaint} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </Screen>
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
});
