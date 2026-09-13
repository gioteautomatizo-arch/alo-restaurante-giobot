export type PromotionDayKey =
  | 'lunes'
  | 'martes'
  | 'miercoles'
  | 'jueves'
  | 'viernes'
  | 'sabado'
  | 'domingo';

export const PROMOTION_DAYS: Array<{ key: PromotionDayKey; label: string; shortLabel: string }> = [
  { key: 'lunes', label: 'Lunes', shortLabel: 'Lun' },
  { key: 'martes', label: 'Martes', shortLabel: 'Mar' },
  { key: 'miercoles', label: 'Miércoles', shortLabel: 'Mié' },
  { key: 'jueves', label: 'Jueves', shortLabel: 'Jue' },
  { key: 'viernes', label: 'Viernes', shortLabel: 'Vie' },
  { key: 'sabado', label: 'Sábado', shortLabel: 'Sáb' },
  { key: 'domingo', label: 'Domingo', shortLabel: 'Dom' },
];

export type WeeklyPromotionMap = Record<PromotionDayKey, string>;

export const CALIENTITO_WEEKLY_PROMOTIONS_BY_DAY: WeeklyPromotionMap = {
  lunes: 'Americano mediano 2x1 · 8:00 a.m. a 11:00 a.m.',
  martes: 'Hamburguesa sencilla $75 · Incluye papas y refresco · 3:00 p.m. a 7:00 p.m.',
  miercoles: '2 burritos especiales $150 · Todo el día',
  jueves: 'Frappuccino $40 con crema batida · 1:00 p.m. a 6:00 p.m.',
  viernes: 'Americano mediano 2x1 · 8:00 a.m. a 11:00 a.m.',
  sabado: 'Americano mediano + pan del día $40 · 9:30 a.m. a 12:00 p.m.',
  domingo: 'Americano mediano + pan del día $40 · 9:30 a.m. a 12:00 p.m.',
};

const EMPTY_PROMOTIONS: WeeklyPromotionMap = {
  lunes: '',
  martes: '',
  miercoles: '',
  jueves: '',
  viernes: '',
  sabado: '',
  domingo: '',
};

const LEGACY_PROMO_PLACEHOLDERS = new Set([
  '',
  'proximamente',
  'próximamente',
  '10% de descuento por traer recipientes propios',
]);

const EMPTY_PROMO_VALUES = new Set([
  'ninguna',
  'sin promociones',
  'sin promociones activas',
  'no hay promociones',
  'no hay promociones activas',
]);

const normalize = (value: string): string =>
  value
    .trim()
    .toLocaleLowerCase('es-MX')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.!]+$/g, '');

export function shouldMigrateLegacyPromotions(value?: string | null): boolean {
  if (value == null) return true;
  return LEGACY_PROMO_PLACEHOLDERS.has(normalize(value));
}

function dayFromPrefix(prefix: string): PromotionDayKey | null {
  const normalized = normalize(prefix);
  if (normalized.startsWith('lunes')) return 'lunes';
  if (normalized.startsWith('martes')) return 'martes';
  if (normalized.startsWith('miercoles')) return 'miercoles';
  if (normalized.startsWith('jueves')) return 'jueves';
  if (normalized.startsWith('viernes')) return 'viernes';
  if (normalized.startsWith('sabado')) return 'sabado';
  if (normalized.startsWith('domingo')) return 'domingo';
  return null;
}

/**
 * Convierte el string histórico de activePromotions en campos editables por día.
 * Seguimos guardando un solo string para no migrar Firestore ni romper Tita.
 */
export function parseWeeklyPromotions(value?: string | null): WeeklyPromotionMap {
  if (shouldMigrateLegacyPromotions(value)) {
    return { ...CALIENTITO_WEEKLY_PROMOTIONS_BY_DAY };
  }
  if (!value || EMPTY_PROMO_VALUES.has(normalize(value))) {
    return { ...EMPTY_PROMOTIONS };
  }

  const result: WeeklyPromotionMap = { ...EMPTY_PROMOTIONS };
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const [rawPrefix, ...rest] = line.split('·');
    const promoText = rest.join('·').trim();
    const prefix = rawPrefix.trim();
    const normalizedPrefix = normalize(prefix);

    // Compatibilidad con el letrero original: “Lunes y viernes” / “Sábado y domingo”.
    if (normalizedPrefix.includes('lunes') && normalizedPrefix.includes('viernes')) {
      const text = promoText || line.replace(/^lunes\s+y\s+viernes\s*[-:·]?\s*/i, '').trim();
      result.lunes = text;
      result.viernes = text;
      continue;
    }
    if (normalizedPrefix.includes('sabado') && normalizedPrefix.includes('domingo')) {
      const text = promoText || line.replace(/^s[aá]bado\s+y\s+domingo\s*[-:·]?\s*/i, '').trim();
      result.sabado = text;
      result.domingo = text;
      continue;
    }

    const day = dayFromPrefix(prefix);
    if (!day) continue;
    result[day] = promoText || line.replace(/^[^:·-]+[:·-]\s*/, '').trim();
  }

  return result;
}

export function serializeWeeklyPromotions(schedule: WeeklyPromotionMap): string {
  const lines = PROMOTION_DAYS
    .map(({ key, label }) => {
      const text = (schedule[key] || '').trim();
      return text ? `${label} · ${text}` : '';
    })
    .filter(Boolean);

  return lines.length > 0 ? lines.join('\n') : 'Sin promociones activas';
}

export function parseActivePromotions(value?: string | null): string[] {
  const schedule = parseWeeklyPromotions(value);
  return PROMOTION_DAYS
    .map(({ key, label }) => (schedule[key] ? `${label} · ${schedule[key]}` : ''))
    .filter(Boolean);
}

export function promotionsForStorage(value?: string | null): string {
  return serializeWeeklyPromotions(parseWeeklyPromotions(value));
}

export function promotionsForEditor(value?: string | null): string {
  return serializeWeeklyPromotions(parseWeeklyPromotions(value));
}

export function getPromotionDayKey(date: Date = new Date()): PromotionDayKey {
  const weekday = new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    timeZone: 'America/Mexico_City',
  }).format(date);

  return dayFromPrefix(weekday) || 'lunes';
}

export function getTodaysPromotion(value?: string | null, date: Date = new Date()): { day: PromotionDayKey; label: string; text: string } | null {
  const schedule = parseWeeklyPromotions(value);
  const day = getPromotionDayKey(date);
  const text = schedule[day]?.trim();
  if (!text) return null;
  const label = PROMOTION_DAYS.find((item) => item.key === day)?.label || day;
  return { day, label, text };
}
