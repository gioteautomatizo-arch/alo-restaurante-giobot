import React, { useEffect, useRef, useState } from 'react';
import {
  TABLE_SERVICE_REQUEST_TYPES,
  createPublicServiceRequest,
  subscribeToTableRequestsForTable,
} from '../../lib/tableRequestsService';
import {
  activatePublicTableSession,
  getTableAccountSelection,
  setTableAccountSelection,
  subscribeToTableSession,
} from '../../lib/tableSessionsService';
import { TableServiceRequestType, TableSession } from '../../types';
import { Check, Minus, Plus, ReceiptText, Users, Utensils } from 'lucide-react';

interface TableCustomerViewProps {
  tableNumber: number;
  onExploreMenu?: () => void;
}

export const TableCustomerView: React.FC<TableCustomerViewProps> = ({
  tableNumber,
  onExploreMenu,
}) => {
  const [session, setSession] = useState<TableSession | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [guestCount, setGuestCount] = useState(2);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const [submittingType, setSubmittingType] = useState<TableServiceRequestType | null>(null);
  const [pendingTypes, setPendingTypes] = useState<Set<TableServiceRequestType>>(new Set());
  const [attendedTypes, setAttendedTypes] = useState<Set<TableServiceRequestType>>(new Set());
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const previousPendingRef = useRef<Set<TableServiceRequestType>>(new Set());
  const listenerReadyRef = useRef(false);
  const attendedTimersRef = useRef<Partial<Record<TableServiceRequestType, ReturnType<typeof setTimeout>>>>({});

  useEffect(() => {
    setSessionLoaded(false);
    const unsubscribe = subscribeToTableSession(tableNumber, (nextSession) => {
      setSession(nextSession);
      setSessionLoaded(true);
      setSessionError(null);

      if (!nextSession) {
        setSelectedAccountId(null);
        return;
      }

      if (nextSession.accountMode === 'GENERAL') {
        const generalId = nextSession.accounts[0]?.id || 'general';
        setSelectedAccountId(generalId);
        setTableAccountSelection(tableNumber, generalId);
        return;
      }

      const stored = getTableAccountSelection(tableNumber);
      const validStored = nextSession.accounts.some((account) => account.id === stored);
      setSelectedAccountId(validStored ? stored : null);
    });

    return unsubscribe;
  }, [tableNumber]);

  // Firestore es la fuente de verdad para solicitudes de servicio.
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
            }, 1500);
          });
        }
      } else {
        listenerReadyRef.current = true;
        TABLE_SERVICE_REQUEST_TYPES.forEach(({ type }) => {
          if (!nextPending.has(type)) {
            try {
              localStorage.removeItem(`alo_qr_req_${tableNumber}_${type}`);
            } catch {
              // ignore
            }
          }
        });
      }

      previousPendingRef.current = nextPending;
      setPendingTypes(nextPending);
    });

    return () => {
      unsubscribe();
      TABLE_SERVICE_REQUEST_TYPES.forEach(({ type }) => {
        const timer = attendedTimersRef.current[type];
        if (timer) clearTimeout(timer);
      });
      attendedTimersRef.current = {};
    };
  }, [tableNumber]);

  const handleStartService = async () => {
    setSessionBusy(true);
    setSessionError(null);
    try {
      const result = await activatePublicTableSession(tableNumber, guestCount);
      setSession(result.session);
      const accountId = result.session.accounts[0]?.id || 'general';
      if (result.session.accountMode === 'GENERAL') {
        setSelectedAccountId(accountId);
        setTableAccountSelection(tableNumber, accountId);
      }
      if (result.alreadyActive) {
        setFeedbackMessage(`Mesa ${tableNumber} ya estaba activa · Te uniste al servicio ✓`);
        setTimeout(() => setFeedbackMessage(null), 3500);
      }
    } catch (err: any) {
      setSessionError(err?.message || 'No pudimos iniciar el servicio. Intenta de nuevo.');
    } finally {
      setSessionBusy(false);
    }
  };

  const chooseAccount = (accountId: string) => {
    setSelectedAccountId(accountId);
    setTableAccountSelection(tableNumber, accountId);
    setFeedbackMessage('Cuenta seleccionada ✓');
    setTimeout(() => setFeedbackMessage(null), 2200);
  };

  const handleRequestClick = async (requestType: TableServiceRequestType) => {
    if (pendingTypes.has(requestType)) {
      setFeedbackMessage('Ya avisamos al equipo ✓');
      setTimeout(() => setFeedbackMessage(null), 3500);
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
      setTimeout(() => setFeedbackMessage(null), 4000);
    }
  };

  const selectedAccount = session?.accounts.find((account) => account.id === selectedAccountId) || null;
  const canOrder = Boolean(
    session &&
      session.status !== 'CERRADA' &&
      (session.accountMode === 'GENERAL' || selectedAccount)
  );

  if (!sessionLoaded) {
    return (
      <section className="w-full max-w-2xl mx-auto my-2 sm:my-4 px-3 sm:px-4">
        <div className="bg-[#FFFDF9] rounded-3xl p-6 border-2 border-[#C9974D]/40 shadow-md text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#3A2418] text-[#FFF7EA] text-sm font-serif font-bold">
            Mesa {tableNumber}
          </div>
          <p className="text-sm text-[#5C3825] mt-3">Preparando tu mesa…</p>
        </div>
      </section>
    );
  }

  if (!session) {
    return (
      <section id="inicio-servicio-mesa" className="w-full max-w-2xl mx-auto my-2 sm:my-4 px-3 sm:px-4">
        <div className="bg-gradient-to-b from-[#FFFDF9] to-[#FFF7EA] rounded-3xl p-5 sm:p-7 border-2 border-[#C9974D]/40 shadow-md space-y-5">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#3A2418] text-[#FFF7EA] text-sm font-serif font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Mesa {tableNumber}
            </div>
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-[#2B1B13]">¡Bienvenidos a Calientito!</h2>
            <p className="text-sm text-[#5C3825]">Antes de pedir, dinos cuántas personas están en la mesa.</p>
          </div>

          <div className="bg-white rounded-2xl border border-[#DEC8AE] p-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[#8A624C] block text-center mb-3">
              ¿Cuántas personas son?
            </span>
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setGuestCount((value) => Math.max(1, value - 1))}
                className="w-11 h-11 rounded-2xl border border-[#DEC8AE] bg-[#FFF7EA] flex items-center justify-center active:scale-95"
                aria-label="Quitar persona"
              >
                <Minus className="w-5 h-5" />
              </button>
              <div className="min-w-[110px] text-center">
                <Users className="w-5 h-5 text-[#C9974D] mx-auto mb-1" />
                <strong className="font-serif text-3xl text-[#2B1B13]">{guestCount}</strong>
                <span className="block text-xs text-[#6B4028]">{guestCount === 1 ? 'persona' : 'personas'}</span>
              </div>
              <button
                type="button"
                onClick={() => setGuestCount((value) => Math.min(20, value + 1))}
                className="w-11 h-11 rounded-2xl border border-[#DEC8AE] bg-[#FFF7EA] flex items-center justify-center active:scale-95"
                aria-label="Agregar persona"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          {sessionError && (
            <div className="rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 text-sm text-center">
              {sessionError}
            </div>
          )}

          <button
            type="button"
            onClick={handleStartService}
            disabled={sessionBusy}
            className="w-full py-3.5 rounded-2xl bg-[#3A2418] text-[#FFF7EA] font-serif font-bold text-base shadow-md disabled:opacity-60 active:scale-[0.99]"
          >
            {sessionBusy ? 'Iniciando servicio…' : `Iniciar servicio en Mesa ${tableNumber}`}
          </button>

          <p className="text-[11px] text-center text-[#8A624C]">
            La mesa se activará en el panel del restaurante y podrás comenzar tu pedido.
          </p>
        </div>
      </section>
    );
  }

  if (session.status === 'CERRADA') {
    return (
      <section className="w-full max-w-2xl mx-auto my-2 sm:my-4 px-3 sm:px-4">
        <div className="bg-[#FFFDF9] rounded-3xl p-6 border-2 border-emerald-200 shadow-md text-center space-y-2">
          <Check className="w-9 h-9 text-emerald-600 mx-auto" />
          <h2 className="font-serif font-bold text-xl text-[#2B1B13]">Servicio finalizado · Mesa {tableNumber}</h2>
          <p className="text-sm text-[#5C3825]">Gracias por visitarnos. Será un gusto recibirte de nuevo.</p>
        </div>
      </section>
    );
  }

  return (
    <section id="atencion-mesa" className="w-full max-w-2xl mx-auto my-2 sm:my-4 px-3 sm:px-4">
      <div className="bg-gradient-to-b from-[#FFFDF9] to-[#FFF7EA] rounded-3xl p-4 sm:p-6 border-2 border-[#C9974D]/40 shadow-md space-y-4">
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#3A2418] text-[#FFF7EA] text-xs sm:text-sm font-serif font-bold shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Mesa {tableNumber} · {session.guestCount} {session.guestCount === 1 ? 'persona' : 'personas'}</span>
          </div>
          <h2 className="text-lg sm:text-xl font-serif font-bold text-[#2B1B13] pt-1">Tu servicio ya comenzó</h2>
          <p className="text-xs sm:text-sm text-[#5C3825] max-w-md mx-auto font-light leading-relaxed">
            Puedes pedir desde aquí o avisarnos cuando necesites algo.
          </p>
        </div>

        {feedbackMessage && (
          <div className="bg-emerald-600 text-white px-4 py-2.5 rounded-2xl text-center text-xs sm:text-sm font-bold shadow-sm flex items-center justify-center gap-2">
            <Check className="w-4 h-4 text-emerald-200" />
            <span>{feedbackMessage}</span>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-[#DEC8AE] p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <ReceiptText className="w-4 h-4 text-[#C9974D]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#6B4028]">
              {session.accountMode === 'SEPARADAS' ? 'Cuentas separadas' : 'Cuenta de la mesa'}
            </span>
          </div>

          {session.accountMode === 'GENERAL' ? (
            <div className="rounded-xl bg-[#FFF7EA] border border-[#F4E3C8] px-3 py-2 text-sm font-bold text-[#3A2418]">
              Cuenta general
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-[#6B4028]">
                Elige tu cuenta para que tus alimentos se agreguen por separado.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {session.accounts.map((account) => {
                  const active = selectedAccountId === account.id;
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => chooseAccount(account.id)}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-bold active:scale-95 ${
                        active
                          ? 'bg-[#3A2418] border-[#3A2418] text-[#FFF7EA]'
                          : 'bg-[#FFF7EA] border-[#DEC8AE] text-[#5C3825]'
                      }`}
                    >
                      {active ? '✓ ' : ''}{account.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5">
          {TABLE_SERVICE_REQUEST_TYPES.map(({ type, label, icon, shortDesc }) => {
            const sent = pendingTypes.has(type);
            const attended = attendedTypes.has(type);
            const isSubmitting = submittingType === type;
            const activeState = sent || attended;

            return (
              <button
                key={type}
                id={`btn-qr-${type.toLowerCase()}`}
                type="button"
                disabled={isSubmitting || attended}
                onClick={() => handleRequestClick(type)}
                className={`relative p-3.5 sm:p-4 rounded-2xl border-2 flex flex-col items-center justify-center text-center transition-all cursor-pointer select-none active:scale-95 shadow-xs ${
                  activeState
                    ? 'bg-emerald-50/80 border-emerald-500/80 text-emerald-950'
                    : 'bg-white hover:bg-[#FFF7EA] border-[#DEC8AE] hover:border-[#C9974D] text-[#2B1B13]'
                }`}
              >
                {activeState && (
                  <span className="absolute top-2 right-2 bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                    <Check className="w-2.5 h-2.5" />
                    <span>{attended ? 'Atendido' : 'Avisado'}</span>
                  </span>
                )}

                <span className="text-2xl sm:text-3xl mb-1.5 block">{icon}</span>
                <span className="font-serif font-bold text-xs sm:text-sm text-[#2B1B13] leading-tight block">{label}</span>
                <span className="text-[10px] text-[#6B4028] mt-1 line-clamp-1 block">
                  {attended ? 'Solicitud atendida ✓' : sent ? 'Ya avisamos al equipo ✓' : shortDesc}
                </span>

                {isSubmitting && (
                  <div className="absolute inset-0 bg-white/80 rounded-2xl flex items-center justify-center text-xs font-bold text-[#A86B3D]">
                    Enviando...
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {onExploreMenu && (
          <div className="pt-2 text-center border-t border-[#DEC8AE]/60 space-y-2">
            {!canOrder && session.accountMode === 'SEPARADAS' && (
              <p className="text-[11px] font-bold text-amber-800">Selecciona tu cuenta antes de hacer el pedido.</p>
            )}
            <button
              type="button"
              onClick={() => {
                if (!canOrder) {
                  setFeedbackMessage('Selecciona tu cuenta para continuar.');
                  setTimeout(() => setFeedbackMessage(null), 3000);
                  return;
                }
                onExploreMenu();
              }}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-serif font-bold text-xs border transition-all ${
                canOrder
                  ? 'bg-[#3A2418] border-[#3A2418] text-[#FFF7EA] cursor-pointer active:scale-95'
                  : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Utensils className="w-3.5 h-3.5 text-[#C9974D]" />
              <span>{selectedAccount ? `Hacer pedido · ${selectedAccount.label}` : 'Ver menú y hacer pedido'}</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
