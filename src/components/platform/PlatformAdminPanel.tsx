import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Bot,
  Building2,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Store,
  Users,
} from 'lucide-react';
import { getAllBusinesses, isPlatformAdmin } from '../../lib/businessAuthService';
import { subscribeToAuth } from '../../lib/firebase';
import type { RestaurantTenant } from '../../lib/restaurantCore';
import type { User as FirebaseUser } from 'firebase/auth';

export const PlatformAdminPanel: React.FC = () => {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [businesses, setBusinesses] = useState<RestaurantTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBusinesses = async () => {
    setLoading(true);
    setError(null);
    try {
      const current = authUser;
      if (!current || !(await isPlatformAdmin(current.uid))) {
        setAuthorized(false);
        setBusinesses([]);
        return;
      }
      setAuthorized(true);
      setBusinesses(await getAllBusinesses());
    } catch (err) {
      console.error('No se pudo cargar el panel Super Admin:', err);
      setError('No pudimos cargar los negocios de la plataforma.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return subscribeToAuth((user) => setAuthUser(user));
  }, []);

  useEffect(() => {
    if (!authUser) {
      setAuthorized(false);
      setBusinesses([]);
      setLoading(false);
      return;
    }
    void loadBusinesses();
  }, [authUser]);

  if (authorized === null || loading) {
    return (
      <div className="min-h-screen bg-[#0B1020] text-white flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm font-bold">
          <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
          Cargando Super Admin…
        </div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-[#0B1020] text-white flex items-center justify-center px-4">
        <div className="max-w-md rounded-[2rem] border border-white/10 bg-white/5 p-7 text-center">
          <ShieldCheck className="mx-auto w-10 h-10 text-amber-300" />
          <h1 className="mt-4 font-serif text-2xl font-black">Acceso restringido</h1>
          <p className="mt-2 text-sm text-slate-300">
            Esta cuenta no está registrada como administrador de la plataforma.
          </p>
          <button
            type="button"
            onClick={() => { window.location.hash = '#business'; }}
            className="mt-6 rounded-xl bg-white px-4 py-3 text-xs font-black text-[#111827]"
          >
            Volver a mis negocios
          </button>
        </div>
      </div>
    );
  }

  const stats = [
    { label: 'Negocios registrados', value: businesses.length, icon: Building2 },
    { label: 'Negocios activos', value: businesses.length, icon: Store },
    { label: 'Usuarios de plataforma', value: '—', icon: Users },
    { label: 'Actividad', value: 'Próximamente', icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-[#F5F1EA] text-[#201610]">
      <header className="border-b border-white/10 bg-[#0B1020] px-4 py-4 text-white shadow-lg">
        <div className="mx-auto max-w-7xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center">
              <Bot className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">Gioteautomatizo</p>
              <h1 className="font-serif text-xl font-black">Super Admin</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { window.location.hash = '#business'; }}
            className="rounded-xl border border-white/15 px-3 py-2 text-xs font-bold text-white flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Mis negocios
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-7 sm:py-10">
        <div className="rounded-[2rem] bg-[#111827] p-6 sm:p-8 text-white shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-amber-300">
                <ShieldCheck className="w-3.5 h-3.5" /> Administrador de plataforma
              </div>
              <h2 className="mt-4 font-serif text-3xl sm:text-4xl font-black">Todos los negocios</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
                Centro de control de Gioteautomatizo. Aquí crecerán usuarios, actividad, planes, soporte y herramientas globales.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadBusinesses()}
              disabled={loading}
              className="rounded-xl bg-white px-4 py-3 text-xs font-black text-[#111827] flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800">
            {error}
          </div>
        )}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map(({ label, value, icon: Icon }) => (
            <article key={label} className="rounded-3xl border border-[#D9C5AC] bg-white p-5 shadow-sm">
              <Icon className="w-5 h-5 text-[#A86B3D]" />
              <p className="mt-4 text-[10px] font-black uppercase tracking-wide text-[#A86B3D]">{label}</p>
              <p className="mt-1 font-serif text-2xl font-black">{value}</p>
            </article>
          ))}
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-serif text-2xl font-black">Negocios registrados</h3>
              <p className="text-xs text-[#6B4028] mt-1">Cada negocio mantiene su propio tenant y configuración.</p>
            </div>
            <span className="rounded-full bg-[#FFF7EA] px-3 py-1 text-[10px] font-black text-[#A86B3D]">
              {businesses.length} registrados
            </span>
          </div>

          {businesses.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#D9C5AC] bg-white p-10 text-center text-sm text-[#6B4028]">
              Aún no hay negocios multinegocio registrados.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {businesses.map((tenant) => (
                <article key={tenant.restaurantId} className="rounded-3xl border border-[#D9C5AC] bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-[#FFF7EA] overflow-hidden flex items-center justify-center shrink-0">
                      {tenant.branding.logoUrl ? (
                        <img src={tenant.branding.logoUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Store className="w-6 h-6 text-[#A86B3D]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-black uppercase tracking-wide text-[#A86B3D]">
                        {tenant.businessType || 'business'}
                      </span>
                      <h4 className="font-serif text-lg font-black truncate">{tenant.branding.restaurantName}</h4>
                      <p className="text-[10px] text-[#8A6A55]">@{tenant.branding.publicSlug}</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl bg-[#FFFDF9] border border-[#E8D8C4] p-3 text-xs text-[#6B4028]">
                    <strong>Tenant:</strong> {tenant.restaurantId}
                  </div>
                  <button
                    type="button"
                    onClick={() => { window.location.hash = `#business/${encodeURIComponent(tenant.restaurantId)}`; }}
                    className="mt-4 w-full rounded-xl bg-[#3A2418] px-4 py-3 text-xs font-black text-white flex items-center justify-center gap-2"
                  >
                    Abrir negocio <ExternalLink className="w-4 h-4 text-[#C9974D]" />
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
