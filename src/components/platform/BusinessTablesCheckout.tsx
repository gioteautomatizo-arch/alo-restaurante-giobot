import React, { useEffect, useRef, useState } from 'react';
import type { RestaurantOrder } from '../../types';
import { db, getCurrentAuthUser } from '../../lib/firebase';
import { BUSINESS_TABLE_NUMBERS, chargeBusinessTable, type BusinessTableCharge } from '../../lib/businessTableCheckout';

const money = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const buttonStyle = 'rounded-xl bg-[#3A2418] px-5 py-3 text-sm font-bold text-white disabled:opacity-40';
type Props = { businessId: string; orders: RestaurantOrder[]; ready: boolean };
export function BusinessTablesCheckout(props: Props) {
  return <TablesSession key={`${props.businessId}:${getCurrentAuthUser()?.uid || ''}`} {...props} />;
}
const TablesSession: React.FC<Props> = ({ businessId, orders, ready }) => {
  const [selected, setSelected] = useState<{ table: number; orders: RestaurantOrder[] } | null>(null);
  const [method, setMethod] = useState<BusinessTableCharge['method']>('EFECTIVO');
  const [cash, setCash] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const mounted = useRef(true);
  const uid = useRef(getCurrentAuthUser()?.uid);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const total = selected?.orders.reduce((sum, o) => sum + Math.round(o.total * 100), 0)! / 100 || 0;
  const validCash = /^\d+(?:\.\d{1,2})?$/.test(cash) && Number(cash) >= total;
  const confirm = async () => {
    if (lock.current || !ready || !selected) return;
    const user = getCurrentAuthUser();
    if (!user || user.uid !== uid.current) { setMessage('Cambió tu sesión. Vuelve a entrar.'); return; }
    lock.current = true; setSaving(true); setMessage('');
    try {
      const result = await chargeBusinessTable(db, {
        businessId, tableNumber: selected.table, orders: selected.orders, method, cashReceived: Number(cash),
        user: { id: user.uid, name: user.displayName || user.email || 'Caja' },
      }, () => getCurrentAuthUser()?.uid);
      if (!mounted.current || getCurrentAuthUser()?.uid !== uid.current) return;
      setSelected(null);
      setMessage(`Cobro registrado: ${money(result.total)}. Cambio: ${money(result.changeDue)}. Referencia: ${result.paymentId}`);
    } catch (error) {
      if (mounted.current && getCurrentAuthUser()?.uid === uid.current) setMessage(error instanceof Error ? error.message : 'No pudimos confirmar el cobro. Revisa los pedidos antes de intentar de nuevo.');
    } finally {
      lock.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  return <section className="mt-6">
    <h2 className="text-xl font-bold">Mesas y cobros</h2>
    <p className="mt-2 text-sm">Revisa las comandas pendientes de cada mesa antes de registrar el pago.</p>
    {message && <p role="status" className="my-4 rounded-xl bg-amber-50 p-4 text-amber-950">{message}</p>}
    {!ready ? <p role="alert">Esperando la consulta de pedidos. El cobro estará disponible cuando termine.</p> : <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {BUSINESS_TABLE_NUMBERS.map(table => {
        const pending = orders.filter(o => o.restaurantId === businessId && o.orderType === 'dine_in' && o.tableNumber === table && o.status !== 'CANCELADO' && o.billingStatus === 'PENDIENTE');
        const amount = pending.reduce((sum, o) => sum + Number(o.total || 0), 0);
        return <article key={table} className="rounded-2xl border border-[#DEC8AE] bg-white p-5 text-[#2B1B13]">
          <h3 className="text-lg font-bold">Mesa {table}</h3>
          <p className="mt-3 text-xs">CONSUMO PENDIENTE</p><strong className="text-2xl">{money(amount)}</strong>
          <p className="mb-4 text-sm">{pending.length} comanda(s) · {pending.length ? 'Por cobrar' : 'Sin pedidos pendientes'}</p>
          <button className={buttonStyle} disabled={!pending.length || saving} onClick={() => { setSelected({ table, orders: pending }); setMethod('EFECTIVO'); setCash(''); setMessage(''); }}>Cobrar mesa {table}</button>
        </article>;
      })}
    </div>}
    {selected && <div role="dialog" aria-modal="true" aria-label={`Cobrar mesa ${selected.table}`} className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4">
      <div className="mx-auto my-8 max-w-lg rounded-2xl bg-white p-6 text-[#2B1B13]">
        <h3 className="text-xl font-bold">Cobrar mesa {selected.table}</h3>
        <p className="mt-2 text-sm">Se cobrarán únicamente estas comandas. Los pedidos nuevos quedan pendientes.</p>
        <ul className="my-4 space-y-2">{selected.orders.map(o => <li key={o.id} className="border-b pb-2"><strong>{o.code} · {money(o.total)}</strong><p className="text-sm">{o.customerName} · {o.items.map(i => `${i.quantity} × ${i.name}`).join(', ')}</p></li>)}</ul>
        <strong className="block text-2xl">Total: {money(total)}</strong>
        <label className="mt-4 block">Método de pago<select value={method} disabled={saving} onChange={e => setMethod(e.target.value as BusinessTableCharge['method'])} className="mt-1 block w-full rounded border p-3"><option value="EFECTIVO">Efectivo</option><option value="TARJETA">Tarjeta</option><option value="TRANSFERENCIA">Transferencia</option></select></label>
        {method === 'EFECTIVO' ? <label className="mt-4 block">Efectivo recibido<input aria-label="Efectivo recibido" inputMode="decimal" value={cash} disabled={saving} onChange={e => setCash(e.target.value)} className="mt-1 block w-full rounded border p-3" /><span>Cambio: {money(validCash ? Number(cash) - total : 0)}</span></label> : <p className="my-4 text-sm">Confirma que recibiste el pago en tu terminal o cuenta bancaria. Este botón registra el pago recibido.</p>}
        {!ready && <p role="alert">No se puede confirmar mientras los pedidos no estén disponibles.</p>}
        {message && <p role="alert" className="my-3 text-red-700">{message}</p>}
        <div className="mt-5 flex flex-wrap gap-3"><button className={buttonStyle} disabled={saving || !ready || (method === 'EFECTIVO' && !validCash)} onClick={confirm}>{saving ? 'Registrando…' : 'Confirmar pago recibido'}</button><button disabled={saving} onClick={() => setSelected(null)} className="rounded-xl border px-4 py-3">Volver</button></div>
      </div>
    </div>}
  </section>;
}
