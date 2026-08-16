import React, { useState, useEffect } from 'react';
import { MenuItem, SizeOption, ExtraOption, CartItem } from '../types';
import { X, Check, Plus, Minus, PackageCheck, MessageSquare } from 'lucide-react';

interface ItemModalProps {
  item: MenuItem | null;
  onClose: () => void;
  onAddToCart: (cartItem: CartItem) => void;
}

export const ItemModal: React.FC<ItemModalProps> = ({ item, onClose, onAddToCart }) => {
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedSize, setSelectedSize] = useState<SizeOption | undefined>(
    item?.sizes && item.sizes.length > 0 ? item.sizes[0] : undefined
  );
  const [selectedOption, setSelectedOption] = useState<string | undefined>(
    item?.options && item.options.length > 0 ? item.options[0] : undefined
  );
  const [selectedExtras, setSelectedExtras] = useState<ExtraOption[]>([]);
  const [makeCombo, setMakeCombo] = useState<boolean>(false);
  const [specialInstructions, setSpecialInstructions] = useState<string>('');

  useEffect(() => {
    if (item) {
      setSelectedSize(item.sizes && item.sizes.length > 0 ? item.sizes[0] : undefined);
      setSelectedOption(item.options && item.options.length > 0 ? item.options[0] : undefined);
      setSelectedExtras([]);
      setMakeCombo(false);
      setSpecialInstructions('');
      setQuantity(1);
    }
  }, [item]);

  if (!item) return null;

  const toggleExtra = (extra: ExtraOption) => {
    if (selectedExtras.some((e) => e.id === extra.id)) {
      setSelectedExtras(selectedExtras.filter((e) => e.id !== extra.id));
    } else {
      setSelectedExtras([...selectedExtras, extra]);
    }
  };

  // Calculate unit price
  let unitPrice = selectedSize ? selectedSize.price : item.price;
  selectedExtras.forEach((e) => (unitPrice += e.price));

  // Add combo price if toggled
  if (makeCombo && item.isComboAvailable && item.comboPrice) {
    unitPrice += item.comboPrice;
  }

  // Handle special options price adjustment (e.g. Arrachera extra in chilaquiles)
  if (selectedOption && selectedOption.includes('+$10')) {
    unitPrice += 10;
  }

  const totalPrice = unitPrice * quantity;

  const handleAdd = () => {
    const cartItem: CartItem = {
      cartId: `${item.id}-${Date.now()}`,
      item,
      quantity,
      selectedSize,
      selectedOption: selectedOption
        ? makeCombo
          ? `${selectedOption} (En Paquete Combo)`
          : selectedOption
        : makeCombo
        ? 'En Paquete Combo'
        : undefined,
      selectedExtras,
      specialInstructions: specialInstructions.trim() || undefined,
      unitPrice,
      totalPrice,
    };
    onAddToCart(cartItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-stone-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="relative bg-[#162e1e] text-stone-50 p-5 flex items-start justify-between border-b border-[#2d563c]">
          <div>
            <span className="text-[10px] uppercase font-black tracking-widest text-[#d1a85b] bg-[#1f402c] px-2.5 py-0.5 rounded-full border border-[#b48a44]/40">
              Personaliza tu orden
            </span>
            <h2 className="text-xl sm:text-2xl font-black font-serif text-stone-100 mt-1">
              {item.name}
            </h2>
            <p className="text-xs text-stone-300 mt-0.5">{item.description}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-[#1f402c] hover:bg-[#285037] text-[#d1a85b] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Customization Content */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Sizes Selection if available */}
          {item.sizes && item.sizes.length > 0 && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-2">
                Selecciona el Tamaño
              </label>
              <div className="grid grid-cols-3 gap-2">
                {item.sizes.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => setSelectedSize(s)}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all text-center flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                      selectedSize?.name === s.name
                        ? 'bg-[#162e1e] text-[#fcfaf6] border-[#162e1e] shadow-sm'
                        : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span>{s.name}</span>
                    <span className="text-[11px] opacity-90">${s.price}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Option Choices if available */}
          {item.options && item.options.length > 0 && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-2">
                Elige tu Sabor / Guisado / Opción
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 border border-stone-100 rounded-xl">
                {item.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSelectedOption(opt)}
                    className={`p-2.5 rounded-xl border text-xs font-semibold text-left flex items-center justify-between transition-all cursor-pointer ${
                      selectedOption === opt
                        ? 'bg-emerald-50 border-[#162e1e] text-[#162e1e] font-bold'
                        : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span>{opt}</span>
                    {selectedOption === opt && <Check className="w-4 h-4 text-[#162e1e] shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Extras checklist if available */}
          {item.extras && item.extras.length > 0 && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-2">
                Agrega Extras Deliciosos
              </label>
              <div className="space-y-2">
                {item.extras.map((extra) => {
                  const isChecked = selectedExtras.some((e) => e.id === extra.id);
                  return (
                    <button
                      key={extra.id}
                      type="button"
                      onClick={() => toggleExtra(extra)}
                      className={`w-full p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                        isChecked
                          ? 'bg-emerald-50 border-[#162e1e] text-[#162e1e]'
                          : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                            isChecked ? 'bg-[#162e1e] border-[#162e1e] text-[#d1a85b]' : 'border-stone-400 bg-white'
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3" />}
                        </div>
                        <span>{extra.name}</span>
                      </div>
                      <span className="font-bold text-[#162e1e]">+${extra.price}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Combo / Paquete Upgrade */}
          {item.isComboAvailable && item.comboPrice && (
            <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#162e1e] text-[#d1a85b] rounded-xl">
                  <PackageCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#162e1e]">
                    ¡Hazlo Paquete Especial!
                  </h4>
                  <p className="text-[11px] text-stone-600">
                    {item.category === 'desayunos'
                      ? 'Incluye Jugo/Fruta + Café de Olla o Té (+ $20)'
                      : item.category === 'hamburguesas'
                      ? 'Incluye Papas a la Francesa y Refresco (+ $35)'
                      : 'Incluye complemento y bebida'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMakeCombo(!makeCombo)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  makeCombo
                    ? 'bg-[#162e1e] text-[#fcfaf6] shadow-sm'
                    : 'bg-white text-[#162e1e] border border-stone-300 hover:bg-emerald-100'
                }`}
              >
                {makeCombo ? '✓ Agregado' : `+ $${item.comboPrice}`}
              </button>
            </div>
          )}

          {/* Special Instructions */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1 flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5 text-[#162e1e]" />
              Instrucciones Especiales (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ej: Sin cebolla, extra salsa verde, con poca sal..."
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#162e1e] text-stone-800"
            />
          </div>
        </div>

        {/* Footer with Quantity & Price */}
        <div className="bg-[#fcfaf6] p-4 border-t border-stone-200 flex items-center justify-between gap-4">
          <div className="flex items-center border border-stone-300 rounded-xl bg-white p-1">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="p-1.5 text-stone-600 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-8 text-center font-black text-sm text-stone-900">{quantity}</span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="p-1.5 text-stone-600 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleAdd}
            className="flex-1 py-3 px-4 bg-[#162e1e] hover:bg-[#20402b] text-[#fcfaf6] rounded-xl font-bold text-sm shadow-md transition-all active:scale-98 flex items-center justify-between cursor-pointer border border-[#b48a44]/30"
          >
            <span>Agregar a mi orden</span>
            <span className="font-black text-base font-serif text-[#d1a85b]">${totalPrice}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
