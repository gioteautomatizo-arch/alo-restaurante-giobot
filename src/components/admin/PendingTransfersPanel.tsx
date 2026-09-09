import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Landmark, XCircle } from 'lucide-react';
import { StaffUser, TablePayment } from '../../types';
import { subscribeToTablePayments } from '../../lib/paymentsService';
import {
  reviewTransferIntent,
  subscribeToPendingTransferIntents,
  TablePaymentIntent,
} from '../../lib/tablePaymentIntentsService';

interface PendingTransfersPanelProps {
  currentUser: StaffUser;
}

function money(value: number): string {
  return `$${Number(value || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export const PendingTransfersPanel: React.FC<PendingTransfersPanelProps> = ({ currentUser }) => {
  const [intents, setIntents] = useState<TablePaymentIntent[]>([]);
  const [payments, setPayments] = useState<TablePayment[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => subscribeToPendingTransferIntents(setIntents), []);
  useEffect(() => subscribeToTablePayments(setPayments), []);

  const matchingPaidIntentIds = useMemo(() => {
    const ids = new Set<string>();
    intents.forEach((intent) => {
      const match = payments.find((payment) =>
        payment.status === 'PAGADO' &&
        payment.paymentMethod === 'TRANSFERENCIA' &&
        payment.tableNumber === intent.tableNumber &&
        Math.abs(Number(payment.total || 0) - Number(intent.amount || 0)) < 0.01 &&
        Date.parse(payment.createdAt) >= Date.parse(intent.createdAt)
      );
      if (match && intent.id) ids.add(intent.id);
    });
    return ids;
  }, [intents, payments]);

  useEffect(() => {
    if (matchingPaidIntentIds.size === 0) return;
    matchingPaidIntentIds.forEach((intentId) => {
      reviewTransferIntent(intentId, 'CONFIRMADO', currentUser).catch((error) => {
        console.warn('[PendingTransfersPanel] no se pudo cerrar intención ya cobrada:', error);
      });
    });
  }, [matchingPaidIntentIds, currentUser.id, currentUser.name]);

  const rejectIntent = async (intent: TablePaymentIntent) => {
    if (!intent.id) return;
    const reason = window.prompt('Motivo para rechazar el comprobante:', 'No coincide con el pago recibido');
    if (reason === null) return;
    setBusyId(intent.id);
    setMessage(null);
    try {
      await reviewTransferIntent(intent.id, 'RECHAZADO', currentUser, reason);
      setMessage(`Comprobante de Mesa ${intent.tableNumber} rechazado.`);
    } catch (error: any) {
      setMessage(error?.message || 'No se pudo rechazar el comprobante.');
    } finally {
      setBusyId(null);
    }
  };

  if (intents.length === 0) return null;

  return (
    <section className="bg-violet-50 border border-violet-200 rounded-3xl p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-violet-800 text-[11px] font-bold uppercase tracking-wider">
            <Landmark className="w-4 h-4" /> Transferencias por verificar
          </div>
          <p className="text-xs text-violet-900 mt-1">
            Revisa el comprobante y después usa <strong>Cobrar → Transferencia → Confirmar cobro</strong>. Al registrar el cobro, el comprobante se marca automáticamente como confirmado.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-violet-700 text-white px-2.5 py-1 text-[10px] font-bold">{intents.length}</span>
      </div>

      {message && <div className="rounded-xl bg-white border border-violet-200 px-3 py-2 text-[11px] text-violet-900">{message}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {intents.map((intent) => (
          <article key={intent.id} className="rounded-2xl bg-white border border-violet-200 p-3.5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[9px] uppercase tracking-wider font-bold text-violet-600">Mesa</span>
                <div className="font-serif font-black text-xl text-[#2B1B13]">Mesa {intent.tableNumber}</div>
                <div className="text-[10px] text-[#6B4028]">{intent.accountLabel || 'Cuenta de la mesa'}</div>
              </div>
              <div className="text-right">
                <span className="inline-block rounded-full bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 text-[9px] font-bold">Pendiente</span>
                <strong className="block font-serif text-xl text-[#2B1B13] mt-1">{money(intent.amount)}</strong>
              </div>
            </div>

            <a href={intent.receiptDataUrl} target="_blank" rel="noreferrer" className="block rounded-xl border border-violet-200 overflow-hidden bg-violet-50">
              <img src={intent.receiptDataUrl} alt={`Comprobante Mesa ${intent.tableNumber}`} className="w-full h-36 object-contain bg-white" />
              <span className="px-3 py-2 text-[10px] font-bold text-violet-800 flex items-center justify-center gap-1.5"><ExternalLink className="w-3.5 h-3.5" /> Abrir comprobante</span>
            </a>

            <div className="text-[10px] text-[#6B4028]">
              Recibido {new Date(intent.createdAt).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-2.5 py-2 text-[10px] text-emerald-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Confirma desde Cobrar
              </div>
              <button type="button" disabled={busyId === intent.id} onClick={() => rejectIntent(intent)} className="rounded-xl bg-rose-50 border border-rose-200 px-2.5 py-2 text-[10px] font-bold text-rose-800 flex items-center justify-center gap-1.5 disabled:opacity-50">
                <XCircle className="w-3.5 h-3.5" /> Rechazar
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
