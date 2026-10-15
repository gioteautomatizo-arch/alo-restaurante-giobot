import type { SaleReceipt } from '../types';

export interface ShiftSalesTotals {
  cash: number;
  card: number;
  platforms: number; // transferencia + Mercado Pago / apps
  total: number;
  count: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Suma lo cobrado en los tickets cerrados desde que abrió el turno.
 * Usa el desglose de pago (cobros mixtos) y, si no hay, el método principal.
 */
export function computeShiftSalesFromReceipts(
  receipts: SaleReceipt[],
  shiftStartIso?: string,
  shiftEndIso?: string
): ShiftSalesTotals {
  const start = Date.parse(shiftStartIso || '') || 0;
  const end = Date.parse(shiftEndIso || '') || Infinity;
  let cash = 0;
  let card = 0;
  let platforms = 0;
  let count = 0;

  const add = (method: string, amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (method === 'EFECTIVO') cash += amount;
    else if (method === 'TARJETA') card += amount;
    else platforms += amount; // TRANSFERENCIA, MERCADO_PAGO u otros
  };

  for (const receipt of receipts) {
    const closedMs = Date.parse(receipt.closedAt || '') || 0;
    if (closedMs < start || closedMs > end) continue;
    count += 1;
    for (const payment of receipt.payments || []) {
      const parts = (payment.paymentBreakdown || []).filter((p) => Number(p.amount) > 0);
      if (parts.length > 0) {
        parts.forEach((p) => add(p.method, Number(p.amount)));
      } else if (payment.paymentMethod !== 'MIXTO') {
        add(payment.paymentMethod, Number(payment.total || 0));
      }
    }
  }

  cash = round2(cash);
  card = round2(card);
  platforms = round2(platforms);
  return { cash, card, platforms, total: round2(cash + card + platforms), count };
}
