// Convierte texto pegado (o escrito) en productos de catálogo. Sin IA y sin costo.
// Formatos que entiende, una línea por producto:
//   Nombre | Categoría | Precio | Descripción | Opciones   (el que pide la IA; Opciones separadas con /)
//   Nombre - $45        Nombre $45        Nombre ..... 45
//   Nombre - descripción - $45
// Líneas sin precio y cortas (o con ":" / "#" / MAYÚSCULAS) se toman como categoría.

export interface ParsedChoice {
  name: string;
  /** Lo que suma al precio base del producto. */
  price: number;
}

export interface ParsedMenuItem {
  name: string;
  category: string;
  price: number | null;
  description: string;
  /** Opciones a elegir (ej. Nopales / Pollo / Chorizo). Vacío si no hay. */
  options: ParsedChoice[];
}

type Row = ParsedMenuItem & { fromPipe: boolean; variantParts: string[] | null };

const PRICE_AT_END = /(?:\$\s*)?(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:pesos|mxn|mx|\$)?\s*$/i;

function toPrice(raw: string): number | null {
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function clean(text: string): string {
  return text.replace(/^[\s\-–—•*·>\d.)]+(?=\D)/, (m) => (/\d/.test(m) ? m : '')).replace(/\s+/g, ' ').trim();
}

function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[-–—•*·>]+|\d{1,2}[.)])\s+/, '').trim();
}

function looksLikeCategory(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^#{1,6}\s+/.test(t)) return true;
  if (/[:：]$/.test(t)) return true;
  const letters = t.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
  if (letters.length >= 3 && t === t.toUpperCase() && t.length <= 40) return true;
  return false;
}

