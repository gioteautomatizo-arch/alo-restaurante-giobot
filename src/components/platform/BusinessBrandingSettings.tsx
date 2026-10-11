import React, { useState } from 'react';
import { ArrowLeft, ImagePlus, Save, Store, Upload } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { uploadBusinessLogo, uploadBusinessMenuImage } from '../../lib/menuImagesService';
import type { RestaurantTenant } from '../../lib/restaurantCore';

type Palette = { name: string; primary: string; accent: string; background: string; surface: string; text: string };

const PALETTES: Palette[] = [
  { name: 'Giote dorado', primary: '#D6A34A', accent: '#E3BC6B', background: '#111111', surface: '#1A1A1A', text: '#F7F7F7' },
  { name: 'Océano', primary: '#0E7490', accent: '#67E8F9', background: '#082F49', surface: '#0C4A6E', text: '#F0F9FF' },
  { name: 'Bosque', primary: '#15803D', accent: '#86EFAC', background: '#10251A', surface: '#183B29', text: '#F0FDF4' },
  { name: 'Rosa', primary: '#BE185D', accent: '#F9A8D4', background: '#2A1020', surface: '#451A32', text: '#FFF1F2' },
  { name: 'Violeta', primary: '#7C3AED', accent: '#C4B5FD', background: '#1E1433', surface: '#30204D', text: '#F5F3FF' },
  { name: 'Claro', primary: '#A86B3D', accent: '#D6A34A', background: '#F5F1EA', surface: '#FFFFFF', text: '#201610' },
];

export const BusinessBrandingSettings: React.FC<{
  business: RestaurantTenant;
  onBack: () => void;
  onSaved: (business: RestaurantTenant) => void;
}> = ({ business, onBack, onSaved }) => {
  const branding = business.branding;
  const initial = PALETTES.find((p) => p.primary === branding.primaryColor) || PALETTES[0];
  const [name, setName] = useState(branding.restaurantName || '');
  const [primary, setPrimary] = useState(branding.primaryColor || initial.primary);
  const [accent, setAccent] = useState(branding.accentColor || initial.accent);
  const [background, setBackground] = useState(branding.backgroundColor || initial.background);
  const [surface, setSurface] = useState(branding.surfaceColor || initial.surface);
  const [textColor, setTextColor] = useState(branding.textColor || initial.text);
  const [logoUrl, setLogoUrl] = useState(branding.logoUrl || '');
  const [coverUrl, setCoverUrl] = useState(branding.coverUrl || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const applyPalette = (palette: Palette) => {
    setPrimary(palette.primary);
    setAccent(palette.accent);
    setBackground(palette.background);
    setSurface(palette.surface);
    setTextColor(palette.text);
  };

  const upload = async (file: File | undefined, kind: 'logo' | 'cover') => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Selecciona un archivo de imagen.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const url = kind === 'logo'
        ? await uploadBusinessLogo(business.restaurantId, file)
        : await uploadBusinessMenuImage(business.restaurantId, file);
      if (kind === 'logo') setLogoUrl(url);
      else setCoverUrl(url);
      setMessage(kind === 'logo' ? 'Logo cargado. Guarda los cambios para aplicarlo.' : 'Portada cargada. Guarda los cambios para aplicarla.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la imagen.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const user = auth.currentUser;
    if (!user) {
      setError('Tu sesión expiró. Inicia sesión nuevamente.');
      return;
    }
    if (name.trim().length < 2) {
      setError('El nombre del negocio debe tener al menos 2 caracteres.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    const updated: RestaurantTenant = {
      ...business,
      branding: {
        ...branding,
        restaurantName: name.trim(),
        logoUrl,
        coverUrl,
        primaryColor: primary,
        accentColor: accent,
        backgroundColor: background,
        surfaceColor: surface,
        textColor,
      },
    };
    try {
      await updateDoc(doc(db, 'businesses', business.restaurantId), { branding: updated.branding });
      onSaved(updated);
      setMessage('Identidad guardada para este negocio.');
    } catch (err) {
      console.error('[BusinessBrandingSettings] save failed:', err);
      setError('No se pudo guardar. Verifica que tu usuario tenga rol de propietario o administrador y vuelve a intentarlo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-5 sm:px-6" style={{ backgroundColor: background, color: textColor }}>
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <button onClick={onBack} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: accent }}>
          <ArrowLeft className="h-4 w-4" /> Volver al negocio
        </button>
        <button onClick={save} disabled={busy} className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-60" style={{ backgroundColor: primary, color: background }}>
          <Save className="h-4 w-4" /> {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </header>

      <main className="mx-auto mt-6 max-w-5xl space-y-5">
        <section className="overflow-hidden rounded-3xl border" style={{ borderColor: accent, backgroundColor: surface }}>
          <div className="relative flex min-h-36 items-end p-5 sm:p-7" style={{ backgroundImage: coverUrl ? `linear-gradient(0deg, ${background}dd, transparent), url("${coverUrl}")` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: background }}>
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-white" style={{ borderColor: accent }}>
                {logoUrl ? <img src={logoUrl} alt="Logo del negocio" className="h-full w-full object-contain" /> : <Store className="h-8 w-8 text-stone-500" />}
              </div>
              <div><p className="text-xs font-bold uppercase tracking-widest" style={{ color: accent }}>Vista previa</p><h1 className="text-2xl font-black">{name || 'Nombre de tu negocio'}</h1><p className="text-sm opacity-80">Así se verá la identidad de tu negocio</p></div>
            </div>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <label className="block text-sm font-semibold">Nombre del negocio
              <input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-3" style={{ color: '#171717', backgroundColor: '#fff', borderColor: accent }} maxLength={100} />
            </label>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Logo del negocio</span>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-3 text-sm" style={{ borderColor: accent }}>
                <Upload className="h-4 w-4" /> Elegir logo
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void upload(e.target.files?.[0], 'logo')} />
              </label>
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <span className="text-sm font-semibold">Imagen de portada</span>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-3 text-sm" style={{ borderColor: accent }}>
                <ImagePlus className="h-4 w-4" /> Elegir portada
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void upload(e.target.files?.[0], 'cover')} />
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border p-5 sm:p-6" style={{ borderColor: accent, backgroundColor: surface }}>
          <h2 className="text-xl font-black">Paleta de colores</h2>
          <p className="mt-1 text-sm opacity-75">Elige un estilo inicial o ajusta los colores manualmente. Los cambios se guardan solo en este negocio.</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {PALETTES.map((palette) => (
              <button key={palette.name} type="button" onClick={() => applyPalette(palette)} className="rounded-2xl border p-3 text-left" style={{ borderColor: primary === palette.primary ? accent : '#88888866', backgroundColor: palette.background, color: palette.text }}>
                <span className="block font-bold">{palette.name}</span>
                <span className="mt-2 flex gap-1">{[palette.primary, palette.accent, palette.surface].map((color) => <span key={color} className="h-5 flex-1 rounded-full" style={{ backgroundColor: color }} />)}</span>
              </button>
            ))}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {([{label:'Color principal',value:primary,set:setPrimary},{label:'Color de acento',value:accent,set:setAccent},{label:'Fondo',value:background,set:setBackground},{label:'Superficie/tarjetas',value:surface,set:setSurface},{label:'Texto',value:textColor,set:setTextColor}] as const).map((item) => (
              <label key={item.label} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm" style={{ borderColor: '#88888866' }}>
                {item.label}<input type="color" value={item.value} onChange={(e) => item.set(e.target.value)} className="h-10 w-12 cursor-pointer rounded border-0 bg-transparent" />
              </label>
            ))}
          </div>
        </section>
        {message && <p role="status" className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: accent, backgroundColor: surface }}>{message}</p>}
        {error && <p role="alert" className="rounded-xl border border-red-400/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</p>}
        <button onClick={save} disabled={busy} className="w-full rounded-2xl px-5 py-4 font-black disabled:opacity-60" style={{ backgroundColor: primary, color: background }}>{busy ? 'Guardando…' : 'Guardar identidad del negocio'}</button>
      </main>
    </div>
  );
};
