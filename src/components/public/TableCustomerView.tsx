import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createPublicServiceRequest,
  subscribeToTableRequestsForTable,
} from '../../lib/tableRequestsService';
import {
  activatePublicTableSession,
  getSessionPersons,
  getTableAccountSelection,
  getTablePersonSelection,
  setTableAccountSelection,
  setTablePersonSelection,
  subscribeToTableSession,
} from '../../lib/tableSessionsService';
import { subscribeToTableOrders } from '../../lib/ordersService';
import { getEffectiveService } from '../../lib/adminStorage';
import {
  CategoryId,
  RestaurantOrder,
  TableServiceRequestType,
  TableSession,
  TableSessionPerson,
  EffectiveService,
} from '../../types';
import {
  Bell,
  Check,
  ReceiptText,
  Sparkles,
  Utensils,
  X,
} from 'lucide-react';

interface TableCustomerViewProps {
  tableNumber: number;
  onExploreMenu?: () => void;
  onSelectCategory?: (category: CategoryId) => void;
  onOpenComidaCorrida?: () => void;
  onPersonSelectionChange?: (person: TableSessionPerson | null) => void;
}

interface OperationalOption {
  type: TableServiceRequestType;
  label: string;
  icon: string;
  shortDesc: string;
}

const BASE_OPERATIONAL_REQUESTS: OperationalOption[] = [
  {
    type: 'LLAMAR_MESERO',
    label: 'Llamar mesero',
    icon: '🙋‍♂️',
    shortDesc: 'Un mesero se acercará a tu mesa',
  },
  {
    type: 'TORTILLAS',
    label: 'Tortillas',
    icon: '🌮',
    shortDesc: 'Tortillas calientes para tu comida',
  },
  {
    type: 'BEBIDAS',
    label: 'Bebidas',
    icon: '🥤',
    shortDesc: 'Pide otra bebida de nuestra carta',
  },
  {
    type: 'PEDIR_CUENTA',
    label: 'Pedir cuenta',
    icon: '💳',
    shortDesc: 'Solicitar la cuenta para pagar',
  },
];

const COMIDA_CORRIDA_REQUESTS: OperationalOption[] = [
  {
    type: 'SEGUNDO_TIEMPO',
    label: 'Segundo tiempo',
    icon: '🍽️',
    shortDesc: 'Listos para sopa, arroz o pasta',
  },
  {
    type: 'TERCER_TIEMPO',
    label: 'Tercer tiempo',
    icon: '🍮',
    shortDesc: 'Listos para el guisado o plato fuerte',
  },
];

