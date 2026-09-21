import { ComidaCorridaAvailabilityStatus, DailyMenuConfig } from '../types';

export const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;

export function getMexicoCityDateKey(date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value || '';
    const month = parts.find((part) => part.type === 'month')?.value || '';
    const day = parts.find((part) => part.type === 'day')?.value || '';
    return `${year}-${month}-${day}`;
  } catch {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

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

  const todayKey = getMexicoCityDateKey(date);

  // El estado manual del día tiene prioridad sobre la programación semanal.
  // Ejemplo: si normalmente no hay corrida en domingo, pero hoy la dueña marca
  // "Disponible", debe poder venderse sólo hoy sin activar todos los domingos.
  const hasTodayManualOverride =
    !!config.availabilityStatus &&
    config.availabilityStatusDate === todayKey;

  if (hasTodayManualOverride) {
    return config.availabilityStatus as ComidaCorridaAvailabilityStatus;
  }

  const today = getMexicoCityWeekday(date);
  if (!enabledDays.includes(today)) return 'NO_DISPONIBLE';

  return 'DISPONIBLE';
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
