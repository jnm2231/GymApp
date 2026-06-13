import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExerciseBlock } from '@/components/gym/exercise-block';
import { Loading, Screen } from '@/components/gym/ui';
import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import { useSession } from '@/context/session-context';
import { listExercises } from '@/db/exercises';
import {
  addAdditionalExercise,
  discardSession,
  finishSession,
  getActiveSession,
  getSessionExercisesWithSets,
  pauseSession,
} from '@/db/sessions';
import type { Exercise, Session, SessionExerciseWithSets } from '@/db/types';
import { formatHM } from '@/lib/format';

export default function SessionScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { refresh } = useSession();

  const [session, setSession] = useState<Session | null>(null);
  const [blocks, setBlocks] = useState<SessionExerciseWithSets[]>([]);
  const [focusedId, setFocusedId] = useState<number | null>(null); // ejercicio en verde (en curso)
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const initRef = useRef(false);

  const load = useCallback(async () => {
    const s = await getActiveSession(db);
    if (!s) {
      setSession(null);
      setLoading(false);
      return;
    }
    setSession(s);
    const bs = await getSessionExercisesWithSets(db, s.id);
    setBlocks(bs);

    // Gestión del foco (qué ejercicio está en verde):
    // - se conserva el elegido por el usuario mientras siga sin terminar;
    // - en la primera carga se enfoca automáticamente el primero pendiente;
    // - si el enfocado se termina (o se pospone), queda sin foco para elegir otro.
    setFocusedId((prev) => {
      const stillValid = prev != null && bs.some((b) => b.id === prev && b.status !== 'done');
      if (stillValid) return prev;
      if (!initRef.current) {
        const first = bs.find((b) => b.status !== 'done');
        return first ? first.id : null;
      }
      return null;
    });
    initRef.current = true;
    setLoading(false);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) return <Loading />;

  // No hay sesión activa: volver al inicio.
  if (!session) {
    return (
      <Screen>
        <View style={styles.noSession}>
          <Text style={styles.noSessionText}>No hay ninguna sesión activa.</Text>
          <Pressable style={styles.linkBtn} onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.linkText}>Volver al inicio</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const allDone = blocks.length > 0 && blocks.every((b) => b.status === 'done');
  const pendingCount = blocks.filter((b) => b.status !== 'done').length;

  const handlePause = async () => {
    await pauseSession(db, session.id);
    await refresh();
    router.replace('/(tabs)');
  };

  const handleFinish = () => {
    Alert.alert('Terminar sesión', '¿Finalizar y guardar el entrenamiento en el histórico?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Finalizar',
        onPress: async () => {
          await finishSession(db, session.id);
          await refresh();
          router.replace('/(tabs)');
        },
      },
    ]);
  };

  const handleDiscard = () => {
    Alert.alert('Descartar sesión', 'Se borrará esta sesión sin guardarla. ¿Seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Descartar',
        style: 'destructive',
        onPress: async () => {
          await discardSession(db, session.id);
          await refresh();
          router.replace('/(tabs)');
        },
      },
    ]);
  };

  const openPicker = async () => {
    setCatalog(await listExercises(db));
    setPickerOpen(true);
  };

  const pickAdditional = async (ex: Exercise) => {
    await addAdditionalExercise(db, session.id, ex.id, ex.name, ex.es_corporal === 1);
    setPickerOpen(false);
    await load();
  };

  return (
    <Screen edges={['top']}>
      {/* Cabecera */}
      <View style={styles.header}>
        <Pressable onPress={handlePause} hitSlop={8} style={styles.headerIcon}>
          <MaterialCommunityIcons name="chevron-down" size={26} color={GymTheme.textMuted} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.dayName}>{session.day_name}</Text>
          <Text style={styles.startedAt}>Inicio · {formatHM(session.start_ts)}</Text>
        </View>
        <Pressable onPress={handleDiscard} hitSlop={8} style={styles.headerIcon}>
          <MaterialCommunityIcons name="trash-can-outline" size={22} color={GymTheme.danger} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 160 }]}>
        {focusedId == null && pendingCount > 0 ? (
          <View style={styles.pickHint}>
            <MaterialCommunityIcons name="gesture-tap" size={18} color={GymTheme.primary} />
            <Text style={styles.pickHintText}>Elige el ejercicio que vas a realizar</Text>
          </View>
        ) : null}

        {blocks.map((b) => (
          <ExerciseBlock
            key={b.id}
            block={b}
            isCurrent={b.id === focusedId}
            sessionId={session.id}
            onChanged={load}
            onOpenHistory={(exId) => router.push({ pathname: '/exercise/[id]', params: { id: String(exId) } })}
            onFocus={() => setFocusedId(b.id)}
            onPostpone={() => setFocusedId(null)}
          />
        ))}

        {allDone ? (
          <View style={styles.allDone}>
            <MaterialCommunityIcons name="check-all" size={20} color={GymTheme.active} />
            <Text style={styles.allDoneText}>¡Todos los ejercicios completados!</Text>
          </View>
        ) : null}

        <Pressable style={styles.addExtra} onPress={openPicker}>
          <MaterialCommunityIcons name="plus" size={18} color={GymTheme.primary} />
          <Text style={styles.addExtraText}>Ejercicio adicional</Text>
        </Pressable>
      </ScrollView>

      {/* Controles globales sobre la barra de navegación */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Pressable style={[styles.control, styles.controlSurface]} onPress={handlePause}>
          <MaterialCommunityIcons name="content-save-outline" size={20} color={GymTheme.text} />
          <Text style={styles.controlText}>Guardar</Text>
        </Pressable>
        <Pressable style={[styles.control, styles.controlPrimary]} onPress={handleFinish}>
          <MaterialCommunityIcons name="flag-checkered" size={20} color="#0C0C0E" />
          <Text style={[styles.controlText, { color: '#0C0C0E' }]}>Fin</Text>
        </Pressable>
      </View>

      {/* Selector de ejercicio adicional */}
      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Añadir ejercicio</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {catalog.map((ex) => (
                <Pressable key={ex.id} style={styles.modalRow} onPress={() => pickAdditional(ex)}>
                  <MaterialCommunityIcons
                    name={ex.es_corporal ? 'human-handsup' : 'weight'}
                    size={18}
                    color={ex.es_corporal ? GymTheme.active : GymTheme.textMuted}
                  />
                  <Text style={styles.modalRowText}>{ex.name}</Text>
                </Pressable>
              ))}
              {catalog.length === 0 ? (
                <Text style={styles.modalEmpty}>No hay ejercicios en el catálogo.</Text>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: GymTheme.border,
  },
  headerIcon: { padding: 4 },
  dayName: { color: GymTheme.text, fontSize: 22, fontWeight: '800' },
  startedAt: { color: GymTheme.textMuted, fontSize: 13, marginTop: 2 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  pickHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: GymTheme.surfaceAlt,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
  },
  pickHintText: { color: GymTheme.primary, fontWeight: '700', fontSize: 14 },
  addExtra: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: GymTheme.primaryDim,
    borderRadius: Radius.md,
    paddingVertical: Spacing.lg,
  },
  addExtraText: { color: GymTheme.primary, fontWeight: '700', fontSize: 15 },
  allDone: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  allDoneText: { color: GymTheme.active, fontWeight: '700' },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: GymTheme.surface,
    borderTopWidth: 1,
    borderTopColor: GymTheme.border,
  },
  control: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.md,
    paddingVertical: 14,
  },
  controlSurface: { backgroundColor: GymTheme.surfaceElevated },
  controlPrimary: { backgroundColor: GymTheme.primary, flex: 1.4 },
  controlText: { color: GymTheme.text, fontWeight: '800', fontSize: 15 },
  noSession: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  noSessionText: { color: GymTheme.textMuted, fontSize: 16 },
  linkBtn: { padding: Spacing.md },
  linkText: { color: GymTheme.primary, fontWeight: '700', fontSize: 15 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: GymTheme.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  modalTitle: { color: GymTheme.text, fontSize: 18, fontWeight: '800', marginBottom: Spacing.sm },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: GymTheme.border,
  },
  modalRowText: { color: GymTheme.text, fontSize: 16 },
  modalEmpty: { color: GymTheme.textFaint, padding: Spacing.lg, textAlign: 'center' },
});
