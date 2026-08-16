import React, { useState, useEffect } from 'react';
import { CartItem, OrderType, VipProfile } from '../types';
import { getVipProfile, addStampToVip, redeemVipReward } from '../lib/vipStorage';
import { X, Trash2, Plus, Minus, ShoppingBag, Leaf, CheckCircle2, MapPin, Phone, User, CreditCard, Send, Star, Gift, Copy, Check, MessageSquare, Printer, ArrowRight } from 'lucide-react';
import { Logo } from './Logo';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onUpdateQuantity: (cartId: string, newQty: number) => void;
  onRemoveItem: (cartId: string) => void;
  onClearCart: () => void;
  bringOwnContainer: boolean;
  setBringOwnContainer: (value: boolean) => void;
  onOpenVipModal: () => void;
}

const RESTAURANT_PHONE = '525574411437'; // 55 7441 1437
const RESTAURANT_ADDRESS = 'Calle la Fama 12, 14260 Tlalpan CDMX, México';

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  bringOwnContainer,
  setBringOwnContainer,
  onOpenVipModal,
}) => {
  const [orderType, setOrderType] = useState<OrderType>('delivery');
  const [customerName, setCustomerName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [reference, setReference] = useState<string>('');
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'transferencia' | 'tarjeta'>('efectivo');
  const [orderConfirmed, setOrderConfirmed] = useState<boolean>(false);
  const [orderCode, setOrderCode] = useState<string>('');
  const [vipProfile, setVipProfile] = useState<VipProfile | null>(null);
  const [redeemingReward, setRedeemingReward] = useState<boolean>(false);
  const [updatedVipResult, setUpdatedVipResult] = useState<VipProfile | null>(null);
  const [copiedTicket, setCopiedTicket] = useState<boolean>(false);
  const [ticketText, setTicketText] = useState<string>('');
  const [orderDate, setOrderDate] = useState<string>('');

  // Auto-fill from VIP Profile when drawer opens
  useEffect(() => {
    if (isOpen) {
      const profile = getVipProfile();
      setVipProfile(profile);

      if (profile) {
        if (!customerName) setCustomerName(profile.customerName);
        if (!phone) setPhone(profile.phone);
        if (!address && profile.address) setAddress(profile.address);
        if (!reference && profile.reference) setReference(profile.reference);
        if (profile.preferredPayment) setPaymentMethod(profile.preferredPayment);
        if (profile.preferredOrderType) setOrderType(profile.preferredOrderType);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Subtotal
  const rawSubtotal = cartItems.reduce((acc, item) => acc + item.totalPrice, 0);

  // 10% discount for eco-friendly container
  const discountAmount = bringOwnContainer ? Math.round(rawSubtotal * 0.1) : 0;

  // Delivery fee if delivery
  const deliveryFee = orderType === 'delivery' ? 25 : 0;

  const total = Math.max(0, rawSubtotal - discountAmount + deliveryFee);

  const formatTicketMessage = (code: string, dateStr: string, currentVipStamps: number) => {
    const modalityName =
      orderType === 'delivery'
        ? '🚚 ENTREGA A DOMICILIO (+$25)'
        : orderType === 'pickup'
        ? '🛍️ ANTICIPAR ORDEN / PARA LLEVAR'
        : '🍽️ CONSUMO EN SUCURSAL';

    let itemsList = '';
    cartItems.forEach((cartItem, idx) => {
      itemsList += `\n*${cartItem.quantity}x ${cartItem.item.name}* — $${cartItem.totalPrice} MXN`;
      if (cartItem.selectedSize) {
        itemsList += `\n  ▫️ Tamaño: ${cartItem.selectedSize.name} ($${cartItem.selectedSize.price})`;
      }
      if (cartItem.selectedOption) {
        itemsList += `\n  ▫️ Elección: ${cartItem.selectedOption}`;
      }
      if (cartItem.selectedExtras && cartItem.selectedExtras.length > 0) {
        itemsList += `\n  ▫️ Extras: ${cartItem.selectedExtras.map((e) => `${e.name} (+$${e.price})`).join(', ')}`;
      }
      if (cartItem.customComidaCorrida) {
        itemsList += `\n  ▫️ 1er Tiempo: ${cartItem.customComidaCorrida.primerTiempo}`;
        itemsList += `\n  ▫️ 2do Tiempo: ${cartItem.customComidaCorrida.segundoTiempo} ${cartItem.customComidaCorrida.extraAgrega ? `(${cartItem.customComidaCorrida.extraAgrega})` : ''}`;
        itemsList += `\n  ▫️ 3er Tiempo: ${cartItem.customComidaCorrida.tercerTiempo}`;
      }
      if (cartItem.customSalad) {
        itemsList += `\n  ▫️ Proteína: ${cartItem.customSalad.proteina}`;
        itemsList += `\n  ▫️ Fruta: ${cartItem.customSalad.fruta}`;
        itemsList += `\n  ▫️ Topping: ${cartItem.customSalad.topping}`;
        itemsList += `\n  ▫️ Aderezo: ${cartItem.customSalad.aderezo}`;
      }
      if (cartItem.specialInstructions) {
        itemsList += `\n  ▫️ Nota: "${cartItem.specialInstructions}"`;
      }
      itemsList += '\n';
    });

    let msg = `🧾 *TICKET DE COMPRA | ¡ALÓ! RESTAURANTE*\n`;
    msg += `═══════════════════════════════\n`;
    msg += `📍 *Sucursal:* ${RESTAURANT_ADDRESS}\n`;
    msg += `📞 *WhatsApp:* 55 7441 1437\n`;
    msg += `═══════════════════════════════\n`;
    msg += `🎫 *FOLIO:* #${code}\n`;
    msg += `📅 *FECHA Y HORA:* ${dateStr}\n`;
    msg += `👤 *CLIENTE:* ${customerName.trim()}\n`;
    if (phone.trim()) msg += `📱 *TELÉFONO:* ${phone.trim()}\n`;
    msg += `🛎️ *TIPO DE SERVICIO:* ${modalityName}\n`;

    if (orderType === 'delivery') {
      msg += `📍 *DIRECCIÓN DE ENTREGA:* ${address.trim()}\n`;
      if (reference.trim()) {
        msg += `🏢 *REFERENCIAS:* ${reference.trim()}\n`;
      }
    }

    if (orderNotes.trim()) {
      msg += `📝 *INSTRUCCIONES ADICIONALES:* ${orderNotes.trim()}\n`;
    }

    msg += `═══════════════════════════════\n`;
    msg += `📋 *DESGLOSE DEL PEDIDO:*${itemsList}\n`;
    msg += `═══════════════════════════════\n`;
    msg += `💵 *Subtotal:* $${rawSubtotal}.00 MXN\n`;

    if (bringOwnContainer && discountAmount > 0) {
      msg += `🌿 *Descuento Ecológico (10% OFF):* -$${discountAmount}.00 MXN\n`;
    }

    if (orderType === 'delivery') {
      msg += `🚚 *Costo de Envío:* +$${deliveryFee}.00 MXN\n`;
    }

    msg += `───────────────────────────────\n`;
    msg += `💰 *TOTAL A PAGAR: $${total}.00 MXN*\n`;
    msg += `═══════════════════════════════\n`;
    msg += `💳 *MÉTODO DE PAGO:* ${paymentMethod.toUpperCase()}\n`;

    if (redeemingReward) {
      msg += `🎁 *RECOMPENSA VIP:* Canje de Café de Olla o Postre gratis aplicado\n`;
    }

    msg += `⭐ *SOCIO ALÓ! VIP:* ${currentVipStamps}/5 Sellos registrados\n`;
    msg += `═══════════════════════════════\n`;
    msg += `_¡Muchas gracias por tu compra! Estamos procesando tu orden. Por favor confírmanos por este medio cuando recibas este ticket._ 🍽️✨`;

    return msg;
  };

  const handleCompleteOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || (orderType === 'delivery' && !address.trim())) return;

    // Award stamp & save/update VIP profile
    const newVip = addStampToVip({
      customerName,
      phone,
      address,
      reference,
      paymentMethod,
      orderType,
    });

    if (redeemingReward) {
      redeemVipReward();
    }

    setUpdatedVipResult(newVip);
    const newCode = `ALO-${Math.floor(1000 + Math.random() * 9000)}`;
    const nowStr = new Date().toLocaleString('es-MX', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
    setOrderDate(nowStr);
    setOrderCode(newCode);

    const generated = formatTicketMessage(newCode, nowStr, newVip.stamps);
    setTicketText(generated);
    setOrderConfirmed(true);

    // Open WhatsApp directly with the formatted professional purchase ticket
    const waUrl = `https://wa.me/${RESTAURANT_PHONE}?text=${encodeURIComponent(generated)}`;
    try {
      window.open(waUrl, '_blank');
    } catch {
      // ignore popup blocker if any, user can still click the button
    }
  };

  const handleCopyTicket = () => {
    navigator.clipboard.writeText(ticketText);
    setCopiedTicket(true);
    setTimeout(() => setCopiedTicket(false), 2500);
  };

  const handleSendToWhatsApp = () => {
    const waUrl = `https://wa.me/${RESTAURANT_PHONE}?text=${encodeURIComponent(ticketText)}`;
    window.open(waUrl, '_blank');
  };

  const handleResetAndClose = () => {
    onClearCart();
    setOrderConfirmed(false);
    onClose();
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] bg-white shadow-2xl border-l border-stone-200 flex flex-col animate-slide-left">
      {/* Header */}
      <div className="bg-[#162e1e] text-stone-100 p-4 flex items-center justify-between border-b border-[#2d563c]">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-[#d1a85b]" />
          <h2 className="font-bold text-base text-stone-100 font-serif">
            {orderConfirmed ? 'Ticket de Compra Digital' : 'Tu Pedido en ¡Aló! Restaurante'}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-xl bg-[#1f402c] hover:bg-[#285037] text-[#d1a85b] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {orderConfirmed ? (
        /* Order Confirmed Screen with Professional Thermal Ticket */
        <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-4 bg-[#f4f2ea]">
          <div className="text-center space-y-1">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-100 text-emerald-800 rounded-full mb-1 shadow-xs">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-black text-[#162e1e] font-serif">
              ¡Pedido Registrado con Éxito!
            </h3>
            <p className="text-xs text-stone-600">
              Se ha generado el <strong>Ticket Oficial de Compra</strong> para enviar por WhatsApp al negocio.
            </p>
          </div>

          {/* Action WhatsApp Button - Highlighted */}
          <button
            type="button"
            onClick={handleSendToWhatsApp}
            className="w-full py-3.5 px-4 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-2xl font-bold text-sm shadow-lg flex items-center justify-center gap-2.5 transition-all transform hover:scale-101 active:scale-98 cursor-pointer border border-emerald-600"
          >
            <MessageSquare className="w-5 h-5 fill-white text-[#25D366]" />
            <span>Enviar Ticket por WhatsApp al Negocio</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {/* Professional Digital Purchase Ticket */}
          <div className="bg-white rounded-2xl border-2 border-stone-300 shadow-md overflow-hidden font-mono text-xs text-stone-800 relative">
            {/* Ticket Header */}
            <div className="p-4 bg-[#fcfaf6] border-b border-dashed border-stone-300 text-center space-y-1">
              <div className="flex justify-center mb-1">
                <Logo variant="compact" size="sm" />
              </div>
              <h4 className="font-black text-sm text-[#162e1e] tracking-tight">¡ALÓ! RESTAURANTE</h4>
              <p className="text-[10px] text-stone-500">{RESTAURANT_ADDRESS}</p>
              <p className="text-[10px] text-stone-600 font-bold">WhatsApp Pedidos: 55 7441 1437</p>
              
              <div className="pt-2 flex items-center justify-between text-[11px] font-bold text-stone-700 border-t border-stone-200 mt-2">
                <span>FOLIO: #{orderCode}</span>
                <span>{orderDate}</span>
              </div>
            </div>

            {/* Client & Service Information */}
            <div className="p-3.5 bg-white border-b border-dashed border-stone-300 space-y-1 text-[11px]">
              <p><span className="text-stone-500 font-bold">CLIENTE:</span> <strong>{customerName}</strong></p>
              {phone && <p><span className="text-stone-500 font-bold">TELÉFONO:</span> {phone}</p>}
              <p>
                <span className="text-stone-500 font-bold">SERVICIO:</span>{' '}
                <strong className="text-[#162e1e]">
                  {orderType === 'delivery'
                    ? '🚚 Envío a Domicilio'
                    : orderType === 'pickup'
                    ? '🛍️ Anticipar / Para Llevar'
                    : '🍽️ Consumo en Sucursal'}
                </strong>
              </p>
              {orderType === 'delivery' && (
                <>
                  <p><span className="text-stone-500 font-bold">DIRECCIÓN:</span> {address}</p>
                  {reference && <p><span className="text-stone-500 font-bold">REF:</span> {reference}</p>}
                </>
              )}
              {orderNotes && <p><span className="text-stone-500 font-bold">NOTAS:</span> {orderNotes}</p>}
            </div>

            {/* Items List */}
            <div className="p-3.5 space-y-2.5 bg-[#fcfaf6] border-b border-dashed border-stone-300">
              <div className="text-[10px] font-black uppercase tracking-wider text-stone-400 border-b border-stone-200 pb-1 flex justify-between">
                <span>CANT / PLATILLO</span>
                <span>IMPORTE</span>
              </div>

              {cartItems.map((cartItem, idx) => (
                <div key={idx} className="space-y-0.5 text-[11px]">
                  <div className="flex justify-between font-bold text-stone-900">
                    <span>{cartItem.quantity}x {cartItem.item.name}</span>
                    <span>${cartItem.totalPrice}.00</span>
                  </div>

                  {cartItem.selectedSize && (
                    <p className="text-[10px] text-stone-500 pl-3">▪ Tamaño: {cartItem.selectedSize.name}</p>
                  )}
                  {cartItem.selectedOption && (
                    <p className="text-[10px] text-stone-500 pl-3">▪ Opción: {cartItem.selectedOption}</p>
                  )}
                  {cartItem.selectedExtras && cartItem.selectedExtras.length > 0 && (
                    <p className="text-[10px] text-stone-500 pl-3">
                      ▪ Extras: {cartItem.selectedExtras.map((e) => e.name).join(', ')}
                    </p>
                  )}
                  {cartItem.customComidaCorrida && (
                    <div className="text-[10px] text-stone-600 pl-3">
                      <p>▪ Sopa: {cartItem.customComidaCorrida.primerTiempo}</p>
                      <p>▪ Arroz/Pasta: {cartItem.customComidaCorrida.segundoTiempo} {cartItem.customComidaCorrida.extraAgrega ? `(${cartItem.customComidaCorrida.extraAgrega})` : ''}</p>
                      <p>▪ Guisado: {cartItem.customComidaCorrida.tercerTiempo}</p>
                    </div>
                  )}
                  {cartItem.customSalad && (
                    <div className="text-[10px] text-stone-600 pl-3">
                      <p>▪ {cartItem.customSalad.proteina} • {cartItem.customSalad.fruta} • {cartItem.customSalad.topping} • {cartItem.customSalad.aderezo}</p>
                    </div>
                  )}
                  {cartItem.specialInstructions && (
                    <p className="text-[10px] text-stone-500 italic pl-3">▪ "{cartItem.specialInstructions}"</p>
                  )}
                </div>
              ))}
            </div>

            {/* Calculations & Total */}
            <div className="p-3.5 bg-white space-y-1.5 text-[11px] border-b border-dashed border-stone-300">
              <div className="flex justify-between text-stone-600">
                <span>Subtotal platillos:</span>
                <span>${rawSubtotal}.00</span>
              </div>
              {bringOwnContainer && discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>🌿 Descuento Eco (10%):</span>
                  <span>-${discountAmount}.00</span>
                </div>
              )}
              {orderType === 'delivery' && (
                <div className="flex justify-between text-stone-600">
                  <span>🚚 Envío a domicilio:</span>
                  <span>+${deliveryFee}.00</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-[#162e1e] pt-1.5 border-t border-stone-300">
                <span>TOTAL A PAGAR:</span>
                <span className="text-base">${total}.00 MXN</span>
              </div>
              <div className="flex justify-between text-[11px] text-stone-700 pt-1">
                <span>MÉTODO DE PAGO:</span>
                <strong className="uppercase">{paymentMethod}</strong>
              </div>
            </div>

            {/* VIP Status */}
            <div className="p-3 bg-[#162e1e] text-[#fcfaf6] text-center space-y-1">
              <p className="text-[10px] text-[#d1a85b] font-bold flex items-center justify-center gap-1">
                <Star className="w-3.5 h-3.5 fill-[#d1a85b]" />
                TARJETA ALÓ! VIP: {updatedVipResult?.stamps || 1}/5 SELLOS
              </p>
              <p className="text-[9px] text-stone-300">
                ¡Gracias por tu compra! Conserva tu folio #{orderCode}.
              </p>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyTicket}
              className="flex-1 py-2.5 px-3 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 text-stone-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              {copiedTicket ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700">¡Ticket Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-stone-600" />
                  <span>Copiar Ticket</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="py-2.5 px-3 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 text-stone-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Imprimir ticket"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleResetAndClose}
            className="w-full py-3 bg-[#162e1e] hover:bg-[#20402b] text-[#fcfaf6] font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
          >
            Listo / Volver al Menú
          </button>
        </div>
      ) : cartItems.length === 0 ? (
        /* Empty Cart Screen */
        <div className="flex-1 p-8 flex flex-col items-center justify-center text-center space-y-3 text-stone-500">
          <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-[#162e1e] flex items-center justify-center text-3xl">
            🍽️
          </div>
          <h3 className="font-bold text-base text-stone-800">Tu pedido está vacío</h3>
          <p className="text-xs text-stone-500 max-w-xs">
            Explora nuestro menú casero en Tlalpan o habla con <strong>Giobot</strong> para recibir sugerencias a tu medida.
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-[#162e1e] text-stone-100 rounded-xl text-xs font-bold shadow-xs hover:bg-[#20402b] transition-colors cursor-pointer"
          >
            Ver Menú Digital
          </button>
        </div>
      ) : (
        /* Cart List & Checkout Form */
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Restaurant Location Header Banner */}
          <div className="bg-[#f7f5ef] border border-stone-200 p-2.5 rounded-2xl flex items-center gap-2 text-xs text-stone-700">
            <MapPin className="w-4 h-4 text-[#b48a44] shrink-0" />
            <div>
              <span className="font-bold text-[#162e1e]">Sucursal Tlalpan:</span> Calle la Fama 12, CDMX
              <span className="block text-[10px] text-stone-500">WhatsApp: 55 7441 1437 • Sucursal, Domicilio y Anticipar orden</span>
            </div>
          </div>

          {/* VIP AUTO-FILL BANNER */}
          {vipProfile ? (
            <div className="bg-gradient-to-r from-[#162e1e] to-[#1f402c] text-stone-100 p-3 rounded-2xl border border-[#b48a44]/50 shadow-xs flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-[#d1a85b] fill-[#d1a85b] shrink-0" />
                <div>
                  <strong className="block text-stone-50">Socio Aló! VIP: {vipProfile.customerName}</strong>
                  <span className="text-[11px] text-emerald-200">
                    Tus datos fueron cargados automáticamente. Acumularás +1 sello.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenVipModal}
                className="text-[11px] font-bold text-[#d1a85b] hover:text-white underline shrink-0 ml-2 cursor-pointer"
              >
                Mi Tarjeta
              </button>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl text-xs flex items-center justify-between text-[#162e1e]">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-[#b48a44] shrink-0" />
                <span>
                  <strong>Tarjeta Aló! VIP:</strong> Al enviar tu pedido tus datos quedarán guardados para tus próximas compras.
                </span>
              </div>
            </div>
          )}

          {/* Sustainability Promo Banner */}
          <div className={`p-3 rounded-2xl border text-xs flex items-center justify-between gap-2 transition-all ${
            bringOwnContainer ? 'bg-emerald-100 border-emerald-400 text-emerald-950 font-medium' : 'bg-stone-100 border-stone-200 text-stone-700'
          }`}>
            <div className="flex items-center gap-2">
              <Leaf className={`w-4 h-4 ${bringOwnContainer ? 'text-emerald-700' : 'text-stone-500'}`} />
              <div>
                <strong className="block">Descuento Ecológico (10% OFF)</strong>
                <span className="text-[11px] text-stone-600">Llevo mis propios recipientes / termo</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={bringOwnContainer}
              onChange={(e) => setBringOwnContainer(e.target.checked)}
              className="w-5 h-5 accent-emerald-700 rounded-md cursor-pointer"
            />
          </div>

          {/* Cart Item List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-stone-500 font-bold uppercase tracking-wider">
              <span>Platillos seleccionados</span>
              <button
                onClick={onClearCart}
                className="text-[#162e1e] hover:underline text-[11px] font-semibold cursor-pointer"
              >
                Vaciar carrito
              </button>
            </div>

            {cartItems.map((cartItem) => (
              <div
                key={cartItem.cartId}
                className="bg-stone-50 border border-stone-200 rounded-2xl p-3 flex flex-col gap-2 relative shadow-2xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-xs text-stone-900">{cartItem.item.name}</h4>
                    {cartItem.selectedSize && (
                      <span className="text-[10px] text-[#162e1e] font-bold bg-emerald-100 px-1.5 py-0.5 rounded-md mr-1">
                        {cartItem.selectedSize.name}
                      </span>
                    )}
                    {cartItem.selectedOption && (
                      <span className="text-[10px] text-stone-600 block">
                        • {cartItem.selectedOption}
                      </span>
                    )}
                    {cartItem.selectedExtras && cartItem.selectedExtras.length > 0 && (
                      <span className="text-[10px] text-emerald-800 block">
                        • Extras: {cartItem.selectedExtras.map((e) => e.name).join(', ')}
                      </span>
                    )}
                    {cartItem.customComidaCorrida && (
                      <span className="text-[10px] text-stone-600 block">
                        • Sopa: {cartItem.customComidaCorrida.primerTiempo} | Arroz/Pasta: {cartItem.customComidaCorrida.segundoTiempo} | Plato: {cartItem.customComidaCorrida.tercerTiempo}
                      </span>
                    )}
                    {cartItem.customSalad && (
                      <span className="text-[10px] text-stone-600 block">
                        • {cartItem.customSalad.proteina}, {cartItem.customSalad.fruta}, {cartItem.customSalad.topping}, {cartItem.customSalad.aderezo}
                      </span>
                    )}
                    {cartItem.specialInstructions && (
                      <span className="text-[10px] text-stone-600 italic block">
                        " {cartItem.specialInstructions} "
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => onRemoveItem(cartItem.cartId)}
                    className="text-stone-400 hover:text-red-600 p-1 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-stone-200/60 mt-1">
                  <div className="flex items-center border border-stone-300 rounded-lg bg-white p-0.5">
                    <button
                      onClick={() => onUpdateQuantity(cartItem.cartId, cartItem.quantity - 1)}
                      className="p-1 text-stone-600 hover:bg-stone-100 rounded-md cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center font-bold text-xs">{cartItem.quantity}</span>
                    <button
                      onClick={() => onUpdateQuantity(cartItem.cartId, cartItem.quantity + 1)}
                      className="p-1 text-stone-600 hover:bg-stone-100 rounded-md cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <span className="font-black text-xs text-stone-900">${cartItem.totalPrice}.00</span>
                </div>
              </div>
            ))}
          </div>

          {/* Checkout Form */}
          <form onSubmit={handleCompleteOrder} className="space-y-4 pt-3 border-t border-stone-200">
            {/* Modalidad de Entrega */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-2">
                Tipo de Servicio
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'delivery', label: '🚚 A Domicilio (+$25)' },
                  { id: 'pickup', label: '🛍️ Anticipar / Llevar' },
                  { id: 'dine_in', label: '🍽️ En Sucursal' },
                ].map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setOrderType(type.id as OrderType)}
                    className={`py-2 px-1.5 rounded-xl border text-[11px] font-bold text-center transition-all cursor-pointer ${
                      orderType === type.id
                        ? 'bg-[#162e1e] text-[#fcfaf6] border-[#162e1e] shadow-xs'
                        : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Customer Information */}
            <div className="space-y-2">
              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-0.5 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-[#162e1e]" /> Tu Nombre completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: María González"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#162e1e]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-0.5 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-[#162e1e]" /> Teléfono / WhatsApp de contacto *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="Ej: 55 1234 5678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#162e1e]"
                />
              </div>

              {orderType === 'delivery' && (
                <>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-0.5 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#162e1e]" /> Dirección de Entrega (Tlalpan y alrededores) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Calle, número exterior/interior, colonia, C.P."
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#162e1e]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-0.5">
                      Referencia o Entre calles
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Portón café frente al parque, timbre 2"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#162e1e]"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-0.5">
                  Instrucciones o comentarios para cocina
                </label>
                <input
                  type="text"
                  placeholder="Ej: Sin cebolla, salsa aparte, etc."
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#162e1e]"
                />
              </div>
            </div>

            {/* Reward Redemption box if reward available */}
            {vipProfile?.rewardAvailable && (
              <div className="bg-emerald-100/90 border border-emerald-400 p-3 rounded-2xl text-xs flex items-center justify-between gap-2 text-emerald-950">
                <div className="flex items-center gap-2">
                  <Gift className="w-5 h-5 text-emerald-700 shrink-0" />
                  <div>
                    <strong className="block">¡Tienes 1 Recompensa Aló! VIP disponible!</strong>
                    <span className="text-[11px] text-emerald-800">
                      Incluye un Café de Olla o Postre gratis en tu pedido.
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={redeemingReward}
                  onChange={(e) => setRedeemingReward(e.target.checked)}
                  className="w-5 h-5 accent-emerald-700 rounded-md cursor-pointer shrink-0"
                />
              </div>
            )}

            {/* Payment Method */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5 flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5 text-[#162e1e]" /> Método de Pago
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'efectivo', label: '💵 Efectivo' },
                  { id: 'tarjeta', label: '💳 Tarjeta' },
                  { id: 'transferencia', label: '📱 Transfer' },
                ].map((pm) => (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setPaymentMethod(pm.id as any)}
                    className={`py-1.5 px-2 rounded-xl border text-xs font-bold text-center transition-all cursor-pointer ${
                      paymentMethod === pm.id
                        ? 'bg-[#162e1e] text-[#fcfaf6] border-[#162e1e]'
                        : 'bg-stone-50 border-stone-200 text-stone-700'
                    }`}
                  >
                    {pm.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Breakdown */}
            <div className="bg-[#fcfaf6] border border-stone-200 rounded-2xl p-3.5 text-xs space-y-1.5 text-stone-700">
              <div className="flex justify-between">
                <span>Subtotal platillos:</span>
                <span className="font-bold">${rawSubtotal}.00</span>
              </div>
              {bringOwnContainer && (
                <div className="flex justify-between text-emerald-800 font-bold">
                  <span>Descuento Eco (10% OFF):</span>
                  <span>-${discountAmount}.00</span>
                </div>
              )}
              {orderType === 'delivery' && (
                <div className="flex justify-between">
                  <span>Envío a domicilio:</span>
                  <span>+$25.00</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-[#162e1e] pt-2 border-t border-stone-200">
                <span>TOTAL A PAGAR:</span>
                <span className="text-base font-serif font-black">${total}.00 MXN</span>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-4 bg-gradient-to-r from-[#162e1e] to-[#20402b] hover:from-[#1b3824] hover:to-[#285037] text-white rounded-xl font-bold text-sm shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer border border-[#b48a44]/30"
            >
              <Send className="w-4 h-4 text-[#d1a85b]" />
              <span>Generar Ticket y Enviar a WhatsApp (${total})</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
