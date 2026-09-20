import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPublicServiceRequest, subscribeToTableRequestsForTable } from '../../lib/tableRequestsService';
import {
  activatePublicTableSession,
  getSessionPersons,
  getTableAccountSelection,
  getTablePersonSelection,
  setTableAccountSelection,
  setTablePersonSelection,
  subscribeToTableSession,
} from '../../lib/tableSessionsService';
import { subscribeToPublicTableOrders } from '../../lib/ordersService';
import { TableSessionConsumption } from './TableSessionConsumption';
import { getEffectiveService } from '../../lib/adminStorage';
import { occupyTableFromPublicQR, subscribeToTables } from '../../lib/tablesService';
import {
  CategoryId,
  EffectiveService,
  PublicTableOrder,
  TableRecord,
  TableServiceRequestType,
  TableSession,
  TableSessionPerson,
} from '../../types';
import { Bell, Check, Loader2, ReceiptText, Utensils, X, ListOrdered } from 'lucide-react';

interface Props {
  tableNumber: number;
  onExploreMenu?: () => void;
  onSelectCategory?: (category: CategoryId) => void;
  onOpenComidaCorrida?: () => void;
  onOpenSaladBuilder?: () => void;
  onOpenTita?: () => void;
  onPersonSelectionChange?: (person: TableSessionPerson | null) => void;
}

type Op = { type: TableServiceRequestType; label: string; icon: string; desc: string };

const BASE_OPS: Op[] = [
  { type: 'LLAMAR_MESERO', label: 'Llamar mesero', icon: '🙋‍♂️', desc: 'Un mesero se acercará a tu mesa' },
  { type: 'TORTILLAS', label: 'Tortillas', icon: '🌮', desc: 'Tortillas calientes para tu comida' },
  { type: 'BEBIDAS', label: 'Bebidas', icon: '🥤', desc: 'Pide otra bebida al personal' },
];

const CORRIDA_OPS: Op[] = [
  { type: 'SEGUNDO_TIEMPO', label: 'Segundo tiempo', icon: '🍽️', desc: 'Listos para sopa, arroz o pasta' },
  { type: 'TERCER_TIEMPO', label: 'Tercer tiempo', icon: '🍮', desc: 'Listos para el guisado o plato fuerte' },
];

const card = 'min-h-[78px] p-2.5 rounded-xl border bg-white text-center active:scale-[0.98] transition-all';

