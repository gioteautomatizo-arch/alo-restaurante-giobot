import type { RestaurantInfo } from '../types';

export type DayKey =
  | 'lunes'
  | 'martes'
  | 'miercoles'
  | 'jueves'
  | 'viernes'
  | 'sabado'
  | 'domingo';

export interface DaySchedule {
  closed: boolean;
  openTime: string; // Formato 24h "HH:MM"
  closeTime: string; // Formato 24h "HH:MM"
}

export type WeeklySchedule = Record<DayKey, DaySchedule>;

export const DAY_KEYS: DayKey[] = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
];

export const DAY_LABELS: Record<DayKey, string> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
  domingo: 'Domingo',
};

export const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = {
  lunes: { closed: false, openTime: '09:00', closeTime: '17:30' },
  martes: { closed: false, openTime: '09:00', closeTime: '17:30' },
  miercoles: { closed: false, openTime: '09:00', closeTime: '17:30' },
  jueves: { closed: false, openTime: '09:00', closeTime: '17:30' },
  viernes: { closed: false, openTime: '09:00', closeTime: '17:30' },
  sabado: { closed: false, openTime: '09:00', closeTime: '17:30' },
  domingo: { closed: false, openTime: '09:00', closeTime: '17:30' },
};

export interface ScheduleStatusResult {
  isOpen: boolean;
  todayKey: DayKey;
  todaySchedule: DaySchedule;
  statusText: string; // Ej. "Abierto · 09:00–17:30" o "Cerrado · abre hoy a las 09:00"
  badgeText: 'Abierto' | 'Cerrado';
  todayHoursText: string; // Ej. "09:00–17:30" o "Cerrado hoy"
  nextOpeningText?: string;
  mexicoTimeText: string;
}

/**
 * Obtiene la fecha, hora y día de la semana en la zona horaria oficial del restaurante
 * ('America/Mexico_City'), sin depender del reloj del dispositivo del cliente.
 */
export function getMexicoCityDateTime(date: Date = new Date()): {
  dayKey: DayKey;
  hours: number;
  minutes: number;
  timeString: string;
  minutesFromMidnight: number;
} {
  const formatter = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  let weekdayStr = '';
  let hourStr = '0';
  let minuteStr = '0';

  for (const part of parts) {
    if (part.type === 'weekday') weekdayStr = part.value.toLowerCase();
    if (part.type === 'hour') hourStr = part.value;
    if (part.type === 'minute') minuteStr = part.value;
  }

  let hours = parseInt(hourStr, 10);
  if (hours === 24) hours = 0;
  const minutes = parseInt(minuteStr, 10);

  const normWeekday = weekdayStr
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  let dayKey: DayKey = 'lunes';
  if (normWeekday.startsWith('lun')) dayKey = 'lunes';
  else if (normWeekday.startsWith('mar')) dayKey = 'martes';
  else if (normWeekday.startsWith('mie')) dayKey = 'miercoles';
  else if (normWeekday.startsWith('jue')) dayKey = 'jueves';
  else if (normWeekday.startsWith('vie')) dayKey = 'viernes';
  else if (normWeekday.startsWith('sab')) dayKey = 'sabado';
  else if (normWeekday.startsWith('dom')) dayKey = 'domingo';

  const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  return {
    dayKey,
    hours,
    minutes,
    timeString,
    minutesFromMidnight: hours * 60 + minutes,
  };
}

/**
 * Resuelve el horario semanal garantizando compatibilidad retroactiva.
 * Si weeklySchedule no existe, utiliza los valores por defecto (09:00 a 17:30 todos los días).
 */
export function resolveWeeklySchedule(info?: Partial<RestaurantInfo> | null): WeeklySchedule {
  if (!info?.weeklySchedule) {
    return { ...DEFAULT_WEEKLY_SCHEDULE };
  }

  const result: WeeklySchedule = { ...DEFAULT_WEEKLY_SCHEDULE };
  for (const day of DAY_KEYS) {
    if (info.weeklySchedule[day]) {
      result[day] = {
        closed: !!info.weeklySchedule[day].closed,
        openTime: info.weeklySchedule[day].openTime || '09:00',
        closeTime: info.weeklySchedule[day].closeTime || '17:30',
      };
    }
  }
  return result;
}

