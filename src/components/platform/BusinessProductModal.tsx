import React, { useMemo, useState } from 'react';
import { Check, Minus, Plus, Utensils, X } from 'lucide-react';
import type { BusinessCatalogItem } from '../../lib/businessCatalogService';
import { formatMoney } from '../../lib/businessPublicPage';
import { hasPriceFrom, missingRequired, toggleChoice, unitPriceFor } from '../../lib/catalogOptions';
import type { OptionSelection } from '../../lib/catalogOptions';

export interface ProductTheme { bg: string; surface: string; text: string; primary: string; accent: string; border: string }

/** Ventana del producto: foto, descripción, opciones (guiso, extras, paquete…) y cantidad. */
export const BusinessProductModal: React.FC<{
  item: BusinessCatalogItem;
  theme: ProductTheme;
  onClose: () => void;
  onAdd: (selection: OptionSelection, quantity: number) => void;
}> = ({ item, theme, onClose, onAdd }) => {
  const [selection, setSelection] = useState<OptionSelection>({});
  const [quantity, setQuantity] = useState(1);
  const [tried, setTried] = useState(false);
  const groups = item.optionGroups || [];
  const missing = useMemo(() => missingRequired(item, selection), [item, selection]);
  const unit = unitPriceFor(item, selection);

  const submit = () => {
    if (missing.length) { setTried(true); return; }
    onAdd(selection, quantity);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border sm:rounded-3xl" style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }} onClick={(event) => event.stopPropagation()}>
        <div className="relative aspect-[16/10] w-full shrink-0" style={{ backgroundColor: theme.bg }}>
          {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" /> : (
            <div className="flex h-full w-full items-center justify-center"><Utensils className="h-10 w-10 opacity-40" style={{ color: theme.accent }} /></div>
          )}
          <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute right-3 top-3 rounded-full bg-black/60 p-2 text-white"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-serif text-xl font-black leading-snug">{item.name}</h2>
            <strong className="shrink-0 text-base" style={{ color: theme.accent }}>{formatMoney(Number(item.price))}{hasPriceFrom(item) ? <span className="text-[10px] font-normal opacity-70"> (desde)</span> : null}</strong>
          </div>
          {item.description && <p className="mt-2 text-sm opacity-80">{item.description}</p>}

          {groups.map((group) => {
            const chosen = selection[group.id] || [];
            const groupMissing = tried && group.required && chosen.length === 0;
            return (
              <fieldset key={group.id} className="mt-5">
                <legend className="flex w-full items-center justify-between gap-2 text-sm font-black">
                  <span>{group.name}</span>
                  <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold" style={{ borderColor: groupMissing ? '#f87171' : theme.border, color: groupMissing ? '#f87171' : theme.accent }}>
                    {group.required ? 'Obligatorio' : 'Opcional'}{group.multiple ? ' · varias' : ' · elige 1'}
                  </span>
                </legend>
                <div className="mt-2 space-y-2">
                  {group.choices.map((choice) => {
                    const on = chosen.includes(choice.name);
                    return (
                      <button
                        key={choice.name}
                        type="button"
                        onClick={() => setSelection((current) => ({ ...current, [group.id]: toggleChoice(group, current[group.id], choice.name) }))}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left text-sm"
                        style={{ borderColor: on ? theme.primary : theme.border, backgroundColor: on ? `${theme.primary}22` : 'transparent' }}
                      >
                        <span className="flex items-center gap-3">
                          <span className={`flex h-5 w-5 items-center justify-center border ${group.multiple ? 'rounded-md' : 'rounded-full'}`} style={{ borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary : 'transparent', color: theme.bg }}>
                            {on && <Check className="h-3 w-3" />}
                          </span>
                          {choice.name}
                        </span>
                        {choice.price > 0 && <span className="text-xs font-bold opacity-80">+{formatMoney(choice.price)}</span>}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>

        <div className="flex items-center gap-3 border-t p-4" style={{ borderColor: theme.border }}>
          <span className="flex items-center gap-1 rounded-xl border px-1 py-1" style={{ borderColor: theme.border }}>
            <button type="button" aria-label="Quitar uno" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="rounded-lg p-2"><Minus className="h-4 w-4" /></button>
            <strong className="w-6 text-center text-sm">{quantity}</strong>
            <button type="button" aria-label="Agregar uno" onClick={() => setQuantity((q) => q + 1)} className="rounded-lg p-2"><Plus className="h-4 w-4" /></button>
          </span>
          <button type="button" onClick={submit} className="flex-1 rounded-2xl px-4 py-3.5 text-sm font-black" style={{ backgroundColor: theme.primary, color: theme.bg, opacity: missing.length ? 0.7 : 1 }}>
            {tried && missing.length ? `Elige: ${missing.join(', ')}` : `Agregar · ${formatMoney(unit * quantity)}`}
          </button>
        </div>
      </div>
    </div>
  );
};
