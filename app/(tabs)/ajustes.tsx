import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import {
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
import { CopyButton } from '@/components/gym/copy-button';
import { SaveButton } from '@/components/gym/save-button';
import { Button, ScreenTitle } from '@/components/gym/ui';
import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import { useSession } from '@/context/session-context';
import {
  createExercise,
  deleteExercise,
  listExercises,
} from '@/db/exercises';
import { getDevNote, saveDevNote } from '@/db/notes';
import { getUserWeight, setUserWeight } from '@/db/settings';
import type { Exercise } from '@/db/types';
import { exportBackup, importBackup } from '@/lib/backup-io';
import { useKeyboardHeight } from '@/lib/use-keyboard';

const CATALOG_PREVIEW = 5; // ejercicios visibles antes de "Ver todos"

export default function AjustesScreen() {
  const db = useSQLiteContext();
  const showAlert = useAlert();
  const insets = useSafeAreaInsets();
  const { refresh } = useSession();
  const scrollRef = useRef<ScrollView>(null);
  const keyboardHeight = useKeyboardHeight();

  const [weight, setWeight] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [catalogExpanded, setCatalogExpanded] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCorporal, setNewCorporal] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const w = await getUserWeight(db);
    setWeight(w ? String(w) : '');
    setExercises(await listExercises(db));
    const devNote = await getDevNote(db);
    setNote(devNote?.content ?? '');
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleSaveWeight = async () => {
    const n = parseFloat(weight.replace(',', '.'));
    await setUserWeight(db, Number.isFinite(n) ? n : 0);
  };

  const handleAddExercise = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await createExercise(db, name, newCorporal);
      setNewName('');
      setNewCorporal(false);
      await load();
    } catch {
      showAlert('Ya existe', `El ejercicio "${name}" ya está en el catálogo.`);
    }
  };

  const handleDeleteExercise = (ex: Exercise) => {
    showAlert(
      'Eliminar ejercicio',
      `¿Eliminar "${ex.name}" del catálogo? Se quitará de las plantillas de día. El histórico se conserva.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await deleteExercise(db, ex.id);
            await load();
          },
        },
      ]
    );
  };

  const handleExport = async () => {
    try {
      setBusy(true);
      await exportBackup(db);
    } catch (e) {
      showAlert('Error al exportar', e instanceof Error ? e.message : 'Error desconocido.');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = () => {
    showAlert(
      'Importar copia de seguridad',
      'Se SOBRESCRIBIRÁN todos los datos actuales (ejercicios, días, sesiones e histórico) con los del archivo. Las Notas de Desarrollo no se ven afectadas. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          style: 'destructive',
          onPress: async () => {
            try {
              setBusy(true);
              const ok = await importBackup(db);
              if (ok) {
                await load();
                await refresh();
                showAlert('Restauración completada', 'Los datos se han importado correctamente.');
              }
            } catch (e) {
              showAlert(
                'Error al importar',
                e instanceof Error ? e.message : 'No se han podido importar los datos.'
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const handleSaveNote = async () => {
    await saveDevNote(db, note);
  };

  const handleCopyNote = async (): Promise<boolean> => {
    if (!note.trim()) {
      showAlert('Nota vacía', 'No hay nada que copiar.');
      return false;
    }
    await Clipboard.setStringAsync(note);
    return true;
  };

  return (
    <View style={{ flex: 1, backgroundColor: GymTheme.background }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.sm, paddingBottom: Spacing.xxl + keyboardHeight },
        ]}
        keyboardShouldPersistTaps="handled">
        <ScreenTitle>Ajustes</ScreenTitle>

        {/* Perfil */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Perfil</Text>
          <Text style={styles.cardSub}>
            Tu peso corporal se usa en los cálculos de fuerza (1RM) de los ejercicios corporales.
          </Text>
          <View style={styles.weightRow}>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={GymTheme.textFaint}
              keyboardType="decimal-pad"
              value={weight}
              onChangeText={setWeight}
              onBlur={handleSaveWeight}
              onSubmitEditing={handleSaveWeight}
              returnKeyType="done"
            />
            <Text style={styles.unit}>kg</Text>
            <SaveButton title="Guardar" onPress={handleSaveWeight} style={{ flex: 1 }} />
          </View>
        </View>

        {/* Catálogo de ejercicios */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Catálogo de ejercicios</Text>
          <Text style={styles.cardSub}>
            Ejercicios base disponibles para componer tus días. Marca &quot;Corporal&quot; si el peso
            propio cuenta para el 1RM (ej: dominadas).
          </Text>

          {(catalogExpanded ? exercises : exercises.slice(0, CATALOG_PREVIEW)).map((ex) => (
            <View key={ex.id} style={styles.exerciseRow}>
              <MaterialCommunityIcons
                name={ex.es_corporal ? 'human-handsup' : 'weight'}
                size={20}
                color={ex.es_corporal ? GymTheme.active : GymTheme.textMuted}
              />
              <Text style={styles.exerciseName}>{ex.name}</Text>
              {ex.es_corporal ? <Text style={styles.tag}>corporal</Text> : null}
              <Pressable hitSlop={8} onPress={() => handleDeleteExercise(ex)}>
                <MaterialCommunityIcons name="trash-can-outline" size={20} color={GymTheme.danger} />
              </Pressable>
            </View>
          ))}
          {exercises.length === 0 ? (
            <Text style={styles.muted}>Aún no hay ejercicios. Crea el primero abajo.</Text>
          ) : null}
          {exercises.length > CATALOG_PREVIEW ? (
            <Pressable style={styles.expandRow} onPress={() => setCatalogExpanded((v) => !v)}>
              <Text style={styles.expandText}>
                {catalogExpanded ? 'Ver menos' : `Ver todos (${exercises.length})`}
              </Text>
              <MaterialCommunityIcons
                name={catalogExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={GymTheme.primary}
              />
            </Pressable>
          ) : null}

          <View style={styles.divider} />
          <TextInput
            style={[styles.input, { width: '100%' }]}
            placeholder="Nuevo ejercicio (ej: Press banca)"
            placeholderTextColor={GymTheme.textFaint}
            value={newName}
            onChangeText={setNewName}
            onSubmitEditing={handleAddExercise}
            returnKeyType="done"
          />
          <View style={styles.corporalRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
              <Switch
                value={newCorporal}
                onValueChange={setNewCorporal}
                trackColor={{ true: GymTheme.active, false: GymTheme.disabled }}
                thumbColor={GymTheme.white}
              />
              <Text style={styles.cardSub}>Es corporal (peso + lastre)</Text>
            </View>
            <Button title="Añadir" onPress={handleAddExercise} />
          </View>
        </View>

        {/* Plantillas de día */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Días de entrenamiento</Text>
          <Text style={styles.cardSub}>
            Crea plantillas de día (Pecho, Espalda...) seleccionando ejercicios del catálogo.
          </Text>
          <Button
            title="Nuevo día"
            variant="surface"
            left={<MaterialCommunityIcons name="plus" size={18} color={GymTheme.text} />}
            onPress={() => router.push('/day-form')}
          />
        </View>

        {/* Copias de seguridad */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Copias de seguridad</Text>
          <Text style={styles.cardSub}>
            Exporta toda la base de datos a un archivo .json para guardarla o pasarla a otro móvil, e
            impórtala para restaurarla. Las Notas de Desarrollo quedan excluidas.
          </Text>
          <Button
            title="Exportar copia (.json)"
            variant="surface"
            loading={busy}
            left={<MaterialCommunityIcons name="export" size={18} color={GymTheme.text} />}
            onPress={handleExport}
          />
          <Button
            title="Importar copia"
            variant="surface"
            loading={busy}
            left={<MaterialCommunityIcons name="import" size={18} color={GymTheme.text} />}
            onPress={handleImport}
          />
        </View>

        {/* Notas de desarrollo */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Notas de desarrollo (Backlog)</Text>
          <Text style={styles.cardSub}>Ideas y pendientes. No se incluyen en las copias de seguridad.</Text>
          <TextInput
            style={styles.textarea}
            placeholder="Escribe aquí tus notas..."
            placeholderTextColor={GymTheme.textFaint}
            value={note}
            onChangeText={setNote}
            onBlur={handleSaveNote}
            onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150)}
            multiline
            textAlignVertical="top"
          />
          <View style={styles.noteActions}>
            <CopyButton onPress={handleCopyNote} style={{ flex: 1 }} />
            <SaveButton title="Guardar nota" onPress={handleSaveNote} style={{ flex: 1 }} />
          </View>
        </View>

        <View style={styles.about}>
          <View style={styles.aboutRow}>
            <Ionicons name="barbell" size={16} color={GymTheme.textFaint} />
            <Text style={styles.version}>
              GymApp v{Constants.expoConfig?.version ?? '1.1.0'} · datos sólo en este dispositivo
            </Text>
          </View>
          <Text style={styles.author}>Creado por jnm2231</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg },
  card: {
    backgroundColor: GymTheme.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: GymTheme.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  cardTitle: { color: GymTheme.text, fontSize: 17, fontWeight: '700' },
  cardSub: { color: GymTheme.textMuted, fontSize: 13, lineHeight: 18 },
  muted: { color: GymTheme.textFaint, fontSize: 14 },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  input: {
    backgroundColor: GymTheme.inputBg,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    color: GymTheme.text,
    fontSize: 16,
    minWidth: 90,
  },
  unit: { color: GymTheme.textMuted, fontSize: 16, fontWeight: '600' },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
  exerciseName: { color: GymTheme.text, fontSize: 15, flex: 1, fontWeight: '500' },
  tag: {
    color: GymTheme.active,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    backgroundColor: GymTheme.activeDim,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  divider: { height: 1, backgroundColor: GymTheme.border, marginVertical: Spacing.xs },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  expandText: { color: GymTheme.primary, fontSize: 14, fontWeight: '700' },
  corporalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  noteActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  textarea: {
    backgroundColor: GymTheme.inputBg,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    color: GymTheme.text,
    fontSize: 15,
    minHeight: 120,
  },
  about: { alignItems: 'center', gap: 4 },
  aboutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  version: { color: GymTheme.textFaint, fontSize: 12, textAlign: 'center' },
  author: { color: GymTheme.textMuted, fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
});
