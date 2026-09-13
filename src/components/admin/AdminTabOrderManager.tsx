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
const SORTABLE_ATTR = 'data-admin-tab-sortable';
const STYLE_ID = 'alo-admin-tab-sort-style';

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

function installHandleStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    button[${SORTABLE_ATTR}="true"]::after {
      content: '⋮⋮';
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      min-width: 18px;
      height: 24px;
      margin-left: 6px;
      padding: 0 3px;
      border-radius: 7px;
      border: 1px solid rgba(201,151,77,.38);
      background: rgba(201,151,77,.10);
      color: #A86B3D;
      font-size: 12px;
      font-weight: 900;
      line-height: 1;
      letter-spacing: -2px;
    }
    button[${SORTABLE_ATTR}="true"] { touch-action: pan-x; }
    button[${SORTABLE_ATTR}="true"].alo-tab-dragging {
      opacity: .72;
      transform: scale(.98);
      box-shadow: 0 0 0 2px rgba(201,151,77,.45) inset;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Orden de pestañas administrativas sin tocar nodos hijos controlados por React.
 *
 * El antiguo enfoque insertaba spans con appendChild y observaba #root con
 * MutationObserver. React reconciliaba esos nodos y ambos observadores podían
 * retroalimentarse hasta producir "Maximum update depth exceeded".
 *
 * Esta versión solo usa CSS ::after para dibujar ⋮⋮ y aplica style.order/dataset
 * a los botones existentes. No observa el DOM ni agrega hijos dentro de React.
 */
export const AdminTabOrderManager: React.FC = () => {
  const [order, setOrder] = useState<AdminTabKey[]>(readSavedOrder);
  const orderRef = useRef(order);
  const draggedIdRef = useRef<AdminTabKey | null>(null);
  const draggedButtonRef = useRef<HTMLButtonElement | null>(null);
  const movedRef = useRef(false);
  const suppressClickUntilRef = useRef(0);

  useEffect(() => {
    orderRef.current = order;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    } catch {
      // Si el navegador bloquea almacenamiento, el orden sigue durante la sesión.
    }
  }, [order]);

  useEffect(() => {
    installHandleStyles();

    const applyOrderToNav = () => {
      const nav = findAdminNav();
      if (!nav) return;

      const buttons = getAdminButtons(nav);
      const canCustomize = canCurrentRoleCustomize() && buttons.has('info_restaurante') && buttons.has('usuarios');

      orderRef.current.forEach((id, index) => {
        const button = buttons.get(id);
        if (!button) return;

        if (button.dataset.adminTabId !== id) button.dataset.adminTabId = id;
        if (button.style.order !== String(index)) button.style.order = String(index);

        if (canCustomize) {
          if (button.getAttribute(SORTABLE_ATTR) !== 'true') button.setAttribute(SORTABLE_ATTR, 'true');
        } else if (button.hasAttribute(SORTABLE_ATTR)) {
          button.removeAttribute(SORTABLE_ATTR);
        }
      });
    };

    applyOrderToNav();
    // Sin MutationObserver: una comprobación ligera mantiene el orden cuando React
    // vuelve a crear la barra al cambiar de vista/rol, sin reaccionar a cada mutación.
    const timer = window.setInterval(applyOrderToNav, 800);
    window.addEventListener('resize', applyOrderToNav);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', applyOrderToNav);
      document.querySelectorAll<HTMLButtonElement>(`button[${SORTABLE_ATTR}]`).forEach((button) => {
        button.removeAttribute(SORTABLE_ATTR);
        button.classList.remove('alo-tab-dragging');
      });
    };
  }, []);

  useEffect(() => {
    // Al cambiar el orden, lo reflejamos inmediatamente sin esperar al intervalo.
    const nav = findAdminNav();
    if (!nav) return;
    const buttons = getAdminButtons(nav);
    order.forEach((id, index) => {
      const button = buttons.get(id);
      if (button && button.style.order !== String(index)) button.style.order = String(index);
    });
  }, [order]);

  useEffect(() => {
    const finishDrag = () => {
      if (draggedButtonRef.current) draggedButtonRef.current.classList.remove('alo-tab-dragging');
      if (movedRef.current) suppressClickUntilRef.current = Date.now() + 350;
      draggedIdRef.current = null;
      draggedButtonRef.current = null;
      movedRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>(`button[${SORTABLE_ATTR}="true"][data-admin-tab-id]`);
      if (!button) return;

      // El pseudo-handle ⋮⋮ ocupa el extremo derecho. Solo esa zona inicia arrastre,
      // así un toque normal en la pestaña sigue abriendo la sección.
      const rect = button.getBoundingClientRect();
      const isHandleZone = event.clientX >= rect.right - 34;
      if (!isHandleZone) return;

      const id = button.dataset.adminTabId as AdminTabKey | undefined;
      if (!id || !DEFAULT_ORDER.includes(id)) return;

      event.preventDefault();
      event.stopPropagation();
      draggedIdRef.current = id;
      draggedButtonRef.current = button;
      movedRef.current = false;
      button.classList.add('alo-tab-dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
      button.setPointerCapture?.(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const draggedId = draggedIdRef.current;
      if (!draggedId) return;

      event.preventDefault();
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const targetButton = element?.closest<HTMLButtonElement>('button[data-admin-tab-id]');
      const targetId = targetButton?.dataset.adminTabId as AdminTabKey | undefined;
      if (!targetId || targetId === draggedId || !DEFAULT_ORDER.includes(targetId)) return;

      movedRef.current = true;
      setOrder((current) => reorderIds(current, draggedId, targetId));
    };

    const handleClickCapture = (event: MouseEvent) => {
      if (Date.now() > suppressClickUntilRef.current) return;
      const target = event.target as HTMLElement | null;
      if (!target?.closest('button[data-admin-tab-id]')) return;
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
