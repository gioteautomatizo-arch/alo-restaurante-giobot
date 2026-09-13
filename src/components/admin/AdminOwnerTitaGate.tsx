import React, { useEffect, useState } from 'react';
import { AdminOwnerTita } from './AdminOwnerTita';

function isAdminWorkspaceVisible(): boolean {
  if (typeof document === 'undefined') return false;
  const headerText = (document.querySelector('header')?.textContent || '').toUpperCase();
  return headerText.includes('RESTAURANTE CALIENTITO') && headerText.includes('ADMINISTRACIÓN');
}

/**
 * Evita montar Tita Administrativa mientras el usuario está en la vista pública.
 *
 * La portada pública contiene componentes dinámicos (VIP, catálogo, destacados),
 * mientras que Tita Administrativa históricamente inspeccionaba cambios del DOM.
 * Mantener ambos montados al mismo tiempo podía generar una cascada de renders en
 * Preview. Este gate separa ambos mundos sin tocar la lógica operativa de Tita.
 */
export const AdminOwnerTitaGate: React.FC = () => {
  const [isAdminWorkspace, setIsAdminWorkspace] = useState<boolean>(() => isAdminWorkspaceVisible());

  useEffect(() => {
    const check = () => {
      const next = isAdminWorkspaceVisible();
      setIsAdminWorkspace((current) => (current === next ? current : next));
    };

    check();
    // No usamos MutationObserver: una comprobación ligera es suficiente para detectar
    // entrada/salida del panel y no reacciona a cada mutación interna de React.
    const timer = window.setInterval(check, 600);
    window.addEventListener('hashchange', check);
    window.addEventListener('popstate', check);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('hashchange', check);
      window.removeEventListener('popstate', check);
    };
  }, []);

  return isAdminWorkspace ? <AdminOwnerTita /> : null;
};
