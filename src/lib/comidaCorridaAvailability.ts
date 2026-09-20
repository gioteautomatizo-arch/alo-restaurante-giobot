import { ComidaCorridaAvailabilityStatus, DailyMenuConfig } from '../types';

export const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;

export function getMexicoCityWeekday(date: Date = new Date()): number {
  try {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      weekday: 'short',
    }).format(date);
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return map[weekday] ?? date.getDay();
  } catch {
    return date.getDay();
  }
}

export function getComidaCorridaStatus(config: DailyMenuConfig, date: Date = new Date()): ComidaCorridaAvailabilityStatus {
  const enabledDays = Array.isArray(config.availableWeekdays) && config.availableWeekdays.length
    ? config.availableWeekdays
    : [1, 2, 3, 4, 5];

  const today = getMexicoCityWeekday(date);
  if (!enabledDays.includes(today)) return 'NO_DISPONIBLE';

  if (config.availabilityStatus) return config.availabilityStatus;
  return config.isAvailable === false ? 'AGOTADA' : 'DISPONIBLE';
}

export function isComidaCorridaOrderable(config: DailyMenuConfig, date: Date = new Date()): boolean {
  const status = getComidaCorridaStatus(config, date);
  return status === 'DISPONIBLE' || status === 'ULTIMAS_PORCIONES';
}

export function getComidaCorridaStatusLabel(status: ComidaCorridaAvailabilityStatus): string {
  switch (status) {
    case 'ULTIMAS_PORCIONES':
      return 'Últimas porciones';
    case 'AGOTADA':
      return 'Agotada por hoy';
    case 'NO_DISPONIBLE':
      return 'Hoy no hay comida corrida';
    default:
      return 'Disponible';
  }
}

export function getComidaCorridaStatusMessage(status: ComidaCorridaAvailabilityStatus): string {
  switch (status) {
    case 'ULTIMAS_PORCIONES':
      return 'Quedan pocas porciones. Pídela antes de que se termine.';
    case 'AGOTADA':
      return 'La comida corrida se terminó por hoy.';
    case 'NO_DISPONIBLE':
      return 'Hoy no tenemos servicio de comida corrida.';
    default:
      return '3 tiempos con guisado casero.';
  }
}
