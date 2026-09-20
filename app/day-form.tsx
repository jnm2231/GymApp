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

import { useAlert } from '@/components/gym/alert';
import { Button, EmptyState } from '@/components/gym/ui';
import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import { createDay, getDay, getDayExercises, updateDay } from '@/db/days';
import { createExercise, listExercises } from '@/db/exercises';
import type { CardioTracking, Exercise, TrainingType } from '@/db/types';
import { getTrainingType, TRAINING_TYPES } from '@/lib/training-types';

export default function DayFormScreen() {
  const db = useSQLiteContext();
  const showAlert = useAlert();
  const params = useLocalSearchParams<{ id?: string }>();
  const dayId = params.id ? Number(params.id) : null;
  const isEdit = dayId != null;

  const [name, setName] = useState('');
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [selected, setSelected] = useState<number[]>([]); // en orden de selección
  const [trainingType, setTrainingType] = useState<TrainingType>('strength');
  const [creatingExercise, setCreatingExercise] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newExerciseCorporal, setNewExerciseCorporal] = useState(false);
  const [newCardioTracking, setNewCardioTracking] = useState<CardioTracking>('both');
  const typeConfig = getTrainingType(trainingType);

  useEffect(() => {
    (async () => {
      setCatalog(await listExercises(db));
      if (isEdit) {
        const day = await getDay(db, dayId);
        if (day) {
          setName(day.name);
          setTrainingType(day.training_type);
        }
        const exs = await getDayExercises(db, dayId);
        setSelected(exs.map((e) => e.id));
      }
    })();
  }, [db, dayId, isEdit]);

  const toggle = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCreateExercise = async () => {
    const trimmed = newExerciseName.trim();
    if (!trimmed) {
      showAlert('Falta el nombre', 'Escribe un nombre para el nuevo ejercicio.');
      return;
    }
    try {
      const exerciseId = await createExercise(
        db,
        trimmed,
        trainingType === 'calisthenics' ? true : newExerciseCorporal,
        trainingType,
        newCardioTracking
      );
      setCatalog(await listExercises(db));
      setSelected((prev) => [...prev, exerciseId]);
      setNewExerciseName('');
      setNewExerciseCorporal(false);
      setNewCardioTracking('both');
      setCreatingExercise(false);
    } catch {
      showAlert('Ya existe', `El ejercicio "${trimmed}" ya está en el catálogo.`);
    }
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      showAlert('Falta el nombre', 'Ponle un nombre al día (ej: Pecho).');
      return;
    }
    if (selected.length === 0) {
      showAlert('Sin ejercicios', 'Selecciona al menos un ejercicio para el día.');
      return;
    }
    if (isEdit) {
      await updateDay(db, dayId, trimmed, selected, trainingType);
    } else {
      await createDay(db, trimmed, selected, trainingType);
    }
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: GymTheme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: isEdit ? 'Editar día' : 'Nuevo día' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Nombre del día</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: Pecho, Espalda, Pierna..."
          placeholderTextColor={GymTheme.textFaint}
          value={name}
          onChangeText={setName}
          returnKeyType="done"
        />

        <Text style={[styles.label, { marginTop: Spacing.md }]}>Tipo de entrenamiento</Text>
        <View style={styles.typeRow}>
          {TRAINING_TYPES.map((type) => (
            <Pressable
              key={type.value}
              style={[
                styles.typeChip,
                trainingType === type.value && { borderColor: type.color, backgroundColor: type.dimColor },
              ]}
              onPress={() => {
                if (trainingType === type.value) return;
                setTrainingType(type.value);
                setSelected([]);
                setCreatingExercise(false);
                setNewExerciseName('');
                setNewExerciseCorporal(false);
                setNewCardioTracking('both');
              }}>
              <MaterialCommunityIcons name={type.icon} size={17} color={type.color} />
              <Text style={[styles.typeText, trainingType === type.value && { color: type.color }]}>
                {type.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.label, { marginTop: Spacing.lg }]}>
          Ejercicios {selected.length > 0 ? `(${selected.length})` : ''}
        </Text>
        <Text style={styles.hint}>El número indica el orden dentro del día.</Text>

        {catalog.filter((ex) => ex.exercise_type === trainingType).length === 0 ? (
          <EmptyState
            title={`No hay ejercicios de ${getTrainingType(trainingType).label.toLowerCase()}`}
            subtitle="Puedes crear el primero directamente aquí abajo."
          />
        ) : (
          catalog.filter((ex) => ex.exercise_type === trainingType).map((ex) => {
            const order = selected.indexOf(ex.id);
            const isSel = order !== -1;
            return (
              <Pressable
                key={ex.id}
                style={[
                  styles.exRow,
                  isSel && { borderColor: typeConfig.color, backgroundColor: typeConfig.dimColor },
                ]}
                onPress={() => toggle(ex.id)}>
                <View
                  style={[
                    styles.checkbox,
                    isSel && { backgroundColor: typeConfig.color, borderColor: typeConfig.color },
                  ]}>
                  {isSel ? (
                    <Text style={styles.orderNum}>{order + 1}</Text>
                  ) : (
                    <MaterialCommunityIcons name="plus" size={16} color={GymTheme.textFaint} />
                  )}
                </View>
                <Text style={styles.exName}>{ex.name}</Text>
                {ex.es_corporal ? <Text style={styles.tag}>corporal</Text> : null}
              </Pressable>
            );
          })
        )}

        <Pressable
          style={[styles.createToggle, { borderColor: typeConfig.color }]}
          onPress={() => setCreatingExercise((value) => !value)}>
          <MaterialCommunityIcons
            name={creatingExercise ? 'chevron-up' : 'plus-circle-outline'}
            size={19}
            color={typeConfig.color}
          />
          <Text style={[styles.createToggleText, { color: typeConfig.color }]}>
            {creatingExercise ? 'Cerrar creación de ejercicio' : 'Crear un ejercicio nuevo'}
          </Text>
        </Pressable>

        {creatingExercise ? (
          <View style={[styles.createCard, { borderColor: typeConfig.color }]}>
            <Text style={styles.createTitle}>Nuevo ejercicio de {typeConfig.label.toLowerCase()}</Text>
            <TextInput
              style={styles.input}
              placeholder={trainingType === 'cardio' ? 'Ej: Cinta de correr' : 'Ej: Press banca'}
              placeholderTextColor={GymTheme.textFaint}
              value={newExerciseName}
              onChangeText={setNewExerciseName}
              returnKeyType="done"
              onSubmitEditing={handleCreateExercise}
            />

            {trainingType === 'cardio' ? (
              <View style={styles.metricRow}>
                {([
                  ['duration', 'Tiempo'],
                  ['distance', 'Distancia'],
                  ['both', 'Tiempo + distancia'],
                ] as const).map(([value, label]) => (
                  <Pressable
                    key={value}
                    style={[
                      styles.metricChip,
                      newCardioTracking === value && {
                        borderColor: typeConfig.color,
                        backgroundColor: typeConfig.dimColor,
                      },
                    ]}
                    onPress={() => setNewCardioTracking(value)}>
                    <Text
                      style={[
                        styles.metricText,
                        newCardioTracking === value && { color: typeConfig.color },
                      ]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : trainingType === 'strength' ? (
              <View style={styles.corporalRow}>
                <Switch
                  value={newExerciseCorporal}
                  onValueChange={setNewExerciseCorporal}
                  trackColor={{ true: GymTheme.active, false: GymTheme.disabled }}
                  thumbColor={GymTheme.white}
                />
                <Text style={styles.hint}>Es corporal (peso propio + lastre)</Text>
              </View>
            ) : (
              <Text style={styles.hint}>Los ejercicios de calistenia se registran como corporales.</Text>
            )}

            <Button title="Crear y seleccionar" onPress={handleCreateExercise} />
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button title="Cancelar" variant="ghost" onPress={() => router.back()} style={{ flex: 1 }} />
        <Button
          title={isEdit ? 'Guardar cambios' : 'Crear día'}
          onPress={handleSave}
          style={{ flex: 2 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.sm },
  label: { color: GymTheme.text, fontSize: 15, fontWeight: '700' },
  hint: { color: GymTheme.textMuted, fontSize: 12, marginBottom: Spacing.xs },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    backgroundColor: GymTheme.surface,
  },
  typeText: { color: GymTheme.textMuted, fontSize: 12, fontWeight: '700' },
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
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: GymTheme.surface,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    backgroundColor: GymTheme.inputBg,
    borderWidth: 1,
    borderColor: GymTheme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderNum: { color: '#0C0C0E', fontWeight: '800', fontSize: 14 },
  exName: { color: GymTheme.text, fontSize: 15, flex: 1, fontWeight: '500' },
  tag: {
    color: GymTheme.active,
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: GymTheme.activeDim,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  createToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    marginTop: Spacing.md,
  },
  createToggleText: { fontSize: 14, fontWeight: '800' },
  createCard: {
    backgroundColor: GymTheme.surface,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  createTitle: { color: GymTheme.text, fontSize: 15, fontWeight: '800' },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  metricChip: {
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  metricText: { color: GymTheme.textMuted, fontSize: 12, fontWeight: '700' },
  corporalRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  footer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: GymTheme.border,
    backgroundColor: GymTheme.background,
  },
});
