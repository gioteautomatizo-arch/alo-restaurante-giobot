import React, { useState } from 'react';
import { MENU_ITEMS } from '../data/menu';
import { CartItem, ComidaCorridaCustomization } from '../types';
import { X, Check, Utensils, Soup, Flame, Sparkles } from 'lucide-react';

interface ComidaCorridaBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (cartItem: CartItem) => void;
}

export const ComidaCorridaBuilder: React.FC<ComidaCorridaBuilderProps> = ({
  isOpen,
  onClose,
  onAddToCart,
}) => {
  const [primerTiempo, setPrimerTiempo] = useState<string>('Consumé del día');
  const [segundoTiempo, setSegundoTiempo] = useState<string>('Arroz del día');
  const [tercerTiempo, setTercerTiempo] = useState<string>('Guisado del día');
  const [extraAgrega, setExtraAgrega] = useState<string>('Sin extra');
  const [quantity, setQuantity] = useState<number>(1);

  if (!isOpen) return null;

  // Price calculations
  let basePrice = 90;
  if (tercerTiempo.includes('+$5')) basePrice += 5;
  if (tercerTiempo.includes('+$10')) basePrice += 10;
  if (extraAgrega !== 'Sin extra') basePrice += 10;

  const handleAdd = () => {
    const customComidaCorrida: ComidaCorridaCustomization = {
      primerTiempo,
      segundoTiempo,
      tercerTiempo,
      extraAgrega: extraAgrega !== 'Sin extra' ? extraAgrega : undefined,
    };

    const corridaItem = MENU_ITEMS.find((i) => i.id === 'comida-corrida') || {
      id: 'comida-corrida',
      name: 'Comida Corrida Completa',
      category: 'comida-corrida' as const,
      description: 'Menú completo de 3 tiempos con agua y postre',
      price: 90,
    };

    const cartItem: CartItem = {
      cartId: `corrida-${Date.now()}`,
      item: corridaItem,
      quantity,
      customComidaCorrida,
      selectedOption: `${primerTiempo} + ${segundoTiempo} + ${tercerTiempo}`,
      unitPrice: basePrice,
      totalPrice: basePrice * quantity,
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
              🍲
            </div>
            <div>
              <span className="text-[10px] uppercase font-black tracking-widest text-[#d1a85b] bg-[#1a3824] px-2.5 py-0.5 rounded-full border border-[#b48a44]/50">
                Sabor Casero Diario
              </span>
              <h2 className="text-xl sm:text-2xl font-black font-serif text-[#fcfaf6] mt-0.5">
                Comida Corrida Completa ($90)
              </h2>
              <p className="text-xs text-stone-300">
                Incluye 1/2L de agua fresca del día + Postre casero de cortesía.
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

        {/* Customization Options */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* 1er Tiempo */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#162e1e] mb-2 flex items-center gap-1.5">
              <Soup className="w-4 h-4 text-[#b48a44]" />
              1er Tiempo (Sopa / Consumé)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {['Consumé del día', 'Sopa del día'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setPrimerTiempo(opt)}
                  className={`p-3 rounded-xl border text-xs font-bold text-left transition-all flex items-center justify-between cursor-pointer ${
                    primerTiempo === opt
                      ? 'bg-[#162e1e]/10 border-[#162e1e] text-[#162e1e] shadow-xs ring-1 ring-[#162e1e]'
                      : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <span>{opt}</span>
                  {primerTiempo === opt && <Check className="w-4 h-4 text-[#162e1e]" />}
                </button>
              ))}
            </div>
          </div>

          {/* 2do Tiempo */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#162e1e] mb-2 flex items-center gap-1.5">
              <Utensils className="w-4 h-4 text-[#b48a44]" />
              2do Tiempo (Arroz / Pasta)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {['Arroz del día', 'Pasta del día'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setSegundoTiempo(opt)}
                  className={`p-3 rounded-xl border text-xs font-bold text-left transition-all flex items-center justify-between cursor-pointer ${
                    segundoTiempo === opt
                      ? 'bg-[#162e1e]/10 border-[#162e1e] text-[#162e1e] shadow-xs ring-1 ring-[#162e1e]'
                      : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <span>{opt}</span>
                  {segundoTiempo === opt && <Check className="w-4 h-4 text-[#162e1e]" />}
                </button>
              ))}
            </div>
          </div>

          {/* 3er Tiempo (Plato Fuerte) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#162e1e] mb-2 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-[#b48a44]" />
              3er Tiempo (Guisado / Especialidad)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                'Guisado del día',
                'Enchiladas Verdes',
                'Enchiladas Rojas',
                'Milanesa de Res',
                'Milanesa de Pollo',
                'Tacos Dorados',
                'Bistec Asado (+$5)',
                'Pechuga Asada (+$5)',
                'Enchiladas Suizas (+$10)',
              ].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setTercerTiempo(opt)}
                  className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all flex items-center justify-between cursor-pointer ${
                    tercerTiempo === opt
                      ? 'bg-[#162e1e]/10 border-[#162e1e] text-[#162e1e] shadow-xs ring-1 ring-[#162e1e]'
                      : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <span>{opt}</span>
                  {tercerTiempo === opt && <Check className="w-4 h-4 text-[#162e1e]" />}
                </button>
              ))}
            </div>
          </div>

          {/* Extra Addon (Huevo / Plátano) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#162e1e] mb-2">
              Agrega al Arroz (+ $10)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['Sin extra', 'Agrega Huevo (+ $10)', 'Agrega Plátano (+ $10)'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setExtraAgrega(opt)}
                  className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all cursor-pointer ${
                    extraAgrega === opt
                      ? 'bg-[#162e1e] text-[#fcfaf6] border-[#162e1e]'
                      : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-[#fcfaf6] border border-[#d1a85b]/40 rounded-2xl p-4 text-xs text-stone-800 space-y-1">
            <h4 className="font-bold text-[#162e1e] mb-1">Tu Menú de Hoy Incluye:</h4>
            <p>• 1er Tiempo: <strong>{primerTiempo}</strong></p>
            <p>• 2do Tiempo: <strong>{segundoTiempo}</strong> {extraAgrega !== 'Sin extra' && `(${extraAgrega})`}</p>
            <p>• 3er Tiempo: <strong>{tercerTiempo}</strong></p>
            <p>• Bebida: <strong>1/2 Litro de Agua Fresca del día</strong></p>
            <p>• Postre: <strong>Postre casero del día</strong></p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-stone-50 p-4 border-t border-stone-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-500 font-bold uppercase">Precio Total:</span>
            <span className="text-xl font-black text-[#162e1e]">${basePrice * quantity}</span>
          </div>

          <button
            onClick={handleAdd}
            className="py-3 px-6 bg-[#162e1e] hover:bg-[#1f402c] text-[#fcfaf6] rounded-xl font-bold text-sm shadow-md transition-all active:scale-98 flex items-center gap-2 cursor-pointer border border-[#b48a44]/30"
          >
            <Sparkles className="w-4 h-4 text-[#d1a85b]" />
            <span>Agregar Comida Corrida (${basePrice})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
