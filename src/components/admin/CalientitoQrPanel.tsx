import React, { useState } from 'react';
import { Printer } from 'lucide-react';
import { QrLinkCard } from '../platform/QrLinkCard';
import { SiteUrlSetting } from '../platform/SiteUrlSetting';
import { calientitoMenuUrl, calientitoTableUrl } from '../../lib/siteUrl';
import { qrToDataUrl } from '../../lib/qrCode';

const TABLES = [1, 2, 4, 5, 6, 7, 8, 9];

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Enlaces y QR de Restaurante Calientito: menú (para Google) y una hoja imprimible con todas las mesas. */
export const CalientitoQrPanel: React.FC = () => {
  const [, setVersion] = useState(0);
  const menuUrl = calientitoMenuUrl();

  const printSheet = () => {
    const win = window.open('', '_blank');
    if (!win) {
      window.alert('Tu navegador bloqueó la ventana. Permite ventanas emergentes e inténtalo de nuevo.');
      return;
    }
    const cards = TABLES.map((n) => {
      const url = calientitoTableUrl(n);
      return `<div class="card"><h2>Mesa ${n}</h2><img src="${qrToDataUrl(url, 8)}" alt="QR mesa ${n}"/><p>Escanea para ver el menú y pedir</p><small>${escapeHtml(url)}</small></div>`;
    }).join('');
    win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR de mesas · Restaurante Calientito</title><style>
      body{font-family:Georgia,serif;margin:16px;color:#2B1B13}
      .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
      .card{border:2px solid #3A2418;border-radius:16px;padding:14px;text-align:center;page-break-inside:avoid}
      h1{text-align:center;margin:0 0 12px}h2{margin:0 0 6px;font-size:28px}img{width:210px;height:210px}
      p{margin:6px 0 2px;font-weight:bold}small{font-size:9px;word-break:break-all;color:#6B4028}
      @media print{button{display:none}}
    </style></head><body><h1>Restaurante Calientito</h1><div class="grid">${cards}</div>
    <p style="text-align:center"><button onclick="window.print()" style="padding:12px 20px;font-size:16px">Imprimir</button></p></body></html>`);
    win.document.close();
  };

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
