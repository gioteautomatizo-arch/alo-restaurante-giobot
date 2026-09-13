import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AdminTabOrderManager } from './components/admin/AdminTabOrderManager';
import { AdminOwnerTitaGate } from './components/admin/AdminOwnerTitaGate';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
      <App />
      <AdminTabOrderManager />
      <AdminOwnerTitaGate />
    </>
  </StrictMode>,
);
