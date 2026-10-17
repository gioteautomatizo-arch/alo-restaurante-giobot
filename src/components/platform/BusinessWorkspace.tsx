import React, { useEffect, useState } from 'react';
import { ArrowLeft, BarChart3, BookOpen, Bot, Clock, Heart, HandCoins, Landmark, PiggyBank, Receipt, ScrollText, ExternalLink, LayoutDashboard, Settings, ShoppingBag, Store, Users } from 'lucide-react';
import { BusinessSummaryTab } from './BusinessSummaryTab';
import { BusinessCustomersView } from './BusinessCustomersView';
import { BusinessShiftView } from './BusinessShiftView';
import { BusinessExpensesView } from './BusinessExpensesView';
import { BusinessAuditView } from './BusinessAuditView';
import { BusinessVaultView } from './BusinessVaultView';
import { BusinessVipPanel } from './BusinessVipPanel';
import { BusinessLedgerView } from './BusinessLedgerView';
import { BusinessModuleToggles } from './BusinessModuleToggles';
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
import { getBusinessPublicationStatus, setBusinessPublication, syncPublicProfileIfNeeded } from '../../lib/businessPublicProfileService';
import { subscribeToAuth } from '../../lib/firebase';
import type { User as FirebaseUser } from 'firebase/auth';

