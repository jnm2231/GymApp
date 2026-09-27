import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAlert } from '@/components/gym/alert';
import { Button } from '@/components/gym/ui';
import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import { useSession } from '@/context/session-context';
import { listDaysWithCount } from '@/db/days';
import {
  countPendingStravaActivities, getSeenSportTypes, getStravaMappings,
  setStravaImportFloor, setStravaMapping, type StravaMapping,
} from '@/db/strava';
import type { DayWithCount } from '@/db/types';
import {
  connectStrava, disconnectStrava, getStravaCredentials, getStravaSession,
  saveStravaCredentials, type StravaSession,
} from '@/lib/strava-auth';
import { syncStrava } from '@/lib/strava-sync';

const SPORTS = [
  'Run', 'TrailRun', 'VirtualRun', 'Walk', 'Hike', 'Ride', 'MountainBikeRide',
  'GravelRide', 'EBikeRide', 'EMountainBikeRide', 'VirtualRide', 'Swim',
  'WeightTraining', 'Workout', 'HighIntensityIntervalTraining', 'Crossfit', 'Yoga',
  'AlpineSki', 'BackcountrySki', 'Badminton', 'Basketball', 'Canoeing', 'Cricket',
  'Dance', 'Elliptical', 'Golf', 'Handcycle', 'IceSkate', 'InlineSkate', 'Kayaking',
  'Kitesurf', 'NordicSki', 'Padel', 'PhysicalTherapy', 'Pickleball', 'Pilates',
  'Racquetball', 'RockClimbing', 'RollerSki', 'Rowing', 'Sail', 'Skateboard',
  'Snowboard', 'Snowshoe', 'Soccer', 'Squash', 'StairStepper', 'StandUpPaddling',
  'Surfing', 'TableTennis', 'Tennis', 'Velomobile', 'VirtualRow', 'Volleyball',
  'Wheelchair', 'Windsurf',
];

type ImportPolicy = '90days' | 'all' | 'future';

