import { qrToDataUrl } from './qrCode';

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Abre una hoja lista para imprimir con un QR por elemento (mesas, menú, etc.). */
export function printQrSheet(businessName: string, items: Array<{ label: string; url: string }>): void {
  const win = window.open('', '_blank');
  if (!win) {
    window.alert('Tu navegador bloqueó la ventana. Permite ventanas emergentes e inténtalo de nuevo.');
    return;
  }
  const cards = items.map((item) =>
    `<div class="card"><h2>${esc(item.label)}</h2><img src="${qrToDataUrl(item.url, 8)}" alt="QR ${esc(item.label)}"/><p>Escanea para ver el menú y pedir</p><small>${esc(item.url)}</small></div>`
  ).join('');
  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR · ${esc(businessName)}</title><style>
    body{font-family:Georgia,serif;margin:16px;color:#222}
    .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
    .card{border:2px solid #222;border-radius:16px;padding:14px;text-align:center;page-break-inside:avoid}
    h1{text-align:center;margin:0 0 12px}h2{margin:0 0 6px;font-size:28px}img{width:210px;height:210px}
    p{margin:6px 0 2px;font-weight:bold}small{font-size:9px;word-break:break-all;color:#555}
    @media print{button{display:none}}
  </style></head><body><h1>${esc(businessName)}</h1><div class="grid">${cards}</div>
  <p style="text-align:center"><button onclick="window.print()" style="padding:12px 20px;font-size:16px">Imprimir</button></p></body></html>`);
  win.document.close();
}
