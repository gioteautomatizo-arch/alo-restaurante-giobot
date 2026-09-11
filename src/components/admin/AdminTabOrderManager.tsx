import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, GripVertical, RotateCcw, SlidersHorizontal, X } from 'lucide-react';

type AdminTabKey =
  | 'resumen'
  | 'mesas'
  | 'caja'
  | 'comandas'
  | 'turno'
  | 'gastos'
  | 'sobre'
  | 'cxc'
  | 'vip_clients'
  | 'inventario'
  | 'menu_dia'
  | 'info_restaurante'
  | 'historial'
  | 'bitacora'
  | 'usuarios';

const STORAGE_KEY = 'alo_admin_tab_order_v1';

const TAB_LABELS: Record<AdminTabKey, string> = {
  resumen: 'Resumen',
  mesas: 'Mesas',
  caja: 'Caja & Cobro',
  comandas: 'Comandas',
  turno: 'Control de Turno',
  gastos: 'Gastos & Comprobantes',
  sobre: 'Sobre / Resguardo',
  cxc: 'CXC',
  vip_clients: 'Clientes VIP',
  inventario: 'Inventario de Papel',
  menu_dia: 'Menú del Día',
  info_restaurante: 'Info Restaurante',
  historial: 'Historial de Cortes',
  bitacora: 'Bitácora & Auditoría',
  usuarios: 'Colaboradores & Accesos',
};

const DEFAULT_ORDER = Object.keys(TAB_LABELS) as AdminTabKey[];

function normalizeOrder(value: unknown): AdminTabKey[] {
  const valid = new Set<AdminTabKey>(DEFAULT_ORDER);
  const parsed = Array.isArray(value)
    ? value.filter((item): item is AdminTabKey => typeof item === 'string' && valid.has(item as AdminTabKey))
    : [];
  const unique = Array.from(new Set(parsed));
  return [...unique, ...DEFAULT_ORDER.filter((id) => !unique.includes(id))];
}

function readSavedOrder(): AdminTabKey[] {
  if (typeof window === 'undefined') return DEFAULT_ORDER;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeOrder(JSON.parse(raw)) : DEFAULT_ORDER;
  } catch {
    return DEFAULT_ORDER;
  }
}

function buttonLabel(button: HTMLButtonElement): string {
  return (button.textContent || '').replace(/\s+/g, ' ').trim();
}

function findAdminNav(): HTMLElement | null {
  const navs = Array.from(document.querySelectorAll<HTMLElement>('nav'));
  return navs.find((nav) => {
    const labels = Array.from(nav.querySelectorAll<HTMLButtonElement>('button')).map(buttonLabel);
    return labels.includes('Resumen') && labels.includes('Mesas') && labels.includes('Comandas');
  }) || null;
}

function getAdminButtons(nav: HTMLElement): Map<AdminTabKey, HTMLButtonElement> {
  const buttons = Array.from(nav.querySelectorAll<HTMLButtonElement>('button'));
  const result = new Map<AdminTabKey, HTMLButtonElement>();

  DEFAULT_ORDER.forEach((id) => {
    const expected = TAB_LABELS[id];
    const button = buttons.find((candidate) => buttonLabel(candidate) === expected);
    if (button) result.set(id, button);
  });

  return result;
}

function reorderIds(order: AdminTabKey[], draggedId: AdminTabKey, targetId: AdminTabKey): AdminTabKey[] {
  const from = order.indexOf(draggedId);
  const to = order.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return order;

  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, draggedId);
  return next;
}

