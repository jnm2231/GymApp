import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { Screen } from '@/components/gym/ui';
import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import { CalendarSession, getMonthSessions } from '@/db/calendar';
import { dateKey } from '@/lib/format';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export default function CalendarioScreen() {
  const db = useSQLiteContext();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [sessions, setSessions] = useState<Record<string, CalendarSession[]>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(today.getFullYear());

  const load = useCallback(async () => {
    const start = new Date(year, month, 1).getTime();
    const end = new Date(year, month + 1, 1).getTime();
    setSessions(await getMonthSessions(db, start, end));
  }, [db, year, month]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const changeMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  };

  const swipe = Gesture.Pan().onEnd((e) => {
    if (e.translationX < -50) runOnJS(changeMonth)(1);
    else if (e.translationX > 50) runOnJS(changeMonth)(-1);
  });

  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Lunes = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const isToday = (d: number) =>
    d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const openDay = (day: number) => {
    const key = dateKey(new Date(year, month, day).getTime());
    const list = sessions[key];
    if (!list || list.length === 0) return; // los días sin entreno no hacen nada
    router.push({ pathname: '/day-detail/[date]', params: { date: key } });
  };

  const selectPicker = (m: number) => {
    setMonth(m);
    setYear(pickerYear);
    setPickerOpen(false);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => changeMonth(-1)} hitSlop={8} style={styles.navBtn}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={GymTheme.text} />
        </Pressable>
        <Pressable
          onPress={() => {
            setPickerYear(year);
            setPickerOpen(true);
          }}
          style={styles.monthLabel}>
          <Text style={styles.monthText}>
            {MONTHS[month]} {year}
          </Text>
          <MaterialCommunityIcons name="menu-down" size={20} color={GymTheme.textMuted} />
        </Pressable>
        <Pressable onPress={() => changeMonth(1)} hitSlop={8} style={styles.navBtn}>
          <MaterialCommunityIcons name="chevron-right" size={28} color={GymTheme.text} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>

      <GestureDetector gesture={swipe}>
        <ScrollView contentContainerStyle={styles.grid}>
          {cells.map((d, i) => {
            if (d == null) return <View key={`e${i}`} style={styles.cell} />;
            const key = dateKey(new Date(year, month, d).getTime());
            const daypSessions = sessions[key];
            const hasTraining = !!daypSessions?.length;
            return (
              <Pressable
                key={`d${d}`}
                style={[styles.cell, isToday(d) && styles.cellToday]}
                onPress={() => openDay(d)}>
                <Text style={[styles.dayNum, isToday(d) && styles.dayNumToday]}>{d}</Text>
                {hasTraining ? (
                  <View style={styles.marker}>
                    <Text style={styles.markerText} numberOfLines={1}>
                      {daypSessions[0].day_name}
                    </Text>
                    {daypSessions.length > 1 ? (
                      <Text style={styles.markerMore}>+{daypSessions.length - 1}</Text>
                    ) : null}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </GestureDetector>

      {/* Selector rápido de mes/año */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.yearRow}>
              <Pressable onPress={() => setPickerYear((y) => y - 1)} hitSlop={8}>
                <MaterialCommunityIcons name="chevron-left" size={26} color={GymTheme.text} />
              </Pressable>
              <Text style={styles.yearText}>{pickerYear}</Text>
              <Pressable onPress={() => setPickerYear((y) => y + 1)} hitSlop={8}>
                <MaterialCommunityIcons name="chevron-right" size={26} color={GymTheme.text} />
              </Pressable>
            </View>
            <View style={styles.monthsGrid}>
              {MONTHS.map((m, i) => {
                const selected = i === month && pickerYear === year;
                return (
                  <Pressable
                    key={m}
                    style={[styles.monthChip, selected && styles.monthChipSel]}
                    onPress={() => selectPicker(i)}>
                    <Text style={[styles.monthChipText, selected && styles.monthChipTextSel]}>
                      {m.slice(0, 3)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  navBtn: { padding: 4 },
  monthLabel: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  monthText: { color: GymTheme.text, fontSize: 22, fontWeight: '800' },
  weekRow: { flexDirection: 'row', paddingHorizontal: Spacing.sm },
  weekday: {
    flex: 1,
    textAlign: 'center',
    color: GymTheme.textMuted,
    fontSize: 12,
    fontWeight: '700',
    paddingBottom: Spacing.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.sm },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 0.82,
    padding: 3,
    borderRadius: Radius.sm,
  },
  cellToday: { backgroundColor: GymTheme.surfaceAlt, borderWidth: 1, borderColor: GymTheme.primary },
  dayNum: { color: GymTheme.text, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  dayNumToday: { color: GymTheme.primary, fontWeight: '800' },
  marker: {
    marginTop: 2,
    backgroundColor: GymTheme.activeDim,
    borderRadius: 4,
    paddingHorizontal: 2,
    paddingVertical: 1,
  },
  markerText: { color: GymTheme.active, fontSize: 9, fontWeight: '700', textAlign: 'center' },
  markerMore: { color: GymTheme.textFaint, fontSize: 8, textAlign: 'center' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  modalSheet: {
    backgroundColor: GymTheme.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: GymTheme.border,
    padding: Spacing.lg,
    width: '100%',
    gap: Spacing.lg,
  },
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  yearText: { color: GymTheme.text, fontSize: 20, fontWeight: '800' },
  monthsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'center' },
  monthChip: {
    width: '30%',
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: GymTheme.surfaceAlt,
    alignItems: 'center',
  },
  monthChipSel: { backgroundColor: GymTheme.primary },
  monthChipText: { color: GymTheme.text, fontWeight: '700' },
  monthChipTextSel: { color: '#0C0C0E' },
});
