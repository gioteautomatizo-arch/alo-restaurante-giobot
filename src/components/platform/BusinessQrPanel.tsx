import React, { useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { QrLinkCard } from './QrLinkCard';
import { SiteUrlSetting } from './SiteUrlSetting';
import { businessPageUrl, businessTableUrl } from '../../lib/siteUrl';
import { printQrSheet } from '../../lib/qrSheet';

interface BusinessQrPanelProps {
  businessId: string;
  businessName: string;
}

/** Enlace de la página del negocio, su QR y, si tiene mesas, un QR por mesa (con hoja para imprimir). */
export const BusinessQrPanel: React.FC<BusinessQrPanelProps> = ({ businessId, businessName }) => {
  const storageKey = `gio_table_count_${businessId}`;
  const [version, setVersion] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey) || 0);
      if (saved > 0) setCount(Math.min(60, saved));
    } catch {
      // sin almacenamiento
    }
  }, [storageKey]);

  const updateCount = (value: number) => {
    const next = Math.max(0, Math.min(60, Math.floor(Number.isFinite(value) ? value : 0)));
    setCount(next);
    try { localStorage.setItem(storageKey, String(next)); } catch { /* sin almacenamiento */ }
  };

  const pageUrl = useMemo(() => businessPageUrl(businessId), [businessId, version]);
  const tables = useMemo(
    () => Array.from({ length: count }, (_, i) => ({ label: `Mesa ${i + 1}`, url: businessTableUrl(businessId, i + 1) })),
    [businessId, count, version]
  );

  return (
    <div className="space-y-3">
      <QrLinkCard tone="dark" title="Tu página y su QR" url={pageUrl} fileName={`qr-${businessId}`} hint="Es el enlace que compartes por WhatsApp, redes o Google. Tus clientes verán solo tu menú, nunca el panel." />

      <div className="rounded-2xl border border-[#3A3022] bg-[#111111] p-4 text-[#F5F5F5]">
        <p className="text-[10px] font-black uppercase tracking-wide text-[#E3BC6B]">QR por mesa</p>
        <p className="mt-1 text-[11px] text-[#B7B7B7]">¿Tu negocio tiene mesas? Escribe cuántas y genera un QR para cada una. El pedido llega con el número de mesa.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold">Número de mesas
            <input
              type="number"
              min={0}
              max={60}
              value={count || ''}
              onChange={(e) => updateCount(Number(e.target.value))}
              placeholder="0"
              className="ml-2 w-20 rounded-xl border border-[#3A3022] bg-[#050505] px-3 py-2 text-xs text-white"
            />
          </label>
          {count > 0 && (
            <button type="button" onClick={() => printQrSheet(businessName, tables)} className="inline-flex items-center gap-2 rounded-xl bg-[#D6A34A] px-4 py-2 text-xs font-black text-[#050505]">
              <Printer className="h-4 w-4" /> Hoja imprimible de mesas
            </button>
          )}
        </div>
        {count > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {tables.map((t) => (
              <QrLinkCard key={t.label + t.url} tone="dark" title={t.label} url={t.url} fileName={`qr-${businessId}-mesa-${t.label.replace('Mesa ', '')}`} size={8} />
            ))}
          </div>
        )}
      </div>

      <SiteUrlSetting tone="dark" onChanged={() => setVersion((v) => v + 1)} />
    </div>
  );
};
