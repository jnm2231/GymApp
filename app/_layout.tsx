import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteProvider } from 'expo-sqlite';
import 'react-native-reanimated';

import { Loading } from '@/components/gym/ui';
import { GymTheme } from '@/constants/gym-theme';
import { SessionProvider } from '@/context/session-context';
import { DATABASE_NAME, initDatabase } from '@/db/schema';

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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Suspense fallback={<Loading />}>
          <SQLiteProvider databaseName={DATABASE_NAME} onInit={initDatabase} useSuspense>
            <SessionProvider>
              <ThemeProvider value={NavTheme}>
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
                  <Stack.Screen
                    name="session"
                    options={{ headerShown: false, gestureEnabled: false }}
                  />
                  <Stack.Screen name="exercise/[id]" options={{ title: 'Histórico' }} />
                  <Stack.Screen name="day-detail/[date]" options={{ title: 'Detalle del día' }} />
                </Stack>
                <StatusBar style="light" />
              </ThemeProvider>
            </SessionProvider>
          </SQLiteProvider>
        </Suspense>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
