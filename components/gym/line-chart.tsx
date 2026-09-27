import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { GymTheme } from '@/constants/gym-theme';

export interface ChartPoint {
  value: number;
  label: string; // etiqueta del eje X (fecha corta)
  tooltip?: {
    title: string;
    lines: string[];
  };
}

/**
 * Gráfico de líneas del 1RM promedio.
 * - Eje X equiespaciado (ignora el tiempo real entre sesiones).
 * - Eje Y autoescalado al rango de valores.
 */
export function LineChart({
  points,
  width,
  color = GymTheme.primary,
  valueFormatter = (value) => String(Math.round(value)),
  selectedIndex,
  onSelectionChange,
}: {
  points: ChartPoint[];
  width: number;
  color?: string;
  valueFormatter?: (value: number) => string;
  selectedIndex?: number | null;
  onSelectionChange?: (index: number | null) => void;
}) {
  const [internalSelectedIndex, setInternalSelectedIndex] = useState<number | null>(null);
  const requestedIndex = selectedIndex === undefined ? internalSelectedIndex : selectedIndex;
  const activeIndex = requestedIndex != null && requestedIndex >= 0 && requestedIndex < points.length
    ? requestedIndex
    : null;
  const [fade] = useState(() => new Animated.Value(0));
  const selectionVisible = activeIndex != null;
  useEffect(() => {
    if (!selectionVisible) {
      fade.setValue(0);
      return;
    }
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 140, useNativeDriver: true }).start();
  }, [selectionVisible, fade]);
  const setSelection = onSelectionChange ?? setInternalSelectedIndex;
  const height = 200;
  const padL = 38;
  const padR = 14;
  const padT = 16;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const values = points.map((p) => p.value);
  let min = values.length > 0 ? Math.min(...values) : 0;
  let max = values.length > 0 ? Math.max(...values) : 1;
  if (min === max) {
    // Evita división por cero con un único valor (o todos iguales).
    min = min - 1;
    max = max + 1;
  }
  const range = max - min;

  const xAt = (i: number) =>
    points.length === 1 ? padL + innerW / 2 : padL + (innerW * i) / (points.length - 1);
  const yAt = (v: number) => padT + innerH - ((v - min) / range) * innerH;

  const polyPoints = points.map((p, i) => `${xAt(i)},${yAt(p.value)}`).join(' ');

  // 3 líneas guía horizontales con su etiqueta de valor.
  const guides = [0, 0.5, 1].map((t) => {
    const v = min + range * t;
    const y = padT + innerH - t * innerH;
    return { v, y };
  });

  // Limita las etiquetas del eje X para que no se solapen.
  const maxLabels = Math.max(2, Math.floor(innerW / 56));
  const step = Math.ceil(points.length / maxLabels);

  const selected = activeIndex == null ? null : points[activeIndex];
  const tooltipWidth = Math.min(
    width - 16,
    Math.max(138, Math.min(190, 22 + Math.max(
      selected?.tooltip?.title.length ?? 0,
      ...(selected?.tooltip?.lines.map((line) => line.length) ?? [0])
    ) * 5.6))
  );
  const tooltipLeft = activeIndex == null
    ? 0
    : Math.max(8, Math.min(width - tooltipWidth - 8, xAt(activeIndex) - tooltipWidth / 2));
  const tooltipHeight = 26 + (selected?.tooltip?.lines.length ?? 0) * 14;
  const selectedY = activeIndex == null ? 0 : yAt(points[activeIndex].value);
  const preferredTooltipTop = selectedY - tooltipHeight - 10;
  const tooltipTop = preferredTooltipTop >= 4
    ? preferredTooltipTop
    : Math.min(height - tooltipHeight - 4, selectedY + 10);
  const selectAtX = (x: number) => {
    if (points.length === 0) return;
    const chartX = Math.max(padL, Math.min(width - padR, x));
    const index = points.length === 1
      ? 0
      : Math.round(((chartX - padL) / innerW) * (points.length - 1));
    setSelection(Math.max(0, Math.min(points.length - 1, index)));
  };

  if (points.length === 0) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>Sin datos suficientes para el gráfico.</Text>
      </View>
    );
  }

  return (
    <View
      style={{ width, height }}
      onTouchStart={(event) => event.stopPropagation()}
      onStartShouldSetResponderCapture={() => true}
      onMoveShouldSetResponderCapture={() => true}
      onResponderGrant={(event) => selectAtX(event.nativeEvent.locationX)}
      onResponderMove={(event) => selectAtX(event.nativeEvent.locationX)}>
    <Svg width={width} height={height}>
      {guides.map((g, idx) => (
        <Line
          key={`g${idx}`}
          x1={padL}
          y1={g.y}
          x2={width - padR}
          y2={g.y}
          stroke={GymTheme.border}
          strokeWidth={1}
        />
      ))}
      {guides.map((g, idx) => (
        <SvgText
          key={`gl${idx}`}
          x={padL - 6}
          y={g.y + 4}
          fill={GymTheme.textFaint}
          fontSize={10}
          textAnchor="end">
          {valueFormatter(g.v)}
        </SvgText>
      ))}

      <Polyline
        points={polyPoints}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {activeIndex != null ? (
        <Line
          x1={xAt(activeIndex)}
          y1={padT}
          x2={xAt(activeIndex)}
          y2={padT + innerH}
          stroke={color}
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.7}
        />
      ) : null}

      {points.map((p, i) => (
        <Circle key={`c${i}`} cx={xAt(i)} cy={yAt(p.value)} r={activeIndex === i ? 6 : 3.5}
          fill={activeIndex === i ? GymTheme.surface : color}
          stroke={activeIndex === i ? color : undefined} strokeWidth={activeIndex === i ? 2 : 0} />
      ))}

      {points.map((p, i) =>
        i % step === 0 || i === points.length - 1 ? (
          <SvgText
            key={`x${i}`}
            x={xAt(i)}
            y={height - 8}
            fill={GymTheme.textFaint}
            fontSize={9}
            textAnchor="middle">
            {p.label}
          </SvgText>
        ) : null
      )}
    </Svg>
    {selected?.tooltip ? (
      <Animated.View pointerEvents="none" style={[styles.tooltip, {
        width: tooltipWidth,
        left: tooltipLeft,
        top: tooltipTop,
        opacity: fade,
        transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }],
      }]}>
        <Text numberOfLines={1} style={styles.tooltipTitle}>{selected.tooltip.title}</Text>
        {selected.tooltip.lines.map((line, index) => <Text numberOfLines={1} key={index} style={styles.tooltipLine}>{line}</Text>)}
      </Animated.View>
    ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: GymTheme.textFaint, fontSize: 13 },
  tooltip: { position: 'absolute', backgroundColor: GymTheme.surfaceElevated,
    borderWidth: 1, borderColor: GymTheme.primaryDim, borderRadius: 9,
    paddingHorizontal: 9, paddingVertical: 6 },
  tooltipTitle: { color: GymTheme.text, fontSize: 11, fontWeight: '800', marginBottom: 1 },
  tooltipLine: { color: GymTheme.textMuted, fontSize: 10, lineHeight: 14 },
});
