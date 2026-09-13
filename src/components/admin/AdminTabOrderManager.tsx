import React, { useEffect, useRef, useState } from 'react';

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
const HANDLE_ATTR = 'data-admin-drag-handle';

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
  const clone = button.cloneNode(true) as HTMLButtonElement;
  clone.querySelectorAll(`[${HANDLE_ATTR}]`).forEach((node) => node.remove());
  return (clone.textContent || '').replace(/\s+/g, ' ').trim();
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
    const byDataset = buttons.find((button) => button.dataset.adminTabId === id);
    if (byDataset) {
      result.set(id, byDataset);
      return;
    }

    const expected = TAB_LABELS[id];
    const byLabel = buttons.find((candidate) => buttonLabel(candidate) === expected);
    if (byLabel) result.set(id, byLabel);
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

function canCurrentRoleCustomize(): boolean {
  const headerText = (document.querySelector('header')?.textContent || '').toUpperCase();
  return headerText.includes('DUEÑA') || headerText.includes('ADMINISTRADOR');
}

function addDirectDragHandle(button: HTMLButtonElement) {
  if (button.querySelector(`[${HANDLE_ATTR}]`)) return;

  const handle = document.createElement('span');
  handle.setAttribute(HANDLE_ATTR, 'true');
  handle.setAttribute('role', 'button');
  handle.setAttribute('aria-label', `Mover ${buttonLabel(button)}`);
  handle.setAttribute('title', 'Mantén y arrastra para cambiar de posición');
  handle.textContent = '⋮⋮';

  Object.assign(handle.style, {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
    minWidth: '18px',
    height: '24px',
    marginLeft: '6px',
    padding: '0 3px',
    borderRadius: '7px',
    border: '1px solid rgba(201,151,77,.38)',
    background: 'rgba(201,151,77,.10)',
    color: '#A86B3D',
    fontSize: '12px',
    fontWeight: '900',
    lineHeight: '1',
    letterSpacing: '-2px',
    cursor: 'grab',
    touchAction: 'none',
    userSelect: 'none',
  } as Partial<CSSStyleDeclaration>);

  button.appendChild(handle);
}

function removeDirectDragHandles(nav: HTMLElement) {
  nav.querySelectorAll(`[${HANDLE_ATTR}]`).forEach((node) => node.remove());
}

/**
 * Personalización directa de la barra administrativa.
 *
 * Dueña/Admin pueden mover las pestañas desde el pequeño control ⋮⋮ que aparece
 * dentro de cada pestaña. Ya no existe botón flotante ni modal separado: el orden
 * se modifica sobre la propia navegación, sin salir de la vista en la que están.
 */
export const AdminTabOrderManager: React.FC = () => {
  const [order, setOrder] = useState<AdminTabKey[]>(readSavedOrder);
  const draggedIdRef = useRef<AdminTabKey | null>(null);
  const draggedButtonRef = useRef<HTMLButtonElement | null>(null);

  const applyOrderToNav = () => {
    const nav = findAdminNav();
    if (!nav) return;

    const buttons = getAdminButtons(nav);
    order.forEach((id, index) => {
      const button = buttons.get(id);
      if (!button) return;
      button.style.order = String(index);
      button.dataset.adminTabId = id;
    });

    const canCustomize = canCurrentRoleCustomize() && buttons.has('info_restaurante') && buttons.has('usuarios');
    if (!canCustomize) {
      removeDirectDragHandles(nav);
      return;
    }

    buttons.forEach((button) => addDirectDragHandle(button));
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    } catch {
      // Si el navegador bloquea almacenamiento, el orden seguirá durante esta sesión.
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
    const finishDrag = () => {
      if (draggedButtonRef.current) {
        draggedButtonRef.current.style.opacity = '';
        draggedButtonRef.current.style.transform = '';
        draggedButtonRef.current.style.boxShadow = '';
      }
      draggedIdRef.current = null;
      draggedButtonRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const handle = target?.closest<HTMLElement>(`[${HANDLE_ATTR}]`);
      if (!handle) return;

      const button = handle.closest<HTMLButtonElement>('button[data-admin-tab-id]');
      const id = button?.dataset.adminTabId as AdminTabKey | undefined;
      if (!button || !id || !DEFAULT_ORDER.includes(id)) return;

      event.preventDefault();
      event.stopPropagation();
      draggedIdRef.current = id;
      draggedButtonRef.current = button;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
      handle.style.cursor = 'grabbing';
      button.style.opacity = '0.72';
      button.style.transform = 'scale(0.98)';
      button.style.boxShadow = '0 0 0 2px rgba(201,151,77,.45) inset';
      handle.setPointerCapture?.(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const draggedId = draggedIdRef.current;
      if (!draggedId) return;

      event.preventDefault();
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const targetButton = element?.closest<HTMLButtonElement>('button[data-admin-tab-id]');
      const targetId = targetButton?.dataset.adminTabId as AdminTabKey | undefined;
      if (!targetId || targetId === draggedId || !DEFAULT_ORDER.includes(targetId)) return;

      setOrder((current) => reorderIds(current, draggedId, targetId));
    };

    const handleClickCapture = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(`[${HANDLE_ATTR}]`)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false });
    document.addEventListener('pointerup', finishDrag, true);
    document.addEventListener('pointercancel', finishDrag, true);
    document.addEventListener('click', handleClickCapture, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('pointermove', handlePointerMove, true);
      document.removeEventListener('pointerup', finishDrag, true);
      document.removeEventListener('pointercancel', finishDrag, true);
      document.removeEventListener('click', handleClickCapture, true);
      finishDrag();
    };
  }, []);

  return null;
};
