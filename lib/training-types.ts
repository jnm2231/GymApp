import { GymTheme } from '@/constants/gym-theme';
import type { TrainingType } from '@/db/types';

export const TRAINING_TYPES: {
  value: TrainingType;
  label: string;
  color: string;
  dimColor: string;
  icon: 'dumbbell' | 'run-fast' | 'human-handsup';
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
    label: 'Calistenia',
    color: GymTheme.active,
    dimColor: GymTheme.activeDim,
    icon: 'human-handsup',
  },
];

export function getTrainingType(type: TrainingType) {
  return TRAINING_TYPES.find((item) => item.value === type) ?? TRAINING_TYPES[0];
}