export default function StravaSettingsScreen() {
  const db = useSQLiteContext();
  const showAlert = useAlert();
  const { refresh } = useSession();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [hasCredentials, setHasCredentials] = useState(false);
  const [session, setSession] = useState<StravaSession | null>(null);
  const [days, setDays] = useState<DayWithCount[]>([]);
  const [mappings, setMappings] = useState<StravaMapping[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [pending, setPending] = useState(0);
  const [policy, setPolicy] = useState<ImportPolicy>('90days');
  const [busy, setBusy] = useState(false);
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [showAllSports, setShowAllSports] = useState(false);

  const load = useCallback(async () => {
    const [credentials, activeSession, allDays, allMappings, seenTypes] = await Promise.all([
      getStravaCredentials(), getStravaSession(), listDaysWithCount(db),
      getStravaMappings(db), getSeenSportTypes(db),
    ]);
    setClientId(credentials?.clientId ?? '');
    setHasCredentials(!!credentials);
    setSession(activeSession);
    setDays(allDays.filter((day) => day.training_type === 'cardio'));
    setMappings(allMappings);
    setSeen(seenTypes);
    setPending(activeSession ? await countPendingStravaActivities(db, activeSession.athleteId) : 0);
  }, [db]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await action(); await load(); }
    catch (error) {
      await load();
      showAlert('Strava', error instanceof Error ? error.message : 'Ha ocurrido un error.');
    }
    finally { setBusy(false); }
  };

  const saveCredentials = () => run(async () => {
    const existing = await getStravaCredentials();
    await saveStravaCredentials({ clientId, clientSecret: clientSecret || existing?.clientSecret || '' });
    setClientSecret('');
    showAlert('Configuración guardada', 'Ya puedes conectar tu cuenta de Strava.');
  });

  const connect = () => run(async () => {
    const existing = await getStravaCredentials();
    await saveStravaCredentials({ clientId, clientSecret: clientSecret || existing?.clientSecret || '' });
    setClientSecret('');
    const now = Math.floor(Date.now() / 1000);
    const floor = policy === 'future' ? now : policy === 'all' ? 0 : now - 90 * 86400;
    await setStravaImportFloor(db, floor);
    await connectStrava();
  });

  const sync = () => run(async () => {
    const count = await syncStrava(db);
    await refresh();
    showAlert('Sincronización terminada', count > 0 ? `${count} actividades añadidas.` : 'No hay actividades nuevas asignadas.');
  });

  const disconnect = () => run(async () => {
    await disconnectStrava();
    if (session) {
      await db.runAsync(
        'DELETE FROM strava_activities WHERE athlete_id = ? AND session_id IS NULL',
        [session.athleteId]
      );
    }
    await db.runAsync("DELETE FROM settings WHERE key IN ('strava_last_sync', 'strava_import_floor')");
    setSession(null);
    showAlert('Strava desconectado', 'Las actividades ya importadas permanecen en GymApp.');
  });

  const changeMapping = (sport: string, dayId: number | null) => run(async () => {
    await setStravaMapping(db, sport, dayId);
    setSelectedSport(null);
    if (session && dayId != null) {
      const count = await syncStrava(db);
      if (count > 0) showAlert('Actividades añadidas', `${count} actividades pendientes se han guardado.`);
    }
  });

  const mappedTypes = mappings.map((item) => item.sport_type);
  const highlights = Array.from(new Set([...seen, ...mappedTypes, ...SPORTS.slice(0, 17)]));
  const sports = showAllSports ? Array.from(new Set([...highlights, ...SPORTS])) : highlights;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Strava' }} />
      <View style={styles.card}>
        <Text style={styles.title}>Conexión con Strava</Text>
        <Text style={styles.hint}>Sincroniza al abrir GymApp y cuando pulses «Sincronizar ahora». Los entrenamientos se guardan en este dispositivo.</Text>
        {Platform.OS === 'web' ? <Text style={styles.hint}>La conexión con Strava está disponible en la app móvil.</Text> : null}
        <Text style={styles.status}>{session ? `Conectado · cuenta ${session.athleteId}` : 'Sin conectar'}</Text>
        {session ? (
          <>
            <Text style={styles.hint}>{pending} actividades pendientes de asignar a un día de cardio.</Text>
            <Button title="Sincronizar ahora" loading={busy} onPress={sync} />
            <Button title="Desconectar Strava" variant="surface" disabled={busy} onPress={disconnect} />
          </>
        ) : (
          <>
            <Text style={styles.label}>ID de la aplicación de Strava</Text>
            <TextInput style={styles.input} value={clientId} onChangeText={setClientId}
              keyboardType="number-pad" placeholder="Client ID" placeholderTextColor={GymTheme.textFaint} />
            <Text style={styles.label}>Secreto de la aplicación</Text>
            <TextInput style={styles.input} value={clientSecret} onChangeText={setClientSecret}
              secureTextEntry placeholder={hasCredentials ? 'Guardado; dejar vacío para conservar' : 'Client secret'}
              placeholderTextColor={GymTheme.textFaint} />
            <Text style={styles.hint}>Crea una aplicación en Strava y configura «strava-callback» como dominio de retorno. URL de retorno: gymapp://strava-callback. El secreto se guarda en el almacén seguro del móvil para esta versión local.</Text>
            <Button title="Guardar configuración" variant="surface" disabled={busy} onPress={saveCredentials} />
            <Text style={styles.label}>Primera importación</Text>
            <View style={styles.options}>
              {([
                ['90days', 'Últimos 90 días'], ['all', 'Todo el historial'], ['future', 'Solo futuras'],
              ] as const).map(([value, label]) => (
                <Pressable key={value} style={[styles.option, policy === value && styles.optionActive]}
                  onPress={() => setPolicy(value)}>
                  <Text style={[styles.optionText, policy === value && styles.optionTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <Button title="Vincular cuenta de Strava" loading={busy} disabled={Platform.OS === 'web'} onPress={connect} />
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Actividades y días</Text>
        <Text style={styles.hint}>Asigna cada tipo de Strava a un día de cardio. Las actividades sin asignar esperan hasta que elijas uno.</Text>
        {days.length === 0 ? (
          <Button title="Crear un día de cardio" variant="surface" onPress={() => router.push('/day-form')} />
        ) : null}
        {sports.map((sport) => {
          const dayId = mappings.find((item) => item.sport_type === sport)?.day_id;
          const day = days.find((item) => item.id === dayId);
          return (
            <View key={sport} style={styles.mapping}>
              <Pressable style={styles.mappingHead} onPress={() => setSelectedSport(selectedSport === sport ? null : sport)}>
                <Text style={styles.mappingName}>{sport}</Text>
                <Text style={styles.mappingDay}>{day?.name ?? 'Sin asignar'}</Text>
                <MaterialCommunityIcons name={selectedSport === sport ? 'chevron-up' : 'chevron-down'}
                  size={20} color={GymTheme.textMuted} />
              </Pressable>
              {selectedSport === sport ? (
                <View style={styles.dayOptions}>
                  <Pressable onPress={() => changeMapping(sport, null)} disabled={busy}>
                    <Text style={styles.dayOption}>Sin asignar</Text>
                  </Pressable>
                  {days.map((item) => (
                    <Pressable key={item.id} onPress={() => changeMapping(sport, item.id)} disabled={busy}>
                      <Text style={styles.dayOption}>{item.name}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
        <Button title={showAllSports ? 'Mostrar menos tipos' : 'Mostrar todos los tipos de Strava'}
          variant="ghost" onPress={() => setShowAllSports(!showAllSports)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: GymTheme.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg },
  card: { backgroundColor: GymTheme.surface, borderColor: GymTheme.border, borderWidth: 1,
    borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md },
  title: { color: GymTheme.text, fontSize: 18, fontWeight: '800' },
  hint: { color: GymTheme.textMuted, fontSize: 13, lineHeight: 19 },
  status: { color: GymTheme.primary, fontSize: 14, fontWeight: '700' },
  label: { color: GymTheme.text, fontWeight: '700', fontSize: 14 },
  input: { backgroundColor: GymTheme.inputBg, borderColor: GymTheme.border, borderWidth: 1,
    borderRadius: Radius.md, color: GymTheme.text, padding: Spacing.md, fontSize: 15 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  option: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.pill,
    backgroundColor: GymTheme.inputBg, borderColor: GymTheme.border, borderWidth: 1 },
  optionActive: { borderColor: GymTheme.primary, backgroundColor: GymTheme.primaryDim },
  optionText: { color: GymTheme.textMuted, fontWeight: '700', fontSize: 12 },
  optionTextActive: { color: GymTheme.primary },
  mapping: { borderColor: GymTheme.border, borderWidth: 1, borderRadius: Radius.md, overflow: 'hidden' },
  mappingHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  mappingName: { color: GymTheme.text, flex: 1, fontWeight: '700' },
  mappingDay: { color: GymTheme.primary, fontSize: 12, maxWidth: 125 },
  dayOptions: { backgroundColor: GymTheme.inputBg, paddingHorizontal: Spacing.md },
  dayOption: { color: GymTheme.text, paddingVertical: Spacing.md, borderTopColor: GymTheme.border,
    borderTopWidth: 1 },
});
