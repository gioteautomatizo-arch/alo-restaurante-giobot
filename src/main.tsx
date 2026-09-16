import {StrictMode, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AdminTabOrderManager } from './components/admin/AdminTabOrderManager';
import { AdminOwnerTitaGate } from './components/admin/AdminOwnerTitaGate';
import { BusinessPortal } from './components/platform/BusinessPortal';
import { BusinessOnboardingDemo } from './components/platform/BusinessOnboardingDemo';
import './index.css';

function RootRouter() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (hash === '#business-new') {
    return <BusinessOnboardingDemo />;
  }

  if (hash === '#business') {
    return <BusinessPortal />;
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