function categoryName(line: string): string {
  const name = line.replace(/^#{1,6}\s+/, '').replace(/[:：]\s*$/, '').replace(/^[\s*_\-–—=]+|[\s*_\-–—=]+$/g, '').trim();
  // "TACO NORTEÑO" -> "Taco norteño"
  if (name.length > 1 && name === name.toUpperCase() && name !== name.toLowerCase()) {
    const lower = name.toLocaleLowerCase('es-MX');
    return lower.charAt(0).toLocaleUpperCase('es-MX') + lower.slice(1);
  }
  return name;
}

function splitOptions(raw: string): ParsedChoice[] {
  return raw.split(/\s*\/\s*|\s*;\s*/).map((o) => o.trim()).filter(Boolean).map((name) => ({ name, price: 0 }));
}

const roundMoney = (n: number) => Math.round(n * 100) / 100;

/** Une las líneas de una sección que son variantes de un mismo producto (Nopales / Pollo / Chorizo $90 …). */
function mergeVariants(rows: Row[], notes: Record<string, string>): ParsedMenuItem[] {
  const byCategory = new Map<string, Row[]>();
  rows.forEach((row) => {
    if (!byCategory.has(row.category)) byCategory.set(row.category, []);
    byCategory.get(row.category)!.push(row);
  });

  const mergedAt = new Map<Row, ParsedMenuItem | null>();
  byCategory.forEach((list, category) => {
    if (!list.some((r) => r.variantParts)) return;
    const members = list.filter((r) => !r.fromPipe && r.price !== null && !r.description && r.options.length === 0);
    if (!members.some((r) => r.variantParts)) return;
    const base = Math.min(...members.map((r) => r.price as number));
    const options: ParsedChoice[] = [];
    members.forEach((row) => {
      const extra = roundMoney((row.price as number) - base);
      (row.variantParts || [row.name]).forEach((name) => {
        if (!options.some((o) => o.name.toLowerCase() === name.toLowerCase())) options.push({ name, price: extra });
      });
    });
    const merged: ParsedMenuItem = { name: category, category, price: base, description: notes[category] || '', options };
    members.forEach((row, index) => mergedAt.set(row, index === 0 ? merged : null));
  });

  const result: ParsedMenuItem[] = [];
  rows.forEach((row) => {
    if (mergedAt.has(row)) {
      const merged = mergedAt.get(row);
      if (merged) result.push(merged);
      return;
    }
    const { fromPipe: _fp, variantParts: _vp, ...item } = row;
    if (!item.description && notes[item.category]) item.description = notes[item.category];
    result.push(item);
  });
  return result;
}

export function parseMenuText(text: string, defaultCategory = 'General'): ParsedMenuItem[] {
  const items: Row[] = [];
  const notes: Record<string, string> = {};
  let category = defaultCategory;

  const lines = text.replace(/\r/g, '').split('\n');
  const hasPriceAtEnd = (l: string) => {
    const t = stripBullet(l.trim());
    const m = t.match(PRICE_AT_END);
    return !!m && m.index !== undefined && t.slice(0, m.index).trim().length > 0;
  };
  const nextContentLine = (from: number): string | undefined => {
    for (let j = from + 1; j < lines.length; j += 1) {
      const t = lines[j].trim();
      if (t && !/^[-=_*\s]{3,}$/.test(t)) return t;
    }
    return undefined;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line || /^[-=_*\s]{3,}$/.test(line)) continue;

    // 1) Formato con separadores: Nombre | Categoría | Precio | Descripción
    const delimiter = line.includes('|') ? '|' : line.includes('\t') ? '\t' : null;
    if (delimiter) {
      const parts = line.split(delimiter).map((p) => p.trim());
      if (parts.length >= 2 && /^(nombre|producto)$/i.test(parts[0]) && /categor|precio/i.test(parts.join(' '))) continue; // encabezado
      const name = clean(stripBullet(parts[0] || ''));
      if (!name) continue;
      let price: number | null = null;
      let cat = '';
      let description = '';
      let options: ParsedChoice[] = [];
      const rest = parts.slice(1);
      const priceIdx = rest.findIndex((p) => /^\$?\s*\d{1,6}(?:[.,]\d{1,2})?\s*(?:pesos|mxn)?$/i.test(p));
      if (priceIdx >= 0) {
        price = toPrice(rest[priceIdx].replace(/[^\d.,]/g, ''));
        const others = rest.filter((_, i) => i !== priceIdx);
        cat = others[0] || '';
        description = others[1] || '';
        options = splitOptions(others[2] || '');
      } else {
        cat = rest[0] || '';
        description = rest.slice(1).join(' · ');
      }
      items.push({ name, category: cat || category, price, description, options, fromPipe: true, variantParts: null });
      continue;
    }

    // 2) Línea de categoría
    const noBullet = stripBullet(line);
    const priceMatch = noBullet.match(PRICE_AT_END);
    const hasPrice = !!priceMatch && priceMatch.index !== undefined && noBullet.slice(0, priceMatch.index).trim().length > 0;
    const next = nextContentLine(i);
    const shortTitleBeforePricedLine = !hasPrice && noBullet.split(/\s+/).length <= 4 && !!next && !next.includes('|') && hasPriceAtEnd(next);
    if (!hasPrice && (looksLikeCategory(line) || shortTitleBeforePricedLine)) {
      const name = categoryName(line);
      if (name) category = name;
      continue;
    }

    // 3) Producto con precio al final
    if (hasPrice && priceMatch && priceMatch.index !== undefined) {
      let head = noBullet.slice(0, priceMatch.index).replace(/[\s.…_\-–—:$]+$/, '').trim();
      let description = '';
      const split = head.split(/\s+[-–—]\s+|\s*:\s+/);
      if (split.length >= 2) {
        head = split[0].trim();
        description = split.slice(1).join(' - ').trim();
      }
      let name = clean(head);
      const parts = name.split(/\s+\/\s+/).map((part) => part.trim()).filter(Boolean);
      const variantParts = parts.length >= 2 ? parts : null;
      if (!variantParts && /^\d+\s*(pieza|piezas|pza|pzas)\b/i.test(name) && category !== defaultCategory) name = `${category} (${name})`;
      if (name) items.push({ name, category, price: toPrice(priceMatch[1]), description, options: [], fromPipe: false, variantParts });
      continue;
    }

    // 4) Línea sin precio: si hay un producto anterior sin descripción, es su descripción; si no, producto sin precio
    const noteCandidate = noBullet.split(/\s+/).length >= 4 && /[a-záéíóú]/.test(noBullet);
    if (noteCandidate && !items.some((row) => row.category === category) && !!next && hasPriceAtEnd(next) && !next.includes('|')) {
      notes[category] = notes[category] ? `${notes[category]} ${noBullet}` : noBullet;
      continue;
    }
    const last = items[items.length - 1];
    if (last && !last.description && last.category === category && noBullet.length > 28 && /[a-záéíóú]/.test(noBullet)) {
      last.description = noBullet;
      continue;
    }
    const name = clean(noBullet);
    if (name) items.push({ name, category, price: null, description: '', options: [], fromPipe: false, variantParts: null });
  }
  return mergeVariants(items, notes);
}

/** Instrucciones para pegarle a ChatGPT/Gemini junto con la foto del menú. */
export const AI_MENU_PROMPT = `Te mando la foto de mi menú. Pásalo a texto con UNA línea por producto, con este formato exacto:

Nombre | Categoría | Precio | Descripción corta | Opciones

Reglas:
- El precio va solo con números, sin signo de pesos (ejemplo: 45 o 45.50).
- Si un producto no tiene precio, descripción u opciones, deja ese campo vacío pero conserva las barras |.
- En Opciones pon las variantes que el cliente puede elegir, separadas con / (ejemplo: Nopales / Pollo / Chorizo). Si no hay, déjalo vacío.
- Repite la categoría en cada línea (ejemplo: Tacos, Bebidas, Postres).
- Si una variante cambia el precio (tamaños), haz una línea por cada una (ejemplo: Café americano chico).
- Responde solo con la lista, sin explicaciones ni títulos.`;
