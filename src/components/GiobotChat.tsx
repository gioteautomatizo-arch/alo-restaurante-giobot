import React, { useState, useRef, useEffect } from 'react';
import { CartItem, ChatMessage, MenuItem } from '../types';
import { Send, X, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { getDailyMenuConfig, getRestaurantInfo } from '../lib/adminStorage';

interface GiobotChatProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSaladBuilder: () => void;
  onOpenComidaCorridaBuilder: () => void;
  menuItems: MenuItem[];
  onAddToCart: (cartItem: CartItem) => void;
  onSelectMenuItem: (item: MenuItem) => void;
  onOpenCart: () => void;
  tableNumber?: number | null;
  selectedPersonLabel?: string | null;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'welcome',
    sender: 'giobot',
    text: 'Hola 👋 Soy Tita, tu anfitriona de Restaurante Calientito. Puedo ayudarte a elegir platillos, resolver dudas sobre el menú o preparar tu pedido. ¿En qué puedo consentirte hoy? 😊',
    timestamp: 'Ahora',
  },
];

const SUGGESTIONS = [
  '🍽️ Quiero pedir algo',
  '🍲 ¿Qué incluye la Comida Corrida?',
  '📍 ¿Cuál es su ubicación y horarios?',
  '⭐ ¿Cómo funciona la Tarjeta VIP?',
  '🌱 ¿Cómo aplica el descuento ecológico?',
];

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const productMatchesConversation = (item: MenuItem, conversationText: string): boolean => {
  const haystack = normalizeText(conversationText);
  const itemName = normalizeText(item.name);
  if (!itemName || !haystack) return false;

  if (haystack.includes(itemName)) return true;

  const meaningfulWords = itemName
    .split(' ')
    .filter((word) => word.length >= 5 && !['tradicionales', 'especial', 'sencilla'].includes(word));

  return meaningfulWords.length > 0 && meaningfulWords.every((word) => haystack.includes(word));
};

const createBasicCartItem = (item: MenuItem): CartItem => ({
  cartId: `${item.id}-tita-${Date.now()}`,
  item,
  quantity: 1,
  selectedExtras: [],
  unitPrice: item.price,
  totalPrice: item.price,
});

