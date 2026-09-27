import React, { useEffect, useState } from 'react';
import { ArrowLeft, Bot, Store } from 'lucide-react';
import { BusinessCatalogEditor } from './BusinessCatalogEditor';
import { BusinessOperationsView } from './BusinessOperationsView';
import { BusinessMenuImport } from './BusinessMenuImport';
import { BusinessModulesView } from './BusinessModulesView';
import { getBusinessTemplateConfig } from '../../data/businessTemplates';
import type { RestaurantTenant } from '../../lib/restaurantCore';
import { getBusinessForUser } from '../../lib/businessAuthService';
import { subscribeToAuth } from '../../lib/firebase';
import type { User as FirebaseUser } from 'firebase/auth';

export const BusinessWorkspace: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [business, setBusiness] = useState<RestaurantTenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'workspace' | 'catalog' | 'operations' | 'menuImport' | 'modules'>('workspace');

  useEffect(() => subscribeToAuth((user) => setAuthUser(user)), []);

  useEffect(() => {
    if (!authUser) {
      setLoading(true);
      return;
    }

    setLoading(true);
    setError(null);
    getBusinessForUser(authUser.uid, businessId)
      .then((tenant) => {
        if (!tenant) {
          setError('No tienes acceso a este negocio o ya no existe.');
          return;
        }
        setBusiness(tenant);
      })
      .catch((err) => {
        console.warn('No se pudo abrir el negocio:', err);
        setError('No pudimos abrir este negocio. Intenta nuevamente.');
      })
      .finally(() => setLoading(false));
  }, [authUser, businessId]);

  const back = () => {
    window.location.hash = '#business';
  };

  if (view === 'modules' && business) {
    return <BusinessModulesView businessName={business.branding.restaurantName} templateName={template.name} modules={template.modules} enabledCapabilities={business.capabilities || []} onBack={() => setView('workspace')} onOpen={(module) => {
      if (module.capability === 'CATALOG') setView('catalog');
      else if (module.capability === 'POS' || module.capability === 'ORDERS' || module.capability === 'ORDER_QUEUE') setView('operations');
      else if (module.capability === 'MENU_IMPORT') setView('menuImport');
    }} />;
  }

  if (view === 'menuImport' && business) {
    return <BusinessMenuImport businessId={businessId} businessName={business.branding.restaurantName} onBack={() => setView('workspace')} />;
  }

  if (view === 'operations' && business) {
    return <BusinessOperationsView businessId={businessId} businessName={business.branding.restaurantName} onBack={() => setView('workspace')} />;
  }

  if (view === 'catalog' && business) {
    return <BusinessCatalogEditor businessId={businessId} businessName={business.branding.restaurantName} onBack={() => setView('workspace')} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F1EA] flex items-center justify-center text-[#2B1B13]">
        <div className="text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-[#111827] text-amber-300 flex items-center justify-center"><Bot className="w-7 h-7" /></div>
          <h1 className="mt-5 font-serif text-2xl font-black">Abriendo tu negocio…</h1>
          <p className="mt-2 text-sm text-[#6B4028]">Validando tu acceso y cargando el espacio de trabajo.</p>
        </div>
      </div>
    );
  }

  if (error || !business) {
    return (
      <div className="min-h-screen bg-[#F5F1EA] flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-[2rem] border border-[#D9C5AC] bg-white p-7 text-center shadow-sm">
          <h1 className="font-serif text-2xl font-black">No pudimos abrir este negocio</h1>
          <p className="mt-2 text-sm text-[#6B4028]">{error || 'El negocio no está disponible.'}</p>
          <button type="button" onClick={back} className="mt-6 rounded-2xl bg-[#3A2418] px-5 py-3 text-sm font-black text-white">Volver a mis negocios</button>
        </div>
      </div>
    );
  }

  const template = getBusinessTemplateConfig(business.templateId || 'other');
  const quickModules = [
    ['Ecosistema completo', 'Todos los módulos de esta plantilla', true, 'modules'],
    ['Operación', 'POS, ventas y operación diaria', business.features.pos, 'operations'],
    ['Catálogo', 'Productos, precios y menú', business.features.publicMenu, 'catalog'],
    ['Sube tu menú', 'Foto + análisis asistido por Giobot', true, 'menuImport'],
    ['Inventario', 'Existencias y control', business.features.inventory, 'disabled'],
    ['Clientes', 'Clientes y relaciones', true, 'disabled'],
    ['Asistente IA', 'Atención con Giobot', business.features.customerAssistant, 'disabled'],
    ['Configuración', 'Identidad, módulos y negocio', true, 'disabled'],
  ] as const;

  return (
    <div className="min-h-screen bg-[#F5F1EA] text-[#201610]">
      <header className="border-b border-[#E5D6C4] bg-white/95 px-4 py-4 shadow-sm">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-4">
          <button type="button" onClick={back} className="rounded-xl border border-[#DEC8AE] bg-white px-3 py-2 text-xs font-bold text-[#6B4028] flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Mis negocios
          </button>
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-[#A86B3D]" />
            <span className="text-xs font-black uppercase tracking-wide text-[#6B4028]">Gioteautomatizo Business</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-7 sm:py-10">
        <section className="rounded-[2rem] border border-[#D9C5AC] bg-white overflow-hidden shadow-sm">
          <div className="bg-[#111827] px-6 py-8 sm:px-8 text-white">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="w-20 h-20 rounded-3xl bg-white overflow-hidden flex items-center justify-center shrink-0">
                {business.branding.logoUrl ? (
                  <img src={business.branding.logoUrl} alt={business.branding.restaurantName} className="w-full h-full object-cover" />
                ) : (
                  <Store className="w-9 h-9 text-[#A86B3D]" />
                )}
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">Espacio de negocio</span>
                <h1 className="mt-1 font-serif text-3xl font-black">{business.branding.restaurantName}</h1>
                <p className="mt-1 text-sm text-slate-300">@{business.branding.publicSlug} · {business.assistant.name}</p>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['POS', business.features.pos],
                ['Catálogo', business.features.publicMenu],
                ['Inventario', business.features.inventory],
                ['Clientes + IA', business.features.customerAssistant],
              ].map(([label, enabled]) => (
                <div key={String(label)} className="rounded-2xl border border-[#E8D8C4] bg-[#FFFDF9] p-4">
                  <span className="text-[10px] font-black uppercase tracking-wide text-[#A86B3D]">{enabled ? 'Disponible' : 'Próximamente'}</span>
                  <strong className="mt-1 block text-sm">{label}</strong>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-amber-900">Giobot</p>
              <p className="mt-1 text-sm text-amber-900">Tu asistente <strong>{business.assistant.name}</strong> está asociado exclusivamente a este negocio.</p>
            </div>

            <div className="mt-6 rounded-2xl border border-[#E8D8C4] bg-[#FFFDF9] p-5"><p className="text-[10px] font-black uppercase tracking-wide text-[#A86B3D]">Ecosistema · {template.name}</p><p className="mt-1 text-xs text-[#6B4028]">Este negocio tiene {template.modules.length} módulos definidos por su plantilla. Los módulos se irán habilitando sin copiar lógica específica de otro negocio.</p><div className="mt-3 flex flex-wrap gap-2">{template.modules.map((module) => <span key={module.id} className="rounded-full border border-[#E8D8C4] bg-white px-2.5 py-1 text-[10px] font-bold text-[#6B4028]">{module.title}</span>)}</div></div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {quickModules.map(([title, description, enabled, action]) => (
                <button
                  key={title}
                  type="button"
                  disabled={!enabled || action === 'disabled'}
                  onClick={() => action === 'catalog' ? setView('catalog') : action === 'operations' ? setView('operations') : action === 'menuImport' ? setView('menuImport') : action === 'modules' ? setView('modules') : undefined}
                  className="rounded-2xl border border-[#DEC8AE] bg-[#FFFDF9] p-5 text-left transition hover:border-[#C9974D] hover:bg-[#FFF7EA] disabled:cursor-default disabled:opacity-60 disabled:hover:border-[#DEC8AE] disabled:hover:bg-[#FFFDF9]"
                >
                  <span className="text-[10px] font-black uppercase tracking-wide text-[#A86B3D]">{enabled ? 'Módulo disponible' : 'Próximamente'}</span>
                  <strong className="mt-2 block font-serif text-lg text-[#2B1B13]">{title}</strong>
                  <span className="mt-1 block text-xs leading-relaxed text-[#6B4028]">{description}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
