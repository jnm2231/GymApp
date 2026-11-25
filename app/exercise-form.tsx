import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAlert } from '@/components/gym/alert';
import { Button, Loading } from '@/components/gym/ui';
import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import {
  createExercise,
  deleteExercise,
  getExercise,
  updateExercise,
  updateExerciseDuringSession,
} from '@/db/exercises';
import { createMuscleGroup, deleteMuscleGroup, listMuscleGroups } from '@/db/muscle-groups';
import type { MuscleGroup, TrainingType } from '@/db/types';
import { TRAINING_TYPES } from '@/lib/training-types';
import { useKeyboardHeight } from '@/lib/use-keyboard';

/** Modal para crear o editar un ejercicio del catálogo o dentro de la sesión activa. */
export default function ExerciseFormScreen() {
  const db = useSQLiteContext();
  const showAlert = useAlert();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const params = useLocalSearchParams<{ id?: string; sessionExerciseId?: string }>();

  const exerciseId = params.id && Number.isFinite(Number(params.id)) ? Number(params.id) : null;
  const sessionExerciseId =
    params.sessionExerciseId && Number.isFinite(Number(params.sessionExerciseId))
      ? Number(params.sessionExerciseId)
      : null;

  const isEditingSession = sessionExerciseId != null;
  const isEditingCatalog = exerciseId != null && !isEditingSession;

  const [loading, setLoading] = useState(exerciseId != null || sessionExerciseId != null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [exerciseType, setExerciseType] = useState<TrainingType>('strength');
  const [isUnilateral, setIsUnilateral] = useState(false);
  const [muscleGroupId, setMuscleGroupId] = useState<number | null>(null);
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>([]);

  const [hasSessionRecords, setHasSessionRecords] = useState(false);
  const [originalUnilateral, setOriginalUnilateral] = useState(false);

  const [muscleDropdownOpen, setMuscleDropdownOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const groups = await listMuscleGroups(db);
      if (!active) return;
      setMuscleGroups(groups);

      let targetExerciseId = exerciseId;
      let blockData: {
        id: number;
        exercise_id: number | null;
        exercise_name: string;
        exercise_type: TrainingType;
        is_unilateral: number;
        timer_started_ts: number | null;
      } | null = null;
      let recordsExist = false;

      if (sessionExerciseId != null) {
        blockData = await db.getFirstAsync<{
          id: number;
          exercise_id: number | null;
          exercise_name: string;
          exercise_type: TrainingType;
          is_unilateral: number;
          timer_started_ts: number | null;
        }>(
          'SELECT id, exercise_id, exercise_name, exercise_type, is_unilateral, timer_started_ts FROM session_exercises WHERE id = ?',
          [sessionExerciseId]
        );
        const setsRow = await db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) AS count FROM sets WHERE session_exercise_id = ?',
          [sessionExerciseId]
        );
        const cardioRow = await db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) AS count FROM cardio_entries WHERE session_exercise_id = ?',
          [sessionExerciseId]
        );
        if (!active) return;

        recordsExist =
          (setsRow?.count ?? 0) > 0 ||
          (cardioRow?.count ?? 0) > 0 ||
          blockData?.timer_started_ts != null;
        setHasSessionRecords(recordsExist);

        if (blockData) {
          setOriginalUnilateral(blockData.is_unilateral === 1);
          if (targetExerciseId == null) {
            targetExerciseId = blockData.exercise_id;
          }
        }
      }

      const ex = targetExerciseId != null ? await getExercise(db, targetExerciseId) : null;
      if (!active) return;

      if (blockData) {
        setName(ex?.name ?? blockData.exercise_name);
        setMuscleGroupId(ex?.muscle_group_id ?? null);
        if (recordsExist) {
          setExerciseType(blockData.exercise_type);
          setIsUnilateral(blockData.is_unilateral === 1);
        } else {
          setExerciseType(ex?.exercise_type ?? blockData.exercise_type);
          setIsUnilateral(ex ? ex.is_unilateral === 1 : blockData.is_unilateral === 1);
        }
      } else if (ex) {
        setName(ex.name);
        setExerciseType(ex.exercise_type);
        setIsUnilateral(ex.is_unilateral === 1);
        setMuscleGroupId(ex.muscle_group_id);
        setOriginalUnilateral(ex.is_unilateral === 1);
      }

      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [db, exerciseId, sessionExerciseId]);

  const typeLocked = isEditingSession && hasSessionRecords;
  const unilateralLocked = isEditingSession && hasSessionRecords && originalUnilateral;
  const selectedGroup = muscleGroups.find((mg) => mg.id === muscleGroupId) ?? null;

  const handleCreateGroup = async () => {
    const trimmed = newGroupName.trim();
    if (!trimmed || creatingGroup) return;
    setCreatingGroup(true);
    try {
      const createdId = await createMuscleGroup(db, trimmed);
      const updated = await listMuscleGroups(db);
      setMuscleGroups(updated);
      setMuscleGroupId(createdId);
      setNewGroupName('');
    } catch (error) {
      showAlert(
        'No se pudo crear',
        error instanceof Error ? error.message : 'Error al crear el grupo muscular.'
      );
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleDeleteGroup = (group: MuscleGroup) => {
    showAlert(
      'Eliminar grupo muscular',
      `¿Eliminar "${group.name}"? Los ejercicios que lo tengan asignado pasarán a "Sin definir".`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await deleteMuscleGroup(db, group.id);
            if (muscleGroupId === group.id) setMuscleGroupId(null);
            setMuscleGroups(await listMuscleGroups(db));
          },
        },
      ]
    );
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      showAlert('Falta el nombre', 'Escribe un nombre para el ejercicio.');
      return;
    }
    setSaving(true);
    try {
      if (sessionExerciseId != null) {
        await updateExerciseDuringSession(db, sessionExerciseId, {
          name: trimmed,
          exerciseType,
          isUnilateral,
          muscleGroupId,
        });
      } else if (exerciseId != null) {
        await updateExercise(db, exerciseId, trimmed, exerciseType, {
          isUnilateral,
          muscleGroupId,
        });
      } else {
        await createExercise(db, trimmed, exerciseType, {
          isUnilateral,
          muscleGroupId,
        });
      }
      router.back();
    } catch (error) {
      showAlert(
        'No se pudo guardar',
        error instanceof Error ? error.message : 'Ha ocurrido un error al guardar el ejercicio.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!isEditingCatalog || exerciseId == null) return;
    const label = name.trim() || 'este ejercicio';
    showAlert(
      'Eliminar ejercicio',
      `¿Eliminar "${label}"? Si tiene entrenamientos registrados, su histórico y gráficas se conservarán.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await deleteExercise(db, exerciseId);
            router.back();
          },
        },
      ]
    );
  };

  if (loading) return <Loading />;

  const title = isEditingSession || isEditingCatalog ? 'Editar ejercicio' : 'Nuevo ejercicio';

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Spacing.xxl + keyboardHeight }]}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Nombre</Text>
        <TextInput
          style={styles.input}
          placeholder={exerciseType === 'cardio' ? 'Ej: Cinta de correr' : 'Ej: Press banca, Dominadas...'}
          placeholderTextColor={GymTheme.textFaint}
          value={name}
          onChangeText={setName}
          returnKeyType="done"
        />

        <Text style={[styles.label, styles.sectionLabel]}>Tipo de ejercicio</Text>
        <View style={styles.typeRow}>
          {TRAINING_TYPES.map((type) => {
            const active = exerciseType === type.value;
            return (
              <Pressable
                key={type.value}
                disabled={typeLocked}
                onPress={() => setExerciseType(type.value)}
                style={[
                  styles.typeChip,
                  active && { borderColor: type.color, backgroundColor: type.dimColor },
                  typeLocked && !active && styles.chipDisabled,
                ]}>
                <MaterialCommunityIcons name={type.icon} size={16} color={type.color} />
                <Text style={[styles.typeText, active && { color: type.color }]}>{type.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {typeLocked ? (
          <Text style={styles.hint}>
            Ya hay registros en esta sesión; el tipo solo puede cambiarse sin registros o desde Ejercicios.
          </Text>
        ) : null}

        {exerciseType !== 'cardio' ? (
          <>
            <View style={styles.cardRow}>
              <View style={styles.cardRowInfo}>
                <Text style={styles.cardRowTitle}>Unilateral (Izquierda / Derecha)</Text>
                <Text style={styles.cardRowSub}>
                  Registra cada serie por separado para cada lado.
                </Text>
              </View>
              <Switch
                value={unilateralLocked ? true : isUnilateral}
                disabled={unilateralLocked}
                onValueChange={setIsUnilateral}
                trackColor={{ true: GymTheme.primary, false: GymTheme.disabled }}
                thumbColor={GymTheme.white}
              />
            </View>
            {unilateralLocked ? (
              <Text style={styles.hint}>
                Ya hay series por lado en esta sesión; cámbialo desde Ejercicios para próximos entrenamientos.
              </Text>
            ) : isEditingSession && hasSessionRecords && !originalUnilateral ? (
              <Text style={styles.hint}>
                Las series ya hechas hoy se desdoblarán a ambos lados.
              </Text>
            ) : null}

            <Text style={[styles.label, styles.sectionLabel]}>Grupo muscular</Text>
            <View style={styles.dropdownBox}>
              <Pressable
                style={styles.dropdownHeader}
                onPress={() => setMuscleDropdownOpen((open) => !open)}>
                <MaterialCommunityIcons
                  name="arm-flex-outline"
                  size={19}
                  color={selectedGroup ? GymTheme.primary : GymTheme.textMuted}
                />
                <Text
                  style={[
                    styles.dropdownValue,
                    !selectedGroup && styles.dropdownPlaceholder,
                  ]}>
                  {selectedGroup ? selectedGroup.name : 'Sin definir'}
                </Text>
                <MaterialCommunityIcons
                  name={muscleDropdownOpen ? 'chevron-up' : 'chevron-down'}
                  size={22}
                  color={GymTheme.textMuted}
                />
              </Pressable>

              {muscleDropdownOpen ? (
                <View style={styles.dropdownList}>
                  <Pressable
                    style={[
                      styles.dropdownOption,
                      muscleGroupId == null && styles.dropdownOptionActive,
                    ]}
                    onPress={() => {
                      setMuscleGroupId(null);
                      setMuscleDropdownOpen(false);
                    }}>
                    <Text
                      style={[
                        styles.dropdownOptionText,
                        muscleGroupId == null && styles.dropdownOptionTextActive,
                      ]}>
                      Sin definir
                    </Text>
                    {muscleGroupId == null ? (
                      <MaterialCommunityIcons name="check" size={18} color={GymTheme.primary} />
                    ) : null}
                  </Pressable>

                  {muscleGroups.map((group) => {
                    const selected = muscleGroupId === group.id;
                    return (
                      <View
                        key={group.id}
                        style={[
                          styles.dropdownGroupRow,
                          selected && styles.dropdownOptionActive,
                        ]}>
                        <Pressable
                          style={styles.dropdownGroupMain}
                          onPress={() => {
                            setMuscleGroupId(group.id);
                            setMuscleDropdownOpen(false);
                          }}>
                          <Text
                            style={[
                              styles.dropdownOptionText,
                              selected && styles.dropdownOptionTextActive,
                            ]}>
                            {group.name}
                          </Text>
                          {selected ? (
                            <MaterialCommunityIcons name="check" size={18} color={GymTheme.primary} />
                          ) : null}
                        </Pressable>
                        <Pressable
                          hitSlop={8}
                          style={styles.trashBtn}
                          accessibilityLabel={`Eliminar grupo ${group.name}`}
                          onPress={() => handleDeleteGroup(group)}>
                          <MaterialCommunityIcons
                            name="trash-can-outline"
                            size={18}
                            color={GymTheme.danger}
                          />
                        </Pressable>
                      </View>
                    );
                  })}

                  <View style={styles.newGroupRow}>
                    <TextInput
                      style={styles.newGroupInput}
                      placeholder="Nuevo grupo muscular..."
                      placeholderTextColor={GymTheme.textFaint}
                      value={newGroupName}
                      onChangeText={setNewGroupName}
                      returnKeyType="done"
                      onSubmitEditing={handleCreateGroup}
                    />
                    <Pressable
                      style={[
                        styles.addGroupBtn,
                        (!newGroupName.trim() || creatingGroup) && styles.addGroupBtnDisabled,
                      ]}
                      disabled={!newGroupName.trim() || creatingGroup}
                      accessibilityLabel="Crear grupo muscular"
                      onPress={handleCreateGroup}>
                      <MaterialCommunityIcons name="plus" size={20} color="#0C0C0E" />
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        {isEditingCatalog ? (
          <View style={styles.deleteSection}>
            <Button
              title="Eliminar ejercicio"
              variant="danger"
              left={<MaterialCommunityIcons name="trash-can-outline" size={18} color={GymTheme.white} />}
              onPress={handleDelete}
            />
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(Spacing.lg, insets.bottom) }]}>
        <Button title="Cancelar" variant="ghost" onPress={() => router.back()} style={{ flex: 1 }} />
        <Button
          title={isEditingSession || isEditingCatalog ? 'Guardar cambios' : 'Crear ejercicio'}
          loading={saving}
          onPress={handleSave}
          style={{ flex: 2 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: GymTheme.background },
  content: { padding: Spacing.lg, gap: Spacing.sm },
  label: { color: GymTheme.text, fontSize: 15, fontWeight: '700' },
  sectionLabel: { marginTop: Spacing.md },
  hint: { color: GymTheme.textMuted, fontSize: 12, lineHeight: 17 },
  input: {
    backgroundColor: GymTheme.inputBg,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    color: GymTheme.text,
    fontSize: 16,
  },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    backgroundColor: GymTheme.surface,
  },
  chipDisabled: { opacity: 0.45 },
  typeText: { color: GymTheme.textMuted, fontSize: 13, fontWeight: '700' },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: GymTheme.surface,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  cardRowInfo: { flex: 1, gap: 2 },
  cardRowTitle: { color: GymTheme.text, fontSize: 14, fontWeight: '700' },
  cardRowSub: { color: GymTheme.textMuted, fontSize: 12 },
  dropdownBox: {
    backgroundColor: GymTheme.surface,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 13,
  },
  dropdownValue: { flex: 1, color: GymTheme.text, fontSize: 15, fontWeight: '600' },
  dropdownPlaceholder: { color: GymTheme.textMuted },
  dropdownList: {
    borderTopWidth: 1,
    borderTopColor: GymTheme.border,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radius.sm,
  },
  dropdownOptionActive: {
    backgroundColor: GymTheme.primaryDim,
  },
  dropdownOptionText: { color: GymTheme.text, fontSize: 14, fontWeight: '600', flex: 1 },
  dropdownOptionTextActive: { color: GymTheme.primary, fontWeight: '700' },
  dropdownGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  dropdownGroupMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: Spacing.sm,
  },
  trashBtn: { paddingHorizontal: Spacing.md, paddingVertical: 10 },
  newGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: GymTheme.border,
  },
  newGroupInput: {
    flex: 1,
    backgroundColor: GymTheme.inputBg,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    color: GymTheme.text,
    fontSize: 14,
  },
  addGroupBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
    backgroundColor: GymTheme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addGroupBtnDisabled: { opacity: 0.45 },
  deleteSection: { marginTop: Spacing.xl },
  footer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: GymTheme.border,
    backgroundColor: GymTheme.background,
  },
});
