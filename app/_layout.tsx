import { Stack } from 'expo-router';
import { DarkTheme, ThemeProvider } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import { Suspense, type ReactNode } from 'react';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import 'react-native-reanimated';

import { AlertProvider } from '@/components/gym/alert';
import { Loading } from '@/components/gym/ui';
import { GymTheme } from '@/constants/gym-theme';
import { SessionProvider } from '@/context/session-context';
import { DATABASE_NAME, initDatabase } from '@/db/schema';
import {
  subscribeToWorkoutNotificationResponses,
} from '@/lib/workout-notifications';

export const unstable_settings = {
  anchor: '(tabs)',
};

const NavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: GymTheme.background,
    card: GymTheme.surface,
    text: GymTheme.text,
    border: GymTheme.border,
    primary: GymTheme.primary,
    notification: GymTheme.primary,
  },
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: GymTheme.background }}>
      <SafeAreaProvider style={{ backgroundColor: GymTheme.background }}>
        <Suspense fallback={<Loading />}>
          <SQLiteProvider databaseName={DATABASE_NAME} onInit={initDatabase} useSuspense>
            <NotificationBridge>
              <SessionProvider>
              <ThemeProvider value={NavTheme}>
                <AlertProvider>
                  <Stack
                    screenOptions={{
                      headerStyle: { backgroundColor: GymTheme.background },
                      headerTintColor: GymTheme.text,
                      contentStyle: { backgroundColor: GymTheme.background },
                    }}>
                    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                    <Stack.Screen
                      name="day-form"
                      options={{ presentation: 'modal', title: 'Día de entrenamiento' }}
                    />
                    <Stack.Screen name="exercise/[id]" options={{ title: 'Histórico' }} />
                    <Stack.Screen name="day-detail/[date]" options={{ title: 'Detalle del día' }} />
                    <Stack.Screen name="patch-notes" options={{ title: 'Historial de versiones' }} />
                  </Stack>
                  <StatusBar style="light" />
                </AlertProvider>
              </ThemeProvider>
              </SessionProvider>
            </NotificationBridge>
          </SQLiteProvider>
        </Suspense>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function NotificationBridge({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();

  useEffect(() => {
    let disposed = false;
    let unsubscribe = () => {};
    void subscribeToWorkoutNotificationResponses(db).then((removeListener) => {
      if (disposed) removeListener();
      else unsubscribe = removeListener;
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [db]);

  return <>{children}</>;
}
