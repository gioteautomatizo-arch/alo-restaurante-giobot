import React, { useState, useEffect } from 'react';
import { CartItem, OrderType, VipProfile, RestaurantOrderItem } from '../types';
import { getVipProfile, addStampToVip, redeemVipReward } from '../lib/vipStorage';
import { getRestaurantInfo, ADMIN_DATA_EVENT } from '../lib/adminStorage';
import { createRestaurantOrder } from '../lib/ordersService';
import { getTableOrderContext } from '../lib/tableSessionsService';
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
  tableNumber?: number | null;
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
  tableNumber = null,
}) => {
  const [restaurantInfo, setRestaurantInfo] = useState(getRestaurantInfo());
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
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);
  const [orderSubmitError, setOrderSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const handleUpdate = () => {
      setRestaurantInfo(getRestaurantInfo());
    };
    window.addEventListener(ADMIN_DATA_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener(ADMIN_DATA_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  // Dynamic values from restaurant_info
  const ecoPercent = restaurantInfo.ecoDiscountPercent ?? 10;
  const rawEcoDesc = (restaurantInfo.ecoDiscountDescription || '').trim();
  const cleanEcoDesc = rawEcoDesc
    .replace(/^\d+%\s*(?:de\s+descuento\s*)?/i, '')
    .replace(/\b\d+%\b/g, '')
    .trim();
  const ecoDescription = cleanEcoDesc
    ? cleanEcoDesc.charAt(0).toUpperCase() + cleanEcoDesc.slice(1)
    : 'Llevo mis propios recipientes / termo';
  const deliveryFeeRate = restaurantInfo.deliveryFee ?? 25;
  const vipStampsReq = restaurantInfo.vipStampsRequired ?? 5;
  const vipRewardDesc =
    restaurantInfo.vipRewardDescription ||
    'Al acumular 5 sellos, el cliente obtiene gratis un café americano o postre del día.';
  const restaurantPhone = restaurantInfo.whatsappRaw || RESTAURANT_PHONE;
  const restaurantAddress = restaurantInfo.address || RESTAURANT_ADDRESS;
  const restaurantPhoneDisplay = restaurantInfo.whatsapp || '55 7441 1437';

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

  // V3: si el cliente llegó por QR de mesa, el carrito inicia como consumo en sucursal.
  useEffect(() => {
    if (isOpen && tableNumber) {
      setOrderType('dine_in');
      if (!customerName.trim()) setCustomerName(`Mesa ${tableNumber}`);
    }
  }, [isOpen, tableNumber]);

  if (!isOpen) return null;

  // Subtotal
  const rawSubtotal = cartItems.reduce((acc, item) => acc + item.totalPrice, 0);

  // Dynamic discount for eco-friendly container
  const discountAmount = bringOwnContainer ? Math.round(rawSubtotal * (ecoPercent / 100)) : 0;

  // Dynamic delivery fee if delivery
  const deliveryFee = orderType === 'delivery' ? deliveryFeeRate : 0;

  const total = Math.max(0, rawSubtotal - discountAmount + deliveryFee);

  const formatTicketMessage = (code: string, dateStr: string, currentVipStamps: number) => {
    const modalityName =
      orderType === 'delivery'
        ? `🚚 ENTREGA A DOMICILIO (+$${deliveryFeeRate})`
        : orderType === 'pickup'
        ? '🛍️ ANTICIPAR ORDEN / PARA LLEVAR'
        : '🍽️ CONSUMO EN SUCURSAL';

    let itemsList = '';
    cartItems.forEach((cartItem, idx) => {
      itemsList += `\n*${cartItem.quantity}x ${cartItem.item.name}* — $${cartItem.totalPrice} MXN`;
      if (cartItem.personLabel) {
        itemsList += `\n  👤 Para: ${cartItem.personLabel}`;
      }
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
    msg += `📍 *Sucursal:* ${restaurantAddress}\n`;
    msg += `📞 *WhatsApp:* ${restaurantPhoneDisplay}\n`;
    msg += `═══════════════════════════════\n`;
    msg += `🎫 *FOLIO:* #${code}\n`;
    msg += `📅 *FECHA Y HORA:* ${dateStr}\n`;
    msg += `👤 *CLIENTE:* ${customerName.trim()}\n`;
    if (phone.trim()) msg += `📱 *TELÉFONO:* ${phone.trim()}\n`;
    msg += `🛎️ *TIPO DE SERVICIO:* ${modalityName}\n`;
    if (orderType === 'dine_in' && tableNumber) {
      msg += `🪑 *MESA:* ${tableNumber}\n`;
    }

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
      msg += `🌿 *Descuento Ecológico (${ecoPercent}% OFF):* -$${discountAmount}.00 MXN\n`;
    }

    if (orderType === 'delivery') {
      msg += `🚚 *Costo de Envío:* +$${deliveryFee}.00 MXN\n`;
    }

    msg += `───────────────────────────────\n`;
    msg += `💰 *TOTAL A PAGAR: $${total}.00 MXN*\n`;
    msg += `═══════════════════════════════\n`;
    msg += `💳 *MÉTODO DE PAGO:* ${paymentMethod.toUpperCase()}\n`;

    if (redeemingReward) {
      msg += `🎁 *RECOMPENSA VIP:* Canje aplicado (${vipRewardDesc})\n`;
    }

    msg += `⭐ *SOCIO ALÓ! VIP:* ${currentVipStamps}/${vipStampsReq} Sellos registrados\n`;
    msg += `═══════════════════════════════\n`;
    msg += `_¡Muchas gracias por tu compra! Estamos procesando tu orden. Por favor confírmanos por este medio cuando recibas este ticket._ 🍽️✨`;

    return msg;
  };

  const handleCompleteOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveCustomerName = customerName.trim() || (tableNumber ? `Mesa ${tableNumber}` : 'Cliente');
    if (orderType === 'delivery' && !address.trim()) return;
    if (cartItems.length === 0) return;

    setIsSubmittingOrder(true);
    setOrderSubmitError(null);

    try {
      const isStaffOrder = (() => {
        try {
          return new URLSearchParams(window.location.search).get('staffOrder') === '1';
        } catch {
          return false;
        }
      })();

      const tableContext = orderType === 'dine_in' && tableNumber
        ? await getTableOrderContext(tableNumber)
        : null;

      const normalizedItems: RestaurantOrderItem[] = cartItems.map((cartItem) => {
        const customParts: string[] = [];
        if (cartItem.customComidaCorrida) {
          customParts.push(`1er tiempo: ${cartItem.customComidaCorrida.primerTiempo}`);
          customParts.push(`2do tiempo: ${cartItem.customComidaCorrida.segundoTiempo}`);
          customParts.push(`3er tiempo: ${cartItem.customComidaCorrida.tercerTiempo}`);
          if (cartItem.customComidaCorrida.extraAgrega) customParts.push(cartItem.customComidaCorrida.extraAgrega);
        }
        if (cartItem.customSalad) {
          customParts.push(
            `Ensalada: ${cartItem.customSalad.proteina}, ${cartItem.customSalad.fruta}, ${cartItem.customSalad.topping}, ${cartItem.customSalad.aderezo}`
          );
        }

        return {
          productId: cartItem.item.id,
          name: cartItem.item.name,
          quantity: cartItem.quantity,
          unitPrice: cartItem.unitPrice,
          totalPrice: cartItem.totalPrice,
          selectedSize: cartItem.selectedSize?.name,
          selectedOption: cartItem.selectedOption,
          extras: cartItem.selectedExtras?.map((extra) => extra.name),
          specialInstructions: cartItem.specialInstructions,
          customizationSummary: customParts.length > 0 ? customParts.join(' · ') : undefined,
          personId: cartItem.personId || tableContext?.personId,
          personIndex: cartItem.personIndex || tableContext?.personIndex,
          personLabel: cartItem.personLabel || tableContext?.personLabel,
        };
      });

      // La comanda se guarda primero en Firestore. WhatsApp queda como copia opcional.
      const order = await createRestaurantOrder({
        orderType,
        tableNumber: orderType === 'dine_in' && tableNumber ? tableNumber : undefined,
        tableSessionId: tableContext?.tableSessionId,
        accountId: tableContext?.accountId,
        accountLabel: tableContext?.accountLabel,
        orderSource: orderType === 'dine_in' && tableNumber
          ? (isStaffOrder ? 'MESERO' : 'CLIENTE_QR')
          : undefined,
        customerName: effectiveCustomerName,
        phone: phone.trim() || undefined,
        address: orderType === 'delivery' ? address.trim() : undefined,
        addressReference: orderType === 'delivery' ? reference.trim() || undefined : undefined,
        paymentMethod,
        bringOwnContainer,
        notes: orderNotes.trim() || undefined,
        items: normalizedItems,
        subtotal: rawSubtotal,
        discountAmount,
        deliveryFee,
        total,
      });

      // Fidelidad se actualiza únicamente después de que Firestore confirma la comanda.
      const newVip = addStampToVip({
        customerName: effectiveCustomerName,
        phone,
        address,
        reference,
        paymentMethod,
        orderType,
      });

      if (redeemingReward) redeemVipReward();

      setCustomerName(effectiveCustomerName);
      setUpdatedVipResult(newVip);
      const nowStr = new Date(order.createdAt).toLocaleString('es-MX', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
      setOrderDate(nowStr);
      setOrderCode(order.code);

      const generated = formatTicketMessage(order.code, nowStr, newVip.stamps);
      setTicketText(generated);
      setOrderConfirmed(true);
    } catch (err: any) {
      console.error('Error creando comanda:', err);
      setOrderSubmitError(
        err?.message || 'No pudimos enviar tu pedido a cocina. Revisa tu conexión e intenta de nuevo.'
      );
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleCopyTicket = () => {
    navigator.clipboard.writeText(ticketText);
    setCopiedTicket(true);
    setTimeout(() => setCopiedTicket(false), 2500);
  };

  const handleSendToWhatsApp = () => {
    const waUrl = `https://wa.me/${restaurantPhone}?text=${encodeURIComponent(ticketText)}`;
    window.open(waUrl, '_blank');
  };

  const handleResetAndClose = () => {
    onClearCart();
    setOrderConfirmed(false);
    onClose();
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] bg-[#FFFDF9] shadow-2xl border-l border-[#DEC8AE] flex flex-col animate-slide-left">
      {/* Header */}
      <div className="bg-[#3A2418] text-[#FFF7EA] p-4 flex items-center justify-between border-b border-[#4E3222]">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-[#C9974D]" />
          <h2 className="font-bold text-base text-[#FFF7EA] font-serif">
            {orderConfirmed ? 'Ticket de Compra Digital' : 'Tu Pedido en Restaurante Calientito'}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-xl bg-[#4A2E1F] hover:bg-[#5C3825] text-[#C9974D] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {orderConfirmed ? (
        /* Order Confirmed Screen with Professional Thermal Ticket */
        <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-4 bg-[#FFF7EA]">
          <div className="text-center space-y-1">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-[#F4E3C8] text-[#3A2418] rounded-full mb-1 shadow-xs border border-[#C9974D]/40">
              <CheckCircle2 className="w-7 h-7 text-[#A86B3D]" />
            </div>
            <h3 className="text-xl font-black text-[#3A2418] font-serif">
              ¡Pedido Registrado con Éxito!
            </h3>
            <p className="text-xs text-[#6B4028]">
              Tu pedido ya entró al <strong>sistema de comandas del restaurante</strong>. WhatsApp queda como copia opcional.
            </p>
          </div>

          {/* Action WhatsApp Button - Highlighted */}
          <button
            type="button"
            onClick={handleSendToWhatsApp}
            className="w-full py-3.5 px-4 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-2xl font-bold text-sm shadow-lg flex items-center justify-center gap-2.5 transition-all transform hover:scale-101 active:scale-98 cursor-pointer border border-emerald-600"
          >
            <MessageSquare className="w-5 h-5 fill-white text-[#25D366]" />
            <span>Enviar copia por WhatsApp</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {/* Professional Digital Purchase Ticket */}
          <div className="bg-white rounded-2xl border-2 border-[#DEC8AE] shadow-md overflow-hidden font-mono text-xs text-[#2B1B13] relative">
            {/* Ticket Header */}
            <div className="p-4 bg-[#FFF7EA] border-b border-dashed border-[#DEC8AE] text-center space-y-1">
              <div className="flex justify-center mb-1">
                <Logo variant="compact" size="xs" />
              </div>
              <h4 className="font-black text-sm text-[#3A2418] tracking-tight">RESTAURANTE CALIENTITO</h4>
              <p className="text-[10px] text-[#6B4028]">{RESTAURANT_ADDRESS}</p>
              <p className="text-[10px] text-[#3A2418] font-bold">WhatsApp Pedidos: 55 7441 1437</p>
              
              <div className="pt-2 flex items-center justify-between text-[11px] font-bold text-[#6B4028] border-t border-[#DEC8AE] mt-2">
                <span>FOLIO: #{orderCode}</span>
                <span>{orderDate}</span>
              </div>
            </div>

            {/* Client & Service Information */}
            <div className="p-3.5 bg-white border-b border-dashed border-[#DEC8AE] space-y-1 text-[11px]">
              <p><span className="text-[#6B4028] font-bold">CLIENTE:</span> <strong>{customerName}</strong></p>
              {phone && <p><span className="text-[#6B4028] font-bold">TELÉFONO:</span> {phone}</p>}
              <p>
                <span className="text-[#6B4028] font-bold">SERVICIO:</span>{' '}
                <strong className="text-[#3A2418]">
                  {orderType === 'delivery'
                    ? '🚚 Envío a Domicilio'
                    : orderType === 'pickup'
                    ? '🛍️ Anticipar / Para Llevar'
                    : '🍽️ Consumo en Sucursal'}
                </strong>
              </p>
              {orderType === 'delivery' && (
                <>
                  <p><span className="text-[#6B4028] font-bold">DIRECCIÓN:</span> {address}</p>
                  {reference && <p><span className="text-[#6B4028] font-bold">REF:</span> {reference}</p>}
                </>
              )}
              {orderNotes && <p><span className="text-[#6B4028] font-bold">NOTAS:</span> {orderNotes}</p>}
            </div>

            {/* Items List */}
            <div className="p-3.5 space-y-2.5 bg-[#FFFDF9] border-b border-dashed border-[#DEC8AE]">
              <div className="text-[10px] font-black uppercase tracking-wider text-[#A86B3D] border-b border-[#DEC8AE] pb-1 flex justify-between">
                <span>CANT / PLATILLO</span>
                <span>IMPORTE</span>
              </div>

              {cartItems.map((cartItem, idx) => (
                <div key={idx} className="space-y-0.5 text-[11px]">
                  <div className="flex justify-between font-bold text-[#2B1B13]">
                    <span>{cartItem.quantity}x {cartItem.item.name}</span>
                    <span>${cartItem.totalPrice}.00</span>
                  </div>
                  {cartItem.personLabel && (
                    <p className="text-[10px] font-bold text-emerald-700 pl-3">👤 {cartItem.personLabel}</p>
                  )}

                  {cartItem.selectedSize && (
                    <p className="text-[10px] text-[#6B4028] pl-3">▪ Tamaño: {cartItem.selectedSize.name}</p>
                  )}
                  {cartItem.selectedOption && (
                    <p className="text-[10px] text-[#6B4028] pl-3">▪ Opción: {cartItem.selectedOption}</p>
                  )}
                  {cartItem.selectedExtras && cartItem.selectedExtras.length > 0 && (
                    <p className="text-[10px] text-[#6B4028] pl-3">
                      ▪ Extras: {cartItem.selectedExtras.map((e) => e.name).join(', ')}
                    </p>
                  )}
                  {cartItem.customComidaCorrida && (
                    <div className="text-[10px] text-[#6B4028] pl-3">
                      <p>▪ Sopa: {cartItem.customComidaCorrida.primerTiempo}</p>
                      <p>▪ Arroz/Pasta: {cartItem.customComidaCorrida.segundoTiempo} {cartItem.customComidaCorrida.extraAgrega ? `(${cartItem.customComidaCorrida.extraAgrega})` : ''}</p>
                      <p>▪ Guisado: {cartItem.customComidaCorrida.tercerTiempo}</p>
                    </div>
                  )}
                  {cartItem.customSalad && (
                    <div className="text-[10px] text-[#6B4028] pl-3">
                      <p>▪ {cartItem.customSalad.proteina} • {cartItem.customSalad.fruta} • {cartItem.customSalad.topping} • {cartItem.customSalad.aderezo}</p>
                    </div>
                  )}
                  {cartItem.specialInstructions && (
                    <p className="text-[10px] text-[#6B4028] italic pl-3">▪ "{cartItem.specialInstructions}"</p>
                  )}
                </div>
              ))}
            </div>

            {/* Calculations & Total */}
            <div className="p-3.5 bg-white space-y-1.5 text-[11px] border-b border-dashed border-[#DEC8AE]">
              <div className="flex justify-between text-[#6B4028]">
                <span>Subtotal platillos:</span>
                <span>${rawSubtotal}.00</span>
              </div>
              {bringOwnContainer && discountAmount > 0 && (
                <div className="flex justify-between text-[#A86B3D] font-bold">
                  <span>🌿 Descuento Eco ({ecoPercent}%):</span>
                  <span>-${discountAmount}.00</span>
                </div>
              )}
              {orderType === 'delivery' && (
                <div className="flex justify-between text-[#6B4028]">
                  <span>🚚 Envío a domicilio:</span>
                  <span>+${deliveryFee}.00</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-[#3A2418] pt-1.5 border-t border-[#DEC8AE]">
                <span>TOTAL A PAGAR:</span>
                <span className="text-base font-serif">${total}.00 MXN</span>
              </div>
              <div className="flex justify-between text-[11px] text-[#6B4028] pt-1">
                <span>MÉTODO DE PAGO:</span>
                <strong className="uppercase text-[#2B1B13]">{paymentMethod}</strong>
              </div>
            </div>

            {/* VIP Status */}
            <div className="p-3 bg-[#3A2418] text-[#FFF7EA] text-center space-y-1">
              <p className="text-[10px] text-[#C9974D] font-bold flex items-center justify-center gap-1">
                <Star className="w-3.5 h-3.5 fill-[#C9974D]" />
                TARJETA ALÓ! VIP: {updatedVipResult?.stamps || 1}/{vipStampsReq} SELLOS
              </p>
              <p className="text-[9px] text-[#EAD9C4]">
                ¡Gracias por tu compra! Conserva tu folio #{orderCode}.
              </p>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyTicket}
              className="flex-1 py-2.5 px-3 rounded-xl border border-[#DEC8AE] bg-[#FFFDF9] hover:bg-[#F4E3C8] text-[#6B4028] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              {copiedTicket ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700">¡Ticket Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-[#6B4028]" />
                  <span>Copiar Ticket</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="py-2.5 px-3 rounded-xl border border-[#DEC8AE] bg-[#FFFDF9] hover:bg-[#F4E3C8] text-[#6B4028] font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Imprimir ticket"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleResetAndClose}
            className="w-full py-3 bg-[#3A2418] hover:bg-[#4A2E1F] text-[#FFF7EA] font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
          >
            Listo / Volver al Menú
          </button>
        </div>
      ) : cartItems.length === 0 ? (
        /* Empty Cart Screen */
        <div className="flex-1 p-8 flex flex-col items-center justify-center text-center space-y-3 text-[#6B4028]">
          <div className="w-16 h-16 rounded-3xl bg-[#F4E3C8] text-[#3A2418] flex items-center justify-center text-3xl border border-[#DEC8AE]">
            🍽️
          </div>
          <h3 className="font-bold text-base text-[#2B1B13] font-serif">Tu pedido está vacío</h3>
          <p className="text-xs text-[#6B4028] max-w-xs">
            Explora nuestro menú casero en Tlalpan o habla con <strong>Tita</strong> para recibir sugerencias a tu medida.
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-[#3A2418] text-[#FFF7EA] rounded-xl text-xs font-bold shadow-xs hover:bg-[#4A2E1F] transition-colors cursor-pointer"
          >
            Ver Menú Digital
          </button>
        </div>
      ) : (
        /* Cart List & Checkout Form */
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Restaurant Location Header Banner */}
          <div className="bg-[#FFF7EA] border border-[#DEC8AE] p-2.5 rounded-2xl flex items-center gap-2 text-xs text-[#6B4028]">
            <MapPin className="w-4 h-4 text-[#A86B3D] shrink-0" />
            <div>
              <span className="font-bold text-[#3A2418]">Sucursal Tlalpan:</span> Calle la Fama 12, CDMX
              <span className="block text-[10px] text-[#6B4028]/80">Pedido directo a cocina • WhatsApp disponible como respaldo</span>
            </div>
          </div>

          {/* VIP AUTO-FILL BANNER */}
          {vipProfile ? (
            <div className="bg-gradient-to-r from-[#3A2418] to-[#4A2E1F] text-[#FFF7EA] p-3 rounded-2xl border border-[#C9974D]/50 shadow-xs flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-[#C9974D] fill-[#C9974D] shrink-0" />
                <div>
                  <strong className="block text-[#FFF7EA] font-serif">Socio VIP: {vipProfile.customerName}</strong>
                  <span className="text-[11px] text-[#F4E3C8]">
                    Tus datos fueron cargados automáticamente. Acumularás +1 sello.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenVipModal}
                className="text-[11px] font-bold text-[#C9974D] hover:text-white underline shrink-0 ml-2 cursor-pointer"
              >
                Mi Tarjeta
              </button>
            </div>
          ) : (
            <div className="bg-[#F4E3C8]/60 border border-[#DEC8AE] p-3 rounded-2xl text-xs flex items-center justify-between text-[#3A2418]">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-[#A86B3D] shrink-0" />
                <span>
                  <strong>Tarjeta VIP:</strong> Al enviar tu pedido tus datos quedarán guardados para tus próximas compras.
                </span>
              </div>
            </div>
          )}

          {/* Sustainability Promo Banner */}
          <div className={`p-3 rounded-2xl border text-xs flex items-center justify-between gap-2 transition-all ${
            bringOwnContainer ? 'bg-[#F4E3C8] border-[#DEC8AE] text-[#3A2418] font-medium' : 'bg-[#FFF7EA] border-[#DEC8AE] text-[#6B4028]'
          }`}>
            <div className="flex items-center gap-2">
              <Leaf className={`w-4 h-4 ${bringOwnContainer ? 'text-[#A86B3D]' : 'text-[#6B4028]'}`} />
              <div>
                <strong className="block font-serif">Descuento Ecológico ({ecoPercent}% OFF)</strong>
                <span className="text-[11px] text-[#6B4028]">{ecoDescription}</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={bringOwnContainer}
              onChange={(e) => setBringOwnContainer(e.target.checked)}
              className="w-5 h-5 accent-[#A86B3D] rounded-md cursor-pointer"
            />
          </div>

          {/* Cart Item List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-[#6B4028] font-bold uppercase tracking-wider font-serif">
              <span>Platillos seleccionados</span>
              <button
                onClick={onClearCart}
                className="text-[#A86B3D] hover:underline text-[11px] font-semibold cursor-pointer"
              >
                Vaciar carrito
              </button>
            </div>

            {cartItems.map((cartItem) => (
              <div
                key={cartItem.cartId}
                className="bg-[#FFF7EA]/70 border border-[#DEC8AE] rounded-2xl p-3 flex flex-col gap-2 relative shadow-2xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-xs text-[#2B1B13] font-serif">{cartItem.item.name}</h4>
                    {cartItem.personLabel && (
                      <span className="inline-block text-[10px] text-emerald-800 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md mb-1">
                        👤 {cartItem.personLabel}
                      </span>
                    )}
                    {cartItem.selectedSize && (
                      <span className="text-[10px] text-[#3A2418] font-bold bg-[#F4E3C8] px-1.5 py-0.5 rounded-md mr-1 border border-[#DEC8AE]">
                        {cartItem.selectedSize.name}
                      </span>
                    )}
                    {cartItem.selectedOption && (
                      <span className="text-[10px] text-[#6B4028] block">
                        • {cartItem.selectedOption}
                      </span>
                    )}
                    {cartItem.selectedExtras && cartItem.selectedExtras.length > 0 && (
                      <span className="text-[10px] text-[#A86B3D] block font-medium">
                        • Extras: {cartItem.selectedExtras.map((e) => e.name).join(', ')}
                      </span>
                    )}
                    {cartItem.customComidaCorrida && (
                      <span className="text-[10px] text-[#6B4028] block">
                        • Sopa: {cartItem.customComidaCorrida.primerTiempo} | Arroz/Pasta: {cartItem.customComidaCorrida.segundoTiempo} | Plato: {cartItem.customComidaCorrida.tercerTiempo}
                      </span>
                    )}
                    {cartItem.customSalad && (
                      <span className="text-[10px] text-[#6B4028] block">
                        • {cartItem.customSalad.proteina}, {cartItem.customSalad.fruta}, {cartItem.customSalad.topping}, {cartItem.customSalad.aderezo}
                      </span>
                    )}
                    {cartItem.specialInstructions && (
                      <span className="text-[10px] text-[#6B4028] italic block">
                        " {cartItem.specialInstructions} "
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => onRemoveItem(cartItem.cartId)}
                    className="text-[#A86B3D] hover:text-red-600 p-1 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-[#DEC8AE]/60 mt-1">
                  <div className="flex items-center border border-[#DEC8AE] rounded-lg bg-[#FFFDF9] p-0.5">
                    <button
                      onClick={() => onUpdateQuantity(cartItem.cartId, cartItem.quantity - 1)}
                      className="p-1 text-[#6B4028] hover:bg-[#F4E3C8] rounded-md cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center font-bold text-xs text-[#2B1B13]">{cartItem.quantity}</span>
                    <button
                      onClick={() => onUpdateQuantity(cartItem.cartId, cartItem.quantity + 1)}
                      className="p-1 text-[#6B4028] hover:bg-[#F4E3C8] rounded-md cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <span className="font-black text-xs text-[#2B1B13] font-serif">${cartItem.totalPrice}.00</span>
                </div>
              </div>
            ))}
          </div>

          {/* Checkout Form */}
          <form onSubmit={handleCompleteOrder} className="space-y-4 pt-3 border-t border-[#DEC8AE]">
            {/* Modalidad de Entrega */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#6B4028] mb-2 font-serif">
                Tipo de Servicio
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'delivery', label: `🚚 A Domicilio (+$${deliveryFeeRate})` },
                  { id: 'pickup', label: '🛍️ Anticipar / Llevar' },
                  { id: 'dine_in', label: '🍽️ En Sucursal' },
                ].map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setOrderType(type.id as OrderType)}
                    className={`py-2 px-1.5 rounded-xl border text-[11px] font-bold text-center transition-all cursor-pointer ${
                      orderType === type.id
                        ? 'bg-[#3A2418] text-[#FFF7EA] border-[#3A2418] shadow-xs'
                        : 'bg-[#FFFDF9] border-[#DEC8AE] text-[#6B4028] hover:bg-[#F4E3C8]'
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
                <label className="block text-[11px] font-bold text-[#6B4028] mb-0.5 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-[#A86B3D]" /> Tu Nombre completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: María González"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-[#FFFDF9] border border-[#DEC8AE] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#A86B3D] text-[#2B1B13]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#6B4028] mb-0.5 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-[#A86B3D]" /> Teléfono / WhatsApp de contacto {orderType === 'dine_in' ? '(opcional)' : '*'}
                </label>
                <input
                  type="tel"
                  required={orderType !== 'dine_in'}
                  placeholder="Ej: 55 1234 5678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-[#FFFDF9] border border-[#DEC8AE] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#A86B3D] text-[#2B1B13]"
                />
              </div>

              {orderType === 'delivery' && (
                <>
                  <div>
                    <label className="block text-[11px] font-bold text-[#6B4028] mb-0.5 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#A86B3D]" /> Dirección de Entrega (Tlalpan y alrededores) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Calle, número exterior/interior, colonia, C.P."
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-[#FFFDF9] border border-[#DEC8AE] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#A86B3D] text-[#2B1B13]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[#6B4028] mb-0.5">
                      Referencia o Entre calles
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Portón café frente al parque, timbre 2"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-[#FFFDF9] border border-[#DEC8AE] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#A86B3D] text-[#2B1B13]"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-[11px] font-bold text-[#6B4028] mb-0.5">
                  Instrucciones o comentarios para cocina
                </label>
                <input
                  type="text"
                  placeholder="Ej: Sin cebolla, salsa aparte, etc."
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-[#FFFDF9] border border-[#DEC8AE] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#A86B3D] text-[#2B1B13]"
                />
              </div>
            </div>

            {/* Reward Redemption box if reward available */}
            {vipProfile?.rewardAvailable && (
              <div className="bg-[#F4E3C8] border border-[#DEC8AE] p-3 rounded-2xl text-xs flex items-center justify-between gap-2 text-[#3A2418]">
                <div className="flex items-center gap-2">
                  <Gift className="w-5 h-5 text-[#A86B3D] shrink-0" />
                  <div>
                    <strong className="block font-serif">¡Tienes 1 Recompensa VIP disponible!</strong>
                    <span className="text-[11px] text-[#6B4028]">
                      {vipRewardDesc}
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={redeemingReward}
                  onChange={(e) => setRedeemingReward(e.target.checked)}
                  className="w-5 h-5 accent-[#A86B3D] rounded-md cursor-pointer shrink-0"
                />
              </div>
            )}

            {/* Payment Method */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#6B4028] mb-1.5 flex items-center gap-1 font-serif">
                <CreditCard className="w-3.5 h-3.5 text-[#A86B3D]" /> Método de Pago
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
                        ? 'bg-[#3A2418] text-[#FFF7EA] border-[#3A2418]'
                        : 'bg-[#FFFDF9] border-[#DEC8AE] text-[#6B4028]'
                    }`}
                  >
                    {pm.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Breakdown */}
            <div className="bg-[#FFF7EA] border border-[#DEC8AE] rounded-2xl p-3.5 text-xs space-y-1.5 text-[#6B4028]">
              <div className="flex justify-between">
                <span>Subtotal platillos:</span>
                <span className="font-bold text-[#2B1B13]">${rawSubtotal}.00</span>
              </div>
              {bringOwnContainer && (
                <div className="flex justify-between text-[#A86B3D] font-bold">
                  <span>Descuento Eco ({ecoPercent}% OFF):</span>
                  <span>-${discountAmount}.00</span>
                </div>
              )}
              {orderType === 'delivery' && (
                <div className="flex justify-between">
                  <span>Envío a domicilio:</span>
                  <span>+${deliveryFee}.00</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-[#3A2418] pt-2 border-t border-[#DEC8AE]">
                <span>TOTAL A PAGAR:</span>
                <span className="text-base font-serif font-black">${total}.00 MXN</span>
              </div>
            </div>

            {orderSubmitError && (
              <div className="rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 px-3.5 py-2.5 text-xs font-medium">
                {orderSubmitError}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={isSubmittingOrder}
              className="w-full py-3 px-4 bg-[#FFFDF9] hover:bg-[#F4E3C8] text-[#5C3825] rounded-xl font-bold text-sm border-2 border-[#DEC8AE] transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              ← Volver a editar pedido
            </button>

            <button
              type="submit"
              disabled={isSubmittingOrder}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-[#3A2418] to-[#4A2E1F] hover:from-[#4A2E1F] hover:to-[#5C3825] text-white rounded-xl font-bold text-sm shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer border border-[#C9974D]/30 disabled:opacity-60 disabled:cursor-wait"
            >
              <Send className="w-4 h-4 text-[#C9974D]" />
              <span>{isSubmittingOrder ? 'Enviando a cocina…' : `Enviar pedido a cocina ($${total})`}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};