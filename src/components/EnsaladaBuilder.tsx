import React, { useState } from 'react';
import { SALAD_OPTIONS, MENU_ITEMS } from '../data/menu';
import { CartItem, SaladCustomization } from '../types';
import { X, Check, Sparkles, ChefHat } from 'lucide-react';

interface EnsaladaBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (cartItem: CartItem) => void;
}

export const EnsaladaBuilder: React.FC<EnsaladaBuilderProps> = ({
  isOpen,
  onClose,
  onAddToCart,
}) => {
  const [proteina, setProteina] = useState<string>(SALAD_OPTIONS.proteinas[0]);
  const [fruta, setFruta] = useState<string>(SALAD_OPTIONS.frutas[0]);
  const [topping, setTopping] = useState<string>(SALAD_OPTIONS.toppings[0]);
  const [aderezo, setAderezo] = useState<string>(SALAD_OPTIONS.aderezos[0]);
  const [quantity, setQuantity] = useState<number>(1);

  if (!isOpen) return null;

  const handleAdd = () => {
    const customSalad: SaladCustomization = {
      proteina,
      fruta,
      topping,
      aderezo,
    };

    const saladItem = MENU_ITEMS.find((i) => i.id === 'arma-ensalada') || {
      id: 'arma-ensalada',
      name: 'Arma Tu Ensalada Especial',
      category: 'ensaladas' as const,
      description: 'Ensalada personalizada de $90',
      price: 90,
    };

    const cartItem: CartItem = {
      cartId: `ensalada-${Date.now()}`,
      item: saladItem,
      quantity,
      customSalad,
      selectedOption: `${proteina} + ${fruta} + ${topping} + ${aderezo}`,
      unitPrice: 90,
      totalPrice: 90 * quantity,
    };

    onAddToCart(cartItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-stone-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#162e1e] to-[#0f1f14] text-stone-100 p-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#d1a85b]/20 border border-[#d1a85b]/40 flex items-center justify-center text-[#d1a85b] text-2xl font-bold">
              🥗
            </div>
            <div>
              <span className="text-[10px] uppercase font-black tracking-widest text-[#d1a85b] bg-[#1a3824] px-2.5 py-0.5 rounded-full border border-[#b48a44]/50">
                Línea Fresca & Saludable
              </span>
              <h2 className="text-xl sm:text-2xl font-black font-serif text-[#fcfaf6] mt-0.5">
                Arma Tu Ensalada ($90)
              </h2>
              <p className="text-xs text-stone-300">
                Incluye base de lechuga italiana, pasta, pepino, jitomate y zanahoria.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-[#1f402c] hover:bg-[#2b593d] text-stone-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Step Selection */}
        <div className="p-5 space-y-6 overflow-y-auto flex-1">
          {/* Step 1: Proteína */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-emerald-900 mb-2 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center text-[10px] font-black">1</span>
              Elige 1 Proteína
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SALAD_OPTIONS.proteinas.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProteina(p)}
                  className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all flex items-center justify-between ${
                    proteina === p
                      ? 'bg-emerald-100 border-emerald-600 text-emerald-950 shadow-xs'
                      : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <span>{p}</span>
                  {proteina === p && <Check className="w-4 h-4 text-emerald-700 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Fruta */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-emerald-900 mb-2 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center text-[10px] font-black">2</span>
              Elige 1 Fruta
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SALAD_OPTIONS.frutas.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFruta(f)}
                  className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all flex items-center justify-between ${
                    fruta === f
                      ? 'bg-emerald-100 border-emerald-600 text-emerald-950 shadow-xs'
                      : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <span>{f}</span>
                  {fruta === f && <Check className="w-4 h-4 text-emerald-700 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Step 3: Topping */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-emerald-900 mb-2 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center text-[10px] font-black">3</span>
              Elige 1 Topping
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SALAD_OPTIONS.toppings.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTopping(t)}
                  className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all flex items-center justify-between ${
                    topping === t
                      ? 'bg-emerald-100 border-emerald-600 text-emerald-950 shadow-xs'
                      : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <span>{t}</span>
                  {topping === t && <Check className="w-4 h-4 text-emerald-700 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Step 4: Aderezo */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-emerald-900 mb-2 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center text-[10px] font-black">4</span>
              Elige 1 Aderezo
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SALAD_OPTIONS.aderezos.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAderezo(a)}
                  className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all flex items-center justify-between ${
                    aderezo === a
                      ? 'bg-emerald-100 border-emerald-600 text-emerald-950 shadow-xs'
                      : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <span>{a}</span>
                  {aderezo === a && <Check className="w-4 h-4 text-emerald-700 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Selection Summary Box */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-emerald-900 mb-2 flex items-center gap-1">
              <ChefHat className="w-4 h-4 text-emerald-700" /> Resumen de Tu Ensalada:
            </h4>
            <div className="text-xs text-emerald-950 font-medium space-y-1">
              <p>• <strong>Base:</strong> Lechuga italiana, pasta, pepino, jitomate y zanahoria</p>
              <p>• <strong>Proteína:</strong> {proteina}</p>
              <p>• <strong>Fruta:</strong> {fruta}</p>
              <p>• <strong>Topping:</strong> {topping}</p>
              <p>• <strong>Aderezo:</strong> {aderezo}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-stone-50 p-4 border-t border-stone-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-500 font-bold uppercase">Precio:</span>
            <span className="text-xl font-black text-[#162e1e]">${90 * quantity}</span>
          </div>

          <button
            onClick={handleAdd}
            className="py-3 px-6 bg-[#162e1e] hover:bg-[#1f402c] text-[#fcfaf6] rounded-xl font-bold text-sm shadow-md transition-all active:scale-98 flex items-center gap-2 cursor-pointer border border-[#b48a44]/30"
          >
            <Sparkles className="w-4 h-4 text-[#d1a85b]" />
            <span>Agregar Ensalada ($90)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
