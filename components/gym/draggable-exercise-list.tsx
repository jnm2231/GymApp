import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { GymTheme, Radius, Spacing } from '@/constants/gym-theme';
import type { TrainingType } from '@/db/types';
import { getTrainingType } from '@/lib/training-types';

export const ROW_HEIGHT = 54;
export const ROW_GAP = 6;
const ROW_STEP = ROW_HEIGHT + ROW_GAP;

export interface DraggableExerciseItem {
  id: number;
  name: string;
  exercise_type: TrainingType;
}

interface DraggableExerciseListProps {
  exercises: DraggableExerciseItem[];
  onReorder: (orderedIds: number[]) => void;
  onRemove: (exerciseId: number) => void;
  onDragActiveChange?: (isDragging: boolean) => void;
}

interface DraggableRowProps {
  exercise: DraggableExerciseItem;
  index: number;
  isDragging: boolean;
  isAnyDragging: boolean;
  shiftOffset: number;
  dragY: Animated.Value;
  onStart: (index: number) => void;
  onMove: (dy: number) => void;
  onEnd: () => void;
  onRemove: (exerciseId: number) => void;
}

function DraggableRow({
  exercise,
  index,
  isDragging,
  isAnyDragging,
  shiftOffset,
  dragY,
  onStart,
  onMove,
  onEnd,
  onRemove,
}: DraggableRowProps) {
  const shiftY = useMemo(() => new Animated.Value(0), []);

  useLayoutEffect(() => {
    if (isDragging || !isAnyDragging) {
      shiftY.stopAnimation();
      shiftY.setValue(0);
      return;
    }
    Animated.timing(shiftY, {
      toValue: shiftOffset,
      duration: 130,
      useNativeDriver: true,
    }).start();
  }, [shiftOffset, isDragging, isAnyDragging, shiftY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          onStart(index);
        },
        onPanResponderMove: (_, gestureState) => {
          onMove(gestureState.dy);
        },
        onPanResponderRelease: () => {
          onEnd();
        },
        onPanResponderTerminate: () => {
          onEnd();
        },
      }),
    [index, onStart, onMove, onEnd]
  );

  const typeInfo = getTrainingType(exercise.exercise_type);
  const translateY = isDragging ? dragY : shiftY;

  return (
    <Animated.View
      style={[
        styles.row,
        isDragging && styles.rowDragging,
        {
          transform: [{ translateY }, { scale: isDragging ? 1.02 : 1 }],
        },
      ]}>
      <View
        style={styles.dragHandle}
        {...panResponder.panHandlers}
        accessibilityLabel={`Reordenar ${exercise.name}`}>
        <MaterialCommunityIcons
          name="drag-vertical"
          size={20}
          color={isDragging ? GymTheme.primary : GymTheme.textFaint}
        />
      </View>

      <View
        style={[
          styles.typeBadge,
          { backgroundColor: typeInfo.dimColor, borderColor: typeInfo.color },
        ]}>
        <MaterialCommunityIcons name={typeInfo.icon} size={16} color={typeInfo.color} />
      </View>

      <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
        {exercise.name}
      </Text>

      <View
        style={[
          styles.orderPill,
          { backgroundColor: typeInfo.dimColor, borderColor: typeInfo.color },
        ]}>
        <Text style={[styles.orderText, { color: typeInfo.color }]}>{index + 1}</Text>
      </View>

      <Pressable
        onPress={() => onRemove(exercise.id)}
        disabled={isAnyDragging}
        hitSlop={6}
        style={({ pressed }) => [
          styles.removeButton,
          pressed && !isAnyDragging && styles.removeButtonPressed,
        ]}
        accessibilityLabel={`Quitar ${exercise.name}`}>
        <MaterialCommunityIcons name="close" size={18} color={GymTheme.textMuted} />
      </Pressable>
    </Animated.View>
  );
}

/**
 * Caja con borde que muestra los ejercicios seleccionados de un día y permite
 * reordenarlos mediante arrastre vertical determinista o quitarlos rápidamente.
 */
