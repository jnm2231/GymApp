/**
 * Paleta visual de GymApp.
 * Tema oscuro inspirado en el icono de la app (placa oscura con aro naranja
 * incandescente). El verde se reserva para el estado "activo" de un ejercicio.
 */

export const GymTheme = {
  // Fondos
  background: '#0C0C0E',
  surface: '#161619',
  surfaceAlt: '#1E1E22',
  surfaceElevated: '#26262B',
  border: '#2C2C31',

  // Texto
  text: '#F2F2F3',
  textMuted: '#A0A0A8',
  textFaint: '#6B6B73',

  // Acentos
  primary: '#FF6A00', // naranja del icono
  primaryDim: '#7A3300',
  active: '#33D17A', // verde "ejercicio activo"
  activeDim: '#16361F',
  danger: '#E5484D',
  warning: '#F5A623',

  // Utilidad
  inputBg: '#1B1B1F',
  disabled: '#3A3A40',
  white: '#FFFFFF',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;
