import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Bot,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Plus,
  Shield,
  Sparkles,
  Store,
} from 'lucide-react';
import { loginStaff } from '../../lib/adminStorage';
import { CALIENTITO_TENANT } from '../../lib/restaurantCore';
import type { BusinessDirectoryCard } from '../../lib/businessAuthService';
import { auth, subscribeToAuth } from '../../lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import {
  getBusinessesForUser,
  isPlatformAdmin,
  loginBusinessOwner,
  logoutBusinessOwner,
} from '../../lib/businessAuthService';
import type { User as FirebaseUser } from 'firebase/auth';

/** Traduce el código de error de Firebase a un mensaje claro (antes todo salía como "contraseña incorrecta"). */
function loginErrorMessage(code?: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Correo o contraseña incorrectos. Si no la recuerdas, toca "Olvidé mi contraseña".';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera unos minutos o usa "Olvidé mi contraseña".';
    case 'auth/network-request-failed':
      return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
    case 'auth/unauthorized-domain':
      return 'Firebase no tiene autorizado este dominio. Hay que agregarlo en Firebase → Authentication → Configuración → Dominios autorizados.';
    case 'auth/operation-not-allowed':
      return 'El acceso con correo y contraseña no está activado en Firebase (Authentication → Método de acceso).';
    case 'auth/user-disabled':
      return 'Esta cuenta está deshabilitada en Firebase.';
    default:
      return `No pudimos iniciar sesión${code ? ` (${code})` : ''}. Inténtalo de nuevo.`;
  }
}