export function DraggableExerciseList({
  exercises,
  onReorder,
  onRemove,
  onDragActiveChange,
}: DraggableExerciseListProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const dragY = useMemo(() => new Animated.Value(0), []);
  const latestRef = useRef({ exercises, onReorder, onDragActiveChange });

  useEffect(() => {
    latestRef.current = { exercises, onReorder, onDragActiveChange };
  });

  const dragStartIndexRef = useRef<number | null>(null);
  const hoverIndexRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      latestRef.current.onDragActiveChange?.(false);
    };
  }, []);

  const handleDragStart = useCallback(
    (index: number) => {
      dragStartIndexRef.current = index;
      hoverIndexRef.current = index;
      dragY.stopAnimation();
      dragY.setValue(0);
      setActiveIndex(index);
      setHoverIndex(index);
      latestRef.current.onDragActiveChange?.(true);
    },
    [dragY]
  );

  const handleDragMove = useCallback(
    (dy: number) => {
      const startIdx = dragStartIndexRef.current;
      const list = latestRef.current.exercises;
      if (startIdx == null || list.length <= 1) return;

      const minDy = -startIdx * ROW_STEP;
      const maxDy = (list.length - 1 - startIdx) * ROW_STEP;
      const clampedDy = Math.max(minDy, Math.min(maxDy, dy));
      dragY.setValue(clampedDy);

      const nextHover = Math.max(
        0,
        Math.min(list.length - 1, startIdx + Math.round(clampedDy / ROW_STEP))
      );

      if (nextHover !== hoverIndexRef.current) {
        hoverIndexRef.current = nextHover;
        setHoverIndex(nextHover);
      }
    },
    [dragY]
  );

  const handleDragEnd = useCallback(() => {
    const startIdx = dragStartIndexRef.current;
    const targetIdx = hoverIndexRef.current;
    const list = latestRef.current.exercises;

    dragStartIndexRef.current = null;
    hoverIndexRef.current = null;

    dragY.stopAnimation();
    dragY.setValue(0);

    setActiveIndex(null);
    setHoverIndex(null);
    latestRef.current.onDragActiveChange?.(false);

    if (
      startIdx != null &&
      targetIdx != null &&
      startIdx !== targetIdx &&
      startIdx >= 0 &&
      targetIdx >= 0 &&
      startIdx < list.length &&
      targetIdx < list.length
    ) {
      const nextIds = list.map((item) => item.id);
      const [moved] = nextIds.splice(startIdx, 1);
      nextIds.splice(targetIdx, 0, moved);
      latestRef.current.onReorder(nextIds);
    }
  }, [dragY]);

  if (exercises.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>
          Selecciona ejercicios abajo para añadirlos al día y arrástralos aquí para ordenarlos.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <View style={styles.list}>
        {exercises.map((exercise, index) => {
          const isDragging = activeIndex === index;
          let shiftOffset = 0;
          if (activeIndex != null && hoverIndex != null && index !== activeIndex) {
            if (hoverIndex > activeIndex && index > activeIndex && index <= hoverIndex) {
              shiftOffset = -ROW_STEP;
            } else if (hoverIndex < activeIndex && index >= hoverIndex && index < activeIndex) {
              shiftOffset = ROW_STEP;
            }
          }

          return (
            <DraggableRow
              key={exercise.id}
              exercise={exercise}
              index={index}
              isDragging={isDragging}
              isAnyDragging={activeIndex != null}
              shiftOffset={shiftOffset}
              dragY={dragY}
              onStart={handleDragStart}
              onMove={handleDragMove}
              onEnd={handleDragEnd}
              onRemove={onRemove}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: GymTheme.surface,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  emptyBox: {
    backgroundColor: GymTheme.surface,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: GymTheme.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  list: {
    gap: ROW_GAP,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GymTheme.surfaceAlt,
    borderWidth: 1,
    borderColor: GymTheme.border,
    borderRadius: Radius.md,
    paddingRight: Spacing.xs,
    zIndex: 1,
  },
  rowDragging: {
    backgroundColor: GymTheme.surfaceElevated,
    borderColor: GymTheme.primary,
    zIndex: 100,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  dragHandle: {
    width: 34,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBadge: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    flex: 1,
    color: GymTheme.text,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: Spacing.sm,
    marginRight: Spacing.xs,
  },
  orderPill: {
    minWidth: 26,
    height: 24,
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderText: {
    fontSize: 12,
    fontWeight: '800',
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  removeButtonPressed: {
    backgroundColor: GymTheme.surfaceElevated,
  },
});
