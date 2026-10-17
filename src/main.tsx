import {StrictMode, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AdminTabOrderManager } from './components/admin/AdminTabOrderManager';
import { AdminOwnerTitaGate } from './components/admin/AdminOwnerTitaGate';
import { BusinessPortal } from './components/platform/BusinessPortal';
import { BusinessWorkspace } from './components/platform/BusinessWorkspace';
import { BusinessPublicPage } from './components/platform/BusinessPublicPage';
import { BusinessDirectory } from './components/platform/BusinessDirectory';
import { BusinessOnboardingDemo } from './components/platform/BusinessOnboardingDemo';
import { PlatformAdminPanel } from './components/platform/PlatformAdminPanel';
import './components/platform/platformTheme.css';
import './index.css';

function RootRouter() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash);
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

  if (hash === '#business-new') {
    return <div className="giote-platform-theme platform-onboarding"><BusinessOnboardingDemo /></div>;
  }

  // Página pública de un negocio (lo que ve el cliente). Calientito conserva su propia app.
  const routeHash = hash.includes('?') ? hash.slice(0, hash.indexOf('?')) : hash;
  const publicMatch = routeHash.match(/^#negocio\/([^/]+)$/);
  if (publicMatch && decodeURIComponent(publicMatch[1]) !== 'alo-restaurante') {
    return <BusinessPublicPage businessId={decodeURIComponent(publicMatch[1])} />;
  }

  if (publicMatch && decodeURIComponent(publicMatch[1]) === 'alo-restaurante') {
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