export const GiobotChat: React.FC<GiobotChatProps> = ({
  isOpen,
  onClose,
  onOpenSaladBuilder,
  onOpenComidaCorridaBuilder,
  menuItems,
  onAddToCart,
  onSelectMenuItem,
  onOpenCart,
  tableNumber = null,
  selectedPersonLabel = null,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [menuSuggestions, setMenuSuggestions] = useState<MenuItem[]>([]);
  const [cartNotice, setCartNotice] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isThinking, isOpen, menuSuggestions, cartNotice]);

  if (!isOpen) return null;

  const refreshMenuSuggestions = (conversationText: string) => {
    const matches = menuItems
      .filter((item) => productMatchesConversation(item, conversationText))
      .sort((a, b) => b.name.length - a.name.length)
      .slice(0, 3);

    setMenuSuggestions(matches);
  };

  const addSuggestionToCart = (item: MenuItem) => {
    const needsCustomization =
      !!item.sizes?.length ||
      !!item.options?.length ||
      !!item.extras?.length ||
      item.id === 'arma-ensalada' ||
      item.id === 'comida-corrida';

    if (item.id === 'arma-ensalada') {
      onClose();
      onOpenSaladBuilder();
      return;
    }

    if (item.id === 'comida-corrida') {
      onClose();
      onOpenComidaCorridaBuilder();
      return;
    }

    if (needsCustomization) {
      onClose();
      onSelectMenuItem(item);
      return;
    }

    onAddToCart(createBasicCartItem(item));
    setCartNotice(`${item.name} fue agregado al carrito. Revísalo antes de enviar el pedido a cocina.`);
    setMenuSuggestions((current) => current.filter((candidate) => candidate.id !== item.id));
  };

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
    setCartNotice(null);

    let botMsgId: string | null = null;
    let accumulatedText = '';

    // Obtener menú del día actual de Firestore/espejo local
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
        };
      }
    } catch (err) {
      console.warn('No se pudo obtener el menú del día para Tita:', err);
    }

    // Obtener información dinámica del restaurante (Firestore / espejo local)
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

    const appContext = tableNumber
      ? `Contexto actual de la app: el cliente está en Mesa ${tableNumber}${selectedPersonLabel ? `, ${selectedPersonLabel}` : ''}. Si habla de pedir aquí, trátalo como consumo en mesa.`
      : 'Contexto actual de la app: el cliente está en la vista general. Si quiere pedir, confirma si será para llevar o a domicilio cuando haga falta.';

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.slice(-6),
          userPrompt: `${appContext}\n\nMensaje del cliente: ${prompt}`,
          dailyMenu: dailyMenuPayload,
          restaurantInfo: restaurantInfoPayload,
        }),
      });

      if (!response.ok) {
        throw new Error(`Error en el servidor: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No se recibió cuerpo de respuesta');
      }

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
          const currentTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const firstBotMsg: ChatMessage = {
            id: botMsgId,
            sender: 'giobot',
            text: accumulatedText,
            timestamp: currentTimestamp,
          };
          setMessages((prev) => [...prev, firstBotMsg]);
        } else {
          const currentText = accumulatedText;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === botMsgId ? { ...msg, text: currentText } : msg
            )
          );
        }
      }

      if (!botMsgId) {
        setIsThinking(false);
        const fallbackMsg: ChatMessage = {
          id: `giobot-${Date.now()}`,
          sender: 'giobot',
          text: accumulatedText || '¡Con gusto te ayudo! ¿En qué más puedo apoyarte? 😊',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, fallbackMsg]);
      }

      // Tita nunca crea un producto inventado: solo ofrece acciones sobre IDs que ya existen
      // en el catálogo público real que App recibió de Firestore.
      refreshMenuSuggestions(`${prompt}\n${accumulatedText}`);
    } catch (err) {
      console.error('Error contacting Giobot:', err);
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

  const contextLabel = tableNumber
    ? `Mesa ${tableNumber}${selectedPersonLabel ? ` · ${selectedPersonLabel}` : ''}`
    : 'Atención general';

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
            <h3 className="font-bold text-sm text-[#FFF7EA] flex items-center gap-1.5 font-serif">
              Tita 💬
              <span className="text-[10px] bg-[#4A2E1F] text-[#C9974D] px-2 py-0.5 rounded-full font-semibold border border-[#C9974D]/40 font-sans">
                Calientito
              </span>
            </h3>
            <p className="text-[11px] text-[#F4E3C8] truncate">{contextLabel}</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-xl bg-[#4A2E1F] hover:bg-[#5C3825] text-[#FFF7EA] transition-colors cursor-pointer"
          aria-label="Cerrar Tita"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-[#FFF7EA]">
        {messages.map((msg) => {
          const isGiobot = msg.sender === 'giobot';
          return (
            <div key={msg.id} className={`flex flex-col ${isGiobot ? 'items-start' : 'items-end'}`}>
              <div
                className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed shadow-2xs ${
                  isGiobot
                    ? 'bg-white border border-[#F4E3C8] text-[#2B1B13] rounded-tl-xs'
                    : 'bg-[#3A2418] text-[#FFF7EA] rounded-tr-xs font-medium'
                }`}
              >
                {isGiobot && (
                  <div className="flex items-center gap-1 mb-1 text-[10px] font-bold text-[#A86B3D] font-serif">
                    <img src="/tita.png" alt="Tita" className="w-3.5 h-3.5 object-contain" /> Tita
                  </div>
                )}
                <p className="whitespace-pre-wrap">{msg.text}</p>
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

        {menuSuggestions.length > 0 && !isLoading && (
          <div className="rounded-2xl border border-[#DEC8AE] bg-white p-3 space-y-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-[#A86B3D]">Opciones reales del menú</p>
              <p className="text-[11px] text-[#6B4028] mt-0.5">Tita encontró estos productos en el catálogo actual.</p>
            </div>
            <div className="space-y-1.5">
              {menuSuggestions.map((item) => {
                const needsCustomization = !!item.sizes?.length || !!item.options?.length || !!item.extras?.length;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addSuggestionToCart(item)}
                    className="w-full rounded-xl border border-[#E8D4BE] bg-[#FFF7EA] hover:bg-[#F4E3C8] px-3 py-2.5 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <span className="block text-xs font-bold text-[#3A2418] truncate">{item.name}</span>
                      <span className="block text-[10px] text-[#8A624C]">{needsCustomization ? 'Revisar opciones antes de agregar' : 'Agregar directo al carrito'}</span>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5 text-[#A86B3D]">
                      <span className="text-xs font-black">${item.price}</span>
                      {needsCustomization ? <UtensilsCrossed className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {cartNotice && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
            <p className="text-[11px] font-bold">✓ Tita preparó tu carrito</p>
            <p className="text-[10px] mt-0.5">{cartNotice}</p>
            <button
              type="button"
              onClick={onOpenCart}
              className="mt-2 w-full rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white py-2 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5" /> Ver y confirmar carrito
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-2.5 bg-[#F4E3C8]/40 border-t border-[#F4E3C8] overflow-x-auto no-scrollbar">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#3A2418] mb-1.5 px-1 font-serif">
          Preguntas sugeridas:
        </p>
        <div className="flex items-center gap-1.5 min-w-max">
          {SUGGESTIONS.map((sug, i) => (
            <button
              key={i}
              onClick={() => handleSendMessage(sug)}
              className="text-[11px] bg-[#FFF7EA] hover:bg-[#F4E3C8] text-[#3A2418] font-semibold border border-[#F4E3C8] px-2.5 py-1 rounded-xl shadow-2xs transition-all active:scale-95 cursor-pointer"
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
          placeholder="Escribe tu mensaje a Tita..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={isLoading}
          className="flex-1 px-3 py-2 text-xs bg-white border border-[#F4E3C8] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#A86B3D] text-[#2B1B13] placeholder-[#A86B3D]/70"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isLoading}
          className="p-2 bg-gradient-to-r from-[#C77B4A] to-[#A86B3D] hover:from-[#d68a57] hover:to-[#ba7845] disabled:opacity-50 text-white rounded-xl shadow-sm transition-all cursor-pointer"
          aria-label="Enviar mensaje a Tita"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