export const BusinessWorkspace: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [business, setBusiness] = useState<RestaurantTenant | null>(null);
  const [role, setRole] = useState<BusinessRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customersTab, setCustomersTab] = useState<'list' | 'vip'>('list');
  const [view, setView] = useState<'workspace' | 'catalog' | 'employees' | 'customers' | 'shifts' | 'expenses' | 'vault' | 'receivables' | 'payables' | 'audit' | 'operations' | 'menuImport' | 'modules' | 'branding' | 'reports'>('workspace');

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
  const [isPublished, setIsPublished] = useState(false);
  const [publicationBusy, setPublicationBusy] = useState(false);
  const [publicationMessage, setPublicationMessage] = useState<string | null>(null);
  const copyPublicLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      window.prompt('Copia el enlace de tu página:', publicUrl);
    }
  };

  // Si el negocio ya está publicado y su copia pública quedó vieja (colores, logo, VIP), el dueño la actualiza al entrar.
  useEffect(() => {
    if (!business || role !== 'OWNER') return;
    syncPublicProfileIfNeeded(businessId, business).catch((err) => console.warn('No se pudo sincronizar la página pública:', err));
  }, [business, role, businessId]);

  useEffect(() => {
    let cancelled = false;
    getBusinessPublicationStatus(businessId)
      .then((published) => { if (!cancelled) setIsPublished(published); })
      .catch((err) => console.warn('No se pudo consultar la publicación:', err));
    return () => { cancelled = true; };
  }, [businessId]);

  const togglePublication = async () => {
    if (!business) return;
    setPublicationBusy(true);
    setPublicationMessage(null);
    try {
      await setBusinessPublication(businessId, business, !isPublished);
      setIsPublished(!isPublished);
      setPublicationMessage(!isPublished ? 'Tu página ya está publicada en el directorio.' : 'Tu página se ocultó del directorio público.');
    } catch (err) {
      setPublicationMessage(err instanceof Error ? err.message : 'No pudimos actualizar la publicación.');
    } finally {
      setPublicationBusy(false);
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

  const canSeeReports = !!role && hasBusinessPermission(role, 'reports.view');
  const canManageBusiness = !!role && hasBusinessPermission(role, 'business.manage');
  const canPos = !!business.features.pos && canUsePos;

  const enabledCapabilities = new Set<string>(business.capabilities && business.capabilities.length > 0 ? business.capabilities : template.capabilities);
  const hasCap = (capability: string) => enabledCapabilities.has(capability);

  const tabs: Array<{ id: typeof view; label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; allowed: boolean }> = [
    { id: 'workspace', label: 'Resumen', icon: LayoutDashboard, allowed: true },
    { id: 'catalog', label: 'Catálogo', icon: BookOpen, allowed: canManageCatalog },
    { id: 'operations', label: 'Pedidos y Caja', icon: ShoppingBag, allowed: canPos },
    { id: 'shifts', label: 'Turno', icon: Clock, allowed: hasCap('SHIFTS') && (!!role && hasBusinessPermission(role, 'pos.use')) },
    { id: 'expenses', label: 'Gastos', icon: Receipt, allowed: hasCap('EXPENSES') && (!!role && hasBusinessPermission(role, 'pos.use')) },
    { id: 'vault', label: 'Resguardo', icon: PiggyBank, allowed: hasCap('CASH_VAULT') && (!!role && hasBusinessPermission(role, 'pos.use')) },
    { id: 'receivables', label: 'Por cobrar', icon: HandCoins, allowed: hasCap('RECEIVABLES') && (!!role && hasBusinessPermission(role, 'pos.use')) },
    { id: 'payables', label: 'Por pagar', icon: Landmark, allowed: hasCap('PAYABLES') && (!!role && hasBusinessPermission(role, 'pos.use')) },
    { id: 'audit', label: 'Bitácora', icon: ScrollText, allowed: hasCap('AUDIT_LOG') && !!role && ['OWNER', 'ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(role) },
    { id: 'reports', label: 'Reportes', icon: BarChart3, allowed: canSeeReports },
    { id: 'customers', label: 'Clientes', icon: Heart, allowed: canPos || canSeeReports },
    { id: 'employees', label: 'Empleados', icon: Users, allowed: canManageEmployees },
    { id: 'branding', label: 'Info', icon: Settings, allowed: canManageBusiness },
  ];
  const visibleTabs = tabs.filter((t) => t.allowed);
  const activeTabId: typeof view = view === 'menuImport' ? 'catalog' : view === 'modules' ? 'workspace' : view;

  const canDeleteAdmin = !!role && ['OWNER', 'ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(role);
  const userName = authUser?.displayName || authUser?.email || 'Usuario';

  const renderContent = () => {
    const goHome = () => setView('workspace');
    if (view === 'modules') {
      return <BusinessModulesView businessName={business.branding.restaurantName} templateName={template.name} modules={template.modules} enabledCapabilities={business.capabilities || []} onBack={() => goHome()} onOpen={(module) => {
        if (module.capability === 'CATALOG') setView('catalog');
        else if (module.capability === 'POS' || module.capability === 'ORDERS' || module.capability === 'ORDER_QUEUE') setView('operations');
        else if (module.capability === 'MENU_IMPORT') setView('menuImport');
        else if (module.capability === 'STAFF' && canManageEmployees) setView('employees');
        else if (module.capability === 'RECEIPTS' && !!role && hasBusinessPermission(role, 'reports.view')) setView('reports');
        else if (module.capability === 'BUSINESS_SETTINGS' && !!role && hasBusinessPermission(role, 'business.manage')) setView('branding');
      }} />;
    }

    if (view === 'vault') {
      return <BusinessVaultView businessId={businessId} canDelete={canDeleteAdmin} userName={userName} />;
    }

    if (view === 'receivables' || view === 'payables') {
      return <BusinessLedgerView businessId={businessId} kind={view} canDelete={canDeleteAdmin} userName={userName} />;
    }

    if (view === 'audit') {
      return <BusinessAuditView businessId={businessId} />;
    }

    if (view === 'expenses') {
      return <BusinessExpensesView businessId={businessId} canDelete={!!role && ['OWNER', 'ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(role)} userName={authUser?.displayName || authUser?.email || 'Usuario'} />;
    }

    if (view === 'shifts') {
      return <BusinessShiftView businessId={businessId} />;
    }

    if (view === 'customers') {
      const showVip = hasCap('VIP');
      return (
        <div className="space-y-4">
          {showVip && (
            <div className="flex gap-2">
              {([['list', 'Clientes'], ['vip', 'Tarjeta VIP']] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setCustomersTab(id)} className={`rounded-full px-4 py-2 text-xs font-black ${customersTab === id ? 'bg-[#D6A34A] text-[#050505]' : 'border border-[#3A3022] text-[#F7F7F7]'}`}>{label}</button>
              ))}
            </div>
          )}
          {showVip && customersTab === 'vip'
            ? <BusinessVipPanel businessId={businessId} business={business} isOwner={role === 'OWNER' || role === 'SUPER_ADMIN'} isPublished={isPublished} onBusinessUpdated={setBusiness} />
            : <BusinessCustomersView businessId={businessId} />}
        </div>
      );
    }

    if (view === 'reports') {
      return <BusinessReportsView businessId={businessId} businessName={business.branding.restaurantName} onBack={() => goHome()} />;
    }

    if (view === 'branding') {
      return <BusinessBrandingSettings business={business} onBack={() => goHome()} onSaved={(updated) => setBusiness(updated)} />;
    }

    if (view === 'menuImport') {
      return <BusinessMenuImport businessId={businessId} businessName={business.branding.restaurantName} onBack={() => setView('catalog')} onOpenCatalog={() => setView('catalog')} />;
    }

    if (view === 'operations') {
      return <BusinessOperationsView businessId={businessId} businessName={business.branding.restaurantName} onBack={() => goHome()} />;
    }

    if (view === 'catalog') {
      return <BusinessCatalogEditor businessId={businessId} businessName={business.branding.restaurantName} onBack={() => goHome()} onImportFromPhoto={() => setView('menuImport')} />;
    }

    if (view === 'employees' && business && role) {
      return <BusinessEmployeesView businessId={businessId} managerRole={role} onBack={() => goHome()} />;
    }


    return (
      <div className="space-y-5">
        <BusinessSummaryTab businessId={businessId} business={business} isPublished={isPublished} onGo={(t) => setView(t)} />
        <BusinessModuleToggles businessId={businessId} enabled={enabledCapabilities} isOwner={role === 'OWNER' || role === 'SUPER_ADMIN'} onChanged={(caps) => setBusiness({ ...business, capabilities: caps })} />
        <section className="rounded-2xl border border-[#3A3022] bg-[#111111] p-4">
          <p className="text-[10px] font-black uppercase tracking-wide text-[#E3BC6B]">Enlace para tus clientes</p>
          <p className="mt-1 break-all text-xs text-[#C8C8C8]">{publicUrl}</p>
          <button type="button" onClick={() => void copyPublicLink()} className="mt-3 rounded-xl bg-[#D6A34A] px-4 py-2.5 text-xs font-black text-[#050505]">{linkCopied ? '¡Enlace copiado!' : 'Copiar enlace'}</button>
          <p className="mt-2 text-[11px] text-[#B7B7B7]">Compártelo por WhatsApp, redes o en un QR. Tus clientes verán solo tu menú, nunca el panel.</p>
          {role === 'OWNER' && (
            <div className="mt-4 border-t border-[#3A3022] pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <strong className="block text-sm">{isPublished ? 'Visible en el directorio' : 'No aparece en el directorio'}</strong>
                  <span className="mt-1 block text-[11px] text-[#B7B7B7]">{isPublished ? 'Cualquier visitante puede encontrar tu página pública.' : 'Publícala cuando el menú y los datos estén listos.'}</span>
                </div>
                <button type="button" disabled={publicationBusy} onClick={() => void togglePublication()} className="rounded-xl bg-[#D6A34A] px-4 py-2.5 text-xs font-black text-[#050505] disabled:opacity-50">
                  {publicationBusy ? 'Guardando…' : isPublished ? 'Ocultar del directorio' : 'Publicar mi negocio'}
                </button>
              </div>
              {publicationMessage && <p role="status" className="mt-3 text-xs text-[#E3BC6B]">{publicationMessage}</p>}
            </div>
          )}
        </section>

        <p className="pb-4 text-center text-[11px] opacity-70">Hecho con Gioteautomatizo</p>
      </div>
    );
  };

  const bizBg = 'var(--biz-bg, #050505)';
  const bizSurface = 'var(--biz-surface, #0B0B0B)';
  const bizText = 'var(--biz-text, #F7F7F7)';
  const bizPrimary = 'var(--biz-primary, #D6A34A)';

  return (
    <div className="min-h-screen" style={{ background: bizBg, color: bizText }}>
      <div className="sticky top-0 z-40">
        <header className="px-4 py-3 shadow-md" style={{ background: bizSurface, borderBottom: '1px solid color-mix(in srgb, var(--biz-primary, #D6A34A) 40%, transparent)' }}>
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" onClick={back} className="flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-bold" style={{ borderColor: 'color-mix(in srgb, var(--biz-primary, #D6A34A) 40%, transparent)' }} title="Mis negocios">
                <ArrowLeft className="h-4 w-4" style={{ color: bizPrimary }} />
                <span className="hidden sm:inline">Mis negocios</span>
              </button>
              {business.branding.logoUrl && <img src={business.branding.logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg bg-white object-cover" />}
              <span className="truncate font-serif text-base font-bold sm:text-xl">
                {business.branding.restaurantName} <span className="font-sans text-xs font-normal sm:text-sm" style={{ color: bizPrimary }}>| Panel</span>
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden rounded-full border px-3 py-1 text-[11px] font-bold md:inline" style={{ borderColor: 'color-mix(in srgb, var(--biz-primary, #D6A34A) 40%, transparent)' }}>{role || '…'}</span>
              <a href={`#negocio/${encodeURIComponent(businessId)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black" style={{ background: bizPrimary, color: bizBg }}>
                <ExternalLink className="h-4 w-4" /> <span className="hidden sm:inline">Ver mi página</span>
              </a>
            </div>
          </div>
        </header>
        <nav className="overflow-x-auto px-4 py-2.5 shadow-sm" style={{ background: bizSurface, borderBottom: '1px solid color-mix(in srgb, var(--biz-primary, #D6A34A) 25%, transparent)', WebkitOverflowScrolling: 'touch' }}>
          <div className="mx-auto flex min-w-max max-w-6xl items-center gap-1.5">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTabId === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setView(tab.id)}
                  className="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold transition-all sm:text-sm"
                  style={active ? { background: bizPrimary, color: bizBg } : { color: bizText, opacity: 0.8 }}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
      <main className="biz-embedded mx-auto max-w-6xl px-4 py-5">{renderContent()}</main>
    </div>
  );
};
