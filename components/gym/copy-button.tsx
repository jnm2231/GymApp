import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';

const AnimatedIcon = Animated.createAnimatedComponent(MaterialCommunityIcons);

interface Props {
  /** Ejecuta la copia. Devuelve `true` si se copió algo (dispara la animación). */
  onPress: () => boolean | Promise<boolean>;
  style?: StyleProp<ViewStyle>;
}

/**
 * Botón de copiar con feedback animado propio (distinto al de guardar): el botón
 * da un pequeño «pop», un icono fantasma de copia se eleva y se desvanece (como
 * si el contenido se llevara al portapapeles) y un tick se «sella» en su sitio.
 * La etiqueta cambia a «¡Copiado!» durante un instante. Comparte la misma caja
 * que el botón de guardar para que tengan exactamente el mismo tamaño.
 */
export function CopyButton({ onPress, style }: Props) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const pop = useSharedValue(1);
  const ghostY = useSharedValue(0);
  const ghostOpacity = useSharedValue(0);
  const ghostScale = useSharedValue(1);
  const checkScale = useSharedValue(0);

  const play = () => {
    // «Pop» de todo el botón.
    pop.value = withSequence(
      withTiming(0.96, { duration: 90, easing: Easing.out(Easing.quad) }),
      withTiming(1.03, { duration: 130, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 130, easing: Easing.out(Easing.quad) })
    );
    // Icono fantasma que se eleva y se desvanece (metáfora de copiar).
    ghostY.value = 0;
    ghostScale.value = 1;
    ghostOpacity.value = withSequence(
      withTiming(0.9, { duration: 90 }),
      withTiming(0, { duration: 380, easing: Easing.in(Easing.quad) })
    );
    ghostY.value = withTiming(-24, { duration: 470, easing: Easing.out(Easing.quad) });
    ghostScale.value = withTiming(1.3, { duration: 470, easing: Easing.out(Easing.quad) });
    // El tick se «sella» con un pequeño rebote.
    checkScale.value = 0;
    checkScale.value = withSequence(
      withDelay(110, withTiming(1.25, { duration: 200, easing: Easing.out(Easing.back(3)) })),
      withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) })
    );
  };

  const handlePress = async () => {
    if (busy) return;
    try {
      setBusy(true);
      const ok = await onPress();
      if (ok === false) return;
      setDone(true);
      play();
      setTimeout(() => setDone(false), 1300);
    } finally {
      setBusy(false);
    }
  };

  const containerStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const ghostStyle = useAnimatedStyle(() => ({
    opacity: ghostOpacity.value,
    transform: [{ translateY: ghostY.value }, { scale: ghostScale.value }],
  }));
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: checkScale.value }] }));

  return (
    <Pressable onPress={handlePress} disabled={busy} style={style}>
      {({ pressed }) => (
        <Animated.View style={[styles.button, containerStyle, pressed && styles.pressed]}>
          <View style={styles.iconWrap}>
            {done ? (
              <AnimatedIcon name="check" size={18} color={GymTheme.active} style={checkStyle} />
            ) : (
              <MaterialCommunityIcons name="content-copy" size={16} color={GymTheme.text} />
            )}
            <AnimatedIcon
              name="content-copy"
              size={16}
              color={GymTheme.primary}
              style={[styles.ghost, ghostStyle]}
            />
          </View>
          <Animated.Text style={[styles.text, done && styles.textDone]}>
            {done ? '¡Copiado!' : 'Copiar'}
          </Animated.Text>
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Misma caja que SaveButton para igualar tamaños.
  button: {
    flexDirection: 'row',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: GymTheme.border,
    backgroundColor: GymTheme.surfaceElevated,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  pressed: { opacity: 0.85 },
  iconWrap: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  ghost: { position: 'absolute' },
  text: { color: GymTheme.text, fontWeight: '700', fontSize: 15 },
  textDone: { color: GymTheme.active },
});
