import React from 'react';
import type { PublicOrderReceipt } from '../../lib/publicOrderReceipts';
import { formatMoney } from '../../lib/businessPublicPage';

export const PublicOrderReceipts: React.FC<{ receipts: PublicOrderReceipt[] }> = ({ receipts }) => {
  if (!receipts.length) return null;
  return <section aria-label="Pedidos enviados" className="mt-6 space-y-3 border-t border-current/20 pt-4">
    <h3 className="font-bold">Pedidos enviados ({receipts.length})</h3>
    <p className="text-xs opacity-70">Comprobantes de esta pestaña. Consulta al personal el estado de preparación.</p>
    {receipts.map(receipt => <article key={receipt.id} className="rounded-xl border border-current/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><strong>Pedido {receipt.code}</strong><span>Enviado</span></div>
      <p className="mt-1 text-xs opacity-70">{new Date(receipt.sentAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}{receipt.tableNumber ? ` · Mesa ${receipt.tableNumber}` : ''}{receipt.guestCount ? ` · ${receipt.guestCount} ${receipt.guestCount === 1 ? 'persona' : 'personas'}` : ''}</p>
      <ul className="mt-3 space-y-2 text-sm">{receipt.items.map((item, i) => <li key={i}>
        <div className="flex justify-between gap-3"><span>{item.quantity} × {item.name}</span><span>{formatMoney(item.totalPrice)}</span></div>
        {item.customizationSummary && <p className="text-xs opacity-70">{item.customizationSummary}</p>}
      </li>)}</ul>
      <p className="mt-3 flex justify-between border-t border-current/20 pt-2 text-sm font-bold"><span>Total del pedido</span><span>{formatMoney(receipt.total)}</span></p>
    </article>)}
  </section>;
};
