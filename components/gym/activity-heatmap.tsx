import { router } from 'expo-router';
import { useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GymTheme, Spacing } from '@/constants/gym-theme';
import type { TrainingActivityDay } from '@/db/personal';
import { dateKey } from '@/lib/format';

const WEEKS = 53;
const CELL = 11;
const GAP = 3;
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DAY_LABELS = ['L', '', 'X', '', 'V', '', ''];

interface WeekColumn {
  key: string;
  month: string;
  days: {
    key: string;
    future: boolean;
    today: boolean;
    activity?: TrainingActivityDay;
  }[];
}

export function ActivityHeatmap({ activity }: { activity: TrainingActivityDay[] }) {
  const scrollRef = useRef<ScrollView>(null);
  const { columns, levelFor } = useMemo(() => buildHeatmap(activity), [activity]);

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
        <View>
          <View style={styles.monthRow}>
            <View style={styles.dayLabelSpacer} />
            {columns.map((column) => (
              <Text key={column.key} style={styles.monthLabel}>
                {column.month}
              </Text>
            ))}
          </View>
          <View style={styles.body}>
            <View style={styles.dayLabels}>
              {DAY_LABELS.map((label, index) => (
                <Text key={index} style={styles.dayLabel}>{label}</Text>
              ))}
            </View>
            <View style={styles.grid}>
              {columns.map((column) => (
                <View key={column.key} style={styles.column}>
                  {column.days.map((day) => {
                    const level = levelFor(day.activity);
                    return (
                      <Pressable
                        key={day.key}
                        disabled={!day.activity || day.future}
                        accessibilityLabel={activityLabel(day.key, day.activity)}
                        onPress={() =>
                          router.push({ pathname: '/day-detail/[date]', params: { date: day.key } })
                        }
                        style={[
                          styles.cell,
                          { backgroundColor: LEVEL_COLORS[level] },
                          day.today && styles.today,
                          day.future && styles.future,
                        ]}
                      />
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
      <View style={styles.legend}>
        <Text style={styles.legendText}>Menos tiempo</Text>
        {LEVEL_COLORS.map((color, index) => (
          <View key={index} style={[styles.legendCell, { backgroundColor: color }]} />
        ))}
        <Text style={styles.legendText}>Más tiempo</Text>
      </View>
    </View>
  );
}

export function activityRangeStart(now = new Date()): number {
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  monday.setDate(monday.getDate() - (WEEKS - 1) * 7);
  monday.setHours(0, 0, 0, 0);
  return monday.getTime();
}

function buildHeatmap(activity: TrainingActivityDay[]) {
  const byDate = new Map(activity.map((day) => [day.date, day]));
  const positiveMinutes = activity
    .map((day) => day.minutes)
    .filter((minutes) => minutes > 0)
    .sort((a, b) => a - b);
  const quartile = (fraction: number) =>
    positiveMinutes.length === 0
      ? 0
      : positiveMinutes[Math.min(positiveMinutes.length - 1, Math.floor(fraction * positiveMinutes.length))];
  const q1 = quartile(0.25);
  const q2 = quartile(0.5);
  const q3 = quartile(0.75);
  const levelFor = (day?: TrainingActivityDay) => {
    if (!day) return 0;
    if (day.minutes <= 0) return 1;
    if (day.minutes >= q3) return 4;
    if (day.minutes >= q2) return 3;
    if (day.minutes >= q1) return 2;
    return 1;
  };

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const start = new Date(activityRangeStart(today));
  const columns: WeekColumn[] = [];
  let previousMonth = -1;
  for (let week = 0; week < WEEKS; week++) {
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + week * 7);
    const month = weekStart.getMonth();
    const showMonth = month !== previousMonth && weekStart.getDate() <= 7 && week < WEEKS - 1;
    if (weekStart.getDate() <= 7) previousMonth = month;
    const days = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + index);
      const key = dateKey(day.getTime());
      return {
        key,
        future: day > today,
        today: key === dateKey(today.getTime()),
        activity: byDate.get(key),
      };
    });
    columns.push({
      key: dateKey(weekStart.getTime()),
      month: showMonth ? MONTHS[month] : '',
      days,
    });
  }
  return { columns, levelFor };
}

function activityLabel(date: string, activity?: TrainingActivityDay): string {
  if (!activity) return `${date}, sin entrenamiento`;
  const workoutLabel = activity.workouts === 1 ? '1 entrenamiento' : `${activity.workouts} entrenamientos`;
  return `${date}, ${workoutLabel}, ${activity.minutes} minutos`;
}

const LEVEL_COLORS = [
  GymTheme.surfaceElevated,
  '#4A2B16',
  '#824016',
  '#C4510A',
  GymTheme.primary,
];

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', marginBottom: 5 },
  dayLabelSpacer: { width: 24 },
  monthLabel: {
    width: CELL + GAP,
    color: GymTheme.textFaint,
    fontSize: 9,
    overflow: 'visible',
  },
  body: { flexDirection: 'row' },
  dayLabels: { width: 24, gap: GAP },
  dayLabel: { height: CELL, lineHeight: CELL, color: GymTheme.textMuted, fontSize: 9 },
  grid: { flexDirection: 'row', gap: GAP },
  column: { gap: GAP },
  cell: { width: CELL, height: CELL, borderRadius: 3 },
  today: { borderWidth: 1.5, borderColor: GymTheme.text },
  future: { opacity: 0.25 },
  legend: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.sm,
  },
  legendCell: { width: 10, height: 10, borderRadius: 3 },
  legendText: { color: GymTheme.textFaint, fontSize: 10 },
});
