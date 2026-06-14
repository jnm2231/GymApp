import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import { getLastExerciseSummary } from '@/db/history';
import {
  addSet,
  finishExercise,
  setExerciseWeight,
  updateSetReps,
  updateSetWeight,
} from '@/db/sessions';
import type { SessionExerciseWithSets } from '@/db/types';
import { formatClock, formatHM, formatRest, repsSummary } from '@/lib/format';

interface Props {
  block: SessionExerciseWithSets;
  isCurrent: boolean;
  sessionId: number;
  sessionUserWeight: number | null; // snapshot del peso del usuario en esta sesión
  onChanged: () => Promise<void>;
  onOpenHistory: (exerciseId: number) => void;
  onFocus: () => void; // pasar a realizar este ejercicio (ponerlo en verde)
  onPostpone: () => void; // posponer el ejercicio activo y elegir otro
  canFocus: boolean; // false cuando ya hay otro ejercicio en curso
  onRepsFocus?: () => void; // el input de repes recibe el foco (para subir el scroll)
}

/**
 * Celda de peso de una serie. En modo lectura muestra "{w} kg" con un lápiz; al
 * pulsarlo se convierte en un input con tick para confirmar. Si no es editable
 * (bloque ya terminado, etc.) solo muestra el texto.
 */
function WeightCell({
  weight,
  editable,
  onSave,
}: {
  weight: number;
  editable: boolean;
  onSave: (w: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(String(weight));
  const savedRef = useRef(false);

  if (!editable) {
    return <Text style={styles.setWeightText}>{weight} kg</Text>;
  }

  if (editing) {
    const save = () => {
      if (savedRef.current) return; // evita doble guardado (submit + blur)
      savedRef.current = true;
      const n = parseFloat(input.replace(',', '.'));
      setEditing(false);
      if (Number.isFinite(n)) onSave(n);
    };
    return (
      <View style={styles.setWeightEdit}>
        <TextInput
          style={styles.setWeightInput}
          value={input}
          onChangeText={setInput}
          keyboardType="decimal-pad"
          autoFocus
          selectTextOnFocus
          onSubmitEditing={save}
          onBlur={save}
          returnKeyType="done"
        />
        <Text style={styles.kgSmall}>kg</Text>
        <Pressable style={styles.miniTick} onPress={save} hitSlop={6}>
          <MaterialCommunityIcons name="check" size={14} color="#06210F" />
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      style={styles.setWeightRead}
      hitSlop={6}
      onPress={() => {
        setInput(String(weight));
        savedRef.current = false;
        setEditing(true);
      }}>
      <Text style={styles.setWeightText}>{weight} kg</Text>
      <MaterialCommunityIcons name="pencil" size={12} color={GymTheme.textMuted} />
    </Pressable>
  );
}

/** Cronómetro en vivo del descanso: cuenta desde la última serie confirmada. */
function RestClock({ sinceTs }: { sinceTs: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1000000), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = Math.floor((Date.now() - sinceTs) / 1000);
  return (
    <View style={styles.restClock}>
      <MaterialCommunityIcons name="timer-sand-complete" size={15} color={GymTheme.primary} />
      <Text style={styles.restClockText}>{formatClock(elapsed)}</Text>
      <Text style={styles.restClockLabel}>de descanso</Text>
    </View>
  );
}

export function ExerciseBlock({
  block,
  isCurrent,
  sessionId,
  sessionUserWeight,
  onChanged,
  onOpenHistory,
  onFocus,
  onPostpone,
  canFocus,
  onRepsFocus,
}: Props) {
  const db = useSQLiteContext();
  const done = block.status === 'done';
  const weightConfirmed = block.weight != null;

  const [weightInput, setWeightInput] = useState(block.weight != null ? String(block.weight) : '');
  const [weightEditing, setWeightEditing] = useState(block.weight == null);
  const [repsInput, setRepsInput] = useState('');
  // Peso de la PRÓXIMA serie a registrar. Por defecto el peso global del ejercicio;
  // el usuario puede sobreescribirlo antes de confirmar la serie.
  const [newSetWeight, setNewSetWeight] = useState<number | null>(block.weight);
  const [editing, setEditing] = useState(false); // modo edición de un bloque terminado
  const [ref, setRef] = useState<{ weight: number | null; reps: number[] } | null>(null);

  // Si cambia el peso global del ejercicio, la próxima serie vuelve a ese valor.
  useEffect(() => {
    setNewSetWeight(block.weight);
  }, [block.weight]);

  // Referencia del último día que se hizo este ejercicio.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (block.exercise_id == null) return;
      const r = await getLastExerciseSummary(db, block.exercise_id, sessionId);
      if (alive) setRef(r);
    })();
    return () => {
      alive = false;
    };
  }, [db, block.exercise_id, sessionId]);

  const interactive = (isCurrent && !done) || editing;

  const confirmWeight = async () => {
    const n = parseFloat(weightInput.replace(',', '.'));
    if (!Number.isFinite(n)) return;
    await setExerciseWeight(db, block.id, n);
    setWeightEditing(false);
    await onChanged();
  };

  const confirmSet = async () => {
    const reps = parseInt(repsInput, 10);
    if (!Number.isInteger(reps) || reps <= 0) return;
    // Guarda NULL (hereda global) si el peso coincide con el global; si no, el valor.
    const stored = block.weight != null && newSetWeight === block.weight ? null : newSetWeight;
    await addSet(db, block.id, reps, stored);
    setRepsInput('');
    setNewSetWeight(block.weight); // siguiente serie vuelve al peso global por defecto
    await onChanged();
  };

  const saveSetWeight = async (setId: number, w: number) => {
    const stored = block.weight != null && w === block.weight ? null : w;
    await updateSetWeight(db, setId, stored);
    await onChanged();
  };

  const handleFinish = async () => {
    await finishExercise(db, block.id);
    await onChanged();
  };

  const handleEditReps = async (setId: number, value: string) => {
    const reps = parseInt(value, 10);
    if (!Number.isInteger(reps) || reps <= 0) return;
    await updateSetReps(db, setId, reps);
    await onChanged();
  };

  // --- Bloque no enfocado y no terminado: seleccionable (se puede empezar/seguir) ---
  if (!isCurrent && !done) {
    const startedSummary = block.sets.length > 0 ? repsSummary(block.sets.map((s) => s.reps)) : null;
    return (
      <View style={[styles.card, canFocus ? styles.selectable : styles.waiting]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              {block.is_additional ? (
                <MaterialCommunityIcons name="plus-circle-outline" size={16} color={GymTheme.primary} />
              ) : null}
              <Text style={styles.selName}>{block.exercise_name}</Text>
              {block.es_corporal ? <Text style={styles.tag}>corporal</Text> : null}
            </View>
            <Text style={styles.selMeta}>
              {block.weight != null ? `${block.weight} kg · ` : ''}
              {startedSummary ? `series: ${startedSummary}` : 'Sin empezar'}
            </Text>
            {ref ? <Text style={styles.refText}>Último: {formatRefSummary(ref)}</Text> : null}
          </View>
          {canFocus ? (
            <Pressable style={styles.playBtn} onPress={onFocus} hitSlop={6}>
              <MaterialCommunityIcons name="play" size={16} color="#06210F" />
              <Text style={styles.playText}>{startedSummary ? 'Seguir' : 'Empezar'}</Text>
            </Pressable>
          ) : (
            <View style={styles.waitingChip}>
              <MaterialCommunityIcons name="timer-sand" size={14} color={GymTheme.textFaint} />
              <Text style={styles.waitingText}>{startedSummary ? 'En pausa' : 'En espera'}</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  const borderColor = isCurrent && !done ? GymTheme.active : GymTheme.border;

  return (
    <View style={[styles.card, { borderColor, borderWidth: isCurrent && !done ? 2 : 1 }]}>
      {/* Cabecera: nombre + peso global */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            {block.is_additional ? (
              <MaterialCommunityIcons name="plus-circle-outline" size={16} color={GymTheme.primary} />
            ) : null}
            <Text style={styles.name}>{block.exercise_name}</Text>
            {block.es_corporal ? <Text style={styles.tag}>corporal</Text> : null}
          </View>
          {(block.start_ts || block.end_ts) && (
            <Text style={styles.times}>
              {block.start_ts ? `Inicio (${formatHM(block.start_ts)})` : ''}
              {block.end_ts ? `   ·   Fin (${formatHM(block.end_ts)})` : ''}
            </Text>
          )}
        </View>

        {/* Peso (lastre) + peso corporal en gris si es un ejercicio corporal */}
        <View style={styles.weightArea}>
        {interactive && weightEditing ? (
          <View style={styles.weightInputWrap}>
            <TextInput
              style={styles.weightInput}
              placeholder="0"
              placeholderTextColor={GymTheme.textFaint}
              keyboardType="decimal-pad"
              value={weightInput}
              onChangeText={setWeightInput}
              onSubmitEditing={confirmWeight}
              returnKeyType="done"
              autoFocus={!weightConfirmed}
            />
            <Text style={styles.kg}>kg</Text>
            <Pressable style={styles.tick} onPress={confirmWeight} hitSlop={6}>
              <MaterialCommunityIcons name="check" size={18} color="#06210F" />
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.weightRead}
            disabled={!interactive}
            onPress={() => interactive && setWeightEditing(true)}>
            <Text style={styles.weightValue}>{weightConfirmed ? `${block.weight} kg` : '— kg'}</Text>
            {interactive ? (
              <MaterialCommunityIcons name="pencil" size={14} color={GymTheme.textMuted} />
            ) : null}
          </Pressable>
        )}
          {block.es_corporal === 1 ? (
            <Text style={styles.corpNote}>+ {Math.round(sessionUserWeight ?? 0)} kg corporal</Text>
          ) : null}
        </View>
      </View>

      {/* Series */}
      {weightConfirmed ? (
        done && !editing ? (
          // Colapsado: una sola línea limpia
          <View style={styles.collapsed}>
            <MaterialCommunityIcons name="check-circle" size={18} color={GymTheme.active} />
            <Text style={styles.collapsedReps}>{repsSummary(block.sets.map((s) => s.reps))}</Text>
          </View>
        ) : (
          <View style={styles.setsWrap}>
            {block.sets.map((s) => (
              <View key={s.id} style={styles.setRow}>
                <Text style={styles.setIndex}>Serie {s.set_index}</Text>
                {editing ? (
                  <TextInput
                    style={styles.repsEdit}
                    keyboardType="number-pad"
                    defaultValue={String(s.reps)}
                    onEndEditing={(e) => handleEditReps(s.id, e.nativeEvent.text)}
                  />
                ) : (
                  <Text style={styles.setReps}>{s.reps} reps</Text>
                )}
                <WeightCell
                  weight={s.weight ?? block.weight ?? 0}
                  editable={interactive}
                  onSave={(w) => saveSetWeight(s.id, w)}
                />
                <Text style={styles.setRest}>
                  {s.rest_seconds == null ? '—' : formatRest(s.rest_seconds)}
                </Text>
              </View>
            ))}

            {/* Cronómetro de descanso en vivo desde la última serie */}
            {isCurrent && !done && block.sets.length > 0 ? (
              <RestClock sinceTs={block.sets[block.sets.length - 1].ts} />
            ) : null}

            {/* Nueva fila de serie (sólo bloque actual no terminado) */}
            {isCurrent && !done ? (
              <View style={styles.newSetRow}>
                <Text style={styles.setIndex}>Serie {block.sets.length + 1}</Text>
                <TextInput
                  style={styles.repsInput}
                  placeholder="reps"
                  placeholderTextColor={GymTheme.textFaint}
                  keyboardType="number-pad"
                  value={repsInput}
                  onChangeText={setRepsInput}
                  onSubmitEditing={confirmSet}
                  onFocus={onRepsFocus}
                  returnKeyType="done"
                />
                <WeightCell
                  weight={newSetWeight ?? block.weight ?? 0}
                  editable
                  onSave={(w) => setNewSetWeight(w)}
                />
                <View style={{ flex: 1 }} />
                <Pressable
                  style={[styles.tick, !repsInput && styles.tickDisabled]}
                  onPress={confirmSet}
                  disabled={!repsInput}
                  hitSlop={6}>
                  <MaterialCommunityIcons name="check" size={20} color="#06210F" />
                </Pressable>
              </View>
            ) : null}
          </View>
        )
      ) : (
        <Text style={styles.hint}>Confirma el peso para empezar a registrar series.</Text>
      )}

      {/* Referencia día anterior */}
      {ref ? <Text style={styles.refText}>Último: {formatRefSummary(ref)}</Text> : null}

      {/* Botones del bloque */}
      <View style={styles.actions}>
        {block.exercise_id != null ? (
          <Pressable style={styles.iconBtn} onPress={() => onOpenHistory(block.exercise_id!)} hitSlop={6}>
            <MaterialCommunityIcons name="chart-line" size={20} color={GymTheme.textMuted} />
          </Pressable>
        ) : null}

        <View style={{ flex: 1 }} />

        {done ? (
          <Pressable style={styles.editBtn} onPress={() => setEditing((v) => !v)} hitSlop={6}>
            <MaterialCommunityIcons
              name={editing ? 'check' : 'pencil'}
              size={16}
              color={editing ? GymTheme.active : GymTheme.textMuted}
            />
            <Text style={[styles.editText, editing && { color: GymTheme.active }]}>
              {editing ? 'Listo' : 'Editar'}
            </Text>
          </Pressable>
        ) : isCurrent ? (
          <>
            <Pressable style={styles.postponeBtn} onPress={onPostpone} hitSlop={6}>
              <MaterialCommunityIcons name="pause" size={16} color={GymTheme.text} />
              <Text style={styles.postponeText}>Posponer</Text>
            </Pressable>
            <Pressable
              style={[styles.doneBtn, block.sets.length === 0 && styles.doneBtnDisabled]}
              onPress={handleFinish}
              disabled={block.sets.length === 0}>
              <MaterialCommunityIcons name="flag-checkered" size={16} color="#0C0C0E" />
              <Text style={styles.doneText}>Terminado</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}

function formatRefSummary(ref: { weight: number | null; reps: number[] }): string {
  const w = ref.weight != null ? `${ref.weight}kg: ` : '';
  return `${w}${repsSummary(ref.reps)}`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: GymTheme.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: GymTheme.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  selectable: { opacity: 0.92 },
  waiting: { opacity: 0.5 },
  waitingChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  waitingText: { color: GymTheme.textFaint, fontSize: 12, fontWeight: '600' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  name: { color: GymTheme.text, fontSize: 18, fontWeight: '800' },
  selName: { color: GymTheme.text, fontSize: 16, fontWeight: '700' },
  selMeta: { color: GymTheme.textMuted, fontSize: 13, marginTop: 4 },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: GymTheme.active,
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  playText: { color: '#06210F', fontWeight: '800', fontSize: 13 },
  postponeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: GymTheme.surfaceElevated,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  postponeText: { color: GymTheme.text, fontWeight: '700', fontSize: 13 },
  tag: {
    color: GymTheme.active,
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: GymTheme.activeDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  times: { color: GymTheme.textMuted, fontSize: 12, marginTop: 4 },
  weightArea: { alignItems: 'flex-end', gap: 2 },
  corpNote: { color: GymTheme.textFaint, fontSize: 11, fontWeight: '600' },
  weightInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weightInput: {
    backgroundColor: GymTheme.inputBg,
    borderWidth: 1,
    borderColor: GymTheme.primary,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: GymTheme.text,
    fontSize: 16,
    minWidth: 56,
    textAlign: 'center',
  },
  kg: { color: GymTheme.textMuted, fontSize: 14, fontWeight: '600' },
  weightRead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weightValue: { color: GymTheme.text, fontSize: 16, fontWeight: '700' },
  collapsed: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  collapsedReps: { color: GymTheme.text, fontSize: 18, fontWeight: '700', letterSpacing: 1 },
  setsWrap: { gap: Spacing.sm },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  newSetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: GymTheme.border,
  },
  setIndex: { color: GymTheme.textMuted, fontSize: 14, width: 52, fontWeight: '600' },
  setReps: { color: GymTheme.text, fontSize: 15, fontWeight: '700', width: 56 },
  setRest: { color: GymTheme.textFaint, fontSize: 12, flex: 1, textAlign: 'right' },
  setWeightText: { color: GymTheme.text, fontSize: 14, fontWeight: '700' },
  setWeightRead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    backgroundColor: GymTheme.surfaceAlt,
  },
  setWeightEdit: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  setWeightInput: {
    backgroundColor: GymTheme.inputBg,
    borderWidth: 1,
    borderColor: GymTheme.primary,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 4,
    color: GymTheme.text,
    fontSize: 14,
    width: 50,
    textAlign: 'center',
  },
  kgSmall: { color: GymTheme.textMuted, fontSize: 12, fontWeight: '600' },
  miniTick: {
    backgroundColor: GymTheme.active,
    borderRadius: Radius.sm,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repsEdit: {
    backgroundColor: GymTheme.inputBg,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: GymTheme.text,
    width: 70,
    textAlign: 'center',
  },
  repsInput: {
    backgroundColor: GymTheme.inputBg,
    borderWidth: 1,
    borderColor: GymTheme.active,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: GymTheme.text,
    fontSize: 15,
    width: 72,
    textAlign: 'center',
  },
  tick: {
    backgroundColor: GymTheme.active,
    borderRadius: Radius.sm,
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickDisabled: { opacity: 0.4 },
  restClock: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: GymTheme.primaryDim,
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: Spacing.xs,
  },
  restClockText: {
    color: GymTheme.primary,
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  restClockLabel: { color: GymTheme.textMuted, fontSize: 12, fontWeight: '600' },
  hint: { color: GymTheme.textFaint, fontSize: 13, fontStyle: 'italic' },
  refText: { color: GymTheme.textFaint, fontSize: 12 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: GymTheme.border,
    paddingTop: Spacing.md,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
    backgroundColor: GymTheme.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: GymTheme.primary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
  },
  doneBtnDisabled: { opacity: 0.4 },
  doneText: { color: '#0C0C0E', fontWeight: '800', fontSize: 14 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6 },
  editText: { color: GymTheme.textMuted, fontWeight: '700', fontSize: 13 },
});
