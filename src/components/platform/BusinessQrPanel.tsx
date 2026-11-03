import React, { useMemo, useState } from 'react';
import { QrLinkCard } from './QrLinkCard';
import { SiteUrlSetting } from './SiteUrlSetting';
import { businessPageUrl } from '../../lib/siteUrl';

interface BusinessQrPanelProps {
  businessId: string;
  businessName: string;
  onOpenTables?: () => void;
}

/** QR general y acceso al único módulo de mesas; no mantiene otra configuración. */
export const BusinessQrPanel: React.FC<BusinessQrPanelProps> = ({ businessId, onOpenTables }) => {
  const [version, setVersion] = useState(0);
  const pageUrl = useMemo(() => businessPageUrl(businessId), [businessId, version]);
  return (
    <div className="space-y-3">
      <SiteUrlSetting tone="dark" onChanged={() => setVersion((v) => v + 1)} />
      <QrLinkCard tone="dark" title="Tu página y su QR" url={pageUrl} fileName={`qr-${businessId}`} hint="Es el enlace que compartes por WhatsApp, redes o Google. Tus clientes verán solo tu menú, nunca el panel." />

      {onOpenTables && <button type="button" onClick={onOpenTables} className="rounded-xl bg-[#D6A34A] px-4 py-3 text-sm font-bold text-black">Administrar mesas y QR</button>}


    </div>
  );
};
