import React, { useEffect, useState } from 'react';
import { subscribeToBusinessTableReconciliation, type TableReconciliationFeedUpdate } from '../../lib/businessTableReconciliationFeed';
import type { TableReconciliationIssueCode } from '../../lib/tablePaymentReconciliation';
const labels: Record<TableReconciliationIssueCode, string> = {
  TENANT_AJENO: 'La consulta contiene datos de otro negocio.', ID_DUPLICADO: 'Hay un identificador repetido.',
  ID_AUSENTE: 'Falta el identificador de un registro.', FECHA_INVALIDA: 'Hay una fecha que no se puede verificar.',
  PAGO_SIN_PEDIDOS: 'Un pago no tiene comandas asociadas.', REFERENCIA_DUPLICADA: 'Una comanda aparece repetida en el pago.',
  PEDIDO_INEXISTENTE: 'No se encontró la comanda de un pago.', PEDIDO_NO_ES_MESA: 'El pago incluye un pedido que no es de mesa.',
  PEDIDO_NO_COBRADO: 'El pago existe, pero la comanda no figura pagada.', PEDIDO_CANCELADO: 'El pago incluye una comanda cancelada.',
  REFERENCIA_NO_RECIPROCA: 'El pago y la comanda no apuntan al mismo registro.', PEDIDO_EN_DOS_PAGOS: 'Una comanda aparece en dos pagos.',
  FECHA_COBRO_DISCREPANTE: 'Las fechas de pago y comanda no coinciden o falta una fecha.',
  IMPORTE_DISCREPANTE: 'El importe del pago no coincide con sus comandas.',
  METODO_O_DESGLOSE_INVALIDO: 'El método o desglose del pago requiere revisión.', PEDIDO_COBRADO_SIN_PAGO: 'Una comanda pagada no tiene un pago comprobable.',
};
const money = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const button = 'rounded-xl border border-[#D6A34A] px-4 py-2 text-sm font-bold text-[#E3BC6B]';
type Props = { businessId: string; shiftStart: string };
/** Consulta bajo demanda. Este diagnóstico no escribe ni autoriza un cierre. */
export const BusinessTableReconciliation: React.FC<Props> = props =>
  <Review key={`${props.businessId}:${props.shiftStart}`} {...props} />;
const Review: React.FC<Props> = ({ businessId, shiftStart }) => {
  const [opened, setOpened] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<TableReconciliationFeedUpdate>({ status: 'loading', businessId });
  useEffect(() => {
    if (!opened) return;
    let alive = true;
    setState({ status: 'loading', businessId });
    let stop = () => {};
    try {
      stop = subscribeToBusinessTableReconciliation(businessId, shiftStart, undefined, next => {
        if (alive && next.businessId === businessId) setState(next);
      });
    } catch {
      setState({ status: 'error', businessId, error: new Error('No se pudo iniciar la consulta.') });
    }
    return () => { alive = false; stop(); };
  }, [opened, attempt, businessId, shiftStart]);
  const reconciliation = state.status === 'diagnostic' ? state.reconciliation : null;
  // Nunca mostrar referencias ni cifras procedentes de un negocio ajeno.
  const foreign = reconciliation?.issues.some(i => i.code === 'TENANT_AJENO');
  const totals = !foreign && reconciliation?.issues.length === 0 ? reconciliation.tableTotals : null;
  return <section className="mt-4 rounded-xl border border-[#3A3022] p-4">
    <button type="button" className={button} onClick={() => setOpened(v => !v)}>{opened ? 'Ocultar revisión de mesas' : 'Revisar cobros de mesas'}</button>
    {opened && <div className="mt-3 space-y-3 text-sm text-[#F7F7F7]">
      <p>Compara los pagos de mesa con sus comandas desde la apertura del turno. Los cobros anteriores quedan fuera de este periodo.</p>
      {state.status === 'loading' && <p role="status">Consultando pagos y comandas en el servidor…</p>}
      {state.status === 'error' && <p role="alert">No se pudo completar la consulta. Revisa la conexión y los permisos; esto no significa que no haya cobros.</p>}
      {foreign ? <p role="alert">No se puede mostrar esta revisión: la consulta contiene datos de otro negocio.</p> : reconciliation && <>
        <p>{reconciliation.inspectedPayments} pago(s) de mesa revisado(s).</p>
        {totals ? <>
          <p role="status">Los importes y referencias consultados coinciden.</p>
          <dl className="grid grid-cols-2 gap-3">{[['Efectivo', totals.cash], ['Tarjeta', totals.card], ['Transferencias', totals.platforms], ['Total de mesas', totals.total]].map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd className="font-bold">{money(Number(value))}</dd></div>)}</dl>
        </> : <div role="alert"><p className="font-bold">Hay diferencias por revisar. Los totales de mesas están ocultos.</p><ul className="mt-2 space-y-2">{reconciliation.issues.slice(0, 30).map((issue, i) => <li key={i}>{labels[issue.code]}{issue.orderId && <span className="block break-all text-xs">Comanda: {issue.orderId}</span>}{issue.paymentId && <span className="block break-all text-xs">Pago: {issue.paymentId}</span>}</li>)}</ul>{reconciliation.issues.length > 30 && <p>Se muestran las primeras 30 diferencias de {reconciliation.issues.length}.</p>}</div>}
      </>}
      <p className="text-xs text-[#B7B7B7]">Esta revisión no modifica cobros ni los suma otra vez a ventas. El cierre de turno con mesas sigue pendiente de validación final.</p>
      <button type="button" className={button} onClick={() => { setState({ status: 'loading', businessId }); setAttempt(v => v + 1); }}>Actualizar revisión</button>
    </div>}
  </section>;
};
