import type { RestaurantOrder } from '../types';

export interface BusinessCustomer {
  key: string;
  name: string;
  phone?: string;
  orders: number;
  totalSpent: number;
  averageTicket: number;
  firstOrderAt: string;
  lastOrderAt: string;
  favorites: Array<{ name: string; quantity: number }>;
}

const GENERIC_NAMES = ['cliente mostrador', 'mostrador', 'cliente', 'sin nombre', 'mesa'];

export function normalizePhone(phone?: string): string {
  return (phone || '').replace(/\D/g, '').slice(-10);
}

function isGenericName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return !n || GENERIC_NAMES.includes(n) || /^mesa\s*\d*$/.test(n);
}

/**
 * Agrupa los pedidos por cliente (por teléfono si lo hay; si no, por nombre).
 * No guarda nada: se calcula al vuelo con los pedidos que el negocio ya tiene.
 * Se omiten pedidos cancelados y ventas de mostrador sin teléfono ni nombre real.
 */
export function buildCustomers(orders: RestaurantOrder[]): BusinessCustomer[] {
  const map = new Map<string, BusinessCustomer & { items: Map<string, number> }>();

  for (const order of orders) {
    if (order.status === 'CANCELADO') continue;
    const phone = normalizePhone(order.phone);
    const hasPhone = phone.length >= 8;
    const name = (order.customerName || '').trim();
    if (!hasPhone && isGenericName(name)) continue;

    const key = hasPhone ? `tel:${phone}` : `nom:${name.toLowerCase()}`;
    const at = order.createdAt || '';
    let c = map.get(key);
    if (!c) {
      c = {
        key,
        name: name || 'Sin nombre',
        phone: hasPhone ? phone : undefined,
        orders: 0,
        totalSpent: 0,
        averageTicket: 0,
        firstOrderAt: at,
        lastOrderAt: at,
        favorites: [],
        items: new Map(),
      };
      map.set(key, c);
    }
    c.orders += 1;
    c.totalSpent += Number(order.total || 0);
    if (at && (!c.firstOrderAt || at < c.firstOrderAt)) c.firstOrderAt = at;
    if (at && at >= c.lastOrderAt) {
      c.lastOrderAt = at;
      if (!isGenericName(name)) c.name = name; // el nombre más reciente
    }
    for (const item of order.items || []) {
      c.items.set(item.name, (c.items.get(item.name) || 0) + Number(item.quantity || 0));
    }
  }

  return [...map.values()]
    .map(({ items, ...c }) => ({
      ...c,
      totalSpent: Math.round(c.totalSpent * 100) / 100,
      averageTicket: Math.round((c.totalSpent / c.orders) * 100) / 100,
      favorites: [...items.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, quantity]) => ({ name, quantity })),
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent);
}

export function customersToCsv(customers: BusinessCustomer[]): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['Nombre', 'Teléfono', 'Pedidos', 'Total gastado', 'Ticket promedio', 'Último pedido', 'Favoritos']];
  for (const c of customers) {
    rows.push([
      c.name,
      c.phone || '',
      String(c.orders),
      c.totalSpent.toFixed(2),
      c.averageTicket.toFixed(2),
      c.lastOrderAt.slice(0, 10),
      c.favorites.map((f) => `${f.name} x${f.quantity}`).join('; '),
    ]);
  }
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\n');
}
