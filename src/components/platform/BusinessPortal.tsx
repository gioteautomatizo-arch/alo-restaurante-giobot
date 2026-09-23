import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Bot,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Plus,
  Sparkles,
  Store,
} from 'lucide-react';
import { loginStaff } from '../../lib/adminStorage';
import { CALIENTITO_TENANT, RestaurantTenant } from '../../lib/restaurantCore';
import { subscribeToAuth } from '../../lib/firebase';
import {
  getBusinessesForUser,
  loginBusinessOwner,
  logoutBusinessOwner,
} from '../../lib/businessAuthService';
import type { User as FirebaseUser } from 'firebase/auth';

export const BusinessPortal: React.FC = () => {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [myBusinesses, setMyBusinesses] = useState<RestaurantTenant[]>([]);
  const [loadingBusinesses, setLoadingBusinesses] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToAuth((user) => {
      setAuthUser(user);
      setAuthChecked(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!authUser) {
      setMyBusinesses([]);
      return;
    }
    setLoadingBusinesses(true);
    getBusinessesForUser(authUser.uid)
      .then((businesses) => setMyBusinesses(businesses))
      .catch((err) => {
        console.warn('No se pudieron cargar tus negocios:', err);
        setMyBusinesses([]);
      })
      .finally(() => setLoadingBusinesses(false));
  }, [authUser]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsLoggingIn(true);
    try {
      await loginBusinessOwner(email.trim(), password);
    } catch (err: any) {
      setError('Correo o contraseña incorrectos.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const openCalientito = () => {
    setError(null);
    const result = loginStaff('gio', '1234', true);
    if (!result.success || !result.user) {
      setError(result.error || 'No pudimos preparar la sesión demo de Calientito.');
      return;
    }
    window.location.hash = '#admin';
  };

  const openPublicCalientito = () => {
    window.location.hash = '';
  };

  const openBusiness = (tenant: RestaurantTenant) => {
    setError(null);
    setNotice(null);
    window.location.hash = `#business/${encodeURIComponent(tenant.restaurantId)}`;
  };

  const goToCreateBusiness = () => {
    window.location.hash = '#business-new';
  };

  const handleSignOut = async () => {
    try {
      await logoutBusinessOwner();
    } catch {
      // ignore
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center text-white text-sm">
        Cargando…
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="min-h-screen bg-[#0F172A] text-white flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-5xl grid lg:grid-cols-[1.1fr_0.9fr] overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-2xl">
          <section className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-[#111827] via-[#1F2937] to-[#3A2418] p-10 text-white">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-amber-300">
                <Sparkles className="w-3.5 h-3.5" /> Business Core
              </div>
              <h1 className="mt-6 text-4xl font-black leading-tight">Tu negocio, su POS y su IA en un solo lugar.</h1>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-300">
                Inicia sesión, abre tu negocio y administra ventas, catálogo, inventario, clientes y asistentes inteligentes desde una sola plataforma.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {['POS integrado', 'IA por negocio', 'Catálogo visual', 'Inventario', 'Clientes', 'Operación'].map((label) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-3 font-semibold text-slate-200">{label}</div>
              ))}
            </div>
          </section>

          <section className="bg-[#FFFDF9] p-6 sm:p-10 text-[#2B1B13]">
            <div className="mx-auto max-w-md">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#3A2418] text-[#C9974D] flex items-center justify-center shadow-sm">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#A86B3D]">Gioteautomatizo</p>
                  <h2 className="font-serif text-2xl font-black">Acceso para negocios</h2>
                </div>
              </div>

              <p className="mt-5 text-sm text-[#6B4028]">Escribe el correo y contraseña con los que registraste tu negocio.</p>

              <form onSubmit={handleLogin} className="mt-6 space-y-4">
                <div>
                  <label className="mb-1.5 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#6B4028]"><Mail className="w-4 h-4 text-[#C9974D]" /> Correo</label>
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="negocio@correo.com" autoComplete="username" className="w-full rounded-2xl border border-[#DEC8AE] bg-white px-4 py-3.5 text-sm outline-none focus:border-[#C9974D] focus:ring-2 focus:ring-[#C9974D]/20" />
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#6B4028]"><LockKeyhole className="w-4 h-4 text-[#C9974D]" /> Contraseña</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" autoComplete="current-password" className="w-full rounded-2xl border border-[#DEC8AE] bg-white px-4 py-3.5 pr-12 text-sm outline-none focus:border-[#C9974D] focus:ring-2 focus:ring-[#C9974D]/20" />
                    <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-2 text-[#8A6A55] hover:bg-[#FFF7EA]" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">{error}</div>}

                <button type="submit" disabled={isLoggingIn} className="w-full rounded-2xl bg-[#3A2418] px-4 py-4 text-sm font-black text-[#FFF7EA] shadow-lg transition hover:bg-[#4A2E1F] active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-60">
                  {isLoggingIn ? 'Entrando…' : 'Entrar a mi negocio'} <ArrowRight className="w-4 h-4 text-[#C9974D]" />
                </button>
              </form>

              <button type="button" onClick={goToCreateBusiness} className="mt-5 w-full rounded-2xl border border-[#DEC8AE] bg-white px-4 py-3.5 text-sm font-black text-[#5C3825] flex items-center justify-center gap-2">
                <Plus className="w-4 h-4 text-[#A86B3D]" /> Registrar un negocio nuevo
              </button>

              <p className="mt-5 text-[10px] leading-relaxed text-[#8A6A55]">Tu acceso se guarda con Firebase Auth. Restaurante Calientito conserva su propio acceso de personal.</p>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F1EA] text-[#201610]">
      <header className="border-b border-[#E5D6C4] bg-white/95 px-4 py-4 shadow-sm">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#111827] text-amber-300 flex items-center justify-center"><Bot className="w-5 h-5" /></div>
            <div><p className="text-[10px] uppercase tracking-[0.15em] font-black text-[#A86B3D]">Gioteautomatizo</p><h1 className="font-serif font-black text-lg">Mis negocios</h1></div>
          </div>
          <button type="button" onClick={handleSignOut} className="rounded-xl border border-[#DEC8AE] bg-white px-3 py-2 text-xs font-bold text-[#6B4028]">Cerrar sesión</button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-7 sm:py-10">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div><span className="text-xs font-black uppercase tracking-[0.14em] text-[#A86B3D]">Cuenta de negocio</span><h2 className="mt-1 font-serif text-3xl font-black">¿Qué quieres administrar?</h2><p className="mt-2 max-w-2xl text-sm text-[#6B4028]">Cada negocio abre su propia página, POS, inventario, clientes e IA según los módulos que tenga activos.</p></div>
          <button type="button" onClick={goToCreateBusiness} className="rounded-2xl bg-[#111827] px-4 py-3 text-sm font-black text-white flex items-center justify-center gap-2"><Plus className="w-4 h-4 text-amber-300" /> Crear nuevo negocio</button>
        </div>

        {notice && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">{notice}</div>
        )}
        {error && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">{error}</div>
        )}

        <section className="mt-7 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <article className="rounded-[2rem] border border-[#D9C5AC] bg-white overflow-hidden shadow-sm">
            <div className="grid md:grid-cols-[180px_1fr]">
              <div className="bg-[#FFF7EA] p-6 flex items-center justify-center"><img src="/logo-calientito.png" alt="Restaurante Calientito" className="w-32 h-32 object-contain rounded-3xl bg-white shadow-sm" /></div>
              <div className="p-6 sm:p-7">
                <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-700">Activo</span><span className="rounded-full bg-[#FFF7EA] px-2.5 py-1 text-[10px] font-black uppercase text-[#A86B3D]">Restaurant Core</span></div>
                <h3 className="mt-3 font-serif text-2xl font-black">{CALIENTITO_TENANT.branding.restaurantName}</h3>
                <p className="mt-1 text-sm text-[#6B4028]">POS + Mesas + Cocina + Inventario + VIP + Promociones + IA.</p>

                <div className="mt-5 flex items-center gap-3 rounded-2xl border border-[#E8D8C4] bg-[#FFFDF9] p-3">
                  <img src="/tita.png" alt="Tita" className="w-11 h-11 rounded-xl object-contain bg-white" />
                  <div><span className="text-[10px] font-black uppercase tracking-wide text-[#A86B3D]">Asistente del negocio</span><strong className="block text-sm">{CALIENTITO_TENANT.assistant.name} · Avatar personalizado</strong></div>
                </div>

                <div className="mt-5 grid sm:grid-cols-2 gap-3">
                  <button type="button" onClick={openCalientito} className="rounded-2xl bg-[#3A2418] px-4 py-3.5 text-sm font-black text-white flex items-center justify-center gap-2">Abrir negocio / POS <ArrowRight className="w-4 h-4 text-[#C9974D]" /></button>
                  <button type="button" onClick={openPublicCalientito} className="rounded-2xl border border-[#DEC8AE] bg-white px-4 py-3.5 text-sm font-black text-[#5C3825]">Ver página pública</button>
                </div>
              </div>
            </div>
          </article>

          <aside className="rounded-[2rem] border border-[#D9C5AC] bg-[#111827] p-6 text-white shadow-sm">
            <Sparkles className="w-7 h-7 text-amber-300" />
            <h3 className="mt-4 font-serif text-xl font-black">Giobot de fábrica</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">Todo negocio nuevo comienza con Giobot. Después puede cambiar nombre, personalidad, colores y avatar, o contratar una experiencia Premium.</p>
            <div className="mt-5 space-y-2 text-xs text-slate-200"><div className="rounded-xl bg-white/5 p-3">✓ Giobot Base incluido</div><div className="rounded-xl bg-white/5 p-3">✓ Avatar propio opcional</div><div className="rounded-xl bg-white/5 p-3">✓ Giobot Premium como mejora</div></div>
          </aside>
        </section>

        {loadingBusinesses && (
          <p className="mt-8 text-sm text-[#6B4028]">Cargando tus negocios…</p>
        )}

        {!loadingBusinesses && myBusinesses.length > 0 && (
          <section className="mt-8">
            <h3 className="font-serif text-xl font-black text-[#2B1B13] mb-4">Tus otros negocios</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {myBusinesses.map((tenant) => (
                <article key={tenant.restaurantId} className="rounded-[2rem] border border-[#D9C5AC] bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-[#FFF7EA] overflow-hidden flex items-center justify-center shrink-0">
                      {tenant.branding.logoUrl ? (
                        <img src={tenant.branding.logoUrl} alt={tenant.branding.restaurantName} className="w-full h-full object-cover" />
                      ) : (
                        <Store className="w-7 h-7 text-[#A86B3D]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="rounded-full bg-[#FFF7EA] px-2.5 py-1 text-[10px] font-black uppercase text-[#A86B3D]">@{tenant.branding.publicSlug}</span>
                      <h4 className="mt-1 font-serif text-lg font-black truncate">{tenant.branding.restaurantName}</h4>
                    </div>
                  </div>
                  <button type="button" onClick={() => openBusiness(tenant)} className="mt-5 w-full rounded-2xl bg-[#3A2418] px-4 py-3 text-sm font-black text-white">Abrir negocio</button>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};