export const AdminTabOrderManager: React.FC = () => {
  const [order, setOrder] = useState<AdminTabKey[]>(readSavedOrder);
  const [isAdminNavVisible, setIsAdminNavVisible] = useState(false);
  const [canCustomize, setCanCustomize] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<AdminTabKey | null>(null);
  const draggedIdRef = useRef<AdminTabKey | null>(null);

  const orderedLabels = useMemo(
    () => order.map((id) => ({ id, label: TAB_LABELS[id] })),
    [order]
  );

  const applyOrderToNav = () => {
    const nav = findAdminNav();
    if (!nav) {
      setIsAdminNavVisible(false);
      setCanCustomize(false);
      return;
    }

    const buttons = getAdminButtons(nav);
    order.forEach((id, index) => {
      const button = buttons.get(id);
      if (button) {
        button.style.order = String(index);
        button.dataset.adminTabId = id;
      }
    });

    const headerText = (document.querySelector('header')?.textContent || '').toUpperCase();
    const roleCanCustomize = headerText.includes('DUEÑA') || headerText.includes('ADMINISTRADOR');

    setIsAdminNavVisible(buttons.size >= 3);
    setCanCustomize(roleCanCustomize && buttons.has('info_restaurante') && buttons.has('usuarios'));
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    } catch {
      // Si el navegador bloquea almacenamiento, el orden seguirá funcionando durante esta sesión.
    }

    applyOrderToNav();
  }, [order]);

  useEffect(() => {
    let rafId = 0;
    const scheduleApply = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(applyOrderToNav);
    };

    scheduleApply();
    const root = document.getElementById('root') || document.body;
    const observer = new MutationObserver(scheduleApply);
    observer.observe(root, { childList: true, subtree: true });
    window.addEventListener('resize', scheduleApply);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener('resize', scheduleApply);
    };
  }, [order]);

  useEffect(() => {
    if (!isAdminNavVisible && isOpen) setIsOpen(false);
  }, [isAdminNavVisible, isOpen]);

  const resetOrder = () => {
    setOrder(DEFAULT_ORDER);
  };

  const handlePointerDown = (id: AdminTabKey, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    draggedIdRef.current = id;
    setDraggingId(id);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const dragged = draggedIdRef.current;
    if (!dragged) return;

    const element = document.elementFromPoint(event.clientX, event.clientY);
    const row = element?.closest<HTMLElement>('[data-admin-order-row]');
    const targetId = row?.dataset.adminOrderRow as AdminTabKey | undefined;
    if (!targetId || targetId === dragged) return;

    setOrder((current) => reorderIds(current, dragged, targetId));
  };

  const finishDragging = (event?: React.PointerEvent<HTMLButtonElement>) => {
    if (event && event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    draggedIdRef.current = null;
    setDraggingId(null);
  };

  if (!isAdminNavVisible || !canCustomize || typeof document === 'undefined') return null;

  return createPortal(
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed right-3 top-[118px] z-[70] inline-flex items-center gap-1.5 rounded-xl border border-[#C9974D]/60 bg-[#3A2418] px-3 py-2 text-[11px] font-bold text-[#FFF7EA] shadow-lg active:scale-95"
          title="Personalizar el orden de las pestañas"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-[#C9974D]" />
          <span>Ordenar</span>
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-3 backdrop-blur-[1px]">
          <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border-2 border-[#C9974D]/45 bg-[#FFFDF9] shadow-2xl">
            <div className="flex items-center justify-between bg-[#3A2418] px-4 py-3.5 text-[#FFF7EA]">
              <div>
                <h2 className="font-serif text-base font-black">Personalizar pestañas</h2>
                <p className="mt-0.5 text-[11px] text-[#F4E3C8]">Arrastra desde ⋮⋮ y acomódalas a tu gusto.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  finishDragging();
                  setIsOpen(false);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20"
                aria-label="Cerrar personalización"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-3">
              <div className="space-y-2">
                {orderedLabels.map(({ id, label }, index) => (
                  <div
                    key={id}
                    data-admin-order-row={id}
                    className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-all ${
                      draggingId === id
                        ? 'border-[#C9974D] bg-[#F4E3C8] shadow-md scale-[1.01]'
                        : 'border-[#DEC8AE] bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      onPointerDown={(event) => handlePointerDown(id, event)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={finishDragging}
                      onPointerCancel={finishDragging}
                      className="flex h-9 w-9 shrink-0 touch-none items-center justify-center rounded-xl border border-[#DEC8AE] bg-[#FFF7EA] text-[#A86B3D] active:bg-[#F4E3C8]"
                      aria-label={`Arrastrar ${label}`}
                      title={`Arrastrar ${label}`}
                    >
                      <GripVertical className="h-5 w-5" />
                    </button>

                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[#3A2418]">{label}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#A86B3D]">Posición {index + 1}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-[#F4E3C8] bg-[#FFF7EA] p-3">
              <button
                type="button"
                onClick={resetOrder}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#DEC8AE] bg-white px-3 py-2.5 text-xs font-bold text-[#6B4028]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restablecer
              </button>
              <button
                type="button"
                onClick={() => {
                  finishDragging();
                  setIsOpen(false);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#3A2418] px-3 py-2.5 text-xs font-bold text-[#FFF7EA] shadow-sm"
              >
                <Check className="h-3.5 w-3.5 text-[#C9974D]" />
                Listo
              </button>
            </div>

            <p className="px-4 pb-3 text-center text-[10px] text-[#8A624C]">
              El orden se guarda en este dispositivo y no cambia los permisos de cada rol.
            </p>
          </div>
        </div>
      )}
    </>,
    document.body
  );
};
