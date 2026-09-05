import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { Bot, Send, X, Sparkles, MessageSquare, Coffee, Utensils, RefreshCw } from 'lucide-react';
import { getDailyMenuConfig, getRestaurantInfo } from '../lib/adminStorage';

interface GiobotChatProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSaladBuilder: () => void;
  onOpenComidaCorridaBuilder: () => void;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'welcome',
    sender: 'giobot',
    text: 'Hola 👋 Soy Tita, tu anfitriona de Restaurante Calientito. Puedo ayudarte a elegir platillos, resolver dudas sobre el menú o tomar tu pedido a domicilio y para llevar. ¿En qué puedo consentirte hoy? 😊',
    timestamp: 'Ahora',
  },
];

const SUGGESTIONS = [
  '📍 ¿Cuál es su ubicación y horarios?',
  '🧾 ¿Cómo pido a domicilio o anticipo por WhatsApp?',
  '🍲 ¿Qué incluye la Comida Corrida?',
  '⭐ ¿Cómo funciona la Tarjeta VIP?',
  '🌱 ¿Cómo aplica el descuento ecológico?',
];

export const GiobotChat: React.FC<GiobotChatProps> = ({
  isOpen,
  onClose,
  onOpenSaladBuilder,
  onOpenComidaCorridaBuilder,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isThinking, isOpen]);

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

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.slice(-6), // context window
          userPrompt: prompt,
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

      // Si por alguna razón el stream finalizó sin fragmentos
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
    } catch (err) {
      console.error('Error contacting Giobot:', err);
      // Solo mostrar error si la petición realmente falló antes de recibir respuesta
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

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-[#FFF7EA] shadow-2xl border-l border-[#F4E3C8] flex flex-col animate-slide-left">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#3A2418] via-[#4A2E1F] to-[#2B1B13] text-[#FFF7EA] p-4 flex items-center justify-between border-b border-[#4E3222]">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-2xl bg-[#FFF7EA] p-1 flex items-center justify-center shadow-md border border-[#C9974D]/40">
              <img src="/tita.png" alt="Tita" className="w-full h-full object-contain" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#3A2418]" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-[#FFF7EA] flex items-center gap-1.5 font-serif">
              Tita 💬
              <span className="text-[10px] bg-[#4A2E1F] text-[#C9974D] px-2 py-0.5 rounded-full font-semibold border border-[#C9974D]/40 font-sans">
                Restaurante Calientito
              </span>
            </h3>
            <p className="text-[11px] text-[#F4E3C8]">Tu anfitriona amable & asesora</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-xl bg-[#4A2E1F] hover:bg-[#5C3825] text-[#FFF7EA] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-[#FFF7EA]">
        {messages.map((msg) => {
          const isGiobot = msg.sender === 'giobot';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isGiobot ? 'items-start' : 'items-end'}`}
            >
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
                <span
                  className={`block text-[9px] mt-1 text-right ${
                    isGiobot ? 'text-[#A86B3D]/80' : 'text-[#F4E3C8]'
                  }`}
                >
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

      {/* Suggestion Chips */}
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

      {/* Input Form */}
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
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
