import React, { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { isOperationalSoundEnabled, playOperationalAlert, showOperationalNotification } from '../../lib/operationalAlerts';

type FeedSource = 'activity' | 'vip';
type FeedTab = 'clients' | 'admin';

interface Movement {
  // La misma alta VIP puede aparecer como documento y como evento de backend:
  // compartir clave elimina duplicados en el historial y los avisos.
  id: string;
  title: string;
  summary: string;
  at: string;
  kind: FeedTab;
}

const MAX_VISIBLE = 50;
const NOTIFICATION_DELAY_MS = 5 * 60 * 1000;

function readActivity(id: string, data: Record<string, unknown>): Movement {
  const action = String(data.action || '');
  const isVip = action === 'vip.register' || action === 'Nueva membresía VIP';
  const target = typeof data.targetId === 'string' ? data.targetId : '';
  return {
    id: isVip && target ? `vip:${target}` : `activity:${id}`,
    title: isVip ? 'Nueva membresía VIP' : action || 'Movimiento registrado',
    summary: String(data.summary || data.details || ''),
    at: String(data.at || data.timestamp || data.createdAt || ''),
    kind: isVip ? 'clients' : 'admin',
  };
}

function readRegistration(id: string, data: Record<string, unknown>): Movement {
  const customerName = typeof data.customerName === 'string' ? data.customerName.trim() : '';
  return {
    id: `vip:${id}`,
    title: 'Nueva membresía VIP',
    summary: customerName ? `${customerName} se registró como cliente VIP` : 'Un cliente se registró como VIP',
    at: String(data.createdAt || ''),
    kind: 'clients',
  };
}

function orderRecent(events: Movement[]): Movement[] {
  const unique = new Map<string, Movement>();
  // Las tarjetas reales prevalecen sobre sus eventos duplicados de bitácora.
  for (const item of events) unique.set(item.id, item);
  return [...unique.values()]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, MAX_VISIBLE);
}

/**
 * Centro de movimientos de todos los negocios.
 * - Bitacora: acciones administrativas y eventos emitidos por el backend.
 * - vip_profiles: altas hechas directamente por los comensales, incluso en
 *   el flujo antiguo de Calientito que no crea un evento de bitacora.
 *
 * Un listener por coleccion y negocio; sin escrituras adicionales, polling,
 * permisos publicos nuevos ni avisos repetidos al cargar el historial.
 */
