import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Send, Sparkles, X, BarChart3, HelpCircle, ClipboardList } from 'lucide-react';
import type { RestaurantOrder } from '../../types';
import {
  ADMIN_DATA_EVENT,
  getAuthSession,
  getCurrentShift,
  getDailyMenuConfig,
  getExpenses,
  getInventory,
  getRestaurantInfo,
} from '../../lib/adminStorage';
import { subscribeToRestaurantOrders } from '../../lib/ordersService';
import { subscribeToPendingTableRequests } from '../../lib/tableRequestsService';

type OwnerMessage = {
  id: string;
  sender: 'user' | 'tita';
  text: string;
  timestamp: string;
};

const INITIAL_MESSAGE: OwnerMessage = {
  id: 'owner-welcome',
  sender: 'tita',
  text: 'Hola 👋 Soy Tita Administrativa. Puedo explicarte cómo funciona la app y analizar lo que está pasando hoy en Restaurante Calientito. ¿Qué quieres revisar?',
  timestamp: 'Ahora',
};

const QUICK_PROMPTS = [
  { icon: BarChart3, text: '¿Cómo está el restaurante ahora?' },
  { icon: ClipboardList, text: '¿Qué debo revisar hoy?' },
  { icon: HelpCircle, text: 'Explícame cómo funciona el flujo de una mesa' },
  { icon: Sparkles, text: '¿Dónde cambio horarios, promociones o información?' },
];

const APP_GUIDE = {
  resumen: 'Resumen: panorama del turno, ventas, gastos, efectivo esperado y accesos rápidos.',
  mesas: 'Mesas: abrir/liberar mesas, comensales, mesero responsable, tiempos y solicitudes de servicio.',
  caja: 'Caja & Cobro: revisar cuentas de mesa y registrar el cobro.',
  comandas: 'Comandas: pedidos en tiempo real separados por Cocina y Cafetería, con estados independientes.',
  turno: 'Control de Turno: apertura, fondo inicial, seguimiento y cierre del turno.',
  gastos: 'Gastos & Comprobantes: registrar salidas de dinero y comprobantes.',
  sobre: 'Sobre / Resguardo: control del dinero físico resguardado.',
  cxc: 'CXC: cuentas por cobrar.',
  vip: 'Clientes VIP: perfiles, sellos y recompensas.',
  inventario: 'Inventario de Papel: conteos y consumo de insumos.',
  menu: 'Menú del Día: publicar comida corrida, guisados, agua y postre.',
  info: 'Info Restaurante: horarios, dirección, WhatsApp, descuentos, promociones y políticas.',
  historial: 'Historial de Cortes: consulta de turnos y cierres anteriores.',
  bitacora: 'Bitácora & Auditoría: registro de acciones administrativas.',
  usuarios: 'Colaboradores & Accesos: personal y permisos.',
  personalizacion: 'Ordenar: Dueña/Admin puede reordenar las pestañas desde el botón Ordenar; el orden queda guardado en ese dispositivo.',
  flujoMesa: 'Flujo recomendado: abrir mesa → elegir comensales/mesero → tomar pedido → Cocina/Cafetería → entregar → cuenta/cobro → liberar mesa.',
};

function isAdminWorkspaceVisible(): boolean {
  const headerText = (document.querySelector('header')?.textContent || '').toUpperCase();
  return headerText.includes('RESTAURANTE CALIENTITO') && headerText.includes('ADMINISTRACIÓN');
}

function nowLabel(): string {
  return new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function sameLocalDay(iso: string | undefined): boolean {
  if (!iso) return false;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toDateString() === new Date().toDateString();
}

function renderFormattedText(text: string): React.ReactNode {
  const lines = text.split('\n');

  return (
    <div className="space-y-1.5">
      {lines.map((line, lineIndex) => {
        if (!line.trim()) return <div key={`gap-${lineIndex}`} className="h-1" />;

        const parts = line.split(/(\*\*.*?\*\*)/g).filter(Boolean);
        const isBullet = /^\s*[-•]\s+/.test(line);
        const isNumbered = /^\s*\d+[.)]\s+/.test(line);

        return (
          <p
            key={`line-${lineIndex}`}
            className={`${isBullet || isNumbered ? 'pl-1' : ''} whitespace-pre-wrap`}
          >
            {parts.map((part, partIndex) => {
              const isBold = part.startsWith('**') && part.endsWith('**') && part.length > 4;
              if (isBold) {
                return (
                  <strong key={`part-${lineIndex}-${partIndex}`} className="font-black text-[#3A2418]">
                    {part.slice(2, -2)}
                  </strong>
                );
              }
              return <React.Fragment key={`part-${lineIndex}-${partIndex}`}>{part}</React.Fragment>;
            })}
          </p>
        );
      })}
    </div>
  );
}

