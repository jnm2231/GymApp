import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { GymTheme } from '@/constants/gym-theme';

export interface ChartPoint {
  value: number;
  label: string; // etiqueta del eje X (fecha corta)
}

/**
 * Gráfico de líneas del 1RM promedio.
 * - Eje X equiespaciado (ignora el tiempo real entre sesiones).
 * - Eje Y autoescalado al rango de valores.
 */
export function LineChart({ points, width }: { points: ChartPoint[]; width: number }) {
  const height = 200;
  const padL = 38;
  const padR = 14;
  const padT = 16;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  if (points.length === 0) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>Sin datos suficientes para el gráfico.</Text>
      </View>
    );
  }

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
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

  return (
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
          {Math.round(g.v)}
        </SvgText>
      ))}

      <Polyline
        points={polyPoints}
        fill="none"
        stroke={GymTheme.primary}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {points.map((p, i) => (
        <Circle key={`c${i}`} cx={xAt(i)} cy={yAt(p.value)} r={3.5} fill={GymTheme.primary} />
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
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: GymTheme.textFaint, fontSize: 13 },
});
