import React, { useRef, useState } from 'react';
import { ArrowLeft, Bot, Camera, FileImage, Sparkles } from 'lucide-react';
import { optimizeMenuImage, validateMenuImage, uploadMenuImage } from '../../lib/menuImagesService';

export const BusinessMenuImport: React.FC<{
  businessId: string;
  businessName: string;
  onBack: () => void;
}> = ({ businessId, businessName, onBack }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState('');

  const chooseFile = (file?: File) => {
    if (!file) return;
    const error = validateMenuImage(file);
    if (error) {
      setMessage(error);
      return;
    }
    setFileName(file.name);
    setMessage('');
    setResult('');
    setPreview(URL.createObjectURL(file));
  };

  const analyze = async () => {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setMessage('Primero selecciona una foto de tu menú.');
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const optimized = await optimizeMenuImage(file);
      const url = await uploadMenuImage(businessId + '-menu-import', optimized);
      setResult('Foto preparada y guardada. El siguiente paso del importador será convertir productos, categorías y precios en un borrador editable.');
      void url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos preparar la imagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F1EA] text-[#201610]">
      <header className="border-b border-[#E5D8C4] bg-white px-4 py-4">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <button onClick={onBack} className="rounded-xl border border-[#DEC8AE] px-3 py-2 text-xs font-bold text-[#6B4028] flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> Negocio</button>
          <span className="text-xs font-black uppercase tracking-wide text-[#6B4028]">Giobot · Importador de menú</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <section className="rounded-[2rem] border border-[#D9C5AC] bg-white p-6 sm:p-10">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-[#111827] p-3 text-amber-300"><Bot className="w-7 h-7" /></div>
            <div><span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#A86B3D]">Configura {businessName}</span><h1 className="mt-1 font-serif text-3xl font-black">Sube tu menú</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#6B4028]">Toma una foto de tu menú. Giobot podrá ayudarte a identificar productos, categorías, precios y descripciones para que tú los revises antes de publicarlos.</p></div>
          </div>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => chooseFile(e.target.files?.[0])} />
          <button onClick={() => inputRef.current?.click()} className="mt-8 w-full rounded-[1.5rem] border-2 border-dashed border-[#D9C5AC] bg-[#FFFDF9] p-8 text-center hover:border-[#C9974D]">
            {preview ? <img src={preview} alt="Vista previa del menú" className="mx-auto max-h-80 rounded-2xl object-contain" /> : <><Camera className="mx-auto h-10 w-10 text-[#A86B3D]" /><strong className="mt-3 block">Tomar / seleccionar foto</strong><span className="mt-1 block text-xs text-[#6B4028]">JPG, PNG o WEBP · máximo 12 MB</span></>}
          </button>
          {fileName && <p className="mt-3 text-xs font-bold text-[#6B4028] flex items-center gap-2"><FileImage className="w-4 h-4" /> {fileName}</p>}
          {message && <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-800">{message}</p>}
          {result && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800">{result}</p>}
          <button onClick={analyze} disabled={busy || !fileName} className="mt-6 w-full rounded-2xl bg-[#111827] px-5 py-4 text-sm font-black text-white disabled:opacity-50 flex items-center justify-center gap-2"><Sparkles className="w-4 h-4 text-amber-300" />{busy ? 'Preparando menú…' : 'Analizar con Giobot'}</button>
          <p className="mt-3 text-center text-[11px] text-[#7A6657]">La publicación nunca debe ser automática: el dueño revisa y edita el borrador antes de publicarlo.</p>
        </section>
      </main>
    </div>
  );
};
