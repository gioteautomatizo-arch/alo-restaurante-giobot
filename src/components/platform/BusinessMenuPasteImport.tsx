import React, { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { AI_MENU_PROMPT, parseMenuText } from '../../lib/menuTextParser';
import type { ParsedMenuItem } from '../../lib/menuTextParser';

export const BusinessMenuPasteImport: React.FC<{
  hasExisting: boolean;
  onApply: (items: ParsedMenuItem[], mode: 'add' | 'replace') => void;
  onClose: () => void;
}> = ({ hasExisting, onApply, onClose }) => {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedMenuItem[] | null>(null);
  const [mode, setMode] = useState<'add' | 'replace'>('add');
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_MENU_PROMPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('Copia estas instrucciones:', AI_MENU_PROMPT);
    }
  };

  const read = () => setParsed(parseMenuText(text));
  const withoutPrice = parsed ? parsed.filter((item) => item.price === null).length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-[#3A3022] bg-[#111111] p-5 text-[#F7F7F7] sm:rounded-3xl sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-[#D6A34A]">Pegar mi menú</p>
            <h2 className="mt-1 font-serif text-2xl font-black">Pasa tu menú en un minuto</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-xl border border-[#3A3022] p-2 text-[#F7F7F7]"><X className="h-4 w-4" /></button>
        </div>

        {!parsed && (
          <>
            <div className="mt-4 rounded-2xl border border-[#3A3022] bg-[#0B0B0B] p-4 text-sm leading-6 text-[#C8C8C8]">
              <strong className="text-[#F7F7F7]">¿Tienes tu menú en foto o en papel?</strong>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Toca <b>Copiar instrucciones</b>.</li>
                <li>Abre tu ChatGPT o Gemini (gratis), manda la foto de tu menú y pega las instrucciones.</li>
                <li>Copia lo que te responda y pégalo aquí abajo.</li>
              </ol>
              <button type="button" onClick={() => void copyPrompt()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#D6A34A] px-4 py-2.5 text-xs font-black text-[#050505]">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? '¡Instrucciones copiadas!' : 'Copiar instrucciones para mi IA'}
              </button>
              <p className="mt-3 text-xs text-[#B7B7B7]">También puedes escribirlo tú, una línea por producto: <i>Taco de pastor - 25</i>. Una línea sin precio (por ejemplo <i>Bebidas</i>) se toma como categoría.</p>
            </div>

            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={9}
              placeholder={'Tacos\nTaco de pastor - 25\nTaco de bistec - 30\n\nBebidas\nAgua de horchata - 20'}
              className="mt-4 w-full rounded-2xl border border-[#3A3022] bg-[#0B0B0B] p-3 text-sm text-[#F7F7F7] outline-none placeholder:text-[#8F8F8F] focus:border-[#D6A34A]"
            />
            <button type="button" disabled={!text.trim()} onClick={read} className="mt-3 w-full rounded-2xl bg-[#D6A34A] px-4 py-3.5 text-sm font-black text-[#050505] disabled:opacity-40">
              Leer mi menú
            </button>
          </>
        )}

        {parsed && (
          <>
            {parsed.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-[#3A3022] bg-[#0B0B0B] p-5 text-sm text-[#C8C8C8]">No encontramos productos. Revisa que cada línea tenga el nombre y el precio.</div>
            ) : (
              <>
                <p className="mt-4 text-sm text-[#C8C8C8]">
                  Encontramos <b className="text-[#F7F7F7]">{parsed.length}</b> productos. Revísalos; después podrás editarlos uno por uno.
                  {withoutPrice > 0 && <span className="text-[#E3BC6B]"> {withoutPrice} sin precio (no se mostrarán al cliente hasta ponerles uno).</span>}
                </p>
                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-[#3A3022] bg-[#0B0B0B] p-3">
                  {parsed.map((item, index) => (
                    <div key={index} className="flex items-start justify-between gap-3 border-b border-[#3A3022] pb-2 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#F7F7F7]">{item.name}</p>
                        <p className="text-[11px] text-[#B7B7B7]">{item.category}{item.description ? ` · ${item.description}` : ''}{item.options.length ? ` · Opciones: ${item.options.map((o) => (o.price > 0 ? `${o.name} (+$${o.price})` : o.name)).join(', ')}` : ''}</p>
                      </div>
                      <span className={`shrink-0 text-sm font-black ${item.price === null ? 'text-[#E3BC6B]' : 'text-[#F7F7F7]'}`}>{item.price === null ? 'Sin precio' : `$${item.price}`}</span>
                    </div>
                  ))}
                </div>
                {hasExisting && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold">
                    <button type="button" onClick={() => setMode('add')} className={`rounded-xl border px-3 py-2.5 ${mode === 'add' ? 'border-[#D6A34A] text-[#E3BC6B]' : 'border-[#3A3022] text-[#C8C8C8]'}`}>Agregar a mi catálogo</button>
                    <button type="button" onClick={() => setMode('replace')} className={`rounded-xl border px-3 py-2.5 ${mode === 'replace' ? 'border-[#D6A34A] text-[#E3BC6B]' : 'border-[#3A3022] text-[#C8C8C8]'}`}>Reemplazar todo</button>
                  </div>
                )}
              </>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setParsed(null)} className="rounded-2xl border border-[#3A3022] px-4 py-3 text-sm font-bold text-[#F7F7F7]">Volver</button>
              <button type="button" disabled={parsed.length === 0} onClick={() => onApply(parsed, hasExisting ? mode : 'add')} className="rounded-2xl bg-[#D6A34A] px-4 py-3 text-sm font-black text-[#050505] disabled:opacity-40">Usar estos productos</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
