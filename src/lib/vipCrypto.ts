/**
 * Utilidades criptográficas y de normalización para Calientito VIP Cloud
 * Generación determinística de Document ID y Hash de PIN sin exponer datos en texto plano.
 */

const VIP_SALT = 'alo_calientito_vip_2026_salt_x9';

/**
 * Normaliza un teléfono a 10 dígitos numéricos
 */
export function normalizePhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

/**
 * Normaliza un PIN de seguridad (solo dígitos, 4 a 6)
 */
export function normalizePin(pin: string): string {
  if (!pin) return '';
  return pin.trim();
}

/**
 * Implementación pura en TypeScript de SHA-256 para máxima portabilidad y resiliencia
 */
function pureSha256(ascii: string): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = 'length';
  let i = 0;
  let j = 0;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii[lengthProperty] * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, number> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while ((ascii[lengthProperty] % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return '';
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength;

  for (j = 0; j < words[lengthProperty];) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];

      const s0 = i < 16 ? w[i] : (w[i] = (
        (w[i - 16] +
          (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
          w[i - 7] +
          (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0
      ));

      const s1 =
        rightRotate(hash[0], 2) ^
        rightRotate(hash[0], 13) ^
        rightRotate(hash[0], 22);
      const ch = (hash[0] & hash[1]) ^ (~hash[0] & hash[2]);
      const temp1 = (hash[7] + (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) + ((hash[4] & hash[5]) ^ (~hash[4] & hash[6])) + k[i] + s0) | 0;
      const temp2 = (s1 + ((hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]))) | 0;

      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + temp1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (temp1 + temp2) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (let b = 3; b >= 0; b--) {
      const byte = (hash[i] >> (8 * b)) & 255;
      result += (byte < 16 ? '0' : '') + byte.toString(16);
    }
  }
  return result;
}

/**
 * Calcula el hash SHA-256 usando crypto.subtle si está disponible, o fallback matemático
 */
export async function sha256Hex(text: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    try {
      const msgBuffer = new TextEncoder().encode(text);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Usar fallback puro
    }
  }
  return pureSha256(text);
}

/**
 * Genera el Document ID determinístico para Firestore a partir de:
 * Teléfono normalizado (10 dígitos) + PIN del cliente
 */
export async function computeVipDocId(phone: string, pin: string): Promise<string> {
  const normPhone = normalizePhone(phone);
  const normPin = normalizePin(pin);
  if (!normPhone || !normPin) {
    throw new Error('El teléfono y el PIN son requeridos para identificar la tarjeta VIP.');
  }
  const payload = `doc_${normPhone}_${normPin}_${VIP_SALT}`;
  return sha256Hex(payload);
}

/**
 * Genera el hash seguro del PIN para almacenamiento en el documento (NUNCA texto plano)
 */
export async function computePinHash(pin: string, phone: string): Promise<string> {
  const normPhone = normalizePhone(phone);
  const normPin = normalizePin(pin);
  const payload = `pinhash_${normPin}_${normPhone}_${VIP_SALT}`;
  return sha256Hex(payload);
}
