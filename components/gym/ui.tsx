import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';

export function Screen({
  children,
  style,
  edges = ['top'],
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}) {
  return (
    <SafeAreaView style={[styles.screen, style]} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

export function ScreenTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.titleRow}>
      <Text style={styles.title}>{children}</Text>
      {right}
    </View>
  );
}

export function Card({
  children,
  style,
  borderColor,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  borderColor?: string;
}) {
  return (
    <View style={[styles.card, borderColor ? { borderColor, borderWidth: 2 } : null, style]}>
      {children}
    </View>
  );
}

type ButtonVariant = 'primary' | 'active' | 'surface' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  textStyle,
  left,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  left?: React.ReactNode;
}) {
  const bg: Record<ButtonVariant, string> = {
    primary: GymTheme.primary,
    active: GymTheme.active,
    surface: GymTheme.surfaceElevated,
    danger: GymTheme.danger,
    ghost: 'transparent',
  };
  const fg: Record<ButtonVariant, string> = {
    primary: '#0C0C0E',
    active: '#06210F',
    surface: GymTheme.text,
    danger: GymTheme.white,
    ghost: GymTheme.textMuted,
  };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg[variant], opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        variant === 'ghost' && styles.ghostBorder,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <View style={styles.buttonInner}>
          {left}
          <Text style={[styles.buttonText, { color: fg[variant] }, textStyle]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={GymTheme.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: GymTheme.background },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  title: { color: GymTheme.text, fontSize: 28, fontWeight: '800', letterSpacing: 0.3 },
  card: {
    backgroundColor: GymTheme.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: GymTheme.border,
  },
  button: {
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  buttonText: { fontWeight: '700', fontSize: 15 },
  ghostBorder: { borderWidth: 1, borderColor: GymTheme.border },
  empty: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl, gap: Spacing.sm },
  emptyTitle: { color: GymTheme.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptySub: { color: GymTheme.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: GymTheme.background },
});