function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = (timeStr || '00:00').split(':').map((v) => parseInt(v, 10) || 0);
  return h * 60 + m;
}

/**
 * Evalúa el estado del restaurante (Abierto o Cerrado) según el horario semanal
 * y la hora actual en America/Mexico_City.
 */
export function computeScheduleStatus(
  weekly: WeeklySchedule,
  currentDate: Date = new Date()
): ScheduleStatusResult {
  const { dayKey, timeString, minutesFromMidnight } = getMexicoCityDateTime(currentDate);
  const currentIdx = DAY_KEYS.indexOf(dayKey);
  const today = weekly[dayKey] || DEFAULT_WEEKLY_SCHEDULE[dayKey];

  const todayOpenMins = parseTimeToMinutes(today.openTime);
  const todayCloseMins = parseTimeToMinutes(today.closeTime);

  // 1. Si hoy no está marcado como cerrado
  if (!today.closed) {
    // Si aún no abre hoy
    if (minutesFromMidnight < todayOpenMins) {
      return {
        isOpen: false,
        todayKey: dayKey,
        todaySchedule: today,
        statusText: `Cerrado · abre hoy a las ${today.openTime}`,
        badgeText: 'Cerrado',
        todayHoursText: `${today.openTime}–${today.closeTime}`,
        nextOpeningText: `Abre hoy a las ${today.openTime}`,
        mexicoTimeText: timeString,
      };
    }
    // Si está dentro de la ventana de apertura
    if (minutesFromMidnight <= todayCloseMins) {
      return {
        isOpen: true,
        todayKey: dayKey,
        todaySchedule: today,
        statusText: `Abierto · ${today.openTime}–${today.closeTime}`,
        badgeText: 'Abierto',
        todayHoursText: `${today.openTime}–${today.closeTime}`,
        mexicoTimeText: timeString,
      };
    }
  }

  // 2. Si hoy está cerrado o ya pasó la hora de cierre, buscar el siguiente día abierto
  for (let offset = 1; offset <= 7; offset++) {
    const nextIdx = (currentIdx + offset) % 7;
    const nextKey = DAY_KEYS[nextIdx];
    const nextDay = weekly[nextKey];

    if (!nextDay.closed) {
      const dayWord = offset === 1 ? 'mañana' : `el ${DAY_LABELS[nextKey].toLowerCase()}`;
      return {
        isOpen: false,
        todayKey: dayKey,
        todaySchedule: today,
        statusText: `Cerrado · abre ${dayWord} a las ${nextDay.openTime}`,
        badgeText: 'Cerrado',
        todayHoursText: today.closed ? 'Cerrado hoy' : `${today.openTime}–${today.closeTime}`,
        nextOpeningText: `Abre ${dayWord} a las ${nextDay.openTime}`,
        mexicoTimeText: timeString,
      };
    }
  }

  return {
    isOpen: false,
    todayKey: dayKey,
    todaySchedule: today,
    statusText: 'Cerrado temporalmente',
    badgeText: 'Cerrado',
    todayHoursText: 'Cerrado',
    nextOpeningText: 'Horario no disponible',
    mexicoTimeText: timeString,
  };
}

/**
 * Genera un texto resumen amigable del horario semanal para guardar en openingHours
 * y mantener compatibilidad con cualquier vista que use texto plano.
 */
export function formatWeeklyScheduleSummary(weekly: WeeklySchedule): string {
  const allSame = DAY_KEYS.every(
    (k) =>
      weekly[k].closed === weekly.lunes.closed &&
      weekly[k].openTime === weekly.lunes.openTime &&
      weekly[k].closeTime === weekly.lunes.closeTime
  );

  if (allSame) {
    if (weekly.lunes.closed) return 'Cerrado';
    return `Lunes a domingo ${weekly.lunes.openTime} - ${weekly.lunes.closeTime}`;
  }

  return DAY_KEYS.map((k) => {
    const d = weekly[k];
    const shortDay = DAY_LABELS[k].slice(0, 3);
    return d.closed ? `${shortDay}: Cerrado` : `${shortDay}: ${d.openTime}-${d.closeTime}`;
  }).join(' | ');
}
