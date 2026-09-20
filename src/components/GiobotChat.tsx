import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, CartItem, MenuItem, PublicTableOrder, TableSessionPerson } from '../types';
import { Send, X } from 'lucide-react';
import { getDailyMenuConfig, getRestaurantInfo } from '../lib/adminStorage';
import { getTableSession } from '../lib/tableSessionsService';
import { subscribeToMenuCatalog } from '../lib/menuCatalogService';
import { subscribeToPublicTableOrders } from '../lib/ordersService';

interface GiobotChatProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSaladBuilder: () => void;
  onOpenComidaCorridaBuilder: () => void;
  tableNumber?: number | null;
  selectedPerson?: TableSessionPerson | null;
  cartItems?: CartItem[];
  menuItems?: MenuItem[];
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'welcome',
    sender: 'giobot',
    text: 'Hola 👋 Soy Tita, tu anfitriona de Restaurante Calientito. Puedo ayudarte a elegir, explicarte el menú y orientarte durante tu visita. ¿Qué se te antoja hoy? 😊',
    timestamp: 'Ahora',
  },
];

const GENERAL_SUGGESTIONS = [
  '🍽️ ¿Qué me recomiendas?',
  '🍲 ¿Qué incluye la Comida Corrida?',
  '📍 ¿Cuál es su ubicación y horarios?',
  '⭐ ¿Cómo funciona la Tarjeta VIP?',
  '🌱 ¿Cómo aplica el descuento ecológico?',
];

const TABLE_SUGGESTIONS = [
  '🧾 ¿Cuánto llevo de cuenta?',
  '🍽️ ¿Qué me recomiendas de la carta?',
  '☕ ¿Qué bebida me recomiendas?',
  '🙋 ¿Cómo llamo a mi mesero?',
  '🍲 ¿Qué incluye la comida corrida?',
  '🧾 ¿Cómo pido la cuenta?',
];

