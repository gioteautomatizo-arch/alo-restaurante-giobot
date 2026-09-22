import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Bot,
  Coffee,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Palette,
  Pizza,
  Plus,
  ShoppingBag,
  Sparkles,
  Store,
  UtensilsCrossed,
} from 'lucide-react';
import { loginStaff } from '../../lib/adminStorage';
import { CALIENTITO_TENANT } from '../../lib/restaurantCore';

const DEMO_EMAIL = 'demo@calientito.mx';
const DEMO_PASSWORD = 'calientito2026';
const PORTAL_SESSION_KEY = 'giote_business_demo_session_v1';

type BusinessTemplate = {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

const BUSINESS_TEMPLATES: BusinessTemplate[] = [
  { id: 'restaurant', name: 'Restaurante', description: 'Menú, mesas, cocina, POS, inventario e IA.', icon: UtensilsCrossed },
  { id: 'pizzeria', name: 'Pizzería', description: 'Pedidos, tamaños, extras, delivery y cocina.', icon: Pizza },
  { id: 'creperia', name: 'Crepería / Cafetería', description: 'Bebidas, combos, recetas, barra y pedidos.', icon: Coffee },
  { id: 'perfumes', name: 'Perfumes y decants', description: 'Catálogo, inventario, clientes, POS y asesor IA.', icon: ShoppingBag },
  { id: 'design', name: 'Diseño gráfico', description: 'Clientes, cotizaciones, proyectos, anticipos e IA.', icon: Palette },
  { id: 'other', name: 'Otro negocio', description: 'Empieza con el Business Core y activa solo lo que necesites.', icon: Store },
];

function hasPortalSession(): boolean {
  try {
    return localStorage.getItem(PORTAL_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export const BusinessPortal: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(hasPortalSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const selectedTemplateInfo = useMemo(
    () => BUSINESS_TEMPLATES.find((template) => template.id === selectedTemplate) || null,
    [selectedTemplate]
  );

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (email.trim().toLowerCase() !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
      setError('Correo o contraseña incorrectos para este entorno demo.');
      return;
    }

    try {
      localStorage.setItem(PORTAL_SESSION_KEY, '1');
    } catch {
      // El demo también funciona si el navegador bloquea almacenamiento local.
    }
    setIsLoggedIn(true);
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

  const closeDemoSession = () => {
    try {
      localStorage.removeItem(PORTAL_SESSION_KEY);
    } catch {
      // ignore
    }
    setShowTemplates(false);
    setSelectedTemplate(null);
    setEmail('');
    setPassword('');
    setIsLoggedIn(false);
  };

  if (!isLoggedIn) {
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

              <p className="mt-5 text-sm text-[#6B4028]">Escribe el correo de tu negocio y contraseña para abrir tu espacio de trabajo.</p>

              <form onSubmit={handleLogin} className="mt-6 space-y-4">
                <div>
                  <label className="mb-1.5 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#6B4028]"><Mail className="w-4 h-4 text-[#C9974D]" /> Correo del negocio</label>
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

                <button type="submit" className="w-full rounded-2xl bg-[#3A2418] px-4 py-4 text-sm font-black text-[#FFF7EA] shadow-lg transition hover:bg-[#4A2E1F] active:scale-[0.99] flex items-center justify-center gap-2">
                  Entrar a mi negocio <ArrowRight className="w-4 h-4 text-[#C9974D]" />
                </button>
              </form>

              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
                <strong className="block mb-1">Acceso demo de Calientito</strong>
                <div>Correo: <span className="font-mono font-bold">{DEMO_EMAIL}</span></div>
                <div>Contraseña: <span className="font-mono font-bold">{DEMO_PASSWORD}</span></div>
                <button type="button" onClick={() => { setEmail(DEMO_EMAIL); setPassword(DEMO_PASSWORD); setError(null); }} className="mt-3 font-black text-amber-900 underline underline-offset-2">Usar datos demo</button>
              </div>

              <p className="mt-5 text-[10px] leading-relaxed text-[#8A6A55]">Esta pantalla es una simulación de producto. La autenticación real por cuenta de negocio se conectará después a Firebase Auth.</p>
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
          <button type="button" onClick={closeDemoSession} className="rounded-xl border border-[#DEC8AE] bg-white px-3 py-2 text-xs font-bold text-[#6B4028]">Cerrar demo</button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-7 sm:py-10">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div><span className="text-xs font-black uppercase tracking-[0.14em] text-[#A86B3D]">Cuenta de negocio</span><h2 className="mt-1 font-serif text-3xl font-black">¿Qué quieres administrar?</h2><p className="mt-2 max-w-2xl text-sm text-[#6B4028]">Cada negocio abre su propia página, POS, inventario, clientes e IA según los módulos que tenga activos.</p></div>
          <button type="button" onClick={() => { window.location.hash = '#business-new'; }} className="rounded-2xl bg-[#111827] px-4 py-3 text-sm font-black text-white flex items-center justify-center gap-2"><Plus className="w-4 h-4 text-amber-300" /> Crear nuevo negocio</button>
        </div>

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

                {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</div>}

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

        {showTemplates && (
          <section className="mt-8 rounded-[2rem] border border-[#D9C5AC] bg-white p-5 sm:p-7 shadow-sm">
            <div className="flex items-start justify-between gap-4"><div><span className="text-[10px] uppercase tracking-[0.15em] font-black text-[#A86B3D]">Nuevo negocio</span><h3 className="font-serif text-2xl font-black mt-1">¿Qué negocio quieres abrir?</h3><p className="text-sm text-[#6B4028] mt-1">La plantilla define los módulos iniciales; después podrás activarlos o quitarlos.</p></div><button type="button" onClick={() => { setShowTemplates(false); setSelectedTemplate(null); }} className="text-xs font-bold text-[#6B4028]">Cerrar</button></div>

            <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {BUSINESS_TEMPLATES.map((template) => {
                const Icon = template.icon;
                const selected = selectedTemplate === template.id;
                return <button key={template.id} type="button" onClick={() => setSelectedTemplate(template.id)} className={`rounded-2xl border p-4 text-left transition ${selected ? 'border-[#A86B3D] bg-[#FFF7EA] ring-2 ring-[#C9974D]/20' : 'border-[#E8D8C4] bg-white hover:border-[#C9974D]'}`}><div className="w-10 h-10 rounded-xl bg-[#111827] text-amber-300 flex items-center justify-center"><Icon className="w-5 h-5" /></div><strong className="block mt-3 text-sm">{template.name}</strong><span className="block mt-1 text-xs leading-relaxed text-[#6B4028]">{template.description}</span></button>;
              })}
            </div>

            {selectedTemplateInfo && (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>{selectedTemplateInfo.name}</strong><span className="block mt-1 text-xs">Esta plantilla ya forma parte del roadmap del Business Core. Por ahora Calientito es el negocio funcional de referencia mientras conectamos creación real, autenticación y datos separados por negocio.</span></div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};
