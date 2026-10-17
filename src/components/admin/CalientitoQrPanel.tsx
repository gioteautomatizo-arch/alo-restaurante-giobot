import React, { useState } from 'react';
import { Printer } from 'lucide-react';
import { QrLinkCard } from '../platform/QrLinkCard';
import { SiteUrlSetting } from '../platform/SiteUrlSetting';
import { calientitoMenuUrl, calientitoTableUrl } from '../../lib/siteUrl';
import { printQrSheet } from '../../lib/qrSheet';

const TABLES = [1, 2, 4, 5, 6, 7, 8, 9];

/** Enlaces y QR de Restaurante Calientito: menú (para Google) y una hoja imprimible con todas las mesas. */
export const CalientitoQrPanel: React.FC = () => {
  const [, setVersion] = useState(0);
  const menuUrl = calientitoMenuUrl();

  const printSheet = () => printQrSheet('Restaurante Calientito', TABLES.map((n) => ({ label: `Mesa ${n}`, url: calientitoTableUrl(n) })));

  return (
    <section className="space-y-4 rounded-3xl border border-[#E7D7C4] bg-white p-4 sm:p-6">
      <div className="border-b border-[#F4E3C8] pb-3">
        <h3 className="font-serif text-base font-bold text-[#2B1B13]">Enlaces y QR de Calientito</h3>
        <p className="mt-1 text-xs text-[#6B4028]">El enlace del menú es el que le das a Google. Los QR de mesa mandan al cliente directo a su mesa.</p>
      </div>
      <SiteUrlSetting onChanged={() => setVersion((v) => v + 1)} />
      <QrLinkCard
        title="Menú público (enlace para Google)"
        url={menuUrl}
        fileName="qr-menu-calientito"
        hint="Pega este enlace en tu ficha de Google Business como sitio web o pedidos."
      />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-black uppercase tracking-wide text-[#A86B3D]">QR por mesa</p>
          <button type="button" onClick={printSheet} className="inline-flex items-center gap-2 rounded-xl bg-[#3A2418] px-4 py-2 text-xs font-black text-[#FFF7EA]">
            <Printer className="h-4 w-4" /> Hoja imprimible de todas las mesas
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {TABLES.map((n) => (
            <QrLinkCard key={n + calientitoTableUrl(n)} title={`Mesa ${n}`} url={calientitoTableUrl(n)} fileName={`qr-mesa-${n}`} size={8} />
          ))}
        </div>
      </div>
    </section>
  );
};
