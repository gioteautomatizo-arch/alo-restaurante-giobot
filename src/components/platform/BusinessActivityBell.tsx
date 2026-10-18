import React, { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { isOperationalSoundEnabled, playOperationalAlert, showOperationalNotification } from '../../lib/operationalAlerts';

interface Movement {
  id: string;
  title: string;
  summary: string;
  at: string;
  kind: 'vip' | 'activity';
}

/**
 * Campana universal de movimientos. Cada panel se suscribe exclusivamente al
 * negocio activo. El primer snapshot crea la linea base: no suena el historial.
 * Usa bitacoras existentes y no escribe datos ni crea listeners por tarjeta.
 */
export const BusinessActivityBell: React.FC<{
  businessId: string;
  legacy?: boolean;
  allowRead?: boolean;
  className?: string;
}> = ({ businessId, legacy = false, allowRead = true, className = '' }) => {
  const [items, setItems] = useState<Movement[]>([]);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    seen.current = null;
    startedAt.current = Date.now();
    setItems([]);
    setUnread(0);
    setError(false);
    if (!businessId || !allowRead) return;
    const ref = legacy
      ? collection(db, 'activity_logs')
      : collection(db, 'businesses', businessId, 'auditLog');
    const q = legacy
      ? query(ref, where('restaurantId', '==', businessId), limit(100))
      : query(ref, orderBy('at', 'desc'), limit(80));
    return onSnapshot(q, (snapshot) => {
      const next: Movement[] = snapshot.docs.map((d): Movement => {
        const data = d.data();
        const action = String(data.action || '');
        const vip = action === 'vip.register' || action === 'Nueva membresía VIP';
        const when = String(data.at || data.timestamp || data.createdAt || '');
        return {
          id: d.id,
          title: vip ? 'Nueva membresía VIP' : action || 'Movimiento registrado',
          summary: String(data.summary || data.details || ''),
          at: when,
          kind: vip ? 'vip' : 'activity',
        };
      }).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);

      const ids = new Set(next.map(x => x.id));
      const previous = seen.current;
      if (previous) {
        const fresh = next.filter(x => !previous.has(x.id) && Date.parse(x.at) >= startedAt.current - 3000);
        if (fresh.length) {
          setUnread(n => Math.min(99, n + fresh.length));
          const registration = fresh.find(x => x.kind === 'vip');
          if (registration && isOperationalSoundEnabled()) {
            void playOperationalAlert('ready');
            showOperationalNotification(registration.title, registration.summary || 'Nuevo registro');
          }
        }
      }
      seen.current = ids;
      setItems(next);
      setError(false);
    }, (e) => {
      console.warn('[BusinessActivityBell] No se pudieron leer los movimientos', e);
      setError(true);
    });
  }, [businessId, legacy, allowRead]);

  // No mostramos un control que no puede leer actividad privada.
  if (!allowRead) return null;

  return (
    <div className={`relative ${className}`}>
      <button type="button" onClick={() => { setOpen(x => !x); setUnread(0); }}
        aria-label={`Movimientos del negocio${unread ? `, ${unread} nuevos` : ''}`}
        aria-expanded={open}
        className="relative flex items-center gap-1 rounded-xl border border-current/20 px-3 py-2 text-xs font-bold">
        <Bell className="h-4 w-4" /><span className="hidden sm:inline">Actividad</span>
        {unread > 0 && <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[10px] leading-5 text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[80] mt-2 w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-gray-300 bg-white text-[#261A12] shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <strong className="text-sm">Movimientos recientes</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar actividad"><X className="h-4 w-4" /></button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {error && <p className="p-4 text-xs text-red-700">No fue posible consultar la actividad. Comprueba tus permisos y conexión.</p>}
            {!error && !items.length && <p className="p-4 text-xs text-gray-600">Todavía no hay movimientos registrados.</p>}
            {!error && items.map(item => (
              <div key={item.id} className="border-b border-gray-100 px-4 py-3 last:border-0">
                <div className="flex items-center gap-2">
                  {item.kind === 'vip' && <span aria-hidden="true">⭐</span>}
                  <strong className="text-xs">{item.title}</strong>
                </div>
                {!!item.summary && <p className="mt-1 break-words text-xs text-gray-700">{item.summary}</p>}
                {!!item.at && !Number.isNaN(Date.parse(item.at)) && <time className="mt-1 block text-[10px] text-gray-500">{new Date(item.at).toLocaleString('es-MX')}</time>}
              </div>
            ))}
          </div>
          <p className="border-t border-gray-200 px-4 py-2 text-[10px] text-gray-500">Avisos en tiempo real mientras este panel permanezca abierto.</p>
        </div>
      )}
    </div>
  );
};
