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
  const [selectedSauce, setSelectedSauce] = useState<'Verde' | 'Roja' | undefined>(undefined);
  const [selectedExtras, setSelectedExtras] = useState<ExtraOption[]>([]);
  const [makeCombo, setMakeCombo] = useState<boolean>(false);
  const [specialInstructions, setSpecialInstructions] = useState<string>('');

  useEffect(() => {
    if (item) {
      setSelectedSize(item.sizes && item.sizes.length > 0 ? item.sizes[0] : undefined);
      setSelectedOption(item.options && item.options.length > 0 ? item.options[0] : undefined);
      setSelectedSauce(undefined);
      setSelectedExtras([]);
      setMakeCombo(false);
      setSpecialInstructions('');
      setQuantity(1);
    }
  }, [item]);

  if (!item) return null;

  const isChilaquiles = item.id === 'chilaquiles';

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
    if (isChilaquiles && !selectedSauce) return;

    const optionForCart = isChilaquiles
      ? `Salsa: ${selectedSauce} · Preparación: ${selectedOption || 'Sin especificar'}`
      : selectedOption
      ? makeCombo
        ? `${selectedOption} (En Paquete Combo)`
        : selectedOption
      : makeCombo
      ? 'En Paquete Combo'
      : undefined;

    const cartItem: CartItem = {
      cartId: `${item.id}-${Date.now()}`,
      item,
      quantity,
      selectedSize,
      selectedOption: optionForCart,
      selectedExtras,
      specialInstructions: specialInstructions.trim() || undefined,
      unitPrice,
      totalPrice,
    };
    onAddToCart(cartItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2B1B13]/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-[#FFFDF9] w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-[#DEC8AE] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="relative bg-[#3A2418] text-[#FFF7EA] p-5 flex items-start justify-between border-b border-[#4E3222]">
          <div>
            <span className="text-[10px] uppercase font-black tracking-widest text-[#C9974D] bg-[#4A2E1F] px-2.5 py-0.5 rounded-full border border-[#C9974D]/40">
              Personaliza tu orden
            </span>
            <h2 className="text-xl sm:text-2xl font-black font-serif text-[#FFF7EA] mt-1">
              {item.name}
            </h2>
            <p className="text-xs text-[#EAD9C4] mt-0.5">{item.description}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-[#4A2E1F] hover:bg-[#5C3825] text-[#C9974D] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Customization Content */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Sizes Selection if available */}
          {item.sizes && item.sizes.length > 0 && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#6B4028] mb-2 font-serif">
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
                        ? 'bg-[#3A2418] text-[#FFF7EA] border-[#3A2418] shadow-sm'
                        : 'bg-[#FFF7EA] border-[#DEC8AE] text-[#6B4028] hover:bg-[#F4E3C8]'
                    }`}
                  >
                    <span>{s.name}</span>
                    <span className="text-[11px] opacity-90">${s.price}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {isChilaquiles && (
            <div>
              <label className="block text-sm font-black uppercase tracking-wider text-[#3A2418] mb-2 font-serif">
                1. Elige la salsa *
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSauce('Verde')}
                  className={`py-3 px-3 rounded-xl border text-sm font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    selectedSauce === 'Verde'
                      ? 'bg-emerald-700 text-white border-emerald-800 shadow-sm'
                      : 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100'
                  }`}
                >
                  <span aria-hidden="true">🟢</span>
                  <span>VERDE</span>
                  {selectedSauce === 'Verde' && <Check className="w-4 h-4 shrink-0" />}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSauce('Roja')}
                  className={`py-3 px-3 rounded-xl border text-sm font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    selectedSauce === 'Roja'
                      ? 'bg-rose-700 text-white border-rose-800 shadow-sm'
                      : 'bg-rose-50 border-rose-300 text-rose-900 hover:bg-rose-100'
                  }`}
                >
                  <span aria-hidden="true">🔴</span>
                  <span>ROJA</span>
                  {selectedSauce === 'Roja' && <Check className="w-4 h-4 shrink-0" />}
                </button>
              </div>
              {!selectedSauce && (
                <p className="text-[11px] font-bold text-rose-700 mt-2">Selecciona Verde o Roja para continuar.</p>
              )}
            </div>
          )}

          {/* Option Choices if available */}
          {item.options && item.options.length > 0 && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#6B4028] mb-2 font-serif">
                {isChilaquiles ? '2. Elige la preparación' : 'Elige tu Sabor / Guisado / Opción'}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 border border-[#DEC8AE] rounded-xl bg-[#FFF7EA]/30">
                {item.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSelectedOption(opt)}
                    className={`p-2.5 rounded-xl border text-xs font-semibold text-left flex items-center justify-between transition-all cursor-pointer ${
                      selectedOption === opt
                        ? 'bg-[#F4E3C8]/70 border-[#A86B3D] text-[#3A2418] font-bold'
                        : 'bg-[#FFF7EA] border-[#DEC8AE] text-[#6B4028] hover:bg-[#F4E3C8]'
                    }`}
                  >
                    <span>{opt}</span>
                    {selectedOption === opt && <Check className="w-4 h-4 text-[#A86B3D] shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Extras checklist if available */}
          {item.extras && item.extras.length > 0 && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#6B4028] mb-2 font-serif">
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
                          ? 'bg-[#F4E3C8]/70 border-[#A86B3D] text-[#3A2418]'
                          : 'bg-[#FFF7EA] border-[#DEC8AE] text-[#6B4028] hover:bg-[#F4E3C8]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                            isChecked ? 'bg-[#3A2418] border-[#3A2418] text-[#C9974D]' : 'border-[#DEC8AE] bg-white'
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3" />}
                        </div>
                        <span>{extra.name}</span>
                      </div>
                      <span className="font-bold text-[#A86B3D]">+${extra.price}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Combo / Paquete Upgrade */}
          {item.isComboAvailable && item.comboPrice && (
            <div className="bg-[#F4E3C8]/50 border border-[#DEC8AE] rounded-2xl p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#3A2418] text-[#C9974D] rounded-xl">
                  <PackageCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#3A2418] font-serif">
                    ¡Hazlo Paquete Especial!
                  </h4>
                  <p className="text-[11px] text-[#6B4028]">
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
                    ? 'bg-[#3A2418] text-[#FFF7EA] shadow-sm'
                    : 'bg-[#FFFDF9] text-[#3A2418] border border-[#DEC8AE] hover:bg-[#F4E3C8]'
                }`}
              >
                {makeCombo ? '✓ Agregado' : `+ $${item.comboPrice}`}
              </button>
            </div>
          )}

          {/* Special Instructions */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#6B4028] mb-1 flex items-center gap-1 font-serif">
              <MessageSquare className="w-3.5 h-3.5 text-[#A86B3D]" />
              Instrucciones Especiales (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ej: Sin cebolla, poca crema, sin queso, frijoles aparte..."
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#FFF7EA] border border-[#DEC8AE] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#A86B3D] text-[#2B1B13]"
            />
          </div>
        </div>

        {/* Footer with Quantity & Price */}
        <div className="bg-[#FFF7EA] p-4 border-t border-[#DEC8AE] flex items-center justify-between gap-4">
          <div className="flex items-center border border-[#DEC8AE] rounded-xl bg-[#FFFDF9] p-1">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="p-1.5 text-[#6B4028] hover:bg-[#F4E3C8] rounded-lg transition-colors cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-8 text-center font-black text-sm text-[#2B1B13]">{quantity}</span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="p-1.5 text-[#6B4028] hover:bg-[#F4E3C8] rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleAdd}
            disabled={isChilaquiles && !selectedSauce}
            className="flex-1 py-3 px-4 bg-[#3A2418] hover:bg-[#4A2E1F] text-[#FFF7EA] rounded-xl font-bold text-sm shadow-md transition-all active:scale-98 flex items-center justify-between cursor-pointer border border-[#C9974D]/30 disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <span>{isChilaquiles && !selectedSauce ? 'Elige salsa para continuar' : 'Agregar a mi orden'}</span>
            <span className="font-black text-base font-serif text-[#C9974D]">${totalPrice}</span>
          </button>
        </div>
      </div>
    </div>
  );
};