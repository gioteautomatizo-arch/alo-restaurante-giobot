import React, { useState } from 'react';
import { getCurrentOrigin, getSavedSiteBaseUrl, getSiteBaseUrl, isValidBaseUrl, looksTemporary, setSiteBaseUrl } from '../../lib/siteUrl';

interface SiteUrlSettingProps {
  tone?: 'dark' | 'light';
  onChanged: () => void;
}

/** Dirección oficial de la app: se guarda una vez y todos los enlaces/QR nuevos la usan. */
export const SiteUrlSetting: React.FC<SiteUrlSettingProps> = ({ tone = 'light', onChanged }) => {
  const current = getCurrentOrigin();
  const [value, setValue] = useState(getSavedSiteBaseUrl());
  const [message, setMessage] = useState('');
  const dark = tone === 'dark';
  const effective = value.trim() && !looksTemporary(value) ? value.trim() : getSiteBaseUrl();
  const previewDetected = looksTemporary(value.trim() || current);

  const save = () => {
    if (value.trim() && !isValidBaseUrl(value)) {
      setMessage('Escribe una dirección completa, por ejemplo https://tu-app.com');
      return;
    }
    if (value.trim() && looksTemporary(value)) {
      setMessage('Esta dirección es temporal. Utiliza la dirección pública de tu app para que los QR abran en otros dispositivos.');
      return;
    }
    setSiteBaseUrl(value);
    setMessage(value.trim() ? 'Guardada. Los enlaces y QR ya usan esta dirección.' : 'Ahora se usa la dirección con la que abriste la app.');
    onChanged();
  };

  return (
    <div className={`rounded-2xl border p-4 ${dark ? 'border-[#3A3022] bg-[#111111] text-[#F5F5F5]' : 'border-[#E7D7C4] bg-[#FFFDF9] text-[#2B1B13]'}`}>
      <p className={`text-[10px] font-black uppercase tracking-wide ${dark ? 'text-[#E3BC6B]' : 'text-[#A86B3D]'}`}>Dirección oficial de la app</p>
      <p className={`mt-1 text-[11px] ${dark ? 'text-[#B7B7B7]' : 'text-[#6B4028]'}`}>
        Todos los QR y enlaces se arman con la dirección pública del sitio. Si cambia tu dominio, escríbelo aquí y vuelve a descargar tus QR.
      </p>
      <input
        value={value}
        onChange={(e) => { setValue(e.target.value); setMessage(''); }}
        placeholder={current}
        inputMode="url"
        className={`mt-3 w-full rounded-xl border px-3 py-2.5 text-xs ${dark ? 'border-[#3A3022] bg-[#050505] text-white' : 'border-[#DEC8AE] bg-white text-[#2B1B13]'}`}
      />
      <p className={`mt-2 break-all text-[11px] ${dark ? 'text-[#E3BC6B]' : 'text-[#6B4028]'}`}>Los QR actuales apuntan a: {effective}</p>
      {previewDetected && (
        <p className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-[11px] font-semibold text-amber-900">
          Estás en una dirección temporal de pruebas. Los QR utilizan la dirección pública mostrada arriba; confirma que esa publicación está activa antes de imprimirlos.
        </p>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={save} className={`rounded-xl px-4 py-2 text-xs font-black ${dark ? 'bg-[#D6A34A] text-[#050505]' : 'bg-[#3A2418] text-[#FFF7EA]'}`}>Guardar dirección</button>
        {message && <span role="status" className="text-[11px] font-semibold">{message}</span>}
      </div>
    </div>
  );
};
