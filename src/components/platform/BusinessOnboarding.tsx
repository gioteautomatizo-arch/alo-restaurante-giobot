import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Camera,
  Check,
  Coffee,
  LockKeyhole,
  Mail,
  Palette,
  Pizza,
  ShoppingBag,
  Sparkles,
  Store,
  UtensilsCrossed,
} from 'lucide-react';
import { normalizeRestaurantSlug } from '../../lib/restaurantCore';

export interface DemoBusinessProfile {
  name: string;
  handle: string;
  type: string;
  typeLabel: string;
  email: string;
  assistantName: string;
  assistantMode: 'GIOBOT_BASE' | 'CUSTOM_AVATAR';
  logoDataUrl?: string;
}

interface BusinessOnboardingProps {
  onCancel: () => void;
  onComplete: (profile: DemoBusinessProfile) => void;
}

type BusinessTemplate = {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

const BUSINESS_TEMPLATES: BusinessTemplate[] = [
  { id: 'restaurant', name: 'Restaurante', description: 'Menú, mesas, cocina, POS e inventario.', icon: UtensilsCrossed },
  { id: 'pizzeria', name: 'Pizzería', description: 'Pedidos, tamaños, extras, delivery y cocina.', icon: Pizza },
  { id: 'creperia', name: 'Crepería / Cafetería', description: 'Bebidas, recetas, barra y pedidos.', icon: Coffee },
  { id: 'perfumes', name: 'Perfumes y decants', description: 'Catálogo, inventario, clientes y asesor IA.', icon: ShoppingBag },
  { id: 'design', name: 'Diseño gráfico', description: 'Clientes, cotizaciones, proyectos y anticipos.', icon: Palette },
  { id: 'other', name: 'Otro negocio', description: 'Empieza con Business Core y activa tus módulos.', icon: Store },
];

const TOTAL_STEPS = 6;

export const BusinessOnboarding: React.FC<BusinessOnboardingProps> = ({ onCancel, onComplete }) => {
  const [step, setStep] = useState(0);
  const [businessType, setBusinessType] = useState('restaurant');
  const [businessName, setBusinessName] = useState('');
  const [handle, setHandle] = useState('');
  const [handleTouched, setHandleTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>();
  const [assistantMode, setAssistantMode] = useState<'GIOBOT_BASE' | 'CUSTOM_AVATAR'>('GIOBOT_BASE');
  const [assistantName, setAssistantName] = useState('Giobot');

  const template = useMemo(
    () => BUSINESS_TEMPLATES.find((item) => item.id === businessType) || BUSINESS_TEMPLATES[0],
    [businessType]
  );

  const canContinue = useMemo(() => {
    if (step === 1) return !!businessType;
    if (step === 2) return businessName.trim().length >= 2 && handle.trim().length >= 2;
    if (step === 3) return /^\S+@\S+\.\S+$/.test(email.trim()) && password.length >= 6;
    if (step === 5) return assistantMode === 'GIOBOT_BASE' || assistantName.trim().length >= 2;
    return true;
  }, [step, businessType, businessName, handle, email, password, assistantMode, assistantName]);

  const goBack = () => {
    if (step === 0) onCancel();
    else setStep((current) => Math.max(0, current - 1));
  };

  const goNext = () => {
    if (!canContinue) return;
    setStep((current) => Math.min(TOTAL_STEPS, current + 1));
  };

  const handleBusinessName = (value: string) => {
    setBusinessName(value);
    if (!handleTouched) setHandle(normalizeRestaurantSlug(value));
  };

  const handleLogo = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setLogoDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const finish = () => {
    onComplete({
      name: businessName.trim(),
      handle: normalizeRestaurantSlug(handle),
      type: businessType,
      typeLabel: template.name,
      email: email.trim().toLowerCase(),
      assistantName: assistantMode === 'GIOBOT_BASE' ? 'Giobot' : assistantName.trim(),
      assistantMode,
      logoDataUrl,
    });
  };

  return (
    <div className="min-h-screen bg-[#0B1220] text-white flex flex-col">
      <header className="px-5 pt-5 pb-3">
        <div className="mx-auto max-w-xl flex items-center justify-between gap-3">
          <button type="button" onClick={goBack} className="w-11 h-11 rounded-full border border-white/10 bg-white/5 flex items-center justify-center active:scale-95" aria-label="Volver">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 flex items-center gap-1.5 justify-center" aria-label={`Paso ${Math.min(step + 1, TOTAL_STEPS)} de ${TOTAL_STEPS}`}>
            {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
              <span key={index} className={`h-1.5 rounded-full transition-all ${index <= Math.min(step, TOTAL_STEPS - 1) ? 'w-7 bg-amber-300' : 'w-3 bg-white/15'}`} />
            ))}
          </div>
          <div className="w-11" />
        </div>
      </header>

      <main className="flex-1 px-5 py-4 flex items-center justify-center">
        <div className="w-full max-w-xl">
          {step === 0 && (
            <section className="text-center py-8">
              <div className="mx-auto w-24 h-24 rounded-[2rem] bg-gradient-to-br from-amber-300 to-orange-500 text-[#111827] flex items-center justify-center shadow-2xl shadow-orange-500/20">
                <Store className="w-11 h-11" />
              </div>
              <p className="mt-7 text-xs font-black uppercase tracking-[0.2em] text-amber-300">Gioteautomatizo Business</p>
              <h1 className="mt-3 text-4xl sm:text-5xl font-black leading-tight">Crea el espacio digital de tu negocio.</h1>
              <p className="mt-5 text-base leading-relaxed text-slate-300">Configura tu perfil, POS, catálogo y asistente IA en pocos pasos. Después podrás editar todo cuando quieras.</p>
              <div className="mt-8 grid grid-cols-3 gap-2 text-xs text-slate-300">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">POS</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">Catálogo</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">IA</div>
              </div>
            </section>
          )}

          {step === 1 && (
            <section>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Paso 1</p>
              <h1 className="mt-2 text-3xl font-black">¿Qué tipo de negocio quieres abrir?</h1>
              <p className="mt-2 text-sm text-slate-400">Esto prepara los módulos iniciales. Podrás cambiarlos después.</p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                {BUSINESS_TEMPLATES.map((item) => {
                  const Icon = item.icon;
                  const selected = businessType === item.id;
                  return (
                    <button key={item.id} type="button" onClick={() => setBusinessType(item.id)} className={`relative rounded-3xl border p-4 text-left transition active:scale-[0.99] ${selected ? 'border-amber-300 bg-amber-300/10 ring-2 ring-amber-300/20' : 'border-white/10 bg-white/5'}`}>
                      {selected && <span className="absolute right-3 top-3 w-6 h-6 rounded-full bg-amber-300 text-[#111827] flex items-center justify-center"><Check className="w-4 h-4" /></span>}
                      <div className="w-11 h-11 rounded-2xl bg-white/10 text-amber-300 flex items-center justify-center"><Icon className="w-5 h-5" /></div>
                      <strong className="mt-3 block text-sm">{item.name}</strong>
                      <span className="mt-1 block text-[11px] leading-relaxed text-slate-400">{item.description}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {step === 2 && (
            <section>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Paso 2</p>
              <h1 className="mt-2 text-3xl font-black">Dale identidad a tu negocio.</h1>
              <p className="mt-2 text-sm text-slate-400">Este nombre y usuario formarán parte de tu perfil público.</p>
              <div className="mt-7 space-y-5">
                <div>
                  <label className="text-xs font-bold text-slate-300">Nombre del negocio</label>
                  <input value={businessName} onChange={(event) => handleBusinessName(event.target.value)} placeholder="Ej. Pizzería Luna" className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-base outline-none focus:border-amber-300" autoFocus />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-300">Nombre de usuario</label>
                  <div className="mt-2 flex items-center rounded-2xl border border-white/10 bg-white/5 px-4 focus-within:border-amber-300">
                    <span className="text-slate-500">@</span>
                    <input value={handle} onChange={(event) => { setHandleTouched(true); setHandle(normalizeRestaurantSlug(event.target.value)); }} placeholder="pizzeria-luna" className="w-full bg-transparent px-1 py-4 text-base outline-none" />
                    {handle.length >= 2 && <Check className="w-5 h-5 text-emerald-400" />}
                  </div>
                  {handle && <p className="mt-2 text-xs text-slate-500">Tu perfil: /negocio/{normalizeRestaurantSlug(handle)}</p>}
                </div>
              </div>
            </section>
          )}

          {step === 3 && (
            <section>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Paso 3</p>
              <h1 className="mt-2 text-3xl font-black">Crea tu acceso.</h1>
              <p className="mt-2 text-sm text-slate-400">El correo será la cuenta principal del dueño. En esta primera versión el registro todavía es de demostración.</p>
              <div className="mt-7 space-y-4">
                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 focus-within:border-amber-300">
                  <Mail className="w-5 h-5 text-amber-300" />
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="correo@negocio.com" className="w-full bg-transparent py-4 outline-none" />
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 focus-within:border-amber-300">
                  <LockKeyhole className="w-5 h-5 text-amber-300" />
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Crea una contraseña (6+ caracteres)" className="w-full bg-transparent py-4 outline-none" />
                </label>
              </div>
            </section>
          )}

          {step === 4 && (
            <section className="text-center">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Paso 4</p>
              <h1 className="mt-2 text-3xl font-black">Agrega la imagen de tu negocio.</h1>
              <p className="mt-2 text-sm text-slate-400">Puede ser tu logo o una foto representativa. También puedes omitirlo.</p>
              <label className="mt-8 mx-auto relative w-52 h-52 rounded-[2.5rem] border-2 border-dashed border-white/20 bg-white/5 flex items-center justify-center overflow-hidden cursor-pointer active:scale-[0.99]">
                {logoDataUrl ? <img src={logoDataUrl} alt="Vista previa del negocio" className="w-full h-full object-cover" /> : <div className="text-center"><Camera className="w-10 h-10 mx-auto text-amber-300" /><span className="mt-3 block text-sm font-bold">Agregar foto</span><span className="mt-1 block text-xs text-slate-500">JPG o PNG</span></div>}
                <input type="file" accept="image/*" onChange={handleLogo} className="sr-only" />
              </label>
              {logoDataUrl && <button type="button" onClick={() => setLogoDataUrl(undefined)} className="mt-4 text-xs font-bold text-slate-400 underline">Quitar foto</button>}
            </section>
          )}

          {step === 5 && (
            <section>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Paso 5</p>
              <h1 className="mt-2 text-3xl font-black">Elige quién atenderá con IA.</h1>
              <p className="mt-2 text-sm text-slate-400">Todos empiezan con Giobot. También puedes preparar un avatar propio para tu marca.</p>
              <div className="mt-7 space-y-3">
                <button type="button" onClick={() => { setAssistantMode('GIOBOT_BASE'); setAssistantName('Giobot'); }} className={`w-full rounded-3xl border p-5 text-left ${assistantMode === 'GIOBOT_BASE' ? 'border-amber-300 bg-amber-300/10' : 'border-white/10 bg-white/5'}`}>
                  <div className="flex items-center gap-4"><div className="w-14 h-14 rounded-2xl bg-amber-300 text-[#111827] flex items-center justify-center"><Bot className="w-7 h-7" /></div><div className="flex-1"><span className="text-[10px] font-black uppercase tracking-wide text-amber-300">Incluido</span><strong className="block text-lg">Giobot de fábrica</strong><span className="block text-xs text-slate-400 mt-1">Asistente listo para atender y vender.</span></div>{assistantMode === 'GIOBOT_BASE' && <Check className="w-5 h-5 text-emerald-400" />}</div>
                </button>
                <button type="button" onClick={() => { setAssistantMode('CUSTOM_AVATAR'); if (assistantName === 'Giobot') setAssistantName(''); }} className={`w-full rounded-3xl border p-5 text-left ${assistantMode === 'CUSTOM_AVATAR' ? 'border-amber-300 bg-amber-300/10' : 'border-white/10 bg-white/5'}`}>
                  <div className="flex items-center gap-4"><div className="w-14 h-14 rounded-2xl bg-white/10 text-amber-300 flex items-center justify-center"><Sparkles className="w-7 h-7" /></div><div className="flex-1"><span className="text-[10px] font-black uppercase tracking-wide text-amber-300">Personalizable</span><strong className="block text-lg">Avatar propio</strong><span className="block text-xs text-slate-400 mt-1">Nombre, imagen y personalidad de tu negocio.</span></div>{assistantMode === 'CUSTOM_AVATAR' && <Check className="w-5 h-5 text-emerald-400" />}</div>
                </button>
                {assistantMode === 'CUSTOM_AVATAR' && <input value={assistantName} onChange={(event) => setAssistantName(event.target.value)} placeholder="Nombre del asistente, ej. Tita" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 outline-none focus:border-amber-300" />}
                <div className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-400/5 p-4"><span className="text-[10px] font-black uppercase tracking-wide text-fuchsia-300">Giobot Premium</span><p className="mt-1 text-xs text-slate-400">Diseño de avatar, personalidad y experiencia avanzada hecha para la marca. Lo activaremos como mejora comercial.</p></div>
              </div>
            </section>
          )}

          {step === 6 && (
            <section className="text-center py-4">
              <div className="mx-auto w-20 h-20 rounded-full bg-emerald-400 text-[#052e1a] flex items-center justify-center shadow-2xl shadow-emerald-500/20"><Check className="w-10 h-10" /></div>
              <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Perfil listo</p>
              <h1 className="mt-2 text-3xl font-black">Tu negocio ya tiene identidad.</h1>
              <p className="mt-2 text-sm text-slate-400">Así se verá dentro de tu cuenta antes de conectar sus módulos reales.</p>
              <div className="mt-7 rounded-[2rem] border border-white/10 bg-white/5 p-5 text-left">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-3xl bg-white/10 overflow-hidden flex items-center justify-center shrink-0">{logoDataUrl ? <img src={logoDataUrl} alt={businessName} className="w-full h-full object-cover" /> : <Store className="w-8 h-8 text-amber-300" />}</div>
                  <div className="min-w-0"><span className="text-[10px] font-black uppercase tracking-wide text-amber-300">{template.name}</span><h2 className="text-xl font-black truncate">{businessName}</h2><p className="text-xs text-slate-400 truncate">@{normalizeRestaurantSlug(handle)}</p></div>
                </div>
                <div className="mt-4 rounded-2xl bg-black/20 p-3 flex items-center gap-3"><Bot className="w-5 h-5 text-amber-300" /><div><span className="block text-[10px] text-slate-500 uppercase font-bold">Asistente IA</span><strong className="text-sm">{assistantMode === 'GIOBOT_BASE' ? 'Giobot' : assistantName}</strong></div></div>
              </div>
              <p className="mt-4 text-[11px] leading-relaxed text-slate-500">Este alta todavía es una simulación visual. No almacenamos la contraseña ni creamos datos productivos hasta conectar autenticación y tenants reales.</p>
            </section>
          )}
        </div>
      </main>

      <footer className="px-5 pb-6 pt-3">
        <div className="mx-auto max-w-xl">
          {step < TOTAL_STEPS ? (
            <button type="button" onClick={goNext} disabled={!canContinue} className="w-full rounded-2xl bg-amber-300 px-5 py-4 text-sm font-black text-[#111827] disabled:opacity-35 flex items-center justify-center gap-2 active:scale-[0.99]">Siguiente <ArrowRight className="w-4 h-4" /></button>
          ) : (
            <button type="button" onClick={finish} className="w-full rounded-2xl bg-emerald-400 px-5 py-4 text-sm font-black text-[#052e1a] flex items-center justify-center gap-2 active:scale-[0.99]">Entrar a mi espacio <ArrowRight className="w-4 h-4" /></button>
          )}
          {step === 4 && <button type="button" onClick={goNext} className="mt-3 w-full py-2 text-xs font-bold text-slate-400">Omitir por ahora</button>}
        </div>
      </footer>
    </div>
  );
};
