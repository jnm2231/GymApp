import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button, EmptyState } from '@/components/gym/ui';
import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import { createDay, getDay, getDayExercises, updateDay } from '@/db/days';
import { listExercises } from '@/db/exercises';
import type { Exercise } from '@/db/types';

export default function DayFormScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ id?: string }>();
  const dayId = params.id ? Number(params.id) : null;
  const isEdit = dayId != null;

  const [name, setName] = useState('');
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [selected, setSelected] = useState<number[]>([]); // en orden de selección

  useEffect(() => {
    (async () => {
      setCatalog(await listExercises(db));
      if (isEdit) {
        const day = await getDay(db, dayId);
        if (day) setName(day.name);
        const exs = await getDayExercises(db, dayId);
        setSelected(exs.map((e) => e.id));
      }
    })();
  }, [db, dayId, isEdit]);

  const toggle = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Falta el nombre', 'Ponle un nombre al día (ej: Pecho).');
      return;
    }
    if (selected.length === 0) {
      Alert.alert('Sin ejercicios', 'Selecciona al menos un ejercicio para el día.');
      return;
    }
    if (isEdit) {
      await updateDay(db, dayId, trimmed, selected);
    } else {
      await createDay(db, trimmed, selected);
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

        <Text style={[styles.label, { marginTop: Spacing.lg }]}>
          Ejercicios {selected.length > 0 ? `(${selected.length})` : ''}
        </Text>
        <Text style={styles.hint}>El número indica el orden dentro del día.</Text>

        {catalog.length === 0 ? (
          <EmptyState
            title="No hay ejercicios en el catálogo"
            subtitle="Ve a Ajustes → Catálogo de ejercicios para crear algunos."
          />
        ) : (
          catalog.map((ex) => {
            const order = selected.indexOf(ex.id);
            const isSel = order !== -1;
            return (
              <Pressable
                key={ex.id}
                style={[styles.exRow, isSel && styles.exRowSel]}
                onPress={() => toggle(ex.id)}>
                <View style={[styles.checkbox, isSel && styles.checkboxSel]}>
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
  exRowSel: { borderColor: GymTheme.primary, backgroundColor: GymTheme.surfaceAlt },
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
  checkboxSel: { backgroundColor: GymTheme.primary, borderColor: GymTheme.primary },
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
  footer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: GymTheme.border,
    backgroundColor: GymTheme.background,
  },
});
