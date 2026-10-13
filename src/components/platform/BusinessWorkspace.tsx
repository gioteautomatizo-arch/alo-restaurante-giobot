import React, { useEffect, useState } from 'react';
import { ArrowLeft, Bot, Store } from 'lucide-react';
import { BusinessBrandingSettings } from './BusinessBrandingSettings';
import { BusinessCatalogEditor } from './BusinessCatalogEditor';
import { BusinessEmployeesView } from './BusinessEmployeesView';
import { BusinessOperationsView } from './BusinessOperationsView';
import { BusinessMenuImport } from './BusinessMenuImport';
import { BusinessReportsView } from './BusinessReportsView';
import { BusinessModulesView } from './BusinessModulesView';
import { getBusinessTemplateConfig } from '../../data/businessTemplates';
import { hasBusinessPermission } from '../../lib/restaurantCore';
import type { BusinessRole, RestaurantTenant } from '../../lib/restaurantCore';
import { getBusinessForUser, getBusinessMembership } from '../../lib/businessAuthService';
import { subscribeToAuth } from '../../lib/firebase';
import type { User as FirebaseUser } from 'firebase/auth';

export const BusinessWorkspace: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [business, setBusiness] = useState<RestaurantTenant | null>(null);
  const [role, setRole] = useState<BusinessRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'workspace' | 'catalog' | 'employees' | 'operations' | 'menuImport' | 'modules' | 'branding' | 'reports'>('workspace');

  useEffect(() => subscribeToAuth((user) => setAuthUser(user)), []);

  useEffect(() => {
    if (!authUser) {
      setLoading(true);
      return;
    }

    setLoading(true);
    setError(null);
    Promise.all([getBusinessForUser(authUser.uid, businessId), getBusinessMembership(authUser.uid, businessId)])
      .then(([tenant, membership]) => {
        if (!tenant || !membership) {
          setError('No tienes acceso a este negocio o ya no existe.');
          return;
        }
        setBusiness(tenant);
        setRole(membership.role);
      })
      .catch((err) => {
        console.warn('No se pudo abrir el negocio:', err);
        setError('No pudimos abrir este negocio. Intenta nuevamente.');
      })
      .finally(() => setLoading(false));
  }, [authUser, businessId]);

  // Paleta del negocio: la leen las pantallas del espacio (ver platformTheme.css).
  useEffect(() => {
    if (!business) return;
    const b = business.branding;
    const root = document.documentElement;
    const vars: Record<string, string | undefined> = {
      '--biz-bg': b.backgroundColor,
      '--biz-surface': b.surfaceColor,
      '--biz-text': b.textColor,
      '--biz-primary': b.primaryColor,
      '--biz-accent': b.accentColor,
    };
    Object.entries(vars).forEach(([key, value]) => {
      if (value) root.style.setProperty(key, value);
      else root.style.removeProperty(key);
    });
    return () => Object.keys(vars).forEach((key) => root.style.removeProperty(key));
  }, [business]);

  const publicUrl = `${window.location.origin}${window.location.pathname}#negocio/${encodeURIComponent(businessId)}`;
  const [linkCopied, setLinkCopied] = useState(false);
  const copyPublicLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      window.prompt('Copia el enlace de tu página:', publicUrl);
    }
  };

  const back = () => {
    window.location.hash = '#business';
  };

  const canManageCatalog = !!role && hasBusinessPermission(role, 'catalog.manage');
  const canUsePos = !!role && hasBusinessPermission(role, 'pos.use');
  const canManageEmployees = !!role && hasBusinessPermission(role, 'employees.manage');

  // La plantilla manda los módulos; si el negocio es anterior a las plantillas,
  // se usa su giro (businessType) y, como último recurso, "other".
  const template = getBusinessTemplateConfig(business?.templateId || business?.businessType || 'other');

  if (view === 'modules' && business) {
    return <BusinessModulesView businessName={business.branding.restaurantName} templateName={template.name} modules={template.modules} enabledCapabilities={business.capabilities || []} onBack={() => setView('workspace')} onOpen={(module) => {
      if (module.capability === 'CATALOG') setView('catalog');
      else if (module.capability === 'POS' || module.capability === 'ORDERS' || module.capability === 'ORDER_QUEUE') setView('operations');
      else if (module.capability === 'MENU_IMPORT') setView('menuImport');
      else if (module.capability === 'STAFF' && canManageEmployees) setView('employees');
      else if (module.capability === 'RECEIPTS' && !!role && hasBusinessPermission(role, 'reports.view')) setView('reports');
      else if (module.capability === 'BUSINESS_SETTINGS' && !!role && hasBusinessPermission(role, 'business.manage')) setView('branding');
    }} />;
  }

  if (view === 'reports' && business) {
    return <BusinessReportsView businessName={business.branding.restaurantName} onBack={() => setView('workspace')} />;
  }

  if (view === 'branding' && business) {
    return <BusinessBrandingSettings business={business} onBack={() => setView('workspace')} onSaved={(updated) => setBusiness(updated)} />;
  }

  if (view === 'menuImport' && business) {
    return <BusinessMenuImport businessId={businessId} businessName={business.branding.restaurantName} onBack={() => setView('catalog')} onOpenCatalog={() => setView('catalog')} />;
  }

  if (view === 'operations' && business) {
    return <BusinessOperationsView businessId={businessId} businessName={business.branding.restaurantName} onBack={() => setView('workspace')} />;
  }

  if (view === 'catalog' && business) {
    return <BusinessCatalogEditor businessId={businessId} businessName={business.branding.restaurantName} onBack={() => setView('workspace')} onImportFromPhoto={() => setView('menuImport')} />;
  }

  if (view === 'employees' && business && role) {
    return <BusinessEmployeesView businessId={businessId} managerRole={role} onBack={() => setView('workspace')} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F1EA] flex items-center justify-center text-[#111111]">
        <div className="text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-black text-[#D4AF37] flex items-center justify-center"><Bot className="w-7 h-7" /></div>
          <h1 className="mt-5 font-serif text-2xl font-black">Abriendo tu negocio…</h1>
          <p className="mt-2 text-sm text-[#333333]">Validando tu acceso y cargando el espacio de trabajo.</p>
        </div>
      </div>
    );
  }

  if (error || !business) {
    return (
      <div className="min-h-screen bg-[#F5F1EA] flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-[2rem] border border-black/10 bg-white p-7 text-center shadow-sm">
          <h1 className="font-serif text-2xl font-black">No pudimos abrir este negocio</h1>
          <p className="mt-2 text-sm text-[#6B4028]">{error || 'El negocio no está disponible.'}</p>
          <button type="button" onClick={back} className="mt-6 rounded-2xl bg-black px-5 py-3 text-sm font-black text-white">Volver a mis negocios</button>
        </div>
      </div>
    );
  }

  // Un solo listado de módulos. "ready" = ya funciona; "soon" = todavía no está construido.
  const canSeeReports = !!role && hasBusinessPermission(role, 'reports.view');
  const canManageBusiness = !!role && hasBusinessPermission(role, 'business.manage');
  const modulesList: Array<{ title: string; description: string; view?: typeof view; href?: string; allowed: boolean; deniedText: string }> = [
    { title: 'Mi página pública', description: 'Lo que ve tu cliente: portada, menú y pedido por WhatsApp.', href: `#negocio/${encodeURIComponent(businessId)}`, allowed: true, deniedText: '' },
    { title: 'Caja y pedidos', description: 'Vende, cobra y sigue cada pedido.', view: 'operations', allowed: !!business.features.pos && canUsePos, deniedText: 'Tu rol no tiene acceso' },
    { title: 'Catálogo', description: 'Productos, precios y disponibilidad. También puedes cargarlo desde la foto de tu menú.', view: 'catalog', allowed: canManageCatalog, deniedText: 'Solo encargados y dueños' },
    { title: 'Reportes', description: 'Ventas, producto estrella y cómo te pagan.', view: 'reports', allowed: canSeeReports, deniedText: 'Tu rol no tiene acceso' },
    { title: 'Empleados', description: 'Tu equipo, roles y permisos.', view: 'employees', allowed: canManageEmployees, deniedText: 'Solo administradores y dueños' },
    { title: 'Identidad y colores', description: 'Logo, portada y paleta de tu negocio.', view: 'branding', allowed: canManageBusiness, deniedText: 'Solo el dueño' },
    { title: 'Clientes', description: 'Historial y relación con tus clientes.', allowed: true, deniedText: '' },
    { title: 'Inventario', description: 'Existencias, entradas y alertas.', allowed: true, deniedText: '' },
    { title: 'Giobot, tu asistente', description: `Atiende a tus clientes por ti (${business.assistant.name}).`, allowed: true, deniedText: '' },
  ];
  const readyModules = modulesList.filter((module) => module.view || module.href);
  const soonModules = modulesList.filter((module) => !module.view && !module.href);

  return (
    <div className="min-h-screen bg-[#050505] text-[#F7F7F7]">
      <header className="border-b border-[#3A3022] bg-[#0B0B0B] px-4 py-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between gap-4">
          <button type="button" onClick={back} className="rounded-xl border border-[#3A3022] px-3 py-2 text-xs font-bold text-[#F7F7F7] flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Mis negocios
          </button>
          <div className="flex min-w-0 items-center gap-2">
            {business.branding.logoUrl && <img src={business.branding.logoUrl} alt="" className="h-8 w-8 rounded-lg bg-white object-cover" />}
            <strong className="truncate font-serif text-base text-[#F7F7F7]">{business.branding.restaurantName}</strong>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:py-8">
        <section className="flex items-center gap-4 rounded-[1.75rem] border border-[#3A3022] bg-[#111111] p-5 sm:p-6">
          <div className="w-16 h-16 rounded-2xl bg-white overflow-hidden flex items-center justify-center shrink-0">
            {business.branding.logoUrl ? (
              <img src={business.branding.logoUrl} alt={business.branding.restaurantName} className="w-full h-full object-cover" />
            ) : (
              <Store className="w-8 h-8 text-[#A86B3D]" />
            )}
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#E3BC6B]">Espacio de negocio</span>
            <h1 className="mt-0.5 truncate font-serif text-2xl font-black text-[#F7F7F7] sm:text-3xl">{business.branding.restaurantName}</h1>
            <p className="mt-0.5 text-xs text-[#B7B7B7]">@{business.branding.publicSlug} · {template.name} · Rol: {role || '…'}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-[#3A3022] bg-[#111111] p-4">
          <p className="text-[10px] font-black uppercase tracking-wide text-[#E3BC6B]">Enlace para tus clientes</p>
          <p className="mt-1 break-all text-xs text-[#C8C8C8]">{publicUrl}</p>
          <button type="button" onClick={() => void copyPublicLink()} className="mt-3 rounded-xl bg-[#D6A34A] px-4 py-2.5 text-xs font-black text-[#050505]">{linkCopied ? '¡Enlace copiado!' : 'Copiar enlace'}</button>
          <p className="mt-2 text-[11px] text-[#B7B7B7]">Compártelo por WhatsApp, redes o en un QR. Tus clientes verán solo tu menú, nunca el panel.</p>
        </section>

        <section>
          <h2 className="mb-3 font-serif text-xl font-black text-[#F7F7F7]">Listos para usar</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {readyModules.map((module) => (
              <button
                key={module.title}
                type="button"
                disabled={!module.allowed}
                onClick={() => (module.href ? window.open(module.href, '_blank') : module.view && setView(module.view))}
                className="rounded-2xl border border-[#3A3022] bg-[#111111] p-5 text-left transition hover:border-[#D6A34A] disabled:cursor-default disabled:opacity-60 disabled:hover:border-[#3A3022]"
              >
                <span className="text-[10px] font-black uppercase tracking-wide text-[#E3BC6B]">{module.allowed ? 'Abrir' : module.deniedText}</span>
                <strong className="mt-1.5 block font-serif text-lg text-[#F7F7F7]">{module.title}</strong>
                <span className="mt-1 block text-xs leading-relaxed text-[#C8C8C8]">{module.description}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-serif text-xl font-black text-[#F7F7F7]">Próximamente</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {soonModules.map((module) => (
              <div key={module.title} className="rounded-2xl border border-dashed border-[#3A3022] bg-[#0B0B0B] p-4">
                <strong className="block font-serif text-base text-[#F7F7F7]">{module.title}</strong>
                <span className="mt-1 block text-xs leading-relaxed text-[#B7B7B7]">{module.description}</span>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setView('modules')} className="mt-4 text-xs font-bold text-[#E3BC6B] underline">
            Ver todo lo que incluirá la plantilla {template.name}
          </button>
        </section>

        <p className="pb-4 text-center text-[11px] text-[#B7B7B7]">Hecho con Gioteautomatizo</p>
      </main>
    </div>
  );
};
