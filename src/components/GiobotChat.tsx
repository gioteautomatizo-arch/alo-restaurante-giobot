import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { Bot, Send, X, Sparkles, MessageSquare, Coffee, Utensils, RefreshCw } from 'lucide-react';

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
    text: 'Hola 👋 Soy Giobot, tu asesor de ¡Aló! Restaurante. Puedo ayudarte a elegir platillos, resolver dudas sobre el menú o tomar tu pedido a domicilio y para llevar. ¿En qué puedo consentirte hoy? 😊',
    timestamp: 'Ahora',
  },
];

const SUGGESTIONS = [
  '📍 ¿Cuál es su ubicación y horarios?',
  '🧾 ¿Cómo pido a domicilio o anticipo por WhatsApp?',
  '🍲 ¿Qué incluye la Comida Corrida ($90)?',
  '⭐ ¿Cómo funciona la Tarjeta Aló! VIP?',
  '🌱 ¿Cómo aplica el 10% de descuento eco?',
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

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

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.slice(-6), // context window
          userPrompt: prompt,
        }),
      });

      const data = await response.json();

      const giobotMsg: ChatMessage = {
        id: `giobot-${Date.now()}`,
        sender: 'giobot',
        text: data.text || '¡Con gusto te ayudo! 😊',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, giobotMsg]);
    } catch (err) {
      console.error('Error contacting Giobot:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'giobot',
          text: '¡Ay! Tuve una pequeña falla de conexión. Pero estoy listo para ayudarte, pregúntame de nuevo. 😊',
          timestamp: 'Ahora',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-white shadow-2xl border-l border-[#1f402c]/30 flex flex-col animate-slide-left">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#162e1e] via-[#1a3824] to-[#0f1f14] text-stone-100 p-4 flex items-center justify-between border-b border-[#1f402c]">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-2xl bg-[#d1a85b] text-[#162e1e] flex items-center justify-center font-black text-xl shadow-md border border-[#fcfaf6]/30">
              🤖
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#162e1e]" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-[#fcfaf6] flex items-center gap-1.5">
              Giobot 💬
              <span className="text-[10px] bg-[#1f402c] text-[#d1a85b] px-2 py-0.5 rounded-full font-semibold border border-[#b48a44]/40">
                ¡Aló! Restaurante
              </span>
            </h3>
            <p className="text-[11px] text-stone-300">Tu anfitrión virtual amable & servidor</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-xl bg-[#1f402c] hover:bg-[#285239] text-stone-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-[#fcfaf6]">
        {messages.map((msg) => {
          const isGiobot = msg.sender === 'giobot';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isGiobot ? 'items-start' : 'items-end'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed shadow-xs ${
                  isGiobot
                    ? 'bg-white border border-stone-200 text-stone-900 rounded-tl-xs'
                    : 'bg-[#162e1e] text-[#fcfaf6] rounded-tr-xs font-medium'
                }`}
              >
                {isGiobot && (
                  <div className="flex items-center gap-1 mb-1 text-[10px] font-bold text-[#b48a44]">
                    <Bot className="w-3 h-3" /> Giobot
                  </div>
                )}
                <p className="whitespace-pre-wrap">{msg.text}</p>
                <span
                  className={`block text-[9px] mt-1 text-right ${
                    isGiobot ? 'text-stone-400' : 'text-stone-300'
                  }`}
                >
                  {msg.timestamp}
                </span>
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-[#162e1e] font-semibold bg-[#162e1e]/10 p-2.5 rounded-xl max-w-[70%] animate-pulse border border-[#162e1e]/20">
            <Bot className="w-4 h-4 text-[#162e1e] animate-spin" />
            <span>Giobot está escribiendo...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion Chips */}
      <div className="p-2.5 bg-[#f7f5ef] border-t border-stone-200 overflow-x-auto no-scrollbar">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#162e1e] mb-1.5 px-1">
          Preguntas sugeridas:
        </p>
        <div className="flex items-center gap-1.5 min-w-max">
          {SUGGESTIONS.map((sug, i) => (
            <button
              key={i}
              onClick={() => handleSendMessage(sug)}
              className="text-[11px] bg-white hover:bg-[#162e1e]/5 text-stone-800 font-semibold border border-stone-300 px-2.5 py-1 rounded-xl shadow-2xs transition-all active:scale-95 cursor-pointer"
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
        className="p-3 bg-white border-t border-stone-200 flex items-center gap-2"
      >
        <input
          type="text"
          placeholder="Escribe tu mensaje a Giobot..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={isLoading}
          className="flex-1 px-3 py-2 text-xs bg-stone-100 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#162e1e] text-stone-900 placeholder-stone-400"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isLoading}
          className="p-2 bg-[#162e1e] hover:bg-[#1f402c] disabled:opacity-50 text-white rounded-xl shadow-sm transition-all cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
