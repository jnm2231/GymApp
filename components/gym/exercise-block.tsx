import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import { getLastExerciseSummary, type LastExerciseSummary } from '@/db/history';
import {
  addSet,
  addUnilateralSetSide,
  finishExercise,
  reopenExercise,
  setExerciseWeight,
  updateSetReps,
  updateSetWeight,
} from '@/db/sessions';
import type { ExerciseSet, SessionExerciseWithSets, SetSide } from '@/db/types';
import { groupSetsByIndex } from '@/lib/calc';
import {
  formatClock,
  formatCollapsedSets,
  formatHM,
  formatLastExerciseSummary,
  formatRest,
} from '@/lib/format';
import { getTrainingType } from '@/lib/training-types';
import {
  cancelTimerNotification,
  scheduleWorkoutReminder,
  showTimerNotification,
} from '@/lib/workout-notifications';

interface Props {
  block: SessionExerciseWithSets;
  isCurrent: boolean;
  sessionId: number;
  sessionUserWeight: number | null; // snapshot del peso del usuario en esta sesión
  onChanged: () => Promise<void>;
  onOpenHistory: (exerciseId: number) => void;
  onEditExercise: (exerciseId: number, sessionExerciseId: number) => void;
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
function RestClock({ sinceTs, color, dimColor }: { sinceTs: number; color: string; dimColor: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [sinceTs]);
  const elapsed = Math.max(0, Math.floor((now - sinceTs) / 1000));
  return (
    <View style={[styles.restClock, { backgroundColor: dimColor }]}>
      <MaterialCommunityIcons name="timer-sand-complete" size={15} color={color} />
      <Text style={[styles.restClockText, { color }]}>{formatClock(elapsed)}</Text>
      <Text style={styles.restClockLabel}>de descanso</Text>
    </View>
  );
}

/** Cronómetro en vivo en texto gris plano entre lados de una serie unilateral. */
function SideRestClock({ sinceTs }: { sinceTs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [sinceTs]);
  const elapsed = Math.max(0, Math.floor((now - sinceTs) / 1000));
  return <Text style={styles.sideRestText}>Entre lados · {formatClock(elapsed)}</Text>;
}

export function ExerciseBlock({
  block,
  isCurrent,
  sessionId,
  sessionUserWeight,
  onChanged,
  onOpenHistory,
  onEditExercise,
  onFocus,
  onPostpone,
  canFocus,
  onRepsFocus,
}: Props) {
  const db = useSQLiteContext();
  const done = block.status === 'done';
  const weightConfirmed = block.weight != null;
  const isUnilateral = block.is_unilateral === 1;
  const exerciseType = getTrainingType(block.exercise_type);

  const latestSet = block.sets[block.sets.length - 1];
  const latestEffectiveWeight = latestSet ? (latestSet.weight ?? block.weight) : block.weight;
  const latestSetId = latestSet?.id ?? null;

  const [weightInput, setWeightInput] = useState(block.weight != null ? String(block.weight) : '');
  const [weightEditing, setWeightEditing] = useState(block.weight == null);
  const [repsInput, setRepsInput] = useState('');
  const [leftRepsInput, setLeftRepsInput] = useState('');
  const [rightRepsInput, setRightRepsInput] = useState('');
  // Peso de la PRÓXIMA serie a registrar. Hereda el último peso efectivo del bloque;
  // el usuario puede sobreescribirlo antes de confirmar la serie.
  const [newSetWeight, setNewSetWeight] = useState<number | null>(latestEffectiveWeight);
  const [leftWeight, setLeftWeight] = useState<number | null>(latestEffectiveWeight);
  const [rightWeight, setRightWeight] = useState<number | null>(latestEffectiveWeight);
  const weightDirtyRef = useRef(false);
  const prevLatestSetIdRef = useRef<number | null>(latestSetId);
  const prevBlockWeightRef = useRef<number | null>(block.weight);
  const prevUniRef = useRef<number>(block.is_unilateral);

  const [editing, setEditing] = useState(false); // modo edición de un bloque terminado
  const [editedReps, setEditedReps] = useState<Record<number, string>>({});
  const [ref, setRef] = useState<LastExerciseSummary | null>(null);

  useEffect(() => {
    const setChanged = prevLatestSetIdRef.current !== latestSetId;
    const globalWeightChanged = prevBlockWeightRef.current !== block.weight;
    const uniChanged = prevUniRef.current !== block.is_unilateral;

    prevLatestSetIdRef.current = latestSetId;
    prevBlockWeightRef.current = block.weight;
    prevUniRef.current = block.is_unilateral;

    if (globalWeightChanged && !weightEditing) {
      setWeightInput(block.weight != null ? String(block.weight) : '');
    }

    if (!setChanged && !globalWeightChanged && !uniChanged) return;
    if (weightDirtyRef.current) return;

    const nextWeight = globalWeightChanged && !setChanged ? block.weight : latestEffectiveWeight;
    setNewSetWeight(nextWeight);
    setLeftWeight(nextWeight);
    setRightWeight(nextWeight);
  }, [latestSetId, block.weight, block.is_unilateral, latestEffectiveWeight, weightEditing]);

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

  const groups = groupSetsByIndex(block.sets);
  const lastGroup = groups[groups.length - 1];
  const inProgressGroup =
    isUnilateral && lastGroup && lastGroup.items.length === 1 ? lastGroup : null;
  const completedGroups = isUnilateral
    ? inProgressGroup
      ? groups.slice(0, -1)
      : groups
    : [];
  const currentSetIndex = inProgressGroup ? inProgressGroup.setIndex : (lastGroup?.setIndex ?? 0) + 1;

  const confirmWeight = async () => {
    const n = parseFloat(weightInput.replace(',', '.'));
    if (!Number.isFinite(n)) return;
    await setExerciseWeight(db, block.id, n);
    weightDirtyRef.current = false;
    setNewSetWeight(n);
    setLeftWeight(n);
    setRightWeight(n);
    setWeightEditing(false);
    await onChanged();
  };

  const updateUpcomingWeight = (w: number) => {
    weightDirtyRef.current = true;
    setNewSetWeight(w);
    setLeftWeight(w);
    setRightWeight(w);
  };

  const confirmSet = async () => {
    const reps = parseInt(repsInput, 10);
    if (!Number.isInteger(reps) || reps <= 0) return;
    // Guarda NULL (hereda global) si el peso coincide con el global; si no, el valor.
    const stored = block.weight != null && newSetWeight === block.weight ? null : newSetWeight;
    const createdSet = await addSet(db, block.id, reps, stored);
    await showTimerNotification(db, sessionId, 'rest', block.exercise_name, createdSet.ts);
    await scheduleWorkoutReminder(db, sessionId);
    weightDirtyRef.current = false;
    setRepsInput('');
    await onChanged();
  };

  const confirmUnilateralSide = async (side: SetSide) => {
    const raw = side === 'left' ? leftRepsInput : rightRepsInput;
    const reps = parseInt(raw, 10);
    if (!Number.isInteger(reps) || reps <= 0) return;

    const chosenWeight = side === 'left' ? leftWeight : rightWeight;
    const stored = block.weight != null && chosenWeight === block.weight ? null : chosenWeight;
    const isSecondSide = inProgressGroup != null && inProgressGroup.setIndex === currentSetIndex;

    const createdSet = await addUnilateralSetSide(
      db,
      block.id,
      currentSetIndex,
      side,
      reps,
      stored
    );

    if (isSecondSide) {
      await showTimerNotification(db, sessionId, 'rest', block.exercise_name, createdSet.ts);
    } else {
      await cancelTimerNotification(sessionId);
    }
    await scheduleWorkoutReminder(db, sessionId);

    if (side === 'left') setLeftRepsInput('');
    else setRightRepsInput('');

    weightDirtyRef.current = false;
    setNewSetWeight(chosenWeight);
    setLeftWeight(chosenWeight);
    setRightWeight(chosenWeight);
    await onChanged();
  };

  const saveSetWeight = async (setId: number, w: number) => {
    const stored = block.weight != null && w === block.weight ? null : w;
    await updateSetWeight(db, setId, stored);
    await onChanged();
  };

  const handleFinish = async () => {
    await finishExercise(db, block.id);
    await cancelTimerNotification(sessionId);
    await onChanged();
  };

  const handleContinue = async () => {
    await reopenExercise(db, block.id);
    setEditing(false);
    onFocus();
    const lastSet = block.sets[block.sets.length - 1];
    if (lastSet && (!isUnilateral || inProgressGroup == null)) {
      await showTimerNotification(db, sessionId, 'rest', block.exercise_name, lastSet.ts);
    }
    await onChanged();
  };

  const postpone = async () => {
    await cancelTimerNotification(sessionId);
    onPostpone();
  };

  const toggleEditing = async () => {
    if (!editing) {
      setEditedReps(Object.fromEntries(block.sets.map((set) => [set.id, String(set.reps)])));
      setEditing(true);
      return;
    }

    let changed = false;
    for (const set of block.sets) {
      const reps = parseInt(editedReps[set.id] ?? String(set.reps), 10);
      if (Number.isInteger(reps) && reps > 0 && reps !== set.reps) {
        await updateSetReps(db, set.id, reps);
        changed = true;
      }
    }
    setEditing(false);
    setEditedReps({});
    if (changed) await onChanged();
  };

  const refText = ref ? formatLastExerciseSummary(ref) : '';

  const renderConfirmedSideRow = (s: ExerciseSet) => (
    <View key={s.id} style={styles.setRow}>
      <View style={styles.sideBadge}>
        <Text style={styles.sideBadgeText}>{s.side === 'left' ? 'Izq' : 'Der'}</Text>
      </View>
      {editing ? (
        <TextInput
          style={styles.repsEdit}
          keyboardType="number-pad"
          value={editedReps[s.id] ?? String(s.reps)}
          onChangeText={(value) =>
            setEditedReps((current) => ({ ...current, [s.id]: value }))
          }
        />
      ) : (
        <Text style={styles.setReps}>{s.reps} reps</Text>
      )}
      <WeightCell
        weight={s.weight ?? block.weight ?? 0}
        editable={interactive}
        onSave={(w) => saveSetWeight(s.id, w)}
      />
    </View>
  );

  const renderUnilateralGroup = (setIndex: number, items: ExerciseSet[]) => {
    const ordered = [...items].sort((a, b) => (a.side_order ?? 0) - (b.side_order ?? 0));
    const first = ordered[0];
    const second = ordered[1];
    return (
      <View key={setIndex} style={styles.uniSetBox}>
        <View style={styles.uniSetHeader}>
          <Text style={styles.uniSetTitle}>Serie {setIndex}</Text>
          {first?.rest_seconds != null ? (
            <View style={[styles.setRestPill, { backgroundColor: exerciseType.dimColor }]}>
              <Text style={[styles.setRestText, { color: exerciseType.color }]}>
                {formatRest(first.rest_seconds)}
              </Text>
            </View>
          ) : null}
        </View>
        {first ? renderConfirmedSideRow(first) : null}
        {second?.side_rest_seconds != null ? (
          <Text style={styles.sideRestText}>
            Entre lados · {formatRest(second.side_rest_seconds)}
          </Text>
        ) : null}
        {second ? renderConfirmedSideRow(second) : null}
      </View>
    );
  };

  const renderSideInputRow = (side: SetSide) => {
    const isLeft = side === 'left';
    const sideReps = isLeft ? leftRepsInput : rightRepsInput;
    const setSideReps = isLeft ? setLeftRepsInput : setRightRepsInput;
    const sideWeight = (isLeft ? leftWeight : rightWeight) ?? block.weight ?? 0;

    return (
      <View key={side} style={styles.uniSideInputRow}>
        <View style={styles.sideBadge}>
          <Text style={styles.sideBadgeText}>{isLeft ? 'Izq' : 'Der'}</Text>
        </View>
        <TextInput
          style={styles.repsInput}
          placeholder="reps"
          placeholderTextColor={GymTheme.textFaint}
          keyboardType="number-pad"
          value={sideReps}
          onChangeText={setSideReps}
          onSubmitEditing={() => confirmUnilateralSide(side)}
          onFocus={onRepsFocus}
          returnKeyType="done"
        />
        <WeightCell weight={sideWeight} editable onSave={updateUpcomingWeight} />
        <View style={{ flex: 1 }} />
        <Pressable
          style={[styles.tick, !sideReps && styles.tickDisabled]}
          onPress={() => confirmUnilateralSide(side)}
          disabled={!sideReps}
          hitSlop={6}>
          <MaterialCommunityIcons name="check" size={20} color="#06210F" />
        </Pressable>
      </View>
    );
  };

  // --- Bloque no enfocado y no terminado: seleccionable (se puede empezar/seguir) ---
  if (!isCurrent && !done) {
    const startedSummary =
      block.sets.length > 0 ? formatCollapsedSets(block.sets, isUnilateral) : null;
    return (
      <View style={[styles.card, canFocus ? styles.selectable : styles.waiting]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              {block.is_additional ? (
                <MaterialCommunityIcons name="plus-circle-outline" size={16} color={GymTheme.primary} />
              ) : null}
              <Text style={styles.selName}>{block.exercise_name}</Text>
              {isUnilateral ? <Text style={styles.uniTag}>I/D</Text> : null}
            </View>
            <Text style={styles.selMeta}>
              {block.weight != null ? `${block.weight} kg · ` : ''}
              {startedSummary ? `series: ${startedSummary}` : 'Sin empezar'}
            </Text>
            {refText ? <Text style={styles.refText}>Último: {refText}</Text> : null}
          </View>
          {canFocus ? (
            <Pressable style={[styles.playBtn, { backgroundColor: exerciseType.color }]} onPress={onFocus} hitSlop={6}>
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

  const borderColor = isCurrent && !done ? exerciseType.color : GymTheme.border;
  const displayedCompletedGroups = isUnilateral
    ? done && inProgressGroup
      ? groups
      : completedGroups
    : [];

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
            {isUnilateral ? <Text style={styles.uniTag}>I/D</Text> : null}
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
            <MaterialCommunityIcons name="check-circle" size={18} color={exerciseType.color} />
            <Text style={styles.collapsedReps}>{formatCollapsedSets(block.sets, isUnilateral)}</Text>
          </View>
        ) : isUnilateral ? (
          <View style={styles.setsWrap}>
            {displayedCompletedGroups.map((g) => renderUnilateralGroup(g.setIndex, g.items))}

            {isCurrent && !done && inProgressGroup == null && block.sets.length > 0 ? (
              <RestClock
                sinceTs={block.sets[block.sets.length - 1].ts}
                color={exerciseType.color}
                dimColor={exerciseType.dimColor}
              />
            ) : null}

            {isCurrent && !done ? (
              <View style={styles.uniSetBox}>
                <View style={styles.uniSetHeader}>
                  <Text style={styles.uniSetTitle}>Serie {currentSetIndex}</Text>
                  {inProgressGroup?.items[0]?.rest_seconds != null ? (
                    <View style={[styles.setRestPill, { backgroundColor: exerciseType.dimColor }]}>
                      <Text style={[styles.setRestText, { color: exerciseType.color }]}>
                        {formatRest(inProgressGroup.items[0].rest_seconds)}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {inProgressGroup ? (
                  (() => {
                    const confirmed = inProgressGroup.items[0];
                    const remainingSide: SetSide = confirmed.side === 'left' ? 'right' : 'left';
                    return (
                      <>
                        {renderConfirmedSideRow(confirmed)}
                        <SideRestClock sinceTs={confirmed.ts} />
                        {renderSideInputRow(remainingSide)}
                      </>
                    );
                  })()
                ) : (
                  <>
                    {renderSideInputRow('left')}
                    {renderSideInputRow('right')}
                  </>
                )}
              </View>
            ) : null}
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
                    value={editedReps[s.id] ?? String(s.reps)}
                    onChangeText={(value) =>
                      setEditedReps((current) => ({ ...current, [s.id]: value }))
                    }
                  />
                ) : (
                  <Text style={styles.setReps}>{s.reps} reps</Text>
                )}
                <WeightCell
                  weight={s.weight ?? block.weight ?? 0}
                  editable={interactive}
                  onSave={(w) => saveSetWeight(s.id, w)}
                />
                {s.rest_seconds == null ? (
                  <Text style={styles.setRestEmpty}>—</Text>
                ) : (
                  <View style={[styles.setRestPill, { backgroundColor: exerciseType.dimColor }]}>
                    <Text style={[styles.setRestText, { color: exerciseType.color }]}>{formatRest(s.rest_seconds)}</Text>
                  </View>
                )}
              </View>
            ))}

            {/* Cronómetro de descanso en vivo desde la última serie */}
            {isCurrent && !done && block.sets.length > 0 ? (
              <RestClock sinceTs={block.sets[block.sets.length - 1].ts}
                color={exerciseType.color} dimColor={exerciseType.dimColor} />
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
                  onSave={updateUpcomingWeight}
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
      {refText ? <Text style={styles.refText}>Último: {refText}</Text> : null}

      {/* Botones del bloque */}
      <View style={styles.actions}>
        {block.exercise_id != null ? (
          <>
            <Pressable style={styles.iconBtn} onPress={() => onOpenHistory(block.exercise_id!)} hitSlop={6}>
              <MaterialCommunityIcons name="chart-line" size={20} color={GymTheme.textMuted} />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={() => onEditExercise(block.exercise_id!, block.id)}
              hitSlop={6}>
              <MaterialCommunityIcons name="tune" size={20} color={GymTheme.textMuted} />
            </Pressable>
          </>
        ) : null}

        <View style={{ flex: 1 }} />

        {done ? (
          <>
            <Pressable style={styles.editBtn} onPress={toggleEditing} hitSlop={6}>
              <MaterialCommunityIcons
                name={editing ? 'check' : 'pencil'}
                size={16}
                color={editing ? GymTheme.active : GymTheme.textMuted}
              />
              <Text style={[styles.editText, editing && { color: GymTheme.active }]}>
                {editing ? 'Listo' : 'Editar'}
              </Text>
            </Pressable>
            {editing ? (
              <Pressable style={styles.continueBtn} onPress={handleContinue} hitSlop={6}>
                <MaterialCommunityIcons name="play" size={16} color="#06210F" />
                <Text style={styles.continueText}>Seguir ejercicio</Text>
              </Pressable>
            ) : null}
          </>
        ) : isCurrent ? (
          <>
            <Pressable style={styles.postponeBtn} onPress={postpone} hitSlop={6}>
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
  uniTag: {
    color: GymTheme.textMuted,
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: GymTheme.surfaceElevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
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
  uniSetBox: {
    backgroundColor: GymTheme.surfaceAlt,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: GymTheme.border,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  uniSetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  uniSetTitle: { color: GymTheme.textMuted, fontSize: 13, fontWeight: '700' },
  uniSideInputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 2 },
  sideBadge: {
    backgroundColor: GymTheme.surfaceElevated,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 38,
    alignItems: 'center',
  },
  sideBadgeText: { color: GymTheme.textMuted, fontSize: 12, fontWeight: '800' },
  sideRestText: {
    color: GymTheme.textMuted,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    paddingLeft: 46,
    paddingVertical: 2,
  },
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
  setRestEmpty: { color: GymTheme.textFaint, fontSize: 12, flex: 1, textAlign: 'right' },
  setRestPill: { marginLeft: 'auto', borderRadius: Radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  setRestText: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
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
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: Spacing.xs,
  },
  restClockText: {
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
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: GymTheme.active,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  continueText: { color: '#06210F', fontWeight: '800', fontSize: 13 },
});