export const TableCustomerView: React.FC<Props> = ({
  tableNumber,
  onExploreMenu,
  onSelectCategory,
  onOpenComidaCorrida,
  onOpenSaladBuilder,
  onOpenTita,
  onPersonSelectionChange,
}) => {
  const [session, setSession] = useState<TableSession | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [isOperationalModalOpen, setIsOperationalModalOpen] = useState(false);
  const [isConsumptionModalOpen, setIsConsumptionModalOpen] = useState(false);
  const [tableOrders, setTableOrders] = useState<PublicTableOrder[]>([]);
  const [effectiveService, setEffectiveService] = useState<EffectiveService>(() => getEffectiveService());
  const [submittingType, setSubmittingType] = useState<TableServiceRequestType | null>(null);
  const [pendingTypes, setPendingTypes] = useState<Set<TableServiceRequestType>>(new Set());
  const [attendedTypes, setAttendedTypes] = useState<Set<TableServiceRequestType>>(new Set());
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [selectedGuestCount, setSelectedGuestCount] = useState<number | null>(null);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [tableRecord, setTableRecord] = useState<TableRecord | null>(null);

  const previousPendingRef = useRef<Set<TableServiceRequestType>>(new Set());
  const listenerReadyRef = useRef(false);
  const attendedTimersRef = useRef<Partial<Record<TableServiceRequestType, ReturnType<typeof setTimeout>>>>({});

  const isStaffOrder = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get('staffOrder') === '1'; }
    catch { return false; }
  }, []);
  const isDesayuno = effectiveService === 'DESAYUNO';

  useEffect(() => subscribeToTables((tables) => {
    const found = tables.find((t) => t.tableNumber === tableNumber);
    if (found) setTableRecord(found);
  }), [tableNumber]);

  useEffect(() => {
    const refresh = () => setEffectiveService(getEffectiveService());
    window.addEventListener('alo_admin_data_updated', refresh);
    window.addEventListener('storage', refresh);
    const timer = setInterval(refresh, 15000);
    return () => {
      window.removeEventListener('alo_admin_data_updated', refresh);
      window.removeEventListener('storage', refresh);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    setSessionLoaded(false);
    return subscribeToTableSession(tableNumber, (next) => {
      setSession(next);
      setSessionLoaded(true);
      if (next && (next.status === 'ACTIVA' || next.status === 'CUENTA')) setIsStartingSession(false);
      if (!next || next.status === 'CERRADA') {
        setSelectedAccountId(null);
        setSelectedPersonId(null);
        onPersonSelectionChange?.(null);
        return;
      }
      const persons = getSessionPersons(next);
      const storedPerson = getTablePersonSelection(tableNumber);
      const person = persons.find((p) => p.id === storedPerson) || persons[0];
      setSelectedPersonId(person.id);
      setTablePersonSelection(tableNumber, person.id);
      onPersonSelectionChange?.(person);
      if (next.accountMode === 'GENERAL') {
        const id = next.accounts[0]?.id || 'general';
        setSelectedAccountId(id);
        setTableAccountSelection(tableNumber, id);
      } else {
        const stored = getTableAccountSelection(tableNumber);
        const id = next.accounts.some((a) => a.id === stored)
          ? stored
          : next.accounts.find((a) => a.id === person.accountId)?.id || next.accounts[0]?.id || null;
        setSelectedAccountId(id);
        if (id) setTableAccountSelection(tableNumber, id);
      }
    });
  }, [tableNumber]);

  useEffect(() => subscribeToPublicTableOrders(tableNumber, setTableOrders), [tableNumber]);

  useEffect(() => {
    const hideDuplicatedBuilders = () => {
      const menu = document.getElementById('menu-section');
      if (!menu) return;
      const buttons = Array.from(menu.querySelectorAll<HTMLButtonElement>('button'));
      const corrida = buttons.find((button) => (button.textContent || '').includes('Armar Corrida'));
      const ensalada = buttons.find((button) => (button.textContent || '').includes('Armar Ensalada'));
      const wrapper = corrida?.parentElement;
      if (wrapper && ensalada && wrapper.contains(ensalada)) {
        wrapper.dataset.tableQrDuplicateBuilders = 'true';
        wrapper.style.display = 'none';
      }
    };

    hideDuplicatedBuilders();
    const timer = window.setInterval(hideDuplicatedBuilders, 1200);

    return () => {
      window.clearInterval(timer);
      document.querySelectorAll<HTMLElement>('[data-table-qr-duplicate-builders="true"]').forEach((node) => {
        node.style.display = '';
        delete node.dataset.tableQrDuplicateBuilders;
      });
    };
  }, []);

  const hasCorrida = useMemo(() => tableOrders.some((order) => {
    if (order.status === 'CANCELADO' || order.billingStatus === 'PAGADO') return false;
    if (session?.accountMode === 'SEPARADAS' && selectedAccountId && order.accountId !== selectedAccountId) return false;
    return order.items.some((item) => {
      const isCorrida = item.productId === 'comida-corrida' || item.name.toLowerCase().includes('comida corrida');
      return isCorrida && (!selectedPersonId || !item.personId || item.personId === selectedPersonId);
    });
  }), [tableOrders, session?.accountMode, selectedAccountId, selectedPersonId]);

  useEffect(() => {
    listenerReadyRef.current = false;
    previousPendingRef.current = new Set();
    setPendingTypes(new Set());
    setAttendedTypes(new Set());
    const unsubscribe = subscribeToTableRequestsForTable(tableNumber, (requests) => {
      const next = new Set<TableServiceRequestType>(requests.map((r) => r.requestType));
      if (listenerReadyRef.current) {
        [...previousPendingRef.current].filter((type) => !next.has(type)).forEach((type) => {
          setAttendedTypes((current) => new Set(current).add(type));
          const old = attendedTimersRef.current[type];
          if (old) clearTimeout(old);
          attendedTimersRef.current[type] = setTimeout(() => {
            setAttendedTypes((current) => {
              const updated = new Set(current); updated.delete(type); return updated;
            });
          }, 1800);
        });
      } else listenerReadyRef.current = true;
      previousPendingRef.current = next;
      setPendingTypes(next);
    });
    return () => {
      unsubscribe();
      Object.values(attendedTimersRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer as unknown as number);
      });
      attendedTimersRef.current = {};
    };
  }, [tableNumber]);

  const waiterName = session?.waiterName || (session?.status !== 'CERRADA' ? tableRecord?.waiterName : '') || '';
  const ops = useMemo(() => hasCorrida ? [...BASE_OPS, ...CORRIDA_OPS] : BASE_OPS, [hasCorrida]);

  const choosePerson = (person: TableSessionPerson) => {
    setSelectedPersonId(person.id);
    setTablePersonSelection(tableNumber, person.id);
    onPersonSelectionChange?.(person);
    if (session?.accountMode === 'SEPARADAS') {
      const account = session.accounts.find((a) => a.id === person.accountId);
      if (account) {
        setSelectedAccountId(account.id);
        setTableAccountSelection(tableNumber, account.id);
      }
    }
    setFeedbackMessage(`${person.label} seleccionada ✓`);
    setTimeout(() => setFeedbackMessage(null), 1800);
  };

  const chooseAccount = (id: string) => {
    setSelectedAccountId(id);
    setTableAccountSelection(tableNumber, id);
    setFeedbackMessage('Cuenta seleccionada ✓');
    setTimeout(() => setFeedbackMessage(null), 1800);
  };

  const request = async (type: TableServiceRequestType) => {
    if (pendingTypes.has(type)) {
      setFeedbackMessage('Ya avisamos al equipo ✓');
      setTimeout(() => setFeedbackMessage(null), 2500);
      return;
    }
    if (attendedTypes.has(type)) return;
    setSubmittingType(type);
    try {
      const result = await createPublicServiceRequest(tableNumber, type);
      if (!result.success) {
        setFeedbackMessage(result.message || 'No pudimos enviar la solicitud.');
      } else {
        setPendingTypes((current) => new Set(current).add(type));
        setFeedbackMessage(result.alreadyPending ? 'Ya avisamos al equipo ✓' : 'Solicitud enviada ✓');
      }
    } catch {
      setFeedbackMessage('No pudimos enviar la solicitud.');
    } finally {
      setSubmittingType(null);
      setTimeout(() => setFeedbackMessage(null), 3000);
    }
  };

  const openCategory = (category: CategoryId) => {
    onSelectCategory?.(category);
    onExploreMenu?.();
  };

  const openSaladBuilder = () => {
    if (onOpenSaladBuilder) {
      onOpenSaladBuilder();
      return;
    }
    const menu = document.getElementById('menu-section');
    const button = menu
      ? Array.from(menu.querySelectorAll<HTMLButtonElement>('button')).find((candidate) =>
          (candidate.textContent || '').includes('Armar Ensalada')
        )
      : undefined;
    if (button) {
      button.click();
      return;
    }
    openCategory('ensaladas');
  };

  if (!sessionLoaded) return (
    <section className="w-full max-w-xl mx-auto my-3 px-3"><div className="bg-white rounded-2xl border border-[#E6CCA8] p-5 text-center text-sm">Cargando servicio de Mesa {tableNumber}…</div></section>
  );

  if (isStartingSession) return (
    <section className="w-full max-w-xl mx-auto my-3 px-3"><div className="bg-white rounded-3xl border border-[#DEC8AE] p-7 text-center"><Loader2 className="w-7 h-7 animate-spin mx-auto mb-3"/><h2 className="font-serif font-black text-xl">Iniciando tu servicio…</h2></div></section>
  );

  if (isStaffOrder && (!session || session.status === 'CERRADA')) return (
    <section className="w-full max-w-xl mx-auto my-3 px-3"><div className="bg-white rounded-3xl border border-[#DEC8AE] p-7 text-center"><Utensils className="w-7 h-7 mx-auto mb-3"/><h2 className="font-serif font-black text-xl">Esta mesa ya no tiene servicio activo</h2><p className="text-xs mt-2">Vuelve al panel de Mesas para abrirla.</p></div></section>
  );

  if (!session || session.status === 'CERRADA') return (
    <section className="w-full max-w-xl mx-auto my-4 px-3">
      <div className="bg-[#FFFDF9] rounded-3xl p-6 border border-[#DEC8AE] text-center space-y-4">
        <div><span className="inline-flex px-3 py-1 rounded-full bg-[#3A2418] text-white text-xs font-bold">Mesa {tableNumber} disponible</span><h2 className="font-serif font-black text-xl mt-2">¿Cuántas personas son?</h2></div>
        <div className="grid grid-cols-5 gap-2">{[1,2,3,4,5,6,7,8,9,10].map((n) => <button key={n} onClick={() => setSelectedGuestCount(n)} className={`h-11 rounded-xl border font-bold ${selectedGuestCount === n ? 'bg-[#3A2418] text-white border-[#3A2418]' : 'bg-white border-[#DEC8AE]'}`}>{n}</button>)}</div>
        <button disabled={!selectedGuestCount || isStartingSession} onClick={async () => {
          if (!selectedGuestCount) return;
          setIsStartingSession(true);
          try {
            const result = await activatePublicTableSession(tableNumber, selectedGuestCount);
            await occupyTableFromPublicQR(tableNumber, selectedGuestCount);
            if (result.session) setSession(result.session);
          } catch { setIsStartingSession(false); }
        }} className="w-full py-3.5 rounded-2xl bg-[#3A2418] text-white text-sm font-bold disabled:opacity-40">
          {selectedGuestCount ? `Comenzar servicio para ${selectedGuestCount} ${selectedGuestCount === 1 ? 'persona' : 'personas'}` : 'Selecciona cuántas personas son'}
        </button>
      </div>
    </section>
  );

  const billPending = pendingTypes.has('PEDIR_CUENTA');
  const billAttended = attendedTypes.has('PEDIR_CUENTA');

  return (
    <section id="atencion-mesa" className="w-full max-w-3xl mx-auto my-2 px-3 sm:px-4">
      <div className="bg-gradient-to-b from-[#FFFDF9] to-[#FFF7EA] rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-[#E6CCA8] shadow-sm space-y-3">
        <div className="pb-2 border-b border-[#E6CCA8]/60">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#3A2418] text-white text-xs font-bold"><span className="w-2 h-2 rounded-full bg-emerald-400"/>Mesa {tableNumber}</span>
            {isStaffOrder ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold">Modo personal</span> : waiterName ? <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-[#DEC8AE] text-xs">Te atiende: <strong>{waiterName}</strong></span> : <span className="px-2.5 py-1 rounded-full bg-stone-100 border text-xs text-stone-500">Mesero por asignar</span>}
          </div>
          <h1 className="text-lg sm:text-xl font-serif font-black">{isStaffOrder ? `Tomando pedido · Mesa ${tableNumber}` : 'Tu servicio ha comenzado'}</h1>
          <p className="text-xs text-[#6B4028] mt-0.5">{isStaffOrder ? 'Selecciona a la persona y agrega sus platillos.' : 'Elige quién ordena y agrega lo que necesites.'}</p>
        </div>

        {feedbackMessage && <div className="bg-emerald-600 text-white px-3 py-2 rounded-xl text-center text-xs font-bold"><Check className="w-3.5 h-3.5 inline mr-1"/>{feedbackMessage}</div>}

        {!isStaffOrder && (
          <div className="bg-white rounded-xl border border-[#DEC8AE] p-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#A86B3D] mb-2">¿Cómo quieres que te atendamos?</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onOpenTita}
                className="min-h-[46px] rounded-xl bg-[#3A2418] text-white border border-[#3A2418] text-xs font-bold flex items-center justify-center gap-2"
              >
                <img src="/tita.png" alt="Tita" className="w-5 h-5 object-contain" />
                Atención con Tita
              </button>
              <button
                type="button"
                disabled={submittingType === 'LLAMAR_MESERO' || pendingTypes.has('LLAMAR_MESERO')}
                onClick={() => request('LLAMAR_MESERO')}
                className="min-h-[46px] rounded-xl bg-[#FFF7EA] text-[#3A2418] border border-[#DEC8AE] text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                🙋 {pendingTypes.has('LLAMAR_MESERO') ? 'Mesero avisado ✓' : 'Atención con mesero'}
              </button>
            </div>
          </div>
        )}

        {session.guestCount > 1 && <div className="bg-white rounded-xl border border-[#DEC8AE] p-2.5"><div className="flex justify-between text-[10px] font-bold uppercase mb-2"><span>{isStaffOrder ? '¿Para quién es este pedido?' : '¿Quién está ordenando?'}</span><span>{session.guestCount} personas</span></div><div className="flex flex-wrap gap-1.5">{getSessionPersons(session).map((person) => <button key={person.id} onClick={() => choosePerson(person)} className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${selectedPersonId === person.id ? 'bg-emerald-700 border-emerald-700 text-white' : 'bg-[#FFF7EA] border-[#DEC8AE]'}`}>{selectedPersonId === person.id ? '✓ ' : ''}{person.label}</button>)}</div></div>}

        {session.accountMode === 'SEPARADAS' && <div className="bg-white rounded-xl border border-[#DEC8AE] p-2.5"><div className="flex items-center gap-1.5 text-[10px] font-bold uppercase mb-2"><ReceiptText className="w-3.5 h-3.5"/>Elige tu cuenta</div><div className="flex flex-wrap gap-1.5">{session.accounts.map((account) => <button key={account.id} onClick={() => chooseAccount(account.id)} className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${selectedAccountId === account.id ? 'bg-[#3A2418] border-[#3A2418] text-white' : 'bg-[#FFF7EA] border-[#DEC8AE]'}`}>{selectedAccountId === account.id ? '✓ ' : ''}{account.label}</button>)}</div></div>}

        <div>
          <span className="text-[10px] uppercase tracking-wider font-black text-[#A86B3D]">Pedir ahora</span>
          <div className="grid grid-cols-2 gap-2 mt-1.5">
            {isDesayuno ? <>
              <button onClick={() => openCategory('desayunos')} className={`${card} border-[#DEC8AE]`}><span className="text-xl block">🍳</span><strong className="block text-xs mt-1">Desayunos</strong></button>
              <button onClick={openSaladBuilder} className={`${card} border-2 border-[#C9974D] bg-[#FFFDF9]`}><span className="text-xl block">🥗</span><strong className="block text-xs mt-1">Arma tu ensalada</strong><span className="text-[10px] font-bold text-[#A86B3D]">$90</span></button>
              <button onClick={() => openCategory('all')} className={`${card} border-[#DEC8AE]`}><span className="text-xl block">🍽️</span><strong className="block text-xs mt-1">Carta</strong></button>
              <button onClick={() => openCategory('bebidas')} className={`${card} border-[#DEC8AE]`}><span className="text-xl block">🥤</span><strong className="block text-xs mt-1">Bebidas</strong></button>
            </> : <>
              <button onClick={() => onOpenComidaCorrida ? onOpenComidaCorrida() : openCategory('comida-corrida')} className={`${card} border-2 border-[#C9974D] bg-[#FFFDF9]`}><span className="text-xl block">🍲</span><strong className="block text-xs mt-1">Comida corrida</strong><span className="text-[10px] font-bold text-[#A86B3D]">$90</span></button>
              <button onClick={openSaladBuilder} className={`${card} border-[#DEC8AE]`}><span className="text-xl block">🥗</span><strong className="block text-xs mt-1">Arma tu ensalada</strong><span className="text-[10px] font-bold text-[#A86B3D]">$90</span></button>
              <button onClick={() => openCategory('all')} className={`${card} border-[#DEC8AE]`}><span className="text-xl block">🍽️</span><strong className="block text-xs mt-1">Carta</strong></button>
              <button onClick={() => openCategory('bebidas')} className={`${card} border-[#DEC8AE]`}><span className="text-xl block">🥤</span><strong className="block text-xs mt-1">Bebidas</strong></button>
            </>}
          </div>
        </div>

        <div className={`grid gap-2 pt-1 ${isStaffOrder ? 'grid-cols-1' : 'grid-cols-3'}`}>
          <button onClick={() => setIsConsumptionModalOpen(true)} className="min-h-[48px] rounded-xl bg-white border border-[#DEC8AE] text-xs font-bold flex items-center justify-center gap-2">
            <ListOrdered className="w-4 h-4 text-[#C9974D]"/>{isStaffOrder ? 'Ver sesión completa' : 'Ver mi consumo'}
          </button>
          {!isStaffOrder && <>
            <button onClick={() => setIsOperationalModalOpen(true)} className="min-h-[48px] rounded-xl bg-white border border-[#DEC8AE] text-xs font-bold flex items-center justify-center gap-2"><Bell className="w-4 h-4 text-[#C9974D]"/>Necesito algo</button>
            <button disabled={submittingType === 'PEDIR_CUENTA' || billAttended} onClick={() => request('PEDIR_CUENTA')} className={`min-h-[48px] rounded-xl border text-xs font-bold flex items-center justify-center gap-2 ${billPending || billAttended ? 'bg-emerald-50 border-emerald-400 text-emerald-800' : 'bg-[#3A2418] border-[#3A2418] text-white'}`}><ReceiptText className="w-4 h-4"/>{billAttended ? 'Cuenta atendida' : billPending ? 'Cuenta solicitada ✓' : 'Pedir cuenta'}</button>
          </>}
        </div>
      </div>

      {isConsumptionModalOpen && session && <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-3" onClick={() => setIsConsumptionModalOpen(false)}>
        <div className="bg-[#FFFDF9] w-full sm:max-w-2xl max-h-[92vh] rounded-t-3xl sm:rounded-3xl border-2 border-[#C9974D]/50 overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="p-4 bg-[#3A2418] text-white flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-[#C9974D]">{isStaffOrder ? 'Sesión completa' : 'Tu consumo en tiempo real'}</div>
              <h3 className="font-serif font-bold">Mesa {tableNumber}</h3>
              <p className="text-[11px] opacity-80">{session.guestCount} {session.guestCount === 1 ? 'persona' : 'personas'} · {waiterName ? `Mesero: ${waiterName}` : 'Mesero por asignar'}</p>
            </div>
            <button onClick={() => setIsConsumptionModalOpen(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"><X className="w-4 h-4"/></button>
          </div>
          <div className="p-4 overflow-y-auto">
            <TableSessionConsumption
              session={session}
              orders={tableOrders}
              selectedPersonId={selectedPersonId}
              showSelectedPersonSummary={!isStaffOrder}
            />
          </div>
        </div>
      </div>}

      {!isStaffOrder && isOperationalModalOpen && <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3"><div className="bg-[#FFFDF9] w-full max-w-lg rounded-3xl border-2 border-[#C9974D]/50 overflow-hidden">
        <div className="p-4 bg-[#3A2418] text-white flex items-center justify-between"><div><h3 className="font-serif font-bold">Atención en Mesa {tableNumber}</h3><p className="text-[11px] opacity-80">El personal recibirá tu aviso de inmediato</p></div><button onClick={() => setIsOperationalModalOpen(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"><X className="w-4 h-4"/></button></div>
        <div className="p-4 grid grid-cols-2 gap-2.5">{ops.map((op) => {
          const pending = pendingTypes.has(op.type), attended = attendedTypes.has(op.type), loading = submittingType === op.type;
          return <button key={op.type} disabled={loading || attended} onClick={() => request(op.type)} className={`relative p-3.5 rounded-2xl border-2 text-center ${pending || attended ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-[#DEC8AE]'}`}><span className="text-2xl block mb-1">{op.icon}</span><strong className="text-xs block">{op.label}</strong><span className="text-[10px] text-[#6B4028] block mt-1">{attended ? 'Solicitud atendida ✓' : pending ? 'Personal avisado ✓' : op.desc}</span>{loading && <span className="absolute inset-0 bg-white/90 rounded-2xl flex items-center justify-center text-xs font-bold">Avisando…</span>}</button>;
        })}</div>
        <div className="p-3 bg-[#F4E3C8]/40 border-t"><button onClick={() => setIsOperationalModalOpen(false)} className="w-full py-2.5 rounded-xl bg-[#3A2418] text-white text-xs font-bold">Volver a la carta</button></div>
      </div></div>}
    </section>
  );
};