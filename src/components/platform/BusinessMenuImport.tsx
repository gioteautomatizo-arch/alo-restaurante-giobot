import React, { useMemo, useState } from 'react';
import { ArrowLeft, Camera, CheckCircle2, FileImage, Sparkles } from 'lucide-react';
import { uploadBusinessMenuImage } from '../../lib/menuImagesService';

type DraftItem = { id: string; name: string; category: string; price: string; description: string };

export const BusinessMenuImport: React.FC<{ businessId: string; businessName: string; onBack: () => void }> = ({ businessId, businessName, onBack }) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [status, setStatus] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);

  const canAnalyze = useMemo(() => !!file && !saving, [file, saving]);

  const chooseFile = (next: File | null) => {
    setFile(next);
    setItems([]);
    setStatus('');
    if (next) setPreview(URL.createObjectURL(next));
    else setPreview('');
  };

  const analyze = async () => {
    if (!file) return;
    setSaving(true);
    setStatus('Subiendo menú y preparando análisis…');
    try {
      const url = await uploadBusinessMenuImage(businessId, file);
      setStatus('Imagen guardada. Giobot puede analizarla en la siguiente etapa.');
      setItems([{ id: 'draft-1', name: '', category: 'Sin categoría', price: '', description: '' }]);
      console.info('[BusinessMenuImport] source image:', url);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : 'No se pudo subir la imagen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F1EA] text-[#201610]">
      <header className="sticky top-0 z-20 border-b border-[#E5D8C4] bg-white px-4 py-4">
        <div className="mx-auto max-w-5xl flex items-center justify-between gap-3">
          <button onClick={onBack} className="rounded-xl border border-[#DEC8AE] px-3 py-2 text-xs font-bold text-[#6B4028] flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> Negocio</button>
          <span className="text-xs font-black text-[#6B4028]">Sube tu menú · {businessName}</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-7">
        <section className="rounded-[2rem] border border-[#D9C5AC] bg-white p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-[#111827] p-3 text-amber-300"><Sparkles className="w-6 h-6" /></div>
            <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-[#A86B3D]">Giobot</p><h1 className="font-serif text-3xl font-black">Convierte tu menú en tu app</h1><p className="mt-2 text-sm text-[#6B4028]">Sube una foto clara. Primero guardamos el original y después la IA propone productos, categorías y precios para que tú los revises antes de publicar.</p></div>
          </div>
          <label className="mt-7 block cursor-pointer rounded-[1.5rem] border-2 border-dashed border-[#DEC8AE] bg-[#FFFDF9] p-8 text-center hover:border-[#C9974D]">
            <Camera className="mx-auto w-10 h-10 text-[#A86B3D]" />
            <strong className="mt-3 block">Subir foto del menú</strong>
            <span className="mt-1 block text-xs text-[#6B4028]">JPG, PNG o WEBP</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => chooseFile(e.target.files?.[0] || null)} />
          </label>
          {preview && <img src={preview} alt="Vista previa del menú" className="mt-5 max-h-[420px] w-full rounded-2xl object-contain bg-[#FFFDF9] border border-[#E8D8C4]" />}
          {file && <button disabled={!canAnalyze} onClick={analyze} className="mt-5 w-full rounded-2xl bg-[#3A2418] px-5 py-4 text-sm font-black text-white disabled:opacity-50 flex items-center justify-center gap-2"><FileImage className="w-4 h-4" /> {saving ? 'Procesando…' : 'Analizar menú con Giobot'}</button>}
          {status && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-900">{status}</div>}
          {items.length > 0 && <div className="mt-7"><h2 className="font-serif text-xl font-black">Borrador para revisar</h2><p className="mt-1 text-xs text-[#6B4028]">La IA nunca publica directamente: primero revisas y corriges.</p><div className="mt-4 rounded-2xl border border-[#E8D8C4] p-4 flex gap-3 items-center"><CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /><span className="text-sm">La estructura de revisión está lista. La extracción automática de texto se conecta aquí con el proveedor de IA.</span></div></div>}
        </section>
      </main>
    </div>
  );
};
