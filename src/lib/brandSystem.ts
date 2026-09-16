export interface BrandPalette {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryDark: string;
  accent: string;
  metallic?: string;
  border: string;
}

export interface BusinessTheme {
  id: string;
  name: string;
  source: 'GIOTEAUTOMATIZO' | 'BUSINESS_CUSTOM';
  palette: BrandPalette;
}

/**
 * Marca madre de la plataforma.
 * Referencia visual: negro + blanco + dorado metálico.
 */
export const GIOTEAUTOMATIZO_BRAND = {
  name: 'Gioteautomatizo',
  slogan: 'Automatiza hoy, crece siempre',
  palette: {
    background: '#050505',
    surface: '#111111',
    surfaceAlt: '#1A1A1A',
    text: '#F7F7F7',
    textMuted: '#B7B7B7',
    primary: '#D6A34A',
    primaryDark: '#B8822D',
    accent: '#E3BC6B',
    metallic: '#C8C8C8',
    border: '#3A3022',
  } satisfies BrandPalette,
} as const;

/**
 * Giobot es la marca del asistente IA de fábrica.
 * Comparte negro/dorado con Gioteautomatizo y añade plata metálica.
 */
export const GIOBOT_BRAND = {
  name: 'Giobot',
  byline: 'by Gioteautomatizo',
  palette: {
    background: '#050505',
    surface: '#121212',
    surfaceAlt: '#1B1B1B',
    text: '#F5F5F5',
    textMuted: '#BDBDBD',
    primary: '#D9A73E',
    primaryDark: '#A87418',
    accent: '#F1C761',
    metallic: '#C7C7C7',
    border: '#40351F',
  } satisfies BrandPalette,
} as const;

export const DEFAULT_BUSINESS_THEME: BusinessTheme = {
  id: 'gioteautomatizo-default',
  name: 'Gioteautomatizo',
  source: 'GIOTEAUTOMATIZO',
  palette: GIOTEAUTOMATIZO_BRAND.palette,
};

/**
 * Más adelante cada tenant guardará esta estructura en Firestore.
 * Si el dueño no personaliza colores, la app siempre cae en la identidad Gioteautomatizo.
 */
export function createBusinessTheme(input?: Partial<BrandPalette>): BusinessTheme {
  if (!input || Object.keys(input).length === 0) return DEFAULT_BUSINESS_THEME;

  return {
    id: 'business-custom',
    name: 'Tema personalizado',
    source: 'BUSINESS_CUSTOM',
    palette: {
      ...GIOTEAUTOMATIZO_BRAND.palette,
      ...input,
    },
  };
}
