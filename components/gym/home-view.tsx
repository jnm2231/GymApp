import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, EmptyState, Screen } from '@/components/gym/ui';
import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import { useSession } from '@/context/session-context';
import { deleteDay, listDaysWithCount } from '@/db/days';
import { startSession } from '@/db/sessions';
import type { DayWithCount } from '@/db/types';

/** Pantalla Inicial: lista de tipos de día. Sólo se muestra cuando NO hay
 * ninguna sesión activa (si la hay, la pestaña "Entreno" muestra la sesión). */
export function HomeView() {
  const db = useSQLiteContext();
  const { refresh } = useSession();
  const [days, setDays] = useState<DayWithCount[]>([]);

  const load = useCallback(async () => {
    setDays(await listDaysWithCount(db));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleStart = async (day: DayWithCount) => {
    if (day.exercise_count === 0) {
      Alert.alert('Día vacío', 'Este día no tiene ejercicios. Edítalo para añadir alguno.');
      return;
    }
    Alert.alert('Empezar entrenamiento', `Vas a empezar "${day.name}". ¿Listo?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Empezar',
        onPress: async () => {
          await startSession(db, day.id);
          await refresh(); // la pestaña "Entreno" pasará a mostrar la sesión
        },
      },
    ]);
  };

  const handleDelete = (day: DayWithCount) => {
    Alert.alert('Eliminar día', `¿Eliminar la plantilla "${day.name}"? El histórico se conserva.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await deleteDay(db, day.id);
          await load();
        },
      },
    ]);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Image source={require('@/assets/images/logo.png')} style={styles.logo} contentFit="contain" />
        <Text style={styles.title}>Entrenamiento</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>Tus días</Text>

        {days.length === 0 ? (
          <EmptyState
            title="No tienes días creados"
            subtitle="Crea tu primer día de entrenamiento (ej: Pecho, Espalda, Pierna) para empezar."
          />
        ) : (
          days.map((day) => (
            <View key={day.id} style={styles.dayCard}>
              <Pressable style={styles.dayMain} onPress={() => handleStart(day)}>
                <View style={styles.dayIcon}>
                  <MaterialCommunityIcons name="dumbbell" size={22} color={GymTheme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dayName}>{day.name}</Text>
                  <Text style={styles.dayCount}>
                    {day.exercise_count} {day.exercise_count === 1 ? 'ejercicio' : 'ejercicios'}
                  </Text>
                </View>
                <View style={styles.startPill}>
                  <MaterialCommunityIcons name="play" size={16} color="#0C0C0E" />
                  <Text style={styles.startText}>Empezar</Text>
                </View>
              </Pressable>
              <View style={styles.dayActions}>
                <Pressable
                  hitSlop={8}
                  style={styles.actionBtn}
                  onPress={() => router.push({ pathname: '/day-form', params: { id: String(day.id) } })}>
                  <MaterialCommunityIcons name="pencil" size={18} color={GymTheme.textMuted} />
                </Pressable>
                <Pressable hitSlop={8} style={styles.actionBtn} onPress={() => handleDelete(day)}>
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color={GymTheme.danger} />
                </Pressable>
              </View>
            </View>
          ))
        )}

        <Button
          title="Nuevo día"
          left={<MaterialCommunityIcons name="plus" size={18} color="#0C0C0E" />}
          onPress={() => router.push('/day-form')}
          style={{ marginTop: Spacing.md }}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  logo: { width: 40, height: 40 },
  title: { color: GymTheme.text, fontSize: 28, fontWeight: '800' },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },
  sectionLabel: {
    color: GymTheme.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.sm,
  },
  dayCard: {
    backgroundColor: GymTheme.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: GymTheme.border,
    overflow: 'hidden',
  },
  dayMain: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  dayIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: GymTheme.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayName: { color: GymTheme.text, fontSize: 17, fontWeight: '700' },
  dayCount: { color: GymTheme.textMuted, fontSize: 13, marginTop: 2 },
  startPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: GymTheme.primary,
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  startText: { color: '#0C0C0E', fontWeight: '800', fontSize: 13 },
  dayActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: GymTheme.border,
    paddingTop: Spacing.sm,
  },
  actionBtn: { padding: 4 },
});
