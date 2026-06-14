import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';

const AnimatedIcon = Animated.createAnimatedComponent(MaterialCommunityIcons);

interface Props {
  title: string;
  onPress: () => void | Promise<void>;
  style?: StyleProp<ViewStyle>;
}

/**
 * Botón de guardar con feedback animado: al confirmar el guardado el botón se
 * tiñe de verde y vuelve progresivamente a su color, mientras un tick aparece
 * JUNTO al texto (sin taparlo), da un par de botecitos «como un muñequito» y se
 * queda un rato antes de desvanecerse suavemente.
 */
export function SaveButton({ title, onPress, style }: Props) {
  const [busy, setBusy] = useState(false);
  const green = useSharedValue(0); // 0 = superficie, 1 = verde
  const tickOpacity = useSharedValue(0);
  const tickScale = useSharedValue(0);
  const tickY = useSharedValue(0); // bote vertical
  const tickRot = useSharedValue(0); // balanceo (grados)

  const playSuccess = () => {
    // Botón: verde, se mantiene un momento y vuelve progresivamente.
    green.value = withSequence(
      withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) }),
      withDelay(950, withTiming(0, { duration: 650, easing: Easing.in(Easing.quad) }))
    );

    // Tick: aparece, aguanta visible un buen rato y se desvanece suave.
    tickOpacity.value = withSequence(
      withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
      withDelay(1100, withTiming(0, { duration: 420, easing: Easing.in(Easing.quad) }))
    );

    // Entrada con rebote y luego asentado.
    tickScale.value = 0;
    tickScale.value = withSequence(
      withTiming(1.3, { duration: 220, easing: Easing.out(Easing.back(3)) }),
      withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) })
    );

    // Botecitos verticales tipo muñequito (suaves y decrecientes).
    tickY.value = 0;
    tickY.value = withSequence(
      withTiming(-6, { duration: 200, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) }),
      withDelay(120, withTiming(-4, { duration: 180, easing: Easing.out(Easing.quad) })),
      withTiming(0, { duration: 180, easing: Easing.in(Easing.quad) }),
      withDelay(160, withTiming(-2, { duration: 160, easing: Easing.out(Easing.quad) })),
      withTiming(0, { duration: 160, easing: Easing.in(Easing.quad) })
    );

    // Balanceo lateral acompañando los botes.
    tickRot.value = 0;
    tickRot.value = withSequence(
      withTiming(-12, { duration: 200, easing: Easing.inOut(Easing.quad) }),
      withTiming(10, { duration: 220, easing: Easing.inOut(Easing.quad) }),
      withTiming(-7, { duration: 200, easing: Easing.inOut(Easing.quad) }),
      withTiming(5, { duration: 180, easing: Easing.inOut(Easing.quad) }),
      withTiming(0, { duration: 180, easing: Easing.inOut(Easing.quad) })
    );
  };

  const handlePress = async () => {
    if (busy) return;
    try {
      setBusy(true);
      await onPress();
      playSuccess();
    } finally {
      setBusy(false);
    }
  };

  const containerStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(green.value, [0, 1], [GymTheme.surfaceElevated, GymTheme.active]),
    borderColor: interpolateColor(green.value, [0, 1], [GymTheme.border, GymTheme.active]),
  }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(green.value, [0, 1], [GymTheme.text, '#06210F']),
  }));
  const tickStyle = useAnimatedStyle(() => ({
    opacity: tickOpacity.value,
    transform: [
      { translateY: tickY.value },
      { rotate: `${tickRot.value}deg` },
      { scale: tickScale.value },
    ],
  }));

  return (
    <Pressable onPress={handlePress} disabled={busy} style={style}>
      {({ pressed }) => (
        <Animated.View style={[styles.button, containerStyle, pressed && styles.pressed]}>
          <Animated.Text style={[styles.text, labelStyle]}>{title}</Animated.Text>
          <View style={styles.tickSlot} pointerEvents="none">
            <AnimatedIcon name="check-circle" size={24} color={GymTheme.white} style={tickStyle} />
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  pressed: { opacity: 0.85 },
  text: { fontWeight: '700', fontSize: 15 },
  // Hueco fijo a la derecha del texto para que éste no se desplace.
  tickSlot: { width: 26, height: 24, alignItems: 'center', justifyContent: 'center' },
});
