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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2B1B13]/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-[#FFF7EA] w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-[#F4E3C8] flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#3A2418] to-[#2B1B13] text-[#FFF7EA] p-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#C9974D]/20 border border-[#C9974D]/40 flex items-center justify-center text-[#C9974D] text-2xl font-bold">
              🥗
            </div>
            <div>
              <span className="text-[10px] uppercase font-black tracking-widest text-[#C9974D] bg-[#4A2E1F] px-2.5 py-0.5 rounded-full border border-[#C9974D]/50 font-serif">
                Línea Fresca & Saludable
              </span>
              <h2 className="text-xl sm:text-2xl font-black font-serif text-[#FFF7EA] mt-0.5">
                Arma Tu Ensalada ($90)
              </h2>
              <p className="text-xs text-[#F4E3C8]">
                Incluye base de lechuga italiana, pasta, pepino, jitomate y zanahoria.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-[#4A2E1F] hover:bg-[#5C3825] text-[#FFF7EA] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Step Selection */}
        <div className="p-5 space-y-6 overflow-y-auto flex-1">
          {/* Step 1: Proteína */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#3A2418] mb-2 flex items-center gap-1.5 font-serif">
              <span className="w-5 h-5 rounded-full bg-[#C77B4A] text-white flex items-center justify-center text-[10px] font-black">1</span>
              Elige 1 Proteína
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SALAD_OPTIONS.proteinas.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProteina(p)}
                  className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all flex items-center justify-between cursor-pointer ${
                    proteina === p
                      ? 'bg-[#C77B4A]/15 border-[#A86B3D] text-[#3A2418] shadow-xs ring-1 ring-[#A86B3D]'
                      : 'bg-[#FFF7EA] border-[#F4E3C8] text-[#3A2418] hover:bg-[#F4E3C8]/50'
                  }`}
                >
                  <span>{p}</span>
                  {proteina === p && <Check className="w-4 h-4 text-[#A86B3D] shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Fruta */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#3A2418] mb-2 flex items-center gap-1.5 font-serif">
              <span className="w-5 h-5 rounded-full bg-[#C77B4A] text-white flex items-center justify-center text-[10px] font-black">2</span>
              Elige 1 Fruta
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SALAD_OPTIONS.frutas.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFruta(f)}
                  className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all flex items-center justify-between cursor-pointer ${
                    fruta === f
                      ? 'bg-[#C77B4A]/15 border-[#A86B3D] text-[#3A2418] shadow-xs ring-1 ring-[#A86B3D]'
                      : 'bg-[#FFF7EA] border-[#F4E3C8] text-[#3A2418] hover:bg-[#F4E3C8]/50'
                  }`}
                >
                  <span>{f}</span>
                  {fruta === f && <Check className="w-4 h-4 text-[#A86B3D] shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Step 3: Topping */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#3A2418] mb-2 flex items-center gap-1.5 font-serif">
              <span className="w-5 h-5 rounded-full bg-[#C77B4A] text-white flex items-center justify-center text-[10px] font-black">3</span>
              Elige 1 Topping
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SALAD_OPTIONS.toppings.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTopping(t)}
                  className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all flex items-center justify-between cursor-pointer ${
                    topping === t
                      ? 'bg-[#C77B4A]/15 border-[#A86B3D] text-[#3A2418] shadow-xs ring-1 ring-[#A86B3D]'
                      : 'bg-[#FFF7EA] border-[#F4E3C8] text-[#3A2418] hover:bg-[#F4E3C8]/50'
                  }`}
                >
                  <span>{t}</span>
                  {topping === t && <Check className="w-4 h-4 text-[#A86B3D] shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Step 4: Aderezo */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#3A2418] mb-2 flex items-center gap-1.5 font-serif">
              <span className="w-5 h-5 rounded-full bg-[#C77B4A] text-white flex items-center justify-center text-[10px] font-black">4</span>
              Elige 1 Aderezo
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SALAD_OPTIONS.aderezos.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAderezo(a)}
                  className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all flex items-center justify-between cursor-pointer ${
                    aderezo === a
                      ? 'bg-[#C77B4A]/15 border-[#A86B3D] text-[#3A2418] shadow-xs ring-1 ring-[#A86B3D]'
                      : 'bg-[#FFF7EA] border-[#F4E3C8] text-[#3A2418] hover:bg-[#F4E3C8]/50'
                  }`}
                >
                  <span>{a}</span>
                  {aderezo === a && <Check className="w-4 h-4 text-[#A86B3D] shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Selection Summary Box */}
          <div className="bg-[#F4E3C8]/60 border border-[#C9974D]/40 rounded-2xl p-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#3A2418] mb-2 flex items-center gap-1 font-serif">
              <ChefHat className="w-4 h-4 text-[#A86B3D]" /> Resumen de Tu Ensalada:
            </h4>
            <div className="text-xs text-[#2B1B13] font-medium space-y-1">
              <p>• <strong>Base:</strong> Lechuga italiana, pasta, pepino, jitomate y zanahoria</p>
              <p>• <strong>Proteína:</strong> {proteina}</p>
              <p>• <strong>Fruta:</strong> {fruta}</p>
              <p>• <strong>Topping:</strong> {topping}</p>
              <p>• <strong>Aderezo:</strong> {aderezo}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#FFF7EA] p-4 border-t border-[#F4E3C8] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6B4028] font-bold uppercase">Precio:</span>
            <span className="text-xl font-black text-[#3A2418] font-serif">${90 * quantity}</span>
          </div>

          <button
            onClick={handleAdd}
            className="py-3 px-6 bg-gradient-to-r from-[#C77B4A] to-[#A86B3D] hover:from-[#d68a57] hover:to-[#b77848] text-white rounded-xl font-bold text-sm shadow-md transition-all active:scale-98 flex items-center gap-2 cursor-pointer border border-[#C9974D]/30"
          >
            <Sparkles className="w-4 h-4 text-[#FFF7EA]" />
            <span>Agregar Ensalada ($90)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