export const TableCustomerView: React.FC<TableCustomerViewProps> = ({
  tableNumber,
  onExploreMenu,
  onSelectCategory,
  onOpenComidaCorrida,
  onPersonSelectionChange,
}) => {
  const [session, setSession] = useState<TableSession | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  // Modal para "🔔 Necesito algo"
  const [isOperationalModalOpen, setIsOperationalModalOpen] = useState(false);

  // Pedidos de la mesa para verificar si tiene Comida Corrida activa
  const [tableOrders, setTableOrders] = useState<RestaurantOrder[]>([]);

  // Estado del servicio actual según servicio efectivo (AUTO | DESAYUNO | COMIDA)
  const [effectiveService, setEffectiveService] = useState<EffectiveService>(() => getEffectiveService());
  const isDesayuno = effectiveService === 'DESAYUNO';

  // Solicitudes operativas en tiempo real (Firestore)
  const [submittingType, setSubmittingType] = useState<TableServiceRequestType | null>(null);
  const [pendingTypes, setPendingTypes] = useState<Set<TableServiceRequestType>>(new Set());
  const [attendedTypes, setAttendedTypes] = useState<Set<TableServiceRequestType>>(new Set());
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const previousPendingRef = useRef<Set<TableServiceRequestType>>(new Set());
  const listenerReadyRef = useRef(false);
  const attendedTimersRef = useRef<Partial<Record<TableServiceRequestType, ReturnType<typeof setTimeout>>>>({});
  const autoStartedRef = useRef(false);

  // Escuchar configuración del servicio y evaluar cambios (por ej. corte exacto a las 12:00)
  useEffect(() => {
    const updateService = () => {
      setEffectiveService(getEffectiveService());
    };
    window.addEventListener('alo_admin_data_updated', updateService);
    window.addEventListener('storage', updateService);

    // Revisión periódica para sincronizar el corte exacto de hora en vivo
    const timer = setInterval(updateService, 15000);

    return () => {
      window.removeEventListener('alo_admin_data_updated', updateService);
      window.removeEventListener('storage', updateService);
      clearInterval(timer);
    };
  }, []);

  // Escuchar sesión de mesa en tiempo real
  useEffect(() => {
    setSessionLoaded(false);
    autoStartedRef.current = false;

    const unsubscribe = subscribeToTableSession(tableNumber, (nextSession) => {
      setSession(nextSession);
      setSessionLoaded(true);

      if (!nextSession) {
        setSelectedAccountId(null);
        setSelectedPersonId(null);
        onPersonSelectionChange?.(null);
        // Autoiniciar la sesión si no existe aún
        if (!autoStartedRef.current) {
          autoStartedRef.current = true;
          setSessionBusy(true);
          activatePublicTableSession(tableNumber, 2)
            .then((result) => {
              setSession(result.session);
            })
            .catch((err) => {
              console.warn('[TableCustomerView] auto-start session error:', err);
            })
            .finally(() => {
              setSessionBusy(false);
            });
        }
        return;
      }

      const persons = getSessionPersons(nextSession);
      const storedPersonId = getTablePersonSelection(tableNumber);
      const selectedPerson = persons.find((person) => person.id === storedPersonId) || persons[0];
      setSelectedPersonId(selectedPerson.id);
      setTablePersonSelection(tableNumber, selectedPerson.id);
      onPersonSelectionChange?.(selectedPerson);

      if (nextSession.accountMode === 'GENERAL') {
        const generalId = nextSession.accounts[0]?.id || 'general';
        setSelectedAccountId(generalId);
        setTableAccountSelection(tableNumber, generalId);
        return;
      }

      const stored = getTableAccountSelection(tableNumber);
      const preferredAccountId = selectedPerson.accountId;
      const validStored = nextSession.accounts.some((account) => account.id === stored);
      const nextAccountId = validStored
        ? stored
        : (nextSession.accounts.find((account) => account.id === preferredAccountId)?.id || nextSession.accounts[0]?.id || null);
      setSelectedAccountId(nextAccountId);
      if (nextAccountId) setTableAccountSelection(tableNumber, nextAccountId);
    });

    return unsubscribe;
  }, [tableNumber]);

  // Escuchar pedidos de la mesa para detectar Comida Corrida activa
  useEffect(() => {
    const unsubscribe = subscribeToTableOrders(tableNumber, (orders) => {
      setTableOrders(orders);
    });
    return unsubscribe;
  }, [tableNumber]);

  // Verificar si la persona/cuenta actual tiene Comida Corrida activa
  const hasActiveComidaCorrida = useMemo(() => {
    const activeOrders = tableOrders.filter(
      (o) => o.status !== 'CANCELADO' && o.billingStatus !== 'PAGADO'
    );

    return activeOrders.some((order) => {
      if (session?.accountMode === 'SEPARADAS' && selectedAccountId && order.accountId !== selectedAccountId) {
        return false;
      }

      return order.items.some((item) => {
        const isComida =
          item.productId === 'comida-corrida' ||
          item.name.toLowerCase().includes('comida corrida');
        if (!isComida) return false;

        // Pedidos anteriores a V4.3A no tienen personId; se conservan como compatibles.
        if (!selectedPersonId) return true;
        return !item.personId || item.personId === selectedPersonId;
      });
    });
  }, [tableOrders, session?.accountMode, selectedAccountId, selectedPersonId]);

  // Escuchar solicitudes de servicio de esta mesa en tiempo real por Firestore
  useEffect(() => {
    listenerReadyRef.current = false;
    previousPendingRef.current = new Set();
    setPendingTypes(new Set());
    setAttendedTypes(new Set());

    const unsubscribe = subscribeToTableRequestsForTable(tableNumber, (requests) => {
      const nextPending = new Set<TableServiceRequestType>(
        requests.map((request) => request.requestType)
      );

      if (listenerReadyRef.current) {
        const resolvedNow = [...previousPendingRef.current].filter(
          (type) => !nextPending.has(type)
        );

        if (resolvedNow.length > 0) {
          setAttendedTypes((current) => {
            const updated = new Set(current);
            resolvedNow.forEach((type) => updated.add(type));
            return updated;
          });

          resolvedNow.forEach((type) => {
            try {
              localStorage.removeItem(`alo_qr_req_${tableNumber}_${type}`);
            } catch {
              // ignore
            }

            const previousTimer = attendedTimersRef.current[type];
            if (previousTimer) clearTimeout(previousTimer);

            attendedTimersRef.current[type] = setTimeout(() => {
              setAttendedTypes((current) => {
                const updated = new Set(current);
                updated.delete(type);
                return updated;
              });
              delete attendedTimersRef.current[type];
            }, 1800);
          });
        }
      } else {
        listenerReadyRef.current = true;
      }

      previousPendingRef.current = nextPending;
      setPendingTypes(nextPending);
    });

    return () => {
      unsubscribe();
      const timers = attendedTimersRef.current;
      (Object.keys(timers) as TableServiceRequestType[]).forEach((key) => {
        const timer = timers[key];
        if (timer) clearTimeout(timer);
      });
      attendedTimersRef.current = {};
    };
  }, [tableNumber]);

  const choosePerson = (person: TableSessionPerson) => {
    setSelectedPersonId(person.id);
    setTablePersonSelection(tableNumber, person.id);
    onPersonSelectionChange?.(person);

    // Si la mesa trabaja con cuentas separadas, Persona N queda vinculada a Cuenta N.
    if (session?.accountMode === 'SEPARADAS') {
      const mappedAccount = session.accounts.find((account) => account.id === person.accountId);
      if (mappedAccount) {
        setSelectedAccountId(mappedAccount.id);
        setTableAccountSelection(tableNumber, mappedAccount.id);
      }
    }

    setFeedbackMessage(`${person.label} seleccionada ✓`);
    setTimeout(() => setFeedbackMessage(null), 1800);
  };

  const chooseAccount = (accountId: string) => {
    setSelectedAccountId(accountId);
    setTableAccountSelection(tableNumber, accountId);
    setFeedbackMessage('Cuenta seleccionada ✓');
    setTimeout(() => setFeedbackMessage(null), 2000);
  };

  const handleRequestClick = async (requestType: TableServiceRequestType) => {
    if (pendingTypes.has(requestType)) {
      setFeedbackMessage('Ya avisamos al equipo ✓');
      setTimeout(() => setFeedbackMessage(null), 3000);
      return;
    }

    if (attendedTypes.has(requestType)) return;

    setSubmittingType(requestType);
    try {
      const res = await createPublicServiceRequest(tableNumber, requestType);
      if (!res.success) {
        setPendingTypes((current) => {
          const updated = new Set(current);
          updated.delete(requestType);
          return updated;
        });
        setFeedbackMessage(res.message || 'No pudimos enviar la solicitud. Intenta de nuevo.');
        return;
      }

      setPendingTypes((current) => {
        const updated = new Set(current);
        updated.add(requestType);
        return updated;
      });
      setFeedbackMessage(res.alreadyPending ? 'Ya avisamos al equipo ✓' : 'Solicitud enviada ✓');
    } catch {
      setFeedbackMessage('No pudimos enviar la solicitud. Intenta de nuevo.');
    } finally {
      setSubmittingType(null);
      setTimeout(() => setFeedbackMessage(null), 3500);
    }
  };

  // Opciones operativas para el modal "🔔 Necesito algo"
  const operationalOptions = useMemo(() => {
    if (hasActiveComidaCorrida) {
      return [...BASE_OPERATIONAL_REQUESTS, ...COMIDA_CORRIDA_REQUESTS];
    }
    return BASE_OPERATIONAL_REQUESTS;
  }, [hasActiveComidaCorrida]);

  if (!sessionLoaded && sessionBusy) {
    return (
      <section className="w-full max-w-3xl mx-auto my-2 px-3 sm:px-4">
        <div className="bg-[#FFFDF9] rounded-2xl p-5 border border-[#E6CCA8] shadow-sm text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#3A2418] text-[#FFF7EA] text-xs font-serif font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Mesa {tableNumber}
          </div>
          <p className="text-xs sm:text-sm text-[#5C3825] mt-2 font-medium">
            Iniciando tu servicio en Mesa {tableNumber}…
          </p>
        </div>
      </section>
    );
  }

  if (session && session.status === 'CERRADA') {
    return (
      <section className="w-full max-w-3xl mx-auto my-2 px-3 sm:px-4">
        <div className="bg-[#FFFDF9] rounded-2xl p-5 border border-emerald-300 shadow-sm text-center space-y-1.5">
          <Check className="w-7 h-7 text-emerald-600 mx-auto" />
          <h2 className="font-serif font-bold text-base sm:text-lg text-[#2B1B13]">
            Servicio finalizado · Mesa {tableNumber}
          </h2>
          <p className="text-xs text-[#5C3825]">Gracias por visitarnos. ¡Buen provecho y vuelve pronto!</p>
        </div>
      </section>
    );
  }

  return (
    <section id="atencion-mesa" className="w-full max-w-3xl mx-auto my-2 sm:my-3 px-3 sm:px-4">
      {/* Contenedor Principal: Enfoque 100% en Ordenar */}
      <div className="bg-gradient-to-b from-[#FFFDF9] to-[#FFF7EA] rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-[#E6CCA8] shadow-sm space-y-4">
        
        {/* Encabezado Directo y Claro */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1 border-b border-[#E6CCA8]/50">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#3A2418] text-[#FFF7EA] text-xs font-serif font-bold tracking-wide shadow-2xs mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Mesa {tableNumber}</span>
            </div>
            <h1 className="text-lg sm:text-xl font-serif font-black text-[#2B1B13] tracking-tight">
              Tu servicio ha comenzado
            </h1>
            <p className="text-xs sm:text-sm text-[#6B4028] font-medium mt-0.5">
              ¿Qué te gustaría ordenar?
            </p>
          </div>

          {/* Botón Secundario: 🔔 Necesito algo */}
          <div className="sm:self-center">
            <button
              id="btn-necesito-algo"
              type="button"
              onClick={() => setIsOperationalModalOpen(true)}
              className="relative inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-[#FFF7EA] border border-[#DEC8AE] hover:border-[#C9974D] text-[#3A2418] text-xs font-serif font-bold shadow-2xs transition-all cursor-pointer active:scale-95"
            >
              <Bell className="w-3.5 h-3.5 text-[#C9974D]" />
              <span>Necesito algo</span>
              {pendingTypes.size > 0 && (
                <span className="bg-emerald-600 text-white text-[10px] font-sans font-bold px-1.5 py-0.2 rounded-full">
                  {pendingTypes.size} activo{pendingTypes.size > 1 ? 's' : ''}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Notificación temporal de acción */}
        {feedbackMessage && (
          <div className="bg-emerald-600 text-white px-3.5 py-2 rounded-xl text-center text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all animate-fadeIn">
            <Check className="w-3.5 h-3.5 text-emerald-200 shrink-0" />
            <span>{feedbackMessage}</span>
          </div>
        )}

        {/* V4.3A - Persona que está ordenando. Se guarda por dispositivo/navegador. */}
        {session && session.guestCount > 1 && (
          <div className="bg-white rounded-xl border border-[#DEC8AE] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B4028]">
                ¿Quién está ordenando?
              </span>
              <span className="text-[10px] text-[#8A624C]">
                {session.guestCount} personas
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {getSessionPersons(session).map((person) => {
                const active = selectedPersonId === person.id;
                return (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => choosePerson(person)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                      active
                        ? 'bg-emerald-700 border-emerald-700 text-white shadow-2xs'
                        : 'bg-[#FFF7EA] border-[#DEC8AE] text-[#5C3825] hover:bg-[#F4E3C8]'
                    }`}
                  >
                    {active ? '✓ ' : ''}{person.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-[#8A624C]">
              Tus platillos quedarán identificados con esta persona aunque todos paguen en una sola cuenta.
            </p>
          </div>
        )}

        {/* Cuentas separadas si la mesa está configurada así */}
        {session && session.accountMode === 'SEPARADAS' && (
          <div className="bg-white rounded-xl border border-[#DEC8AE] p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <ReceiptText className="w-3.5 h-3.5 text-[#C9974D]" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B4028]">
                Elige tu cuenta para ordenar
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {session.accounts.map((account) => {
                const active = selectedAccountId === account.id;
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => chooseAccount(account.id)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                      active
                        ? 'bg-[#3A2418] border-[#3A2418] text-[#FFF7EA] shadow-2xs'
                        : 'bg-[#FFF7EA] border-[#DEC8AE] text-[#5C3825] hover:bg-[#F4E3C8]'
                    }`}
                  >
                    {active ? '✓ ' : ''}{account.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Tarjetas de Selección de Orden Principal */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
          {isDesayuno ? (
            /* Servicio actual: DESAYUNO */
            <>
              <button
                id="btn-ordenar-desayunos"
                type="button"
                onClick={() => {
                  onSelectCategory?.('desayunos');
                  onExploreMenu?.();
                }}
                className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border-2 border-[#E6CCA8] hover:border-[#C9974D] bg-white hover:bg-[#FFFDF9] text-left transition-all active:scale-[0.98] shadow-2xs group cursor-pointer flex flex-row sm:flex-col items-center sm:items-start gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-[#FFF7EA] border border-[#F4E3C8] flex items-center justify-center text-xl shrink-0 group-hover:scale-105 transition-transform">
                  🍳
                </div>
                <div className="flex-1">
                  <span className="font-serif font-black text-sm sm:text-base text-[#2B1B13] block group-hover:text-[#A86B3D] transition-colors">
                    Desayunos
                  </span>
                  <p className="text-[11px] text-[#6B4028] mt-0.5 leading-snug line-clamp-2">
                    Chilaquiles, huevos al gusto, enfrijoladas y paquetes matutinos.
                  </p>
                </div>
              </button>

              <button
                id="btn-ordenar-carta"
                type="button"
                onClick={() => {
                  onSelectCategory?.('all');
                  onExploreMenu?.();
                }}
                className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border-2 border-[#E6CCA8] hover:border-[#C9974D] bg-white hover:bg-[#FFFDF9] text-left transition-all active:scale-[0.98] shadow-2xs group cursor-pointer flex flex-row sm:flex-col items-center sm:items-start gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-[#FFF7EA] border border-[#F4E3C8] flex items-center justify-center text-xl shrink-0 group-hover:scale-105 transition-transform">
                  🍽️
                </div>
                <div className="flex-1">
                  <span className="font-serif font-black text-sm sm:text-base text-[#2B1B13] block group-hover:text-[#A86B3D] transition-colors">
                    A la carta
                  </span>
                  <p className="text-[11px] text-[#6B4028] mt-0.5 leading-snug line-clamp-2">
                    Chapatas, hamburguesas, antojitos, especialidades y panadería.
                  </p>
                </div>
              </button>

              <button
                id="btn-ordenar-bebidas"
                type="button"
                onClick={() => {
                  onSelectCategory?.('bebidas');
                  onExploreMenu?.();
                }}
                className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border-2 border-[#E6CCA8] hover:border-[#C9974D] bg-white hover:bg-[#FFFDF9] text-left transition-all active:scale-[0.98] shadow-2xs group cursor-pointer flex flex-row sm:flex-col items-center sm:items-start gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-[#FFF7EA] border border-[#F4E3C8] flex items-center justify-center text-xl shrink-0 group-hover:scale-105 transition-transform">
                  🥤
                </div>
                <div className="flex-1">
                  <span className="font-serif font-black text-sm sm:text-base text-[#2B1B13] block group-hover:text-[#A86B3D] transition-colors">
                    Bebidas
                  </span>
                  <p className="text-[11px] text-[#6B4028] mt-0.5 leading-snug line-clamp-2">
                    Café de olla, infusiones, jugos naturales y licuados.
                  </p>
                </div>
              </button>
            </>
          ) : (
            /* Servicio actual: COMIDA */
            <>
              <button
                id="btn-ordenar-comida-corrida"
                type="button"
                onClick={() => {
                  if (onOpenComidaCorrida) {
                    onOpenComidaCorrida();
                  } else {
                    onSelectCategory?.('comida-corrida');
                    onExploreMenu?.();
                  }
                }}
                className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border-2 border-[#C9974D] bg-gradient-to-br from-[#FFFDF9] to-[#FFF7EA] hover:to-[#F4E3C8]/40 text-left transition-all active:scale-[0.98] shadow-xs group cursor-pointer flex flex-row sm:flex-col items-center sm:items-start gap-3 ring-1 ring-[#C9974D]/30"
              >
                <div className="w-10 h-10 rounded-xl bg-[#C9974D]/15 border border-[#C9974D]/40 flex items-center justify-center text-xl shrink-0 group-hover:scale-105 transition-transform">
                  🍲
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-serif font-black text-sm sm:text-base text-[#2B1B13] group-hover:text-[#A86B3D] transition-colors">
                      Comida Corrida / Menú del día
                    </span>
                    <span className="bg-[#3A2418] text-[#FFF7EA] text-[10px] font-serif font-bold px-1.5 py-0.5 rounded-md">
                      $90
                    </span>
                  </div>
                  <p className="text-[11px] text-[#6B4028] mt-0.5 leading-snug line-clamp-3">
                    3 tiempos: sopa/consomé, arroz/pasta y guisado. Incluye 1/2 L de agua del día y postre.
                  </p>
                </div>
              </button>

              <button
                id="btn-ordenar-carta"
                type="button"
                onClick={() => {
                  onSelectCategory?.('all');
                  onExploreMenu?.();
                }}
                className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border-2 border-[#E6CCA8] hover:border-[#C9974D] bg-white hover:bg-[#FFFDF9] text-left transition-all active:scale-[0.98] shadow-2xs group cursor-pointer flex flex-row sm:flex-col items-center sm:items-start gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-[#FFF7EA] border border-[#F4E3C8] flex items-center justify-center text-xl shrink-0 group-hover:scale-105 transition-transform">
                  🍽️
                </div>
                <div className="flex-1">
                  <span className="font-serif font-black text-sm sm:text-base text-[#2B1B13] block group-hover:text-[#A86B3D] transition-colors">
                    A la carta
                  </span>
                  <p className="text-[11px] text-[#6B4028] mt-0.5 leading-snug line-clamp-2">
                    Especialidades, hamburguesas, chapatas y antojitos mexicanos.
                  </p>
                </div>
              </button>

              <button
                id="btn-ordenar-bebidas"
                type="button"
                onClick={() => {
                  onSelectCategory?.('bebidas');
                  onExploreMenu?.();
                }}
                className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border-2 border-[#E6CCA8] hover:border-[#C9974D] bg-white hover:bg-[#FFFDF9] text-left transition-all active:scale-[0.98] shadow-2xs group cursor-pointer flex flex-row sm:flex-col items-center sm:items-start gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-[#FFF7EA] border border-[#F4E3C8] flex items-center justify-center text-xl shrink-0 group-hover:scale-105 transition-transform">
                  🥤
                </div>
                <div className="flex-1">
                  <span className="font-serif font-black text-sm sm:text-base text-[#2B1B13] block group-hover:text-[#A86B3D] transition-colors">
                    Bebidas
                  </span>
                  <p className="text-[11px] text-[#6B4028] mt-0.5 leading-snug line-clamp-2">
                    Aguas frescas del día, frappés, café y refrescos.
                  </p>
                </div>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Modal / Ventana Emergente: 🔔 Necesito algo */}
      {isOperationalModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fadeIn"
        >
          <div className="bg-[#FFFDF9] w-full max-w-lg rounded-3xl border-2 border-[#C9974D]/50 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Cabecera del Modal */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-[#3A2418] to-[#4A2E1F] text-[#FFF7EA] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-[#C9974D]/20 border border-[#C9974D]/40 flex items-center justify-center text-base">
                  🔔
                </span>
                <div>
                  <h3 className="font-serif font-bold text-base text-[#FFF7EA] leading-tight">
                    Atención en Mesa {tableNumber}
                  </h3>
                  <p className="text-[11px] text-[#F4E3C8]/80">
                    El personal recibirá tu aviso de inmediato
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOperationalModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-[#FFF7EA] flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Cerrar ventana de atención"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Contenido del Modal: Botones Operativos */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
              {feedbackMessage && (
                <div className="bg-emerald-600 text-white px-3.5 py-2 rounded-xl text-center text-xs font-bold shadow-xs flex items-center justify-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-200" />
                  <span>{feedbackMessage}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                {operationalOptions.map(({ type, label, icon, shortDesc }) => {
                  const isPending = pendingTypes.has(type);
                  const isAttended = attendedTypes.has(type);
                  const isSubmitting = submittingType === type;
                  const isActive = isPending || isAttended;

                  return (
                    <button
                      key={type}
                      id={`btn-op-${type.toLowerCase()}`}
                      type="button"
                      disabled={isSubmitting || isAttended}
                      onClick={() => handleRequestClick(type)}
                      className={`relative p-3.5 sm:p-4 rounded-2xl border-2 flex flex-col items-center justify-center text-center transition-all cursor-pointer select-none active:scale-95 shadow-2xs ${
                        isActive
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-950 ring-1 ring-emerald-400'
                          : 'bg-white hover:bg-[#FFF7EA] border-[#DEC8AE] hover:border-[#C9974D] text-[#2B1B13]'
                      }`}
                    >
                      {isActive && (
                        <span className="absolute top-2 right-2 bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-2xs">
                          <Check className="w-2.5 h-2.5" />
                          <span>{isAttended ? 'Atendido' : 'Avisado'}</span>
                        </span>
                      )}

                      <span className="text-2xl sm:text-3xl mb-1.5 block">{icon}</span>
                      <span className="font-serif font-bold text-xs sm:text-sm text-[#2B1B13] leading-tight block">
                        {label}
                      </span>
                      <span className="text-[10px] text-[#6B4028] mt-1 line-clamp-1 block">
                        {isAttended
                          ? 'Solicitud atendida ✓'
                          : isPending
                          ? 'Personal avisado ✓'
                          : shortDesc}
                      </span>

                      {isSubmitting && (
                        <div className="absolute inset-0 bg-white/85 rounded-2xl flex items-center justify-center text-xs font-bold text-[#A86B3D]">
                          Avisando...
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pie del modal */}
            <div className="p-3 sm:p-4 bg-[#F4E3C8]/40 border-t border-[#DEC8AE] text-center">
              <button
                type="button"
                onClick={() => setIsOperationalModalOpen(false)}
                className="w-full py-2.5 rounded-xl bg-[#3A2418] text-[#FFF7EA] font-serif font-bold text-xs sm:text-sm hover:bg-[#4A2E1F] transition-all cursor-pointer"
              >
                Volver a la carta
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
