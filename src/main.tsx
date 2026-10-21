import {StrictMode, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AdminTabOrderManager } from './components/admin/AdminTabOrderManager';
import { AdminOwnerTitaGate } from './components/admin/AdminOwnerTitaGate';
import { BusinessPortal } from './components/platform/BusinessPortal';
import { BusinessInviteAccept } from './components/platform/BusinessInviteAccept';
import { BUSINESS_INVITES_ENABLED } from './lib/businessInvitesService';
import { BusinessWorkspace } from './components/platform/BusinessWorkspace';
import { BusinessPublicPage } from './components/platform/BusinessPublicPage';
import { BusinessDirectory } from './components/platform/BusinessDirectory';
import { BusinessOnboardingDemo } from './components/platform/BusinessOnboardingDemo';
import { PlatformAdminPanel } from './components/platform/PlatformAdminPanel';
import './components/platform/platformTheme.css';
import './index.css';
import { RESERVED_PATHS } from './lib/siteUrl';

/** Enlaces limpios: /negocio/<nombre> equivale a #negocio/<nombre> (los enlaces con # siguen funcionando). */
const LEGACY_ALIASES: Record<string, string> = { calientito: 'alo-restaurante', 'restaurante-calientito': 'alo-restaurante' };

function currentRouteHash(): string {
  if (window.location.hash) return window.location.hash;
  const match = window.location.pathname.match(/^\/negocio\/([^/]+)\/?$/);
  if (match) return `#negocio/${match[1]}`;
  // Enlace corto: /nombre-del-negocio (sin "negocio" ni #). Solo un tramo, sin punto, y que no sea una ruta de la app.
  const short = window.location.pathname.match(/^\/([^/.]+)\/?$/);
  if (short && !RESERVED_PATHS.includes(short[1].toLowerCase())) return `#negocio/${short[1]}`;
  return '';
}

function RootRouter() {
  const [hash, setHash] = useState(() => currentRouteHash());

  useEffect(() => {
    const handleHashChange = () => setHash(currentRouteHash());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // QR heredados pueden colocar sus parámetros antes o después de #.
  // Unificamos ambos formatos sin alterar la URL que recibe el cliente.
  const fragmentQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  const qrParams = new URLSearchParams(window.location.search);
  new URLSearchParams(fragmentQuery).forEach((value, key) => {
    if (!qrParams.has(key)) qrParams.set(key, value);
  });
  const hasTableQr = qrParams.has('table') || qrParams.has('qr') || qrParams.get('staffOrder') === '1';

  if (hash === '#explorar' || hash === '#') {
    return <div className="giote-platform-theme"><BusinessDirectory /></div>;
  }

  if (hash === '#platform-admin') {
    return <div className="giote-platform-theme"><PlatformAdminPanel /></div>;
  }

  const inviteMatch = hash.match(/^#invite\/([A-Za-z0-9_-]{43})$/);
  if (inviteMatch && BUSINESS_INVITES_ENABLED) {
    // El token viaja exclusivamente por el fragmento, no por la solicitud HTTP.
    return <div className="giote-platform-theme"><BusinessInviteAccept token={inviteMatch[1]} /></div>;
  }

  if (hash === '#business-new') {
    return <div className="giote-platform-theme platform-onboarding"><BusinessOnboardingDemo /></div>;
  }

  // Página pública de un negocio (lo que ve el cliente). Calientito conserva su propia app.
  const routeHash = hash.includes('?') ? hash.slice(0, hash.indexOf('?')) : hash;
  const publicMatch = routeHash.match(/^#negocio\/([^/]+)$/);
  const publicId = publicMatch ? (LEGACY_ALIASES[decodeURIComponent(publicMatch[1]).toLowerCase()] || decodeURIComponent(publicMatch[1])) : '';
  if (publicMatch && publicId !== 'alo-restaurante') {
    return <BusinessPublicPage businessId={publicId} />;
  }

  if (publicMatch && publicId === 'alo-restaurante') {
    return <App />;
  }

  const businessMatch = routeHash.match(/^#business\/([^/]+)$/);
  if (businessMatch) {
    return <div className="giote-platform-theme platform-business"><BusinessWorkspace businessId={decodeURIComponent(businessMatch[1])} /></div>;
  }

  if (hash === '#business') {
    return <div className="giote-platform-theme"><BusinessPortal /></div>;
  }

  return (
    <>
      <App />
      <AdminTabOrderManager />
      <AdminOwnerTitaGate />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootRouter />
  </StrictMode>,
);
