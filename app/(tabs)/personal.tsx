import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ActivityHeatmap, activityRangeStart } from '@/components/gym/activity-heatmap';
import { LineChart } from '@/components/gym/line-chart';
import { Card, EmptyState, Screen, ScreenTitle } from '@/components/gym/ui';
import { GymTheme, Spacing } from '@/constants/gym-theme';
import { getTrainingActivity, getWeightEvolution } from '@/db/personal';
import type { TrainingActivityDay } from '@/db/personal';
import type { BodyMeasurement } from '@/db/types';

export default function PersonalScreen() {
  const db = useSQLiteContext();
  const { width } = useWindowDimensions();
  const [weights, setWeights] = useState<BodyMeasurement[]>([]);
  const [activity, setActivity] = useState<TrainingActivityDay[]>([]);

  const load = useCallback(async () => {
    const nextWeights = await getWeightEvolution(db);
    const nextActivity = await getTrainingActivity(db, activityRangeStart());
    setWeights(nextWeights);
    setActivity(nextActivity);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const points = weights.map((entry) => ({
    value: entry.weight,
    label: shortDate(entry.recorded_at),
  }));
  const latest = weights.at(-1);
  const change = latest && weights.length > 1 ? latest.weight - weights[0].weight : null;

  return (
    <Screen>
      <ScreenTitle>Personal</ScreenTitle>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="scale-bathroom" size={21} color={GymTheme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Evolución del peso</Text>
              <Text style={styles.cardSub}>
                {latest
                  ? `${latest.weight} kg actuales${change == null ? '' : ` · ${signed(change)} kg desde el primer registro`}`
                  : 'Registra tu peso desde Ajustes para empezar.'}
              </Text>
            </View>
          </View>
          {weights.length > 0 ? (
            <LineChart
              points={points}
              width={Math.max(240, width - Spacing.lg * 4)}
              color={GymTheme.primary}
              valueFormatter={(value) => value.toFixed(1)}
            />
          ) : (
            <EmptyState title="Sin registros de peso" subtitle="Los registros aparecerán aquí como una evolución." />
          )}
        </Card>

        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconBox, { backgroundColor: GymTheme.activeDim }]}>
              <MaterialCommunityIcons name="calendar-check" size={21} color={GymTheme.active} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Frecuencia de entrenamiento</Text>
              <Text style={styles.cardSub}>Últimas 53 semanas · intensidad según tiempo entrenado</Text>
            </View>
          </View>
          <ActivityHeatmap activity={activity} />
        </Card>
      </ScrollView>
    </Screen>
  );
}

function shortDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function signed(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },
  card: { gap: Spacing.md, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: GymTheme.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { color: GymTheme.text, fontSize: 18, fontWeight: '800' },
  cardSub: { color: GymTheme.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
});
