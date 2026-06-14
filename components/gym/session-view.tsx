import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAlert } from '@/components/gym/alert';
import { ExerciseBlock } from '@/components/gym/exercise-block';
import { Button, Loading, Screen } from '@/components/gym/ui';
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
  resumeSession,
} from '@/db/sessions';
import type { Exercise, Session, SessionExerciseWithSets } from '@/db/types';
import { formatHM } from '@/lib/format';
import { useKeyboardHeight } from '@/lib/use-keyboard';

/**
 * Vista de la sesión activa. Se renderiza DENTRO de la pestaña "Entreno"
 * (no como pantalla apilada) para que la barra de navegación inferior siga
 * visible y los controles globales queden justo encima de ella.
 */
export function SessionView() {
  const db = useSQLiteContext();
  const showAlert = useAlert();
  const { refresh } = useSession();

  const [session, setSession] = useState<Session | null>(null);
  const [blocks, setBlocks] = useState<SessionExerciseWithSets[]>([]);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const initRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const blockY = useRef<Record<number, number>>({});
  const keyboardHeight = useKeyboardHeight();

  // Desplaza el bloque activo por encima del teclado al enfocar el input de repes.
  const scrollToBlock = useCallback((id: number) => {
    setTimeout(() => {
      const y = blockY.current[id];
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 60), animated: true });
    }, 120);
  }, []);

  const load = useCallback(async () => {
    const s = await getActiveSession(db);
    setSession(s);
    if (!s) {
      setLoading(false);
      return;
    }
    const bs = await getSessionExercisesWithSets(db, s.id);
    setBlocks(bs);
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

  // Si la carga termina sin sesión (p. ej. tras finalizar), sincroniza el
  // contexto para que la pestaña vuelva al Inicio.
  useEffect(() => {
    if (!loading && !session) refresh();
  }, [loading, session, refresh]);

  if (loading || !session) return <Loading />;

  const handlePause = async () => {
    await pauseSession(db, session.id);
    await load();
  };

  const handleResume = async () => {
    await resumeSession(db, session.id);
    await load();
  };

  const handleFinish = () => {
    showAlert('Terminar sesión', '¿Finalizar y guardar el entrenamiento en el histórico?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Finalizar',
        onPress: async () => {
          await finishSession(db, session.id);
          await refresh(); // el tab "Entreno" volverá a mostrar el Inicio
        },
      },
    ]);
  };

  const handleDiscard = () => {
    showAlert('Descartar sesión', 'Se borrará esta sesión sin guardarla. ¿Seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Descartar',
        style: 'destructive',
        onPress: async () => {
          await discardSession(db, session.id);
          await refresh();
        },
      },
    ]);
  };

  // --- Estado pausado: tarjeta compacta para reanudar ---
  if (session.status === 'paused') {
    return (
      <Screen>
        <View style={styles.pausedWrap}>
          <View style={styles.pausedCard}>
            <MaterialCommunityIcons name="pause-circle" size={48} color={GymTheme.primary} />
            <Text style={styles.pausedTitle}>Entrenamiento en pausa</Text>
            <Text style={styles.pausedDay}>{session.day_name}</Text>
            <Text style={styles.pausedSub}>Inicio · {formatHM(session.start_ts)}</Text>
            <Button
              title="Reanudar"
              variant="active"
              onPress={handleResume}
              left={<MaterialCommunityIcons name="play" size={18} color="#06210F" />}
              style={{ alignSelf: 'stretch' }}
            />
            <Button
              title="Finalizar entrenamiento"
              variant="surface"
              onPress={handleFinish}
              style={{ alignSelf: 'stretch' }}
            />
            <Button title="Descartar" variant="ghost" onPress={handleDiscard} style={{ alignSelf: 'stretch' }} />
          </View>
        </View>
      </Screen>
    );
  }

  const allDone = blocks.length > 0 && blocks.every((b) => b.status === 'done');
  const pendingCount = blocks.filter((b) => b.status !== 'done').length;

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
    <Screen>
      {/* Cabecera (sin escape al Inicio) */}
      <View style={styles.header}>
        <View style={styles.headerIconBox}>
          <MaterialCommunityIcons name="dumbbell" size={22} color={GymTheme.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.dayName}>{session.day_name}</Text>
          <Text style={styles.startedAt}>Inicio · {formatHM(session.start_ts)}</Text>
        </View>
        <Pressable onPress={handleDiscard} hitSlop={8} style={styles.headerIcon}>
          <MaterialCommunityIcons name="trash-can-outline" size={22} color={GymTheme.danger} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: 130 + keyboardHeight }]}>
        {focusedId == null && pendingCount > 0 ? (
          <View style={styles.pickHint}>
            <MaterialCommunityIcons name="gesture-tap" size={18} color={GymTheme.primary} />
            <Text style={styles.pickHintText}>Elige el ejercicio que vas a realizar</Text>
          </View>
        ) : null}

        {blocks.map((b) => (
          <View
            key={b.id}
            onLayout={(e) => {
              blockY.current[b.id] = e.nativeEvent.layout.y;
            }}>
            <ExerciseBlock
              block={b}
              isCurrent={b.id === focusedId}
              sessionId={session.id}
              onChanged={load}
              onOpenHistory={(exId) => router.push({ pathname: '/exercise/[id]', params: { id: String(exId) } })}
              onFocus={() => setFocusedId(b.id)}
              onPostpone={() => setFocusedId(null)}
              canFocus={focusedId == null}
              onRepsFocus={() => scrollToBlock(b.id)}
            />
          </View>
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

      {/* Controles globales: SIEMPRE encima de la barra de navegación */}
      <View style={styles.controls}>
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
  headerIconBox: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: GymTheme.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingBottom: Spacing.md,
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
  pausedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  pausedCard: {
    backgroundColor: GymTheme.surface,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    width: '100%',
    alignItems: 'center',
    gap: Spacing.md,
  },
  pausedTitle: { color: GymTheme.text, fontSize: 20, fontWeight: '800' },
  pausedDay: { color: GymTheme.primary, fontSize: 17, fontWeight: '700' },
  pausedSub: { color: GymTheme.textMuted, fontSize: 13, marginBottom: Spacing.sm },
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
