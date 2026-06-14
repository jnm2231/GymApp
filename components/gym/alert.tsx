import { createContext, useCallback, useContext, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';

export type AlertButtonStyle = 'default' | 'cancel' | 'destructive';

export interface AlertButton {
  text: string;
  style?: AlertButtonStyle;
  onPress?: () => void;
}

/** API imperativa tipo `Alert.alert(titulo, mensaje?, botones?)`, pero con estilo propio. */
export type ShowAlert = (title: string, message?: string, buttons?: AlertButton[]) => void;

interface AlertState {
  title: string;
  message?: string;
  buttons: AlertButton[];
}

const AlertContext = createContext<ShowAlert | null>(null);

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AlertState | null>(null);

  const show = useCallback<ShowAlert>((title, message, buttons) => {
    setState({
      title,
      message,
      buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
    });
  }, []);

  const close = useCallback(() => setState(null), []);

  const handlePress = (b: AlertButton) => {
    close();
    b.onPress?.();
  };

  const stacked = (state?.buttons.length ?? 0) > 2;

  return (
    <AlertContext.Provider value={show}>
      {children}
      <Modal
        visible={state != null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={close}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>{state?.title}</Text>
            {state?.message ? <Text style={styles.message}>{state.message}</Text> : null}
            <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
              {state?.buttons.map((b, i) => {
                const cancel = b.style === 'cancel';
                const destructive = b.style === 'destructive';
                return (
                  <Pressable
                    key={i}
                    onPress={() => handlePress(b)}
                    style={({ pressed }) => [
                      styles.btn,
                      cancel ? styles.btnCancel : destructive ? styles.btnDestructive : styles.btnDefault,
                      stacked && styles.btnStacked,
                      pressed && styles.btnPressed,
                    ]}>
                    <Text
                      style={[
                        styles.btnText,
                        cancel
                          ? styles.btnTextCancel
                          : destructive
                            ? styles.btnTextDestructive
                            : styles.btnTextDefault,
                      ]}>
                      {b.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </AlertContext.Provider>
  );
}

export function useAlert(): ShowAlert {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAlert debe usarse dentro de <AlertProvider>');
  return ctx;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: GymTheme.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: GymTheme.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  title: { color: GymTheme.text, fontSize: 18, fontWeight: '800' },
  message: { color: GymTheme.textMuted, fontSize: 14, lineHeight: 20 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.sm },
  buttonsStacked: { flexDirection: 'column-reverse', alignItems: 'stretch' },
  btn: {
    borderRadius: Radius.md,
    paddingVertical: 11,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnStacked: { paddingVertical: 13 },
  btnPressed: { opacity: 0.8 },
  btnDefault: { backgroundColor: GymTheme.primary },
  btnCancel: { backgroundColor: GymTheme.surfaceElevated },
  btnDestructive: { backgroundColor: GymTheme.danger },
  btnText: { fontSize: 15, fontWeight: '800' },
  btnTextDefault: { color: '#0C0C0E' },
  btnTextCancel: { color: GymTheme.text },
  btnTextDestructive: { color: GymTheme.white },
});