export const AdminOwnerTita: React.FC = () => {
  const currentSession = getAuthSession();
  const currentUser = currentSession?.user || null;
  const canUseOwnerTita = currentUser?.role === 'DUEÑA' || currentUser?.role === 'ADMINISTRADOR';

  const [isVisible, setIsVisible] = useState(() => Boolean(canUseOwnerTita && isAdminWorkspaceVisible()));
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<OwnerMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [, forceRefresh] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => {
      setIsVisible(Boolean(canUseOwnerTita && isAdminWorkspaceVisible()));
    };

    check();
    window.addEventListener('hashchange', check);
    window.addEventListener('popstate', check);

    return () => {
      window.removeEventListener('hashchange', check);
      window.removeEventListener('popstate', check);
    };
  }, [canUseOwnerTita]);

  useEffect(() => {
    if (!canUseOwnerTita) return;
    const unsubOrders = subscribeToRestaurantOrders(setOrders);
    const unsubRequests = subscribeToPendingTableRequests((requests) => setPendingRequests(requests.length));
    const handleData = () => forceRefresh((value) => value + 1);
    window.addEventListener(ADMIN_DATA_EVENT, handleData);

    return () => {
      unsubOrders();
      unsubRequests();
      window.removeEventListener(ADMIN_DATA_EVENT, handleData);
    };
  }, [canUseOwnerTita]);

  useEffect(() => {
    if (isOpen) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, isOpen]);

  useEffect(() => {
    if (!isVisible && isOpen) setIsOpen(false);
  }, [isVisible, isOpen]);

  const adminContext = useMemo(() => {
    const todayOrders = orders.filter((order) => sameLocalDay(order.createdAt));
    const activeOrders = todayOrders.filter((order) => order.status !== 'CANCELADO');
    const statusCounts = todayOrders.reduce<Record<string, number>>((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {});

    const productCounts = new Map<string, number>();
    activeOrders.forEach((order) => {
      order.items.forEach((item) => {
        productCounts.set(item.name, (productCounts.get(item.name) || 0) + (item.quantity || 0));
      });
    });

    const topProducts = Array.from(productCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, quantity]) => ({ name, quantity }));

    const shift = getCurrentShift();
    const shiftExpenses = shift ? getExpenses(shift.id) : [];
    const inventory = getInventory();
    const info = getRestaurantInfo();
    const dailyMenu = getDailyMenuConfig();

    return {
      generatedAt: new Date().toISOString(),
      user: currentUser ? { name: currentUser.name, role: currentUser.role } : null,
      shift: shift
        ? {
            status: shift.status,
            type: shift.shiftType,
            responsible: shift.responsibleUser,
            totalSales: shift.totalSales,
            salesCash: shift.salesCash,
            salesCard: shift.salesCard,
            salesPlatforms: shift.salesPlatforms,
            initialCashFund: shift.initialCashFund,
            expectedCash: shift.expectedCash,
            cashExpenses: shift.cashExpenses,
            expenseRecords: shiftExpenses.length,
          }
        : null,
      today: {
        ordersTotal: todayOrders.length,
        newOrders: statusCounts.NUEVO || 0,
        preparingOrders: statusCounts.PREPARANDO || 0,
        readyOrders: statusCounts.LISTO || 0,
        deliveredOrders: statusCounts.ENTREGADO || 0,
        cancelledOrders: statusCounts.CANCELADO || 0,
        pendingTableRequests: pendingRequests,
        topProducts,
      },
      inventory: {
        items: inventory.length,
        totalConsumption: inventory.reduce((sum, item) => sum + (item.consumption || 0), 0),
      },
      restaurant: {
        openingHours: info.openingHours,
        address: info.address,
        deliveryFee: info.deliveryFee,
        ecoDiscountPercent: info.ecoDiscountPercent,
        activePromotions: info.activePromotions,
      },
      dailyMenu: dailyMenu
        ? {
            available: dailyMenu.isAvailable !== false,
            price: dailyMenu.price,
            entrada: dailyMenu.entrada,
            platoFuerte: dailyMenu.platoFuerte,
            guarniciones: dailyMenu.guarniciones,
            aguaDelDia: dailyMenu.aguaDelDia,
            postreDelDia: dailyMenu.postreDelDia,
          }
        : null,
      appGuide: APP_GUIDE,
    };
  }, [orders, pendingRequests, currentUser]);

  const sendMessage = async (text?: string) => {
    const prompt = (text || input).trim();
    if (!prompt || isLoading) return;

    const userMessage: OwnerMessage = {
      id: `owner-user-${Date.now()}`,
      sender: 'user',
      text: prompt,
      timestamp: nowLabel(),
    };
    const conversation = [...messages, userMessage];
    setMessages(conversation);
    setInput('');
    setIsLoading(true);

    let botId: string | null = null;
    let accumulated = '';

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'owner',
          messages: conversation.slice(-8).map((message) => ({
            sender: message.sender === 'tita' ? 'giobot' : 'user',
            text: message.text,
          })),
          userPrompt: prompt,
          adminContext,
        }),
      });

      if (!response.ok || !response.body) throw new Error(`Error ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        accumulated += chunk;

        if (!botId) {
          botId = `owner-tita-${Date.now()}`;
          setMessages((prev) => [
            ...prev,
            { id: botId!, sender: 'tita', text: accumulated, timestamp: nowLabel() },
          ]);
        } else {
          setMessages((prev) => prev.map((message) => (
            message.id === botId ? { ...message, text: accumulated } : message
          )));
        }
      }

      if (!botId) {
        setMessages((prev) => [
          ...prev,
          {
            id: `owner-tita-${Date.now()}`,
            sender: 'tita',
            text: accumulated || 'Puedo ayudarte a revisar la operación o explicarte cualquier parte de la app.',
            timestamp: nowLabel(),
          },
        ]);
      }
    } catch (error) {
      console.error('[Tita Administrativa] error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `owner-tita-error-${Date.now()}`,
          sender: 'tita',
          text: 'Tuve un problema de conexión. Los datos del panel siguen intactos; intenta preguntarme de nuevo.',
          timestamp: 'Ahora',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isVisible || typeof document === 'undefined') return null;

  return createPortal(
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-4 z-[75] flex items-center gap-2 rounded-full border border-[#C9974D] bg-[#3A2418] px-3 py-2.5 text-xs font-bold text-[#FFF7EA] shadow-2xl active:scale-95"
          title="Abrir Tita Administrativa"
        >
          <div className="h-8 w-8 rounded-full bg-[#FFF7EA] p-0.5">
            <img src="/tita.png" alt="Tita" className="h-full w-full object-contain" />
          </div>
          <span>Tita Administrativa</span>
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[110] bg-black/45 sm:bg-black/25" onClick={() => setIsOpen(false)}>
          <section
            className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-[#C9974D]/40 bg-[#FFF7EA] shadow-2xl sm:w-[430px]"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between bg-gradient-to-r from-[#3A2418] to-[#4A2E1F] p-4 text-[#FFF7EA]">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl border border-[#C9974D]/50 bg-[#FFF7EA] p-1">
                  <img src="/tita.png" alt="Tita" className="h-full w-full object-contain" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-serif text-base font-black">Tita Administrativa</h2>
                    <span className="rounded-full border border-emerald-400/40 bg-emerald-950/50 px-2 py-0.5 text-[9px] font-bold text-emerald-300">OPERACIÓN</span>
                  </div>
                  <p className="text-[11px] text-[#F4E3C8]">Ayuda de la app + análisis del restaurante</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20"
                aria-label="Cerrar Tita Administrativa"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="border-b border-[#DEC8AE] bg-[#FFFDF9] px-3 py-2.5">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {QUICK_PROMPTS.map(({ icon: Icon, text }) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => void sendMessage(text)}
                    disabled={isLoading}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[#DEC8AE] bg-white px-3 py-2 text-[10px] font-bold text-[#5C3825] disabled:opacity-50"
                  >
                    <Icon className="h-3.5 w-3.5 text-[#A86B3D]" />
                    {text}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.sender === 'tita' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[88%] rounded-2xl px-3.5 py-3 text-xs leading-relaxed shadow-xs ${
                    message.sender === 'tita'
                      ? 'rounded-tl-sm border border-[#F4E3C8] bg-white text-[#2B1B13]'
                      : 'rounded-tr-sm bg-[#3A2418] text-[#FFF7EA]'
                  }`}>
                    {message.sender === 'tita' ? (
                      renderFormattedText(message.text)
                    ) : (
                      <p className="whitespace-pre-wrap">{message.text}</p>
                    )}
                    <span className={`mt-1 block text-[9px] ${message.sender === 'tita' ? 'text-[#A86B3D]' : 'text-[#EAD9C4]'}`}>
                      {message.timestamp}
                    </span>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-[#F4E3C8] bg-white px-3.5 py-3 text-xs text-[#6B4028]">
                    <Bot className="h-4 w-4 animate-pulse text-[#A86B3D]" />
                    Analizando datos actuales…
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="border-t border-[#DEC8AE] bg-[#FFFDF9] p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] text-[#8A624C]">
                <Sparkles className="h-3 w-3 text-[#C9974D]" />
                Tita recibe un resumen operativo, no acceso libre a la base de datos.
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder="Pregunta sobre la app o la operación…"
                  rows={2}
                  className="min-h-[46px] flex-1 resize-none rounded-2xl border border-[#DEC8AE] bg-white px-3 py-2.5 text-xs text-[#2B1B13] outline-none focus:ring-2 focus:ring-[#C9974D]/40"
                />
                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={isLoading || !input.trim()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#3A2418] text-[#FFF7EA] shadow-md disabled:opacity-40"
                  aria-label="Enviar pregunta a Tita"
                >
                  <Send className="h-4 w-4 text-[#C9974D]" />
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>,
    document.body
  );
};
