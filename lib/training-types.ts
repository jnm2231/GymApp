import { GymTheme } from '@/constants/gym-theme';
import type { TrainingType } from '@/db/types';

export const TRAINING_TYPES: {
  value: TrainingType;
  label: string;
  color: string;
  dimColor: string;
  icon: 'dumbbell' | 'run-fast' | 'human-handsup' | 'timer-outline';
}[] = [
  {
    value: 'strength',
    label: 'Musculación',
    color: GymTheme.primary,
    dimColor: GymTheme.primaryDim,
    icon: 'dumbbell',
  },
  {
    value: 'cardio',
    label: 'Cardio',
    color: GymTheme.cardio,
    dimColor: GymTheme.cardioDim,
    icon: 'run-fast',
  },
  {
    value: 'calisthenics',
    label: 'Corporal',
    color: GymTheme.active,
    dimColor: GymTheme.activeDim,
    icon: 'human-handsup',
  },
  {
    value: 'hold',
    label: 'Aguante',
    color: GymTheme.hold,
    dimColor: GymTheme.holdDim,
    icon: 'timer-outline',
  },
];

/** Tipos disponibles para una plantilla de día. Aguante es solo un tipo de ejercicio. */
export const DAY_TYPES = TRAINING_TYPES.filter(
  (type) => type.value !== 'hold'
).map((type) =>
  type.value === 'calisthenics' ? { ...type, label: 'Calistenia' } : type
);

export function getTrainingType(type: TrainingType) {
  return TRAINING_TYPES.find((item) => item.value === type) ?? TRAINING_TYPES[0];
}

export function getDayType(type: TrainingType) {
  return DAY_TYPES.find((item) => item.value === type) ?? DAY_TYPES[0];
}
