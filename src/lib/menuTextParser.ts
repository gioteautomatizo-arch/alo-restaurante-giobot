// Convierte texto pegado (o escrito) en productos de catálogo. Sin IA y sin costo.
// Formatos que entiende, una línea por producto:
//   Nombre | Categoría | Precio | Descripción      (el que pide la IA)
//   Nombre - $45        Nombre $45        Nombre ..... 45
//   Nombre - descripción - $45
// Líneas sin precio y cortas (o con ":" / "#" / MAYÚSCULAS) se toman como categoría.

export interface ParsedMenuItem {
  name: string;
  category: string;
  price: number | null;
  description: string;
}

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
  return line.replace(/^#{1,6}\s+/, '').replace(/[:：]\s*$/, '').replace(/^[\s*_\-–—=]+|[\s*_\-–—=]+$/g, '').trim();
}

export function parseMenuText(text: string, defaultCategory = 'General'): ParsedMenuItem[] {
  const items: ParsedMenuItem[] = [];
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
      const rest = parts.slice(1);
      const priceIdx = rest.findIndex((p) => /^\$?\s*\d{1,6}(?:[.,]\d{1,2})?\s*(?:pesos|mxn)?$/i.test(p));
      if (priceIdx >= 0) {
        price = toPrice(rest[priceIdx].replace(/[^\d.,]/g, ''));
        const others = rest.filter((_, i) => i !== priceIdx);
        cat = others[0] || '';
        description = others.slice(1).join(' · ');
      } else {
        cat = rest[0] || '';
        description = rest.slice(1).join(' · ');
      }
      items.push({ name, category: cat || category, price, description });
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
      const name = clean(head);
      if (name) items.push({ name, category, price: toPrice(priceMatch[1]), description });
      continue;
    }

    // 4) Línea sin precio: si hay un producto anterior sin descripción, es su descripción; si no, producto sin precio
    const last = items[items.length - 1];
    if (last && !last.description && last.category === category && noBullet.length > 28 && /[a-záéíóú]/.test(noBullet)) {
      last.description = noBullet;
      continue;
    }
    const name = clean(noBullet);
    if (name) items.push({ name, category, price: null, description: '' });
  }
  return items;
}

/** Instrucciones para pegarle a ChatGPT/Gemini junto con la foto del menú. */
export const AI_MENU_PROMPT = `Te mando la foto de mi menú. Pásalo a texto con UNA línea por producto, con este formato exacto:

Nombre | Categoría | Precio | Descripción corta

Reglas:
- El precio va solo con números, sin signo de pesos (ejemplo: 45 o 45.50).
- Si un producto no tiene precio o descripción, deja ese campo vacío pero conserva las barras |.
- Repite la categoría en cada línea (ejemplo: Tacos, Bebidas, Postres).
- Si un producto tiene tamaños o variantes con distinto precio, haz una línea por cada uno (ejemplo: Café americano chico).
- Responde solo con la lista, sin explicaciones ni títulos.`;