export const BusinessPortal: React.FC = () => {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [myBusinesses, setMyBusinesses] = useState<BusinessDirectoryCard[]>([]);
  const [loadingBusinesses, setLoadingBusinesses] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [businessesResolvedFor, setBusinessesResolvedFor] = useState<string | null>(null);
  const [adminResolvedFor, setAdminResolvedFor] = useState<string | null>(null);
  const [businessesError, setBusinessesError] = useState<string | null>(null);
  const [reloadBusinesses, setReloadBusinesses] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeToAuth((user) => {
      setAuthUser(user);
      setAuthChecked(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    // Cada lectura pertenece al UID que la inició. Ignorar respuestas antiguas
    // cuando se cambia de cuenta o se reintenta la consulta.
    let cancelled = false;
    const userId = authUser?.uid;
    setMyBusinesses([]);
    setBusinessesResolvedFor(null);
    setIsSuperAdmin(false);
    setAdminResolvedFor(null);
    setBusinessesError(null);
    setLoadingBusinesses(!!userId);
    if (!userId) return () => { cancelled = true; };

    getBusinessesForUser(userId)
      .then((businesses) => {
        if (!cancelled) setMyBusinesses(businesses);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('No se pudieron cargar tus negocios:', err);
        setBusinessesError(`No pudimos cargar tus negocios${err?.code ? ` (${err.code})` : ''}. Revisa tu conexión o permisos e inténtalo nuevamente.`);
      })
      .finally(() => {
        if (cancelled) return;
        setBusinessesResolvedFor(userId);
        setLoadingBusinesses(false);
      });

    isPlatformAdmin(userId)
      .then((admin) => {
        if (cancelled) return;
        setIsSuperAdmin(admin);
        setAdminResolvedFor(userId);
      })
      .catch(() => {
        if (cancelled) return;
        setIsSuperAdmin(false);
        setAdminResolvedFor(userId);
      });

    return () => { cancelled = true; };
  }, [authUser?.uid, reloadBusinesses]);

  // La limpieza del efecto ocurre después del render: nunca mostrar datos de
  // otro UID durante ese intervalo, ni siquiera por un fotograma.
  const visibleBusinesses = authUser && businessesResolvedFor === authUser.uid ? myBusinesses : [];
  const showingBusinessLoad = !!authUser && (loadingBusinesses || businessesResolvedFor !== authUser.uid);
  const showSuperAdmin = !!authUser && adminResolvedFor === authUser.uid && isSuperAdmin;

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsLoggingIn(true);
    try {
      await loginBusinessOwner(email.trim(), password);
    } catch (err: any) {
      console.error('Error al iniciar sesión de negocio:', err?.code, err?.message);
      setError(loginErrorMessage(err?.code));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError('Escribe tu correo arriba y vuelve a tocar "Olvidé mi contraseña".');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setNotice('Te enviamos un correo para crear una contraseña nueva. Revisa también tu carpeta de spam.');
    } catch (err: any) {
      console.error('Error al enviar correo de recuperación:', err?.code, err?.message);
      setError(loginErrorMessage(err?.code));
    }
  };

  const openCalientito = () => {
    // Calientito conserva su propio acceso de personal (usuario y PIN): se abre su pantalla de acceso.
    setError(null);
    window.location.hash = '#admin';
  };

  const openPublicCalientito = () => {
    // La raíz de Gioteautomatizo ahora es el directorio; Calientito tiene su enlace propio.
    window.location.hash = '#negocio/alo-restaurante';
  };

  const openBusiness = (tenant: BusinessDirectoryCard) => {
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
              <div className="w-full max-w-md aspect-[16/9] overflow-hidden rounded-2xl bg-black">
                <img src="/brand/gioteautomatizo-oficial.jpg" alt="Gioteautomatizo — Tu negocio más conectado" className="h-full w-full object-contain" />
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-amber-300">
                <Sparkles className="w-3.5 h-3.5" /> Plataforma para negocios
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
                <div className="w-12 h-12 rounded-2xl bg-[#050505] flex items-center justify-center shadow-sm overflow-hidden">
                  <img src="/gioteautomatizo-mark.png" alt="" className="w-full h-full object-contain" />
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#A86B3D]">Gioteautomatizo</p>
                  <h2 className="font-serif text-2xl font-black">Acceso para negocios</h2>
                </div>
              </div>

              <div className="mt-5 lg:hidden w-full aspect-[16/10] overflow-hidden rounded-2xl bg-black">
                <img src="/brand/gioteautomatizo-oficial.jpg" alt="Gioteautomatizo · Tu negocio más conectado" className="h-full w-full object-contain" />
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

                <button type="button" onClick={() => void handleForgotPassword()} className="text-xs font-bold text-[#A86B3D] underline">Olvidé mi contraseña</button>

                {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">{notice}</div>}

                {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">{error}</div>}

                <button type="submit" disabled={isLoggingIn} className="w-full rounded-2xl bg-[#3A2418] px-4 py-4 text-sm font-black text-[#FFF7EA] shadow-lg transition hover:bg-[#4A2E1F] active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-60">
                  {isLoggingIn ? 'Entrando…' : 'Entrar a mi negocio'} <ArrowRight className="w-4 h-4 text-[#C9974D]" />
                </button>
              </form>

              <button type="button" onClick={goToCreateBusiness} className="mt-5 w-full rounded-2xl border border-[#DEC8AE] bg-white px-4 py-3.5 text-sm font-black text-[#5C3825] flex items-center justify-center gap-2">
                <Plus className="w-4 h-4 text-[#A86B3D]" /> Registrar un negocio nuevo
              </button>

              <button type="button" onClick={openPublicCalientito} className="mt-3 w-full rounded-2xl border border-[#3A3022] bg-transparent px-4 py-3 text-sm font-bold text-[#E3BC6B]">
                Ir a la app de Restaurante Calientito
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
            <div><p className="text-[10px] uppercase tracking-[0.15em] font-black text-[#A86B3D]">Gioteautomatizo</p><h1 className="font-serif font-black text-lg" style={{ color: '#111111' }}>Mis negocios</h1></div>
          </div>
          <div className="flex items-center gap-2">
            {showSuperAdmin && (
              <button
                type="button"
                onClick={() => {
                  window.location.hash = '#platform-admin';
                }}
                className="rounded-xl border border-amber-300/40 bg-[#111827] hover:bg-[#1F2937] px-3 py-2 text-xs font-black text-amber-300 transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5 text-amber-300" />
                <span>Super Admin</span>
              </button>
            )}
            <button type="button" onClick={handleSignOut} className="rounded-xl border border-[#DEC8AE] bg-white px-3 py-2 text-xs font-bold text-[#6B4028] hover:bg-[#FFF7EA] transition">Cerrar sesión</button>
          </div>
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
        {businessesError && businessesResolvedFor === authUser.uid && (
          <div role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">
            <p>{businessesError}</p>
            <button type="button" onClick={() => setReloadBusinesses((value) => value + 1)} className="mt-2 rounded-lg border border-rose-300 px-3 py-2 font-bold">Reintentar carga de negocios</button>
          </div>
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
                  <div><span className="text-[10px] font-black uppercase tracking-wide text-[#A86B3D]">Asistente del negocio</span><strong className="block text-sm" style={{ color: '#F7F7F7' }}>{CALIENTITO_TENANT.assistant.name} · Avatar personalizado</strong></div>
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

        {showingBusinessLoad && (
          <p className="mt-8 text-sm text-[#6B4028]">Cargando tus negocios…</p>
        )}

        {!showingBusinessLoad && visibleBusinesses.length > 0 && (
          <section className="mt-8">
            <h3 className="font-serif text-xl font-black text-[#2B1B13] mb-4">Tus otros negocios</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {visibleBusinesses.map((tenant) => (
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
                  <button type="button" onClick={() => { window.location.hash = `#negocio/${encodeURIComponent(tenant.restaurantId)}`; }} className="mt-2 w-full rounded-2xl border border-[#DEC8AE] bg-white px-4 py-3 text-sm font-black text-[#5C3825]">Ver página pública</button>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};