function readTableNumberFromUrl(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = new URLSearchParams(window.location.search).get('table');
    if (!value) return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function renderFormattedText(text: string): React.ReactNode {
  return (
    <div className="space-y-1.5">
      {text.split('\n').map((line, lineIndex) => {
        if (!line.trim()) return <div key={`gap-${lineIndex}`} className="h-1" />;
        const parts = line.split(/(\*\*.*?\*\*)/g).filter(Boolean);
        return (
          <p key={`line-${lineIndex}`} className="whitespace-pre-wrap">
            {parts.map((part, partIndex) => {
              const bold = part.startsWith('**') && part.endsWith('**') && part.length > 4;
              return bold ? (
                <strong key={`part-${lineIndex}-${partIndex}`} className="font-black text-[#3A2418]">
                  {part.slice(2, -2)}
                </strong>
              ) : (
                <React.Fragment key={`part-${lineIndex}-${partIndex}`}>{part}</React.Fragment>
              );
            })}
          </p>
        );
      })}
    </div>
  );
}

const DEFAULT_CART_ITEMS: CartItem[] = [];
const DEFAULT_MENU_ITEMS: MenuItem[] = [];

export const GiobotChat: React.FC<GiobotChatProps> = ({
  isOpen,
  onClose,
  tableNumber = null,
  selectedPerson = null,
  cartItems = DEFAULT_CART_ITEMS,
  menuItems = DEFAULT_MENU_ITEMS,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [liveMenuItems, setLiveMenuItems] = useState<MenuItem[]>(menuItems);
  const [tableOrders, setTableOrders] = useState<PublicTableOrder[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const effectiveTableNumber = tableNumber ?? readTableNumberFromUrl();

  useEffect(() => {
    if (!effectiveTableNumber) {
      setTableOrders([]);
      return;
    }
    return subscribeToPublicTableOrders(effectiveTableNumber, setTableOrders);
  }, [effectiveTableNumber]);

  useEffect(() => {
    if (menuItems.length > 0) {
      setLiveMenuItems(menuItems);
      return;
    }

    return subscribeToMenuCatalog(
      (catalog) => {
        if (!catalog) return;
        const items: MenuItem[] = catalog.items
          .filter((item) => item.active && item.available)
          .map((item) => {
            const sizes = (item.sizes || [])
              .filter((size) => typeof size.price === 'number' && size.price != null)
              .map((size) => ({ name: size.name, price: Number(size.price) }));
            const basePrice = typeof item.price === 'number'
              ? item.price
              : sizes.length > 0
              ? Math.min(...sizes.map((size) => size.price))
              : 0;

            return {
              id: item.id,
              name: item.name,
              category: item.category,
              description: item.description,
              price: basePrice,
              ...(sizes.length ? { sizes } : {}),
              ...(item.options?.length ? { options: item.options } : {}),
              ...(item.extras?.length
                ? { extras: item.extras.map((extra) => ({ id: extra.id, name: extra.name, price: extra.price })) }
                : {}),
              popular: item.popular,
              ...(item.weekendOnly ? { weekendOnly: item.weekendOnly } : {}),
            } as MenuItem;
          });
        setLiveMenuItems(items);
      },
      (error) => console.warn('No se pudo sincronizar catálogo para Tita:', error)
    );
  }, [menuItems]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isThinking, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const tableIntro = effectiveTableNumber
      ? `Hola 👋 Soy Tita. Ya sé que estás en la Mesa ${effectiveTableNumber}${selectedPerson?.label ? ` como ${selectedPerson.label}` : ''}. Puedo ayudarte con la carta, recomendarte algo y orientarte con el servicio. ¿Qué se te antoja? 😊`
      : INITIAL_MESSAGES[0].text;

    setMessages((current) => {
      if (current.length !== 1 || current[0].id !== 'welcome') return current;
      return [{ ...current[0], text: tableIntro }];
    });
  }, [isOpen, effectiveTableNumber, selectedPerson?.label]);

  if (!isOpen) return null;

  const handleSendMessage = async (textToSend?: string) => {
    const prompt = (textToSend || inputText).trim();
    if (!prompt || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputText('');
    setIsLoading(true);
    setIsThinking(true);

    let botMsgId: string | null = null;
    let accumulatedText = '';

    let dailyMenuPayload: any = null;
    try {
      const menuConfig = getDailyMenuConfig();
      if (menuConfig) {
        const guarns = Array.isArray(menuConfig.guarniciones) ? menuConfig.guarniciones.filter(Boolean) : [];
        dailyMenuPayload = {
          price: Number(menuConfig.price) || 90,
          entrada: menuConfig.entrada || '',
          platoFuerte: menuConfig.platoFuerte || '',
          guarniciones: guarns,
          guarnicion1: guarns[0] || '',
          guarnicion2: guarns[1] || '',
          aguaDelDia: menuConfig.aguaDelDia || '',
          postreDelDia: menuConfig.postreDelDia || '',
          isAvailable: menuConfig.isAvailable !== false,
          availabilityStatus: menuConfig.availabilityStatus || (menuConfig.isAvailable === false ? 'AGOTADA' : 'DISPONIBLE'),
          availableWeekdays: menuConfig.availableWeekdays || [1, 2, 3, 4, 5],
          quickAlternatives: menuConfig.quickAlternatives || [],
        };
      }
    } catch (err) {
      console.warn('No se pudo obtener el menú del día para Tita:', err);
    }

    let restaurantInfoPayload = {
      address: 'Calle la Fama 12, 14260 Tlalpan CDMX, México',
      whatsapp: '55 7441 1437',
      whatsappRaw: '5574411437',
      openingHours: 'Abiertos de 9:00 am a 5:30 pm',
      ecoDiscountPercent: 10,
      ecoDiscountDescription: '10% de descuento si el cliente trae sus propios recipientes o termo.',
      deliveryFee: 25,
      vipStampsRequired: 5,
      vipRewardDescription: 'Al acumular 5 sellos, el cliente obtiene gratis un café americano o postre del día.',
      servicePolicies: 'Servicio en comedor, para llevar y a domicilio. Formas de pago: efectivo, transferencia y tarjeta.',
      activePromotions: '10% de descuento por traer recipientes propios.',
    };

    try {
      const restInfo = getRestaurantInfo();
      if (restInfo) {
        restaurantInfoPayload = {
          address: restInfo.address || restaurantInfoPayload.address,
          whatsapp: restInfo.whatsapp || restaurantInfoPayload.whatsapp,
          whatsappRaw: restInfo.whatsappRaw || restaurantInfoPayload.whatsappRaw,
          openingHours: restInfo.openingHours || restaurantInfoPayload.openingHours,
          ecoDiscountPercent: typeof restInfo.ecoDiscountPercent === 'number' ? restInfo.ecoDiscountPercent : restaurantInfoPayload.ecoDiscountPercent,
          ecoDiscountDescription: restInfo.ecoDiscountDescription || restaurantInfoPayload.ecoDiscountDescription,
          deliveryFee: typeof restInfo.deliveryFee === 'number' ? restInfo.deliveryFee : restaurantInfoPayload.deliveryFee,
          vipStampsRequired: typeof restInfo.vipStampsRequired === 'number' ? restInfo.vipStampsRequired : restaurantInfoPayload.vipStampsRequired,
          vipRewardDescription: restInfo.vipRewardDescription || restaurantInfoPayload.vipRewardDescription,
          servicePolicies: restInfo.servicePolicies || restaurantInfoPayload.servicePolicies,
          activePromotions: restInfo.activePromotions || restaurantInfoPayload.activePromotions,
        };
      }
    } catch (err) {
      console.warn('No se pudo obtener la info del restaurante para Tita:', err);
    }

    let tableSessionPayload: any = null;
    if (effectiveTableNumber) {
      try {
        const session = await getTableSession(effectiveTableNumber);
        tableSessionPayload = session
          ? {
              tableNumber: effectiveTableNumber,
              sessionId: session.id,
              openedAt: session.openedAt,
              status: session.status,
              guestCount: session.guestCount,
              accountMode: session.accountMode,
              waiterName: session.waiterName || 'Por asignar',
              selectedPerson: selectedPerson
                ? { index: selectedPerson.index, label: selectedPerson.label }
                : null,
            }
          : { tableNumber: effectiveTableNumber, status: 'SIN_SESION' };
      } catch (err) {
        console.warn('No se pudo obtener la sesión de mesa para Tita:', err);
        tableSessionPayload = { tableNumber: effectiveTableNumber, status: 'NO_DISPONIBLE' };
      }
    }

    const currentSessionOrders = tableSessionPayload?.sessionId && effectiveTableNumber
      ? tableOrders.filter((order) => {
          if (order.status === 'CANCELADO') return false;
          const openedAt = Date.parse(tableSessionPayload.openedAt || '') || 0;
          const createdAt = Date.parse(order.createdAt || '') || 0;
          if (openedAt && createdAt < openedAt) return false;
          if (tableSessionPayload.sessionId && order.tableSessionId && order.tableSessionId !== tableSessionPayload.sessionId) return false;
          return true;
        })
      : [];

    const sessionConsumptionItems = currentSessionOrders.flatMap((order) =>
      order.items.map((item) => ({
        orderCode: order.code,
        name: item.name,
        quantity: item.quantity,
        totalPrice: item.totalPrice,
        personId: item.personId,
        personLabel: item.personLabel,
        selectedSize: item.selectedSize,
        selectedOption: item.selectedOption,
        extras: item.extras || [],
      }))
    );

    const sessionTotal = currentSessionOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const selectedPersonTotal = selectedPerson
      ? sessionConsumptionItems
          .filter((item) => item.personId === selectedPerson.id)
          .reduce((sum, item) => sum + Number(item.totalPrice || 0), 0)
      : 0;

    const menuCatalogPayload = liveMenuItems.slice(0, 120).map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      description: item.description,
      price: item.price,
      sizes: item.sizes?.map((size) => ({ name: size.name, price: size.price })),
      options: item.options,
      extras: item.extras?.map((extra) => ({ name: extra.name, price: extra.price })),
      popular: item.popular || false,
    }));

    const cartPayload = cartItems.map((cartItem) => ({
      name: cartItem.item.name,
      quantity: cartItem.quantity,
      totalPrice: cartItem.totalPrice,
      personLabel: cartItem.personLabel,
      selectedSize: cartItem.selectedSize?.name,
      selectedOption: cartItem.selectedOption,
      extras: cartItem.selectedExtras?.map((extra) => extra.name) || [],
    }));

    const customerContext = {
      serviceMode: effectiveTableNumber ? 'MESA' : 'GENERAL',
      table: tableSessionPayload,
      cart: {
        items: cartPayload,
        itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
        total: cartItems.reduce((sum, item) => sum + item.totalPrice, 0),
      },
      consumption: {
        orders: currentSessionOrders.map((order) => ({
          code: order.code,
          createdAt: order.createdAt,
          total: order.total,
          items: order.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            totalPrice: item.totalPrice,
            personId: item.personId,
            personLabel: item.personLabel,
            selectedSize: item.selectedSize,
            selectedOption: item.selectedOption,
            extras: item.extras || [],
          })),
        })),
        total: sessionTotal,
        selectedPersonTotal,
        selectedPersonLabel: selectedPerson?.label || null,
      },
    };

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'customer',
          messages: newMessages.slice(-8),
          userPrompt: prompt,
          dailyMenu: dailyMenuPayload,
          restaurantInfo: restaurantInfoPayload,
          menuCatalog: menuCatalogPayload,
          customerContext,
        }),
      });

      if (!response.ok) throw new Error(`Error en el servidor: ${response.status}`);
      if (!response.body) throw new Error('No se recibió cuerpo de respuesta');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        accumulatedText += chunk;

        if (!botMsgId) {
          botMsgId = `giobot-${Date.now()}`;
          setIsThinking(false);
          setMessages((prev) => [
            ...prev,
            {
              id: botMsgId!,
              sender: 'giobot',
              text: accumulatedText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
        } else {
          setMessages((prev) => prev.map((msg) => (msg.id === botMsgId ? { ...msg, text: accumulatedText } : msg)));
        }
      }

      if (!botMsgId) {
        setIsThinking(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `giobot-${Date.now()}`,
            sender: 'giobot',
            text: accumulatedText || '¡Con gusto te ayudo! ¿En qué más puedo apoyarte? 😊',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } catch (err) {
      console.error('Error contacting Tita:', err);
      if (!botMsgId) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            sender: 'giobot',
            text: '¡Ay! Tuve una pequeña falla de conexión. Pero estoy lista para ayudarte, pregúntame de nuevo. 😊',
            timestamp: 'Ahora',
          },
        ]);
      }
    } finally {
      setIsThinking(false);
      setIsLoading(false);
    }
  };

  const suggestions = effectiveTableNumber ? TABLE_SUGGESTIONS : GENERAL_SUGGESTIONS;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-[#FFF7EA] shadow-2xl border-l border-[#F4E3C8] flex flex-col animate-slide-left">
      <div className="bg-gradient-to-r from-[#3A2418] via-[#4A2E1F] to-[#2B1B13] text-[#FFF7EA] p-4 flex items-center justify-between border-b border-[#4E3222]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-2xl bg-[#FFF7EA] p-1 flex items-center justify-center shadow-md border border-[#C9974D]/40">
              <img src="/tita.png" alt="Tita" className="w-full h-full object-contain" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#3A2418]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-bold text-sm text-[#FFF7EA] font-serif">Tita</h3>
              <span className="text-[9px] bg-[#4A2E1F] text-[#C9974D] px-2 py-0.5 rounded-full font-semibold border border-[#C9974D]/40 font-sans">
                {effectiveTableNumber ? `MESA ${effectiveTableNumber}` : 'COMENSALES'}
              </span>
            </div>
            <p className="text-[11px] text-[#F4E3C8] truncate">
              {effectiveTableNumber
                ? `${selectedPerson?.label || 'Tu mesa'} · anfitriona y guía de servicio`
                : 'Tu anfitriona amable & asesora'}
            </p>
          </div>
        </div>

        <button onClick={onClose} className="p-1.5 rounded-xl bg-[#4A2E1F] hover:bg-[#5C3825] text-[#FFF7EA] transition-colors cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-[#FFF7EA]">
        {messages.map((msg) => {
          const isGiobot = msg.sender === 'giobot';
          return (
            <div key={msg.id} className={`flex flex-col ${isGiobot ? 'items-start' : 'items-end'}`}>
              <div className={`max-w-[88%] rounded-2xl p-3 text-xs leading-relaxed shadow-2xs ${
                isGiobot
                  ? 'bg-white border border-[#F4E3C8] text-[#2B1B13] rounded-tl-xs'
                  : 'bg-[#3A2418] text-[#FFF7EA] rounded-tr-xs font-medium'
              }`}>
                {isGiobot && (
                  <div className="flex items-center gap-1 mb-1 text-[10px] font-bold text-[#A86B3D] font-serif">
                    <img src="/tita.png" alt="Tita" className="w-3.5 h-3.5 object-contain" /> Tita
                  </div>
                )}
                {isGiobot ? renderFormattedText(msg.text) : <p className="whitespace-pre-wrap">{msg.text}</p>}
                <span className={`block text-[9px] mt-1 text-right ${isGiobot ? 'text-[#A86B3D]/80' : 'text-[#F4E3C8]'}`}>
                  {msg.timestamp}
                </span>
              </div>
            </div>
          );
        })}

        {isThinking && (
          <div className="flex items-center gap-2 text-xs text-[#3A2418] font-semibold bg-[#F4E3C8] p-2.5 rounded-xl max-w-[70%] animate-pulse border border-[#C9974D]/40">
            <img src="/tita.png" alt="Tita" className="w-4 h-4 object-contain animate-bounce" />
            <span>Tita está pensando...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-2.5 bg-[#F4E3C8]/40 border-t border-[#F4E3C8] overflow-x-auto no-scrollbar">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#3A2418] mb-1.5 px-1 font-serif">
          {effectiveTableNumber ? 'Puedo ayudarte con:' : 'Preguntas sugeridas:'}
        </p>
        <div className="flex items-center gap-1.5 min-w-max">
          {suggestions.map((sug, i) => (
            <button
              key={i}
              onClick={() => handleSendMessage(sug)}
              disabled={isLoading}
              className="text-[11px] bg-[#FFF7EA] hover:bg-[#F4E3C8] text-[#3A2418] font-semibold border border-[#F4E3C8] px-2.5 py-1 rounded-xl shadow-2xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {sug}
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="p-3 bg-[#FFF7EA] border-t border-[#F4E3C8] flex items-center gap-2"
      >
        <input
          type="text"
          placeholder={effectiveTableNumber ? `Pregunta desde Mesa ${effectiveTableNumber}...` : 'Escribe tu mensaje a Tita...'}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={isLoading}
          className="flex-1 px-3 py-2 text-xs bg-white border border-[#F4E3C8] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#A86B3D] text-[#2B1B13] placeholder-[#A86B3D]/70"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isLoading}
          className="p-2 bg-gradient-to-r from-[#C77B4A] to-[#A86B3D] hover:from-[#d68a57] hover:to-[#ba7845] disabled:opacity-50 text-white rounded-xl shadow-sm transition-all cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
