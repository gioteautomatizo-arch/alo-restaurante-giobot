import React, { useState, useEffect } from 'react';
import { VipProfile, OrderType } from '../types';
import { saveVipProfile, clearVipProfile } from '../lib/vipStorage';
import { X, Award, Utensils, Check, Star, User, Sparkles, Edit3, Trash2, ShieldCheck, Gift } from 'lucide-react';
import { Logo } from './Logo';

interface VipCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCart: () => void;
  vipProfile: VipProfile | null;
  onProfileUpdated: () => void;
}

export const VipCardModal: React.FC<VipCardModalProps> = ({
  isOpen,
  onClose,
  onOpenCart,
  vipProfile,
  onProfileUpdated,
}) => {
  const [isEditing, setIsEditing] = useState<boolean>(!vipProfile);
  const [customerName, setCustomerName] = useState<string>(vipProfile?.customerName || '');
  const [phone, setPhone] = useState<string>(vipProfile?.phone || '');
  const [address, setAddress] = useState<string>(vipProfile?.address || '');
  const [reference, setReference] = useState<string>(vipProfile?.reference || '');
  const [preferredPayment, setPreferredPayment] = useState<'efectivo' | 'transferencia' | 'tarjeta'>(
    vipProfile?.preferredPayment || 'efectivo'
  );
  const [preferredOrderType, setPreferredOrderType] = useState<OrderType>(
    vipProfile?.preferredOrderType || 'pickup'
  );

  useEffect(() => {
    if (vipProfile) {
      setCustomerName(vipProfile.customerName);
      setPhone(vipProfile.phone);
      setAddress(vipProfile.address || '');
      setReference(vipProfile.reference || '');
      setPreferredPayment(vipProfile.preferredPayment || 'efectivo');
      setPreferredOrderType(vipProfile.preferredOrderType || 'pickup');
    } else {
      setIsEditing(true);
    }
  }, [vipProfile]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !phone.trim()) return;

    saveVipProfile({
      customerName,
      phone,
      address,
      reference,
      preferredPayment,
      preferredOrderType,
    });

    onProfileUpdated();
    setIsEditing(false);
  };

  const handleClear = () => {
    if (window.confirm('¿Seguro que deseas eliminar tus datos Aló! VIP guardados?')) {
      clearVipProfile();
      onProfileUpdated();
      setIsEditing(true);
    }
  };

  const currentStamps = vipProfile?.stamps || 0;
  const isRewardReady = vipProfile?.rewardAvailable || false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-xs animate-fade-in">
      <div className="bg-[#122418] text-stone-100 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-[#b48a44]/40 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#162e1e] via-[#1f402c] to-[#162e1e] p-5 flex items-center justify-between border-b border-[#2d563c]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#d1a85b] to-[#b48a44] text-[#162e1e] font-black text-xl flex items-center justify-center shadow-md">
              ⭐
            </div>
            <div>
              <h2 className="text-xl font-black font-serif text-stone-100 flex items-center gap-1.5">
                Tarjeta Aló! VIP
              </h2>
              <p className="text-xs text-emerald-200/90">
                Tus datos guardados + Beneficios exclusivos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-[#162e1e] hover:bg-[#20402b] text-[#d1a85b] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* DIGITAL VIP CARD VISUAL */}
          <div className="relative bg-gradient-to-br from-[#1b3824] via-[#244b31] to-[#122618] rounded-2xl p-5 border-2 border-[#b48a44] shadow-2xl overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-[#d1a85b]/15 rounded-full blur-xl pointer-events-none" />
            
            <div className="flex items-start justify-between relative z-10">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest bg-[#d1a85b] text-[#162e1e] px-2.5 py-0.5 rounded-full shadow-xs">
                  SOCIO VIP PREMIER
                </span>
                <div className="mt-2 bg-[#fcfaf6] px-2.5 py-1 rounded-xl inline-block shadow-md border border-[#b48a44]/30">
                  <Logo size="sm" variant="full" />
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-[#d1a85b] font-mono block">ID MIEMBRO</span>
                <span className="text-sm font-black font-mono text-stone-100 tracking-wider">
                  {vipProfile?.memberId || 'ALÓ-VIP-NUEVO'}
                </span>
              </div>
            </div>

            {/* Member Info */}
            <div className="mt-4 pt-3 border-t border-[#2d563c] flex items-center justify-between text-xs text-stone-100">
              <div>
                <span className="text-[10px] text-[#d1a85b] block">TITULAR</span>
                <strong className="text-sm text-white">{vipProfile?.customerName || 'Ingresa tus datos'}</strong>
              </div>
              {vipProfile?.phone && (
                <div className="text-right">
                  <span className="text-[10px] text-[#d1a85b] block">TELÉFONO</span>
                  <span className="font-semibold text-stone-200">{vipProfile.phone}</span>
                </div>
              )}
            </div>

            {/* STAMPS GRID */}
            <div className="mt-4 pt-3 border-t border-[#2d563c]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#d1a85b] flex items-center gap-1">
                  <Award className="w-3.5 h-3.5 text-[#d1a85b]" /> Sellos Acumulados (5 = 1 Gratis)
                </span>
                <span className="text-xs font-black text-stone-200">
                  {isRewardReady ? '¡1 RECOMPENSA LISTA!' : `${currentStamps} / 5`}
                </span>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((slot) => {
                  const isFilled = slot <= currentStamps;
                  const isLastSlot = slot === 5;
                  return (
                    <div
                      key={slot}
                      className={`h-12 rounded-xl flex flex-col items-center justify-center border transition-all ${
                        isFilled
                          ? 'bg-gradient-to-tr from-[#d1a85b] to-[#b48a44] border-[#e0bc74] text-[#162e1e] font-black shadow-md scale-102'
                          : isRewardReady && isLastSlot
                          ? 'bg-emerald-500 border-emerald-300 text-white animate-bounce'
                          : 'bg-[#14281b] border-[#2d563c] text-[#d1a85b]/40'
                      }`}
                    >
                      {isFilled ? (
                        <Utensils className="w-5 h-5 text-[#162e1e]" />
                      ) : isLastSlot ? (
                        <Gift className="w-5 h-5 text-[#d1a85b]" />
                      ) : (
                        <span className="text-xs font-bold font-mono">{slot}</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {isRewardReady ? (
                <div className="mt-3 bg-emerald-500/20 border border-emerald-400/50 p-2.5 rounded-xl text-center text-xs font-bold text-emerald-300 flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400 animate-spin" />
                  <span>¡Felicidades! Tienes una Bebida o Postre GRATIS en tu próximo pedido.</span>
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-stone-300 text-center font-medium">
                  {currentStamps === 0
                    ? '¡Haz tu primer pedido registrado para acumular tu 1er sello en ¡Aló! Restaurante!'
                    : `Te faltan solo ${5 - currentStamps} pedido(s) para ganar tu bebida o postre gratis.`}
                </p>
              )}
            </div>
          </div>

          {/* BENEFIT EXPLANATION BANNER */}
          <div className="bg-[#162e1e] border border-[#2d563c] rounded-2xl p-3.5 text-xs text-stone-300 space-y-1.5">
            <h4 className="font-bold text-[#d1a85b] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#d1a85b]" />
              ¿Cómo funciona Aló! VIP?
            </h4>
            <p className="text-[11px] text-stone-300 leading-relaxed">
              1. <strong>Cero Formularios Repetidos:</strong> Guardamos tus datos en tu navegador para que nunca tengas que volver a escribirlos al pedir.
              <br />
              2. <strong>Sellos Automáticos:</strong> Por cada compra en ¡Aló! Restaurante acumulas 1 sello automáticamente.
              <br />
              3. <strong>Premios Gratis:</strong> Al acumular 5 sellos, tu siguiente café o postre del día es gratis.
            </p>
          </div>

          {/* SAVED PROFILE / EDIT FORM */}
          {vipProfile && !isEditing ? (
            <div className="bg-[#162e1e]/90 border border-[#2d563c] rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#d1a85b] flex items-center gap-1.5">
                  <User className="w-4 h-4 text-[#d1a85b]" /> Datos Guardados del Cliente
                </h4>
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-xs text-[#d1a85b] hover:text-white font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Editar Datos
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-stone-300">
                <div className="bg-[#122418] p-2.5 rounded-xl border border-[#2d563c]">
                  <span className="text-[10px] text-stone-400 block font-bold">NOMBRE</span>
                  <strong className="text-stone-100">{vipProfile.customerName}</strong>
                </div>

                <div className="bg-[#122418] p-2.5 rounded-xl border border-[#2d563c]">
                  <span className="text-[10px] text-stone-400 block font-bold">TELÉFONO</span>
                  <strong className="text-stone-100">{vipProfile.phone}</strong>
                </div>

                {vipProfile.address && (
                  <div className="bg-[#122418] p-2.5 rounded-xl border border-[#2d563c] sm:col-span-2">
                    <span className="text-[10px] text-stone-400 block font-bold">DIRECCIÓN DE ENTREGA</span>
                    <strong className="text-stone-100">{vipProfile.address}</strong>
                    {vipProfile.reference && (
                      <span className="text-[11px] text-[#d1a85b] block italic">
                        Ref: {vipProfile.reference}
                      </span>
                    )}
                  </div>
                )}

                <div className="bg-[#122418] p-2.5 rounded-xl border border-[#2d563c]">
                  <span className="text-[10px] text-stone-400 block font-bold">PAGO PREFERIDO</span>
                  <strong className="text-stone-100 uppercase">{vipProfile.preferredPayment}</strong>
                </div>

                <div className="bg-[#122418] p-2.5 rounded-xl border border-[#2d563c]">
                  <span className="text-[10px] text-stone-400 block font-bold">MODALIDAD PREFERIDA</span>
                  <strong className="text-stone-100">
                    {vipProfile.preferredOrderType === 'dine_in'
                      ? 'Restaurante'
                      : vipProfile.preferredOrderType === 'delivery'
                      ? 'Domicilio'
                      : 'Recoger'}
                  </strong>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-[#2d563c] text-[11px] text-stone-400">
                <span>Total de pedidos en ¡Aló!: <strong>{vipProfile.totalOrders}</strong></span>
                <button
                  onClick={handleClear}
                  className="text-red-400 hover:text-red-300 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Borrar tarjeta
                </button>
              </div>
            </div>
          ) : (
            /* EDIT / REGISTRATION FORM */
            <form onSubmit={handleSave} className="bg-[#162e1e]/90 border border-[#2d563c] rounded-2xl p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#d1a85b] flex items-center gap-1.5">
                <Star className="w-4 h-4 text-[#d1a85b]" />
                {vipProfile ? 'Actualizar mis datos VIP' : 'Registrarme en Aló! VIP'}
              </h4>

              <div>
                <label className="block text-[11px] font-bold text-stone-200 mb-1">
                  Tu Nombre completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: María González"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#122418] border border-[#2d563c] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-[#d1a85b]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-200 mb-1">
                  Teléfono de WhatsApp / Contacto *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="Ej: 55 1234 5678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#122418] border border-[#2d563c] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-[#d1a85b]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-200 mb-1">
                  Dirección predeterminada (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Calle, número exterior/interior, colonia"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#122418] border border-[#2d563c] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-[#d1a85b]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-200 mb-1">
                  Referencia o entre calles
                </label>
                <input
                  type="text"
                  placeholder="Ej: Portón blanco frente al parque"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#122418] border border-[#2d563c] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-[#d1a85b]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-stone-200 mb-1">
                    Método de Pago Favorito
                  </label>
                  <select
                    value={preferredPayment}
                    onChange={(e) => setPreferredPayment(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-[#122418] border border-[#2d563c] rounded-xl text-stone-100 focus:outline-none focus:ring-2 focus:ring-[#d1a85b]"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="transferencia">Transferencia</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-200 mb-1">
                    Modalidad Favorita
                  </label>
                  <select
                    value={preferredOrderType}
                    onChange={(e) => setPreferredOrderType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-[#122418] border border-[#2d563c] rounded-xl text-stone-100 focus:outline-none focus:ring-2 focus:ring-[#d1a85b]"
                  >
                    <option value="pickup">Recoger</option>
                    <option value="dine_in">Restaurante</option>
                    <option value="delivery">Domicilio</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                {vipProfile && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 text-xs font-bold text-stone-400 hover:text-white cursor-pointer"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-[#d1a85b] to-[#b48a44] hover:from-[#e0bc74] hover:to-[#c59a50] text-[#162e1e] font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Guardar Mi Tarjeta Aló! VIP</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-[#0e1d13] p-4 border-t border-[#2d563c] flex items-center justify-between gap-3">
          <span className="text-[11px] text-[#d1a85b]/90">
            {vipProfile ? '✓ Datos vinculados en este dispositivo' : 'Aún no has guardado tus datos'}
          </span>
          <button
            onClick={() => {
              onClose();
              onOpenCart();
            }}
            className="py-2.5 px-4 bg-[#1f402c] hover:bg-[#285037] text-stone-100 rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer border border-[#b48a44]/40"
          >
            <Utensils className="w-4 h-4 text-[#d1a85b]" />
            <span>Ver mi Pedido / Comprar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
