import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { Screen } from '@/components/gym/ui';
import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import { CalendarSession, getMonthSessions } from '@/db/calendar';
import { dateKey } from '@/lib/format';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const RANGE = 120; // meses a cada lado del mes actual

type Sessions = Record<string, CalendarSession[]>;
type MonthRef = { year: number; month: number };

/** Suma `delta` meses a (year, month) controlando el cambio de año. */
function addMonths(year: number, month: number, delta: number): MonthRef {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

export default function CalendarioScreen() {
  const db = useSQLiteContext();
  const { width } = useWindowDimensions();
  const today = new Date();
  const listRef = useRef<FlatList<MonthRef>>(null);

  // Páginas reales de meses (sin reciclar): así el paginado es nativo y no hay
  // que recolocar nada, lo que elimina cualquier parpadeo al cambiar de mes.
  const pages = useMemo<MonthRef[]>(() => {
    const base = addMonths(today.getFullYear(), today.getMonth(), -RANGE);
    return Array.from({ length: RANGE * 2 + 1 }, (_, i) => addMonths(base.year, base.month, i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today.getFullYear(), today.getMonth()]);

  const [index, setIndex] = useState(RANGE); // arranca en el mes actual
  const [sessions, setSessions] = useState<Sessions>({});
  const [vh, setVh] = useState(0); // alto disponible para la cuadrícula
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(today.getFullYear());

  const current = pages[index] ?? pages[RANGE];

  // Carga los tres meses alrededor del visible y los acumula en el mapa.
  const load = useCallback(async () => {
    const cur = pages[index] ?? pages[RANGE];
    const prev = addMonths(cur.year, cur.month, -1);
    const next = addMonths(cur.year, cur.month, 2);
    const start = new Date(prev.year, prev.month, 1).getTime();
    const end = new Date(next.year, next.month, 1).getTime();
    const data = await getMonthSessions(db, start, end);
    setSessions((prevMap) => ({ ...prevMap, ...data }));
  }, [db, index, pages]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index && i >= 0 && i < pages.length) setIndex(i);
  };

  const goTo = (delta: number) => {
    const target = Math.min(pages.length - 1, Math.max(0, index + delta));
    if (target === index) return;
    setIndex(target);
    listRef.current?.scrollToIndex({ index: target, animated: true });
  };

  const openDay = (y: number, m: number, day: number) => {
    const key = dateKey(new Date(y, m, day).getTime());
    const list = sessions[key];
    if (!list || list.length === 0) return; // los días sin entreno no hacen nada
    router.push({ pathname: '/day-detail/[date]', params: { date: key } });
  };

  const selectPicker = (m: number) => {
    const target = (pickerYear * 12 + m) - (pages[0].year * 12 + pages[0].month);
    const clamped = Math.min(pages.length - 1, Math.max(0, target));
    setPickerOpen(false);
    setIndex(clamped);
    listRef.current?.scrollToIndex({ index: clamped, animated: false });
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => goTo(-1)} hitSlop={8} style={styles.navBtn}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={GymTheme.text} />
        </Pressable>
        <Pressable
          onPress={() => {
            setPickerYear(current.year);
            setPickerOpen(true);
          }}
          style={styles.monthLabel}>
          <Text style={styles.monthText}>
            {MONTHS[current.month]} {current.year}
          </Text>
          <MaterialCommunityIcons name="menu-down" size={20} color={GymTheme.textMuted} />
        </Pressable>
        <Pressable onPress={() => goTo(1)} hitSlop={8} style={styles.navBtn}>
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

      <View style={styles.listWrap} onLayout={(e) => setVh(e.nativeEvent.layout.height)}>
        {vh > 0 ? (
          <FlatList
            ref={listRef}
            data={pages}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={RANGE}
            keyExtractor={(p) => `${p.year}-${p.month}`}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={onMomentumEnd}
            onScrollToIndexFailed={({ index: i }) => {
              listRef.current?.scrollToOffset({ offset: i * width, animated: false });
            }}
            windowSize={3}
            initialNumToRender={1}
            maxToRenderPerBatch={3}
            removeClippedSubviews
            renderItem={({ item }) => (
              <MonthGrid
                year={item.year}
                month={item.month}
                sessions={sessions}
                today={today}
                width={width}
                height={vh}
                onPressDay={openDay}
              />
            )}
          />
        ) : null}
      </View>

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
                const selected = i === current.month && pickerYear === current.year;
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

/** Cuadrícula de un mes concreto (una página del calendario). */
function MonthGrid({
  year,
  month,
  sessions,
  today,
  width,
  height,
  onPressDay,
}: {
  year: number;
  month: number;
  sessions: Sessions;
  today: Date;
  width: number;
  height: number;
  onPressDay: (year: number, month: number, day: number) => void;
}) {
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Lunes = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const isToday = (d: number) =>
    d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  // Cuántos marcadores caben en una celda según el alto disponible. Si hay más
  // tipos de día de los que caben, el último hueco se usa para el "+N más".
  const numWeeks = weeks.length || 1;
  const weekH = (height - Spacing.md - (numWeeks - 1) * CELL_GAP) / numWeeks;
  const markerAreaH = weekH - 34; // paddingTop(5) + nº de día(26) + paddingBottom(3)
  const maxMarkers = Math.max(1, Math.floor((markerAreaH + MARKER_GAP) / (MARKER_H + MARKER_GAP)));

  return (
    <View style={[styles.grid, { width, height }]}>
      {weeks.map((week, wi) => (
        <View key={`w${wi}`} style={styles.weekCells}>
          {week.map((d, di) => {
            if (d == null) return <View key={`e${wi}-${di}`} style={styles.cellEmpty} />;
            const key = dateKey(new Date(year, month, d).getTime());
            const list = sessions[key] ?? [];
            const hasTraining = list.length > 0;
            const todayCell = isToday(d);
            // Un recuadro por tipo de día; si no caben todos, el último es "+N más".
            const visible = list.length > maxMarkers ? list.slice(0, Math.max(1, maxMarkers - 1)) : list;
            const moreCount = list.length - visible.length;
            return (
              <Pressable
                key={`d${d}`}
                style={[styles.cell, hasTraining && styles.cellTraining, todayCell && styles.cellToday]}
                onPress={() => onPressDay(year, month, d)}>
                <View style={[styles.dayNumWrap, todayCell && styles.dayNumWrapToday]}>
                  <Text style={[styles.dayNum, todayCell && styles.dayNumToday]}>{d}</Text>
                </View>
                {hasTraining ? (
                  <View style={styles.markers}>
                    {visible.map((s, idx) => (
                      <View key={idx} style={styles.mk}>
                        <Text style={styles.mkText} numberOfLines={1}>
                          {s.day_name}
                        </Text>
                      </View>
                    ))}
                    {moreCount > 0 ? <Text style={styles.mkMore}>+{moreCount} más</Text> : null}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const CELL_GAP = 6;
const MARKER_H = 15; // alto aproximado de cada recuadro de tipo de día
const MARKER_GAP = 2;

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
  weekRow: { flexDirection: 'row', paddingHorizontal: Spacing.md, gap: CELL_GAP },
  weekday: {
    flex: 1,
    textAlign: 'center',
    color: GymTheme.textMuted,
    fontSize: 12,
    fontWeight: '700',
    paddingBottom: Spacing.sm,
  },
  listWrap: { flex: 1 },
  grid: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: CELL_GAP },
  weekCells: { flex: 1, flexDirection: 'row', gap: CELL_GAP },
  cell: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: GymTheme.surface,
    borderWidth: 1,
    borderColor: GymTheme.border,
    paddingTop: 5,
    paddingHorizontal: 3,
    paddingBottom: 3,
    alignItems: 'center',
    overflow: 'hidden',
  },
  cellEmpty: { flex: 1 },
  cellTraining: { borderColor: GymTheme.activeDim, backgroundColor: 'rgba(51,209,122,0.07)' },
  cellToday: { borderColor: GymTheme.primary, borderWidth: 2, backgroundColor: GymTheme.surfaceAlt },
  dayNumWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumWrapToday: { backgroundColor: GymTheme.primary },
  dayNum: { color: GymTheme.text, fontSize: 15, fontWeight: '600' },
  dayNumToday: { color: '#0C0C0E', fontWeight: '800' },
  markers: { alignSelf: 'stretch', marginTop: 2, gap: MARKER_GAP },
  mk: {
    backgroundColor: GymTheme.activeDim,
    borderRadius: 5,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  mkText: { color: GymTheme.active, fontSize: 9.5, fontWeight: '700', textAlign: 'center' },
  mkMore: { color: GymTheme.textFaint, fontSize: 9, fontWeight: '600', textAlign: 'center' },
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
