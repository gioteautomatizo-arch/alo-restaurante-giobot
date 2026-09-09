import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { TableCheckoutPanel } from './components/public/TableCheckoutPanel';
import { isValidTableNumber } from './lib/tableRequestsService';
import './index.css';

function getPublicTableNumber(): number | null {
  try {
    const raw = new URLSearchParams(window.location.search).get('table');
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return isValidTableNumber(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const publicTableNumber = getPublicTableNumber();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {publicTableNumber !== null && (
      <TableCheckoutPanel tableNumber={publicTableNumber} />
    )}
  </StrictMode>,
);
