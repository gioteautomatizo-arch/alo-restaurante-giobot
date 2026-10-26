import React, { useEffect, useMemo, useState } from 'react';
import { looksTemporary } from '../../lib/siteUrl';
import { qrToDataUrl } from '../../lib/qrCode';

interface QrLinkCardProps {
  title: string;
  url: string;
  fileName: string;
  hint?: string;
  tone?: 'dark' | 'light';
  size?: number;
}

/** Enlace + QR descargable. Todo se genera en el navegador, sin servicios externos. */
export const QrLinkCard: React.FC<QrLinkCardProps> = ({ title, url, fileName, hint, tone = 'light', size = 10 }) => {
  const [copied, setCopied] = useState(false);
  const dataUrl = useMemo(() => {
    try {
      return qrToDataUrl(url, size);
    } catch {
      return '';
    }
  }, [url, size]);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt('Copia el enlace:', url);
    }
  };

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${fileName}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title, url });
      else await copy();
    } catch {
      // el usuario canceló
    }
  };

  const dark = tone === 'dark';
  const box = dark ? 'border-[#3A3022] bg-[#111111] text-[#F5F5F5]' : 'border-[#E7D7C4] bg-white text-[#2B1B13]';
  const sub = dark ? 'text-[#B7B7B7]' : 'text-[#6B4028]';
  const btn = dark ? 'bg-[#D6A34A] text-[#050505]' : 'bg-[#3A2418] text-[#FFF7EA]';
  const btn2 = dark ? 'border-[#3A3022] text-[#E3BC6B]' : 'border-[#DEC8AE] text-[#5C3825] bg-[#FFF7EA]';

  return (
    <div className={`rounded-2xl border p-4 ${box}`}>
      <p className={`text-[10px] font-black uppercase tracking-wide ${dark ? 'text-[#E3BC6B]' : 'text-[#A86B3D]'}`}>{title}</p>
      {looksTemporary(url) && <p role="alert" className="mt-2 rounded-xl bg-amber-100 p-3 text-xs font-semibold text-amber-950">QR de prueba: esta dirección es temporal y puede no abrir fuera de tu sesión. Guarda la dirección pública de la app y vuelve a descargar el QR para tus clientes.</p>}
      <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {dataUrl ? (
          <img src={dataUrl} alt={`QR de ${title}`} className="h-40 w-40 shrink-0 rounded-xl border border-black/10 bg-white" />
        ) : (
          <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-white p-3 text-center text-[11px] text-black/60">No se pudo generar el QR</div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <p className="break-all text-xs font-mono">{url}</p>
          {hint && <p className={`text-[11px] ${sub}`}>{hint}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copy()} className={`rounded-xl px-3 py-2 text-xs font-black ${btn}`}>{copied ? '¡Copiado!' : 'Copiar enlace'}</button>
            <button type="button" onClick={download} className={`rounded-xl border px-3 py-2 text-xs font-black ${btn2}`}>Descargar QR</button>
            <button type="button" onClick={() => void share()} className={`rounded-xl border px-3 py-2 text-xs font-black ${btn2}`}>Compartir</button>
            <a href={url} target="_blank" rel="noopener noreferrer" className={`rounded-xl border px-3 py-2 text-xs font-black ${btn2}`}>Abrir</a>
          </div>
        </div>
      </div>
    </div>
  );
};
