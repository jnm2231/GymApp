import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/gym/ui';
import { GymTheme, Spacing } from '@/constants/gym-theme';
import { completeStravaConnection } from '@/lib/strava-auth';
import { syncStrava } from '@/lib/strava-sync';

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function StravaCallbackScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{
    state?: string; code?: string; scope?: string; error?: string;
  }>();
  const started = useRef(false);
  const mounted = useRef(false);
  const [message, setMessage] = useState('Terminando la vinculación con Strava…');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    mounted.current = true;
    if (started.current) return () => { mounted.current = false; };
    started.current = true;
    void (async () => {
      try {
        await completeStravaConnection({
          state: single(params.state), code: single(params.code),
          scope: single(params.scope), error: single(params.error),
        });
        if (!mounted.current) return;
        setMessage('Cuenta vinculada. Sincronizando actividades…');
        await syncStrava(db);
        if (mounted.current) router.replace('/strava');
      } catch (error) {
        if (!mounted.current) return;
        setMessage(error instanceof Error ? error.message : 'No se pudo completar la vinculación.');
        setFailed(true);
      }
    })();
    return () => { mounted.current = false; };
  }, [db, params.state, params.code, params.scope, params.error]);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.content}>
        {!failed ? <ActivityIndicator color={GymTheme.primary} size="large" /> : null}
        <Text style={styles.message}>{message}</Text>
        {failed ? <Button title="Volver a Strava" onPress={() => router.replace('/strava')} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: Spacing.xl,
    backgroundColor: GymTheme.background },
  content: { gap: Spacing.lg },
  message: { color: GymTheme.text, textAlign: 'center', fontSize: 16 },
});