export const BusinessActivityBell: React.FC<{
  businessId: string;
  legacy?: boolean;
  allowRead?: boolean;
  className?: string;
}> = ({ businessId, legacy = false, allowRead = true, className = '' }) => {
  const [items, setItems] = useState<Movement[]>([]);
  const [tab, setTab] = useState<FeedTab>('clients');
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [readErrors, setReadErrors] = useState<Partial<Record<FeedSource, boolean>>>({});
  const sourceItems = useRef<Record<FeedSource, Movement[]>>({ activity: [], vip: [] });
  const knownIds = useRef<Record<FeedSource, Set<string> | null>>({ activity: null, vip: null });
  const notifiedIds = useRef<Set<string>>(new Set());
  const openedAt = useRef(Date.now());

  useEffect(() => {
    openedAt.current = Date.now();
    sourceItems.current = { activity: [], vip: [] };
    knownIds.current = { activity: null, vip: null };
    notifiedIds.current = new Set();
    setItems([]);
    setUnread(0);
    setReadErrors({});
    setTab('clients');
    if (!businessId.trim() || !allowRead) return;

    const receive = (source: FeedSource, incoming: Movement[]) => {
      const previous = knownIds.current[source];
      const nextIds = new Set(incoming.map((event) => event.id));

      if (previous === null) {
        // El primer snapshot es historial, NO una nueva notificación.
        incoming.forEach((event) => notifiedIds.current.add(event.id));
      } else {
        const fresh = incoming.filter((event) =>
          !previous.has(event.id)
          && !notifiedIds.current.has(event.id)
          && Number.isFinite(Date.parse(event.at))
          && Date.parse(event.at) >= openedAt.current - NOTIFICATION_DELAY_MS,
        );
        for (const event of fresh) {
          notifiedIds.current.add(event.id);
          // Lo prioritario es avisar sobre movimientos del COMENSAL;
          // las acciones internas permanecen en la pestaña Administración.
          if (event.kind !== 'clients') continue;
          setUnread((value) => Math.min(99, value + 1));
        }
        if (fresh.some((event) => event.kind === 'clients') && isOperationalSoundEnabled()) {
          void playOperationalAlert('ready');
          // El aviso del sistema no revela datos personales en pantalla bloqueada.
          showOperationalNotification('Nuevo registro de cliente', 'Revisa la actividad de tu negocio.');
        }
      }

      knownIds.current[source] = nextIds;
      sourceItems.current[source] = incoming;
      setItems(orderRecent([...sourceItems.current.activity, ...sourceItems.current.vip]));
      setReadErrors((old) => ({ ...old, [source]: false }));
    };

    const activityRef = legacy
      ? collection(db, 'activity_logs')
      : collection(db, 'businesses', businessId, 'auditLog');
    const activityQuery = legacy
      ? query(activityRef, where('restaurantId', '==', businessId), limit(100))
      : query(activityRef, orderBy('at', 'desc'), limit(80));

    const unsubActivity = onSnapshot(
      activityQuery,
      (snapshot) => {
        receive('activity', snapshot.docs.map((d) => readActivity(d.id, d.data())));
      },
      (error) => {
        console.warn('[ActivityBell] Bitácora no disponible:', error);
        setReadErrors((old) => ({ ...old, activity: true }));
      },
    );

    // El alta pública actual (VITE_SECURE_VIP_API desactivado) guarda
    // directamente en vip_profiles y NO crea ninguna entrada de auditoría.
    // Escuchar esa colección es necesario para detectar esas inscripciones.
    // Filtramos en Firestore antes de recibir datos de cualquier otra tienda.
    const vipQuery = query(
      collection(db, 'vip_profiles'),
      where('restaurantId', '==', businessId),
    );
    const unsubVip = onSnapshot(
      vipQuery,
      (snapshot) => {
        receive('vip', snapshot.docs.map((d) => readRegistration(d.id, d.data())));
      },
      (error) => {
        console.warn('[ActivityBell] Registros VIP no disponibles:', error);
        setReadErrors((old) => ({ ...old, vip: true }));
      },
    );

    return () => {
      unsubActivity();
      unsubVip();
    };
  }, [businessId, legacy, allowRead]);

  if (!allowRead) return null;

  const visible = items.filter((entry) => entry.kind === tab);
  const missingVip = !!readErrors.vip;
  const missingActivity = !!readErrors.activity;

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => { setOpen((old) => !old); setUnread(0); }}
        aria-label={`Notificaciones de clientes${unread ? `, ${unread} nuevas` : ''}`}
        aria-expanded={open}
        className="relative flex items-center gap-1 rounded-xl border border-current/20 px-3 py-2 text-xs font-bold"
      >
        <Bell className="h-4 w-4" />
        <span className="hidden sm:inline">Notificaciones</span>
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[10px] leading-5 text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[80] mt-2 w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-gray-300 bg-white text-[#261A12] shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <strong className="text-sm">Actividad del negocio</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar notificaciones">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex border-b border-gray-200 px-2 pt-2" role="tablist" aria-label="Tipo de actividad">
            <button type="button" role="tab" aria-selected={tab === 'clients'} onClick={() => setTab('clients')}
              className={`flex-1 rounded-t-lg px-2 py-2 text-xs font-bold ${tab === 'clients' ? 'bg-amber-100 text-amber-900' : 'text-gray-600'}`}>
              Clientes
            </button>
            <button type="button" role="tab" aria-selected={tab === 'admin'} onClick={() => setTab('admin')}
              className={`flex-1 rounded-t-lg px-2 py-2 text-xs font-bold ${tab === 'admin' ? 'bg-amber-100 text-amber-900' : 'text-gray-600'}`}>
              Administración
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {tab === 'clients' && missingVip && (
              <p className="border-b border-red-100 bg-red-50 px-4 py-3 text-xs text-red-800">
                No fue posible consultar todas las altas VIP. Revisa tu acceso a Firebase.
              </p>
            )}
            {tab === 'admin' && missingActivity && (
              <p className="border-b border-red-100 bg-red-50 px-4 py-3 text-xs text-red-800">
                No fue posible consultar la bitácora administrativa.
              </p>
            )}
            {!visible.length && (
              <p className="p-4 text-xs text-gray-600">
                {tab === 'clients'
                  ? 'Todavía no hay registros VIP visibles para este negocio.'
                  : 'Todavía no hay movimientos administrativos.'}
              </p>
            )}
            {visible.map((item) => (
              <div key={item.id} className="border-b border-gray-100 px-4 py-3 last:border-0">
                <div className="flex items-center gap-2">
                  {item.kind === 'clients' && <span aria-hidden="true">⭐</span>}
                  <strong className="text-xs">{item.title}</strong>
                </div>
                {!!item.summary && <p className="mt-1 break-words text-xs text-gray-700">{item.summary}</p>}
                {!!item.at && !Number.isNaN(Date.parse(item.at)) && (
                  <time className="mt-1 block text-[10px] text-gray-500">{new Date(item.at).toLocaleString('es-MX')}</time>
                )}
              </div>
            ))}
          </div>
          <p className="border-t border-gray-200 px-4 py-2 text-[10px] text-gray-500">
            Actividad en vivo mientras el panel está abierto. Los avisos nuevos no repiten el historial.
          </p>
        </div>
      )}
    </div>
  );
};
