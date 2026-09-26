import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
}: {
  points: ChartPoint[];
  width: number;
  color?: string;
  valueFormatter?: (value: number) => string;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
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

  const selected = selectedIndex == null ? null : points[selectedIndex];
  const tooltipWidth = Math.min(190, width - 16);
  const tooltipLeft = selectedIndex == null
    ? 0
    : Math.max(8, Math.min(width - tooltipWidth - 8, xAt(selectedIndex) - tooltipWidth / 2));
  const tooltipHeight = 64;
  const selectedY = selectedIndex == null ? 0 : yAt(points[selectedIndex].value);
  const preferredTooltipTop = selectedY - tooltipHeight - 12;
  const tooltipTop = preferredTooltipTop >= 8
    ? preferredTooltipTop
    : Math.min(height - tooltipHeight - 8, selectedY + 12);
  const selectAtX = (x: number) => {
    if (points.length === 0) return;
    const chartX = Math.max(padL, Math.min(width - padR, x));
    const index = points.length === 1
      ? 0
      : Math.round(((chartX - padL) / innerW) * (points.length - 1));
    setSelectedIndex(Math.max(0, Math.min(points.length - 1, index)));
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

      {selectedIndex != null ? (
        <Line
          x1={xAt(selectedIndex)}
          y1={padT}
          x2={xAt(selectedIndex)}
          y2={padT + innerH}
          stroke={color}
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.7}
        />
      ) : null}

      {points.map((p, i) => (
        <Circle key={`c${i}`} cx={xAt(i)} cy={yAt(p.value)} r={selectedIndex === i ? 6 : 3.5}
          fill={selectedIndex === i ? GymTheme.surface : color}
          stroke={selectedIndex === i ? color : undefined} strokeWidth={selectedIndex === i ? 2 : 0} />
      ))}

      {points.map((p, i) => p.tooltip ? (
        <Circle key={`hit${i}`} cx={xAt(i)} cy={yAt(p.value)} r={14} fill="transparent"
          onPress={() => setSelectedIndex((current) => current === i ? null : i)} />
      ) : null)}

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
      <View pointerEvents="none" style={[styles.tooltip, { width: tooltipWidth, left: tooltipLeft, top: tooltipTop }]}>
        <Text numberOfLines={1} style={styles.tooltipTitle}>{selected.tooltip.title}</Text>
        {selected.tooltip.lines.map((line, index) => <Text numberOfLines={1} key={index} style={styles.tooltipLine}>{line}</Text>)}
      </View>
    ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: GymTheme.textFaint, fontSize: 13 },
  tooltip: { position: 'absolute', top: 8, backgroundColor: GymTheme.surfaceElevated,
    borderWidth: 1, borderColor: GymTheme.primary, borderRadius: 10, paddingHorizontal: 11,
    paddingVertical: 8, minHeight: 64 },
  tooltipTitle: { color: GymTheme.text, fontSize: 12, fontWeight: '800', marginBottom: 2 },
  tooltipLine: { color: GymTheme.textMuted, fontSize: 11, lineHeight: 15, flexShrink: 0 },
});
