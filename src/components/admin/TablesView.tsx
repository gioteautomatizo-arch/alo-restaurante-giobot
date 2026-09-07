import React, { useState, useEffect } from 'react';
import {
  Users,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Edit3,
  Coffee,
  Sparkles,
  ArrowRight,
  User,
  Utensils,
  Receipt,
  X,
  RefreshCw,
  MapPin,
  ChevronRight,
  Flame,
  LayoutGrid,
  List,
  Tv,
  QrCode,
  ExternalLink,
} from 'lucide-react';
import { TableRecord, TableStatus, TableCourse, StaffUser, TableServiceRequest, TableServiceRequestType, TableSession, RestaurantOrder } from '../../types';
import {
  subscribeToTables,
  occupyTable,
  freeTable,
  setTableStatus,
  setTableCourse,
  toggleTablePending,
  updateTableNotes,
  updateTableGuestCount,
  addTable,
  deleteTable,
  initTablesRealtimeSync,
  DEFAULT_TABLES,
} from '../../lib/tablesService';
import {
  subscribeToPendingTableRequests,
  markTableRequestAttended,
  clearAllPendingRequestsForTable,
} from '../../lib/tableRequestsService';
import { getStaffUsers } from '../../lib/adminStorage';
import { TableSessionAccountsPanel } from './TableSessionAccountsPanel';
import { subscribeToTableSession, setTableSessionStatusByStaff } from '../../lib/tableSessionsService';
import { subscribeToRestaurantOrders } from '../../lib/ordersService';

interface TablesViewProps {
  currentUser: StaffUser;
}

export const TablesView: React.FC<TablesViewProps> = ({ currentUser }) => {
  const [tables, setTables] = useState<TableRecord[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableRecord | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'occupied' | 'free' | 'bill'>('all');
  const [viewMode, setViewMode] = useState<'croquis' | 'lista'>('croquis');
  const [isOccupyModalOpen, setIsOccupyModalOpen] = useState(false);
  const [isAddTableModalOpen, setIsAddTableModalOpen] = useState(false);
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [qrRequests, setQrRequests] = useState<TableServiceRequest[]>([]);
  const [copiedTableQr, setCopiedTableQr] = useState<number | null>(null);
  const [tableSessionsByNumber, setTableSessionsByNumber] = useState<Record<number, TableSession | null>>({});
  const [restaurantOrders, setRestaurantOrders] = useState<RestaurantOrder[]>([]);

  // Datos para modal de ocupación rápida
  const [occupyGuests, setOccupyGuests] = useState(2);
  const [occupyWaiterId, setOccupyWaiterId] = useState(currentUser.id);
  const [occupyWaiterName, setOccupyWaiterName] = useState(currentUser.name);
  const [occupyNotes, setOccupyNotes] = useState('');

  // Datos para agregar nueva mesa
  const [newTableNumber, setNewTableNumber] = useState<number>(1);
  const [newTableCapacity, setNewTableCapacity] = useState<number>(4);
  const [newTableLocation, setNewTableLocation] = useState<'salon' | 'terraza' | 'barra'>('salon');
  const [addTableError, setAddTableError] = useState<string | null>(null);

  // Inicializar listener de Firestore en tiempo real y cargar personal
  useEffect(() => {
    const unsubFirestore = initTablesRealtimeSync();
    const unsubTables = subscribeToTables((updatedTables) => {
      setTables(updatedTables);
    });

    const unsubQr = subscribeToPendingTableRequests((requests) => {
      setQrRequests(requests);
    });

    // Respaldo operacional: las comandas activas también prueban que una mesa está en servicio.
    // Esto evita que el croquis muestre LIBRE si por cualquier motivo la sesión QR no llegó al listener.
    const unsubOrders = subscribeToRestaurantOrders((orders) => {
      setRestaurantOrders(orders);
    });

    // Escuchar también las sesiones QR. Una sesión ACTIVA debe reflejar la mesa como
    // ocupada en el panel aunque el registro operativo de `tables` siga en LIBRE.
    // Usamos listeners por documento (8 mesas) para no depender de permisos de listado.
    const sessionUnsubs = [1, 2, 4, 5, 6, 7, 8, 9].map((tableNumber) =>
      subscribeToTableSession(tableNumber, (session) => {
        setTableSessionsByNumber((prev) => ({ ...prev, [tableNumber]: session }));
      })
    );

    setStaffList(getStaffUsers().filter((u) => u.active));

    return () => {
      unsubFirestore();
      unsubTables();
      unsubQr();
      unsubOrders();
      sessionUnsubs.forEach((unsub) => unsub());
    };
  }, []);

  // Regla: Las mesas operativas son exactamente 8 (Mesa 1, 2, 4, 5, 6, 7, 8 y 9)
  // Mesa 3 físicamente corresponde al área de Pantalla (no operativa)
  const baseOperationalTables = tables.filter((t) => t.tableId !== 'table-3' && t.tableNumber !== 3);

  // Estado efectivo para el panel:
  // - una sesión QR ACTIVA convierte una mesa LIBRE en OCUPADA;
  // - una sesión en CUENTA se refleja como CUENTA;
  // - LIMPIEZA siempre tiene prioridad para no reabrir visualmente una mesa ya cobrada;
  // - el número de personas viene de la sesión digital mientras siga activa.
  const activeDineInOrders = restaurantOrders.filter(
    (order) =>
      order.orderType === 'dine_in' &&
      typeof order.tableNumber === 'number' &&
      order.status !== 'CANCELADO' &&
      order.billingStatus !== 'PAGADO'
  );

  const activeOrdersByTable = activeDineInOrders.reduce<Record<number, RestaurantOrder[]>>((acc, order) => {
    const tableNumber = Number(order.tableNumber);
    if (!Number.isInteger(tableNumber)) return acc;
    if (!acc[tableNumber]) acc[tableNumber] = [];
    acc[tableNumber].push(order);
    return acc;
  }, {});

  const inferGuestCountFromOrders = (orders: RestaurantOrder[]): number => {
    const personKeys = new Set<string>();
    orders.forEach((order) => {
      order.items?.forEach((item: any) => {
        const key = item.personId || item.personLabel;
        if (key) personKeys.add(String(key));
      });
    });
    return Math.max(1, personKeys.size || 1);
  };

  const operationalTables = baseOperationalTables.map((table) => {
    const session = tableSessionsByNumber[table.tableNumber];
    const tableUpdatedAtMs = Date.parse(table.updatedAt || '') || 0;
    const activeOrders = (activeOrdersByTable[table.tableNumber] || []).filter((order) => {
      // Si la mesa fue liberada manualmente, freeTable actualiza table.updatedAt.
      // Una comanda anterior a ese corte es histórica y no debe volver a ocuparla.
      const orderCreatedAtMs = Date.parse(order.createdAt || '') || 0;
      return orderCreatedAtMs >= tableUpdatedAtMs;
    });
    const hasActiveOrders = activeOrders.length > 0;

    let effectiveStatus: TableStatus = table.status;
    let effectiveGuestCount = table.guestCount;
    let effectiveOpenedAt = table.openedAt;

    // LIMPIEZA es el único estado que no debe reabrirse visualmente por una sesión/comanda vieja.
    if (table.status !== 'LIMPIEZA') {
      if (session && session.status !== 'CERRADA') {
        if (session.status === 'CUENTA') effectiveStatus = 'CUENTA';
        else if (session.status === 'ACTIVA' && table.status === 'LIBRE') effectiveStatus = 'OCUPADA';

        effectiveGuestCount = session.guestCount;
        effectiveOpenedAt = table.openedAt || session.openedAt;
      }

      // Fallback fuerte: una mesa con comandas activas/no pagadas no puede verse LIBRE.
      // Las comandas ya están demostrando actividad real aunque table_sessions no haya sincronizado.
      if (
  hasActiveOrders &&
  effectiveStatus === 'LIBRE' &&
  session?.status !== 'CERRADA'
) {
        effectiveStatus = 'OCUPADA';
        effectiveGuestCount = session?.guestCount || inferGuestCountFromOrders(activeOrders);
        const oldest = [...activeOrders]
          .sort((a, b) => (Date.parse(a.createdAt || '') || 0) - (Date.parse(b.createdAt || '') || 0))[0];
        effectiveOpenedAt = effectiveOpenedAt || oldest?.createdAt;
      }
    }

    return {
      ...table,
      status: effectiveStatus,
      guestCount: effectiveGuestCount,
      openedAt: effectiveOpenedAt,
    };
  });

  // Si el panel de una mesa está abierto, mantenerlo sincronizado con el estado efectivo
  // calculado arriba (por ejemplo, LIBRE -> OCUPADA al entrar clientes por QR).
  useEffect(() => {
    setSelectedTable((prev) => {
      if (!prev) return null;
      const effective = operationalTables.find((t) => t.tableId === prev.tableId);
      if (!effective) return null;
      if (
        effective.status === prev.status &&
        effective.guestCount === prev.guestCount &&
        effective.openedAt === prev.openedAt &&
        effective.updatedAt === prev.updatedAt
      ) {
        return prev;
      }
      return effective;
    });
  }, [tables, tableSessionsByNumber, restaurantOrders]);

  // Helper para verificar si una mesa tiene algún pendiente interno o por QR
  const checkTableHasPending = (t: TableRecord) => {
    const tableQrs = qrRequests.filter(
      (r) => r.tableNumber === t.tableNumber && r.status === 'PENDIENTE'
    );
    return (
      t.needsTortillas ||
      t.needsDrinks ||
      t.needsSecondCourse ||
      t.needsThirdCourse ||
      t.needsBill ||
      tableQrs.length > 0
    );
  };

  // Calcular estadísticas rápidas basadas exclusivamente en mesas operativas
  const totalTables = operationalTables.length;
  const occupiedCount = operationalTables.filter((t) => t.status === 'OCUPADA').length;
  const freeCount = operationalTables.filter((t) => t.status === 'LIBRE').length;
  const billCount = operationalTables.filter((t) => t.status === 'CUENTA').length;
  const cleaningCount = operationalTables.filter((t) => t.status === 'LIMPIEZA').length;

  const tablesWithPending = operationalTables.filter(checkTableHasPending);
  const totalPendingCount = tablesWithPending.length;

  // Filtrado de mesas (únicamente sobre mesas operativas)
  const filteredTables = operationalTables.filter((t) => {
    if (filter === 'pending') {
      return checkTableHasPending(t);
    }
    if (filter === 'occupied') return t.status === 'OCUPADA';
    if (filter === 'free') return t.status === 'LIBRE';
    if (filter === 'bill') return t.status === 'CUENTA' || t.status === 'LIMPIEZA';
    return true;
  });

  // Abrir modal para ocupar mesa
  const handleOpenOccupyModal = (table: TableRecord, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedTable(table);
    setOccupyGuests(table.capacity || 2);
    setOccupyWaiterId(currentUser.id);
    setOccupyWaiterName(currentUser.name);
    setOccupyNotes('');
    setIsOccupyModalOpen(true);
  };

  // Confirmar ocupación
  const handleConfirmOccupy = async () => {
    if (!selectedTable) return;
    try {
      await occupyTable(
        selectedTable.tableId,
        {
          guestCount: occupyGuests,
          waiterId: occupyWaiterId,
          waiterName: occupyWaiterName,
          notes: occupyNotes,
        },
        { id: currentUser.id, name: currentUser.name }
      );
      setIsOccupyModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Error al ocupar mesa');
    }
  };

  // Liberar mesa
  const handleFreeTable = async (tableId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (window.confirm('¿Liberar esta mesa y dejarla lista para nuevos clientes?')) {
      try {
        const table = tables.find((t) => t.tableId === tableId);

        // V4.3A FIX V3: liberar una mesa debe cerrar también su sesión digital.
        // Si dejamos table_sessions ACTIVA, el listener QR la vuelve a pintar como OCUPADA.
        if (table) {
          await setTableSessionStatusByStaff(table.tableNumber, 'CERRADA', {
            id: currentUser.id,
            name: currentUser.name,
          });
        }

        // freeTable actualiza updatedAt; ese timestamp también funciona como corte para
        // ignorar comandas históricas en el fallback visual del croquis.
        await freeTable(tableId, { id: currentUser.id, name: currentUser.name });

        if (table) {
          await clearAllPendingRequestsForTable(table.tableNumber, {
            id: currentUser.id,
            name: currentUser.name,
          });
        }
      } catch (err: any) {
        alert(err.message || 'Error al liberar mesa');
      }
    }
  };

  // Cambiar estado a limpieza
  const handleSetCleaning = async (tableId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await setTableStatus(tableId, 'LIMPIEZA', { id: currentUser.id, name: currentUser.name });
    } catch (err: any) {
      alert(err.message || 'Error al actualizar estado');
    }
  };

  // Cambiar tiempo de servicio
  const handleCourseChange = async (tableId: string, course: TableCourse) => {
    try {
      await setTableCourse(tableId, course, { id: currentUser.id, name: currentUser.name });
    } catch (err: any) {
      alert(err.message || 'Error al actualizar tiempo de servicio');
    }
  };

  // Alternar pendiente rápido y resolver solicitud QR correspondiente si existía
  const handleTogglePending = async (
    tableId: string,
    key: 'needsTortillas' | 'needsDrinks' | 'needsSecondCourse' | 'needsThirdCourse' | 'needsBill',
    currentVal: boolean,
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    try {
      await toggleTablePending(tableId, key, !currentVal, {
        id: currentUser.id,
        name: currentUser.name,
      });

      // Sólo cuando el pendiente pasa de ACTIVO -> RESUELTO se debe borrar
      // la solicitud QR correspondiente. Al activarlo manualmente desde el panel
      // no debemos eliminar una solicitud real del comensal.
      const table = tables.find((t) => t.tableId === tableId);
      if (table && currentVal) {
        const typeMap: Record<string, TableServiceRequestType> = {
          needsTortillas: 'TORTILLAS',
          needsDrinks: 'BEBIDAS',
          needsSecondCourse: 'SEGUNDO_TIEMPO',
          needsThirdCourse: 'TERCER_TIEMPO',
          needsBill: 'PEDIR_CUENTA',
        };
        const reqType = typeMap[key];
        if (reqType) {
          await markTableRequestAttended(table.tableNumber, reqType, {
            id: currentUser.id,
            name: currentUser.name,
          });
        }
      }
    } catch (err: any) {
      alert(err.message || 'Error al actualizar pendiente');
    }
  };

  // Resolver solicitud QR directa (por ejemplo: Llamar al Mesero)
  const handleResolveQrRequest = async (
    tableNumber: number,
    requestType: TableServiceRequestType,
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    try {
      await markTableRequestAttended(tableNumber, requestType, {
        id: currentUser.id,
        name: currentUser.name,
      });

      // Si la solicitud correspondía a un flag interno de la mesa, también limpiarlo
      const table = tables.find((t) => t.tableNumber === tableNumber);
      if (table) {
        const flagMap: Record<string, 'needsTortillas' | 'needsDrinks' | 'needsSecondCourse' | 'needsThirdCourse' | 'needsBill' | null> = {
          TORTILLAS: 'needsTortillas',
          BEBIDAS: 'needsDrinks',
          SEGUNDO_TIEMPO: 'needsSecondCourse',
          TERCER_TIEMPO: 'needsThirdCourse',
          PEDIR_CUENTA: 'needsBill',
          LLAMAR_MESERO: null,
        };
        const flag = flagMap[requestType];
        if (flag && table[flag]) {
          await toggleTablePending(table.tableId, flag, false, {
            id: currentUser.id,
            name: currentUser.name,
          });
        }
      }
    } catch (err: any) {
      alert(err.message || 'Error al resolver solicitud');
    }
  };

  // Abrir modal para agregar mesa
  const handleOpenAddTableModal = () => {
    const nextNumber = tables.length > 0 ? Math.max(...tables.map((t) => t.tableNumber)) + 1 : 1;
    setNewTableNumber(nextNumber);
    setNewTableCapacity(4);
    setNewTableLocation('salon');
    setAddTableError(null);
    setIsAddTableModalOpen(true);
  };

  // Guardar nueva mesa (solo DUEÑA o ADMINISTRADOR)
  const handleConfirmAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser.role !== 'DUEÑA' && currentUser.role !== 'ADMINISTRADOR') {
      setAddTableError('Solo la administración puede agregar nuevas mesas.');
      return;
    }
    if (Number(newTableNumber) === 3) {
      setAddTableError('El espacio 3 corresponde al área no operativa de Pantalla y no puede crearse como mesa.');
      return;
    }
    try {
      await addTable(
        Number(newTableNumber),
        `Mesa ${newTableNumber}`,
        Number(newTableCapacity),
        newTableLocation,
        { id: currentUser.id, name: currentUser.name }
      );
      setIsAddTableModalOpen(false);
    } catch (err: any) {
      setAddTableError(err.message || 'Error al agregar mesa');
    }
  };

  // Eliminar mesa
  const handleDeleteTable = async (tableId: string) => {
    if (window.confirm('¿Seguro que deseas eliminar esta mesa de la distribución?')) {
      try {
        await deleteTable(tableId, { id: currentUser.id, name: currentUser.name });
        setSelectedTable(null);
      } catch (err: any) {
        alert(err.message || 'Error al eliminar mesa');
      }
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Barra Superior Informativa y de Sincronización */}
      <div className="bg-[#3A2418] text-[#FFF7EA] p-4 sm:p-6 rounded-3xl shadow-md border border-[#C9974D]/30 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[11px] font-bold tracking-wider uppercase text-[#C9974D]">
                Control Operativo en Tiempo Real
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-tight">
              Mesas del Restaurante
            </h1>
            <p className="text-xs sm:text-sm text-[#F4E3C8]/80 mt-0.5">
              Gestión visual de salón, tiempos de servicio y llamados rápidos de atención.
            </p>
          </div>

          {/* Selector de Vistas y Botones de acción en cabecera */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Selector: [ Vista Croquis ] [ Vista Lista Rápida ] */}
            <div className="inline-flex p-1 bg-[#24160E] border border-[#C9974D]/40 rounded-2xl shadow-inner">
              <button
                type="button"
                onClick={() => setViewMode('croquis')}
                className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'croquis'
                    ? 'bg-[#C9974D] text-[#2B1B13] shadow-md font-extrabold'
                    : 'text-[#F4E3C8]/80 hover:text-white hover:bg-white/5'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                <span>Vista Croquis</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('lista')}
                className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'lista'
                    ? 'bg-[#C9974D] text-[#2B1B13] shadow-md font-extrabold'
                    : 'text-[#F4E3C8]/80 hover:text-white hover:bg-white/5'
                }`}
              >
                <List className="w-4 h-4" />
                <span>Vista Lista Rápida</span>
              </button>
            </div>

            {(currentUser.role === 'DUEÑA' || currentUser.role === 'ADMINISTRADOR') && (
              <button
                onClick={handleOpenAddTableModal}
                className="px-3 py-2 rounded-xl bg-[#C9974D] hover:bg-[#A67632] text-[#2B1B13] text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar Mesa</span>
              </button>
            )}
          </div>
        </div>

        {/* Tarjetas de Métricas / Resumen de Salón */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mt-5 pt-4 border-t border-[#C9974D]/20">
          <div className="bg-[#4A2E1F]/60 p-2.5 rounded-2xl border border-[#C9974D]/20 text-center">
            <span className="text-[11px] text-[#F4E3C8]/70 block font-medium">Total Mesas</span>
            <span className="text-xl sm:text-2xl font-bold font-serif text-white">{totalTables}</span>
          </div>

          <div className="bg-emerald-950/40 p-2.5 rounded-2xl border border-emerald-500/30 text-center">
            <span className="text-[11px] text-emerald-300 block font-medium">Libres</span>
            <span className="text-xl sm:text-2xl font-bold font-serif text-emerald-400">{freeCount}</span>
          </div>

          <div className="bg-[#4A2E1F] p-2.5 rounded-2xl border border-[#C9974D]/50 text-center">
            <span className="text-[11px] text-[#C9974D] block font-medium">Ocupadas</span>
            <span className="text-xl sm:text-2xl font-bold font-serif text-[#FFF7EA]">{occupiedCount}</span>
          </div>

          <div className="bg-blue-950/40 p-2.5 rounded-2xl border border-blue-500/30 text-center">
            <span className="text-[11px] text-blue-300 block font-medium">Cuenta / Limpieza</span>
            <span className="text-xl sm:text-2xl font-bold font-serif text-blue-400">
              {billCount + cleaningCount}
            </span>
          </div>

          <div
            onClick={() => setFilter('pending')}
            className={`col-span-2 sm:col-span-1 p-2.5 rounded-2xl border transition-all cursor-pointer text-center ${
              totalPendingCount > 0
                ? 'bg-amber-500/20 border-amber-400 text-amber-300 animate-pulse shadow-md'
                : 'bg-[#4A2E1F]/60 border-[#C9974D]/20 text-[#F4E3C8]/70'
            }`}
          >
            <span className="text-[11px] block font-bold flex items-center justify-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              Con Pendientes
            </span>
            <span className="text-xl sm:text-2xl font-bold font-serif text-amber-300">
              {totalPendingCount}
            </span>
          </div>
        </div>
      </div>

      {/* Barra de Filtros Rápidos (Muy cómoda para Celulares y Tablets) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setFilter('all')}
          className={`px-3.5 py-2 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
            filter === 'all'
              ? 'bg-[#3A2418] text-[#FFF7EA] shadow-sm'
              : 'bg-white border border-[#DEC8AE] text-[#4A2E1F] hover:bg-[#FFF7EA]'
          }`}
        >
          Todas ({totalTables})
        </button>

        <button
          onClick={() => setFilter('pending')}
          className={`px-3.5 py-2 rounded-xl font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            filter === 'pending'
              ? 'bg-amber-600 text-white shadow-sm'
              : totalPendingCount > 0
              ? 'bg-amber-100 border border-amber-300 text-amber-900 font-extrabold animate-bounce'
              : 'bg-white border border-[#DEC8AE] text-[#4A2E1F] hover:bg-[#FFF7EA]'
          }`}
        >
          <span>⚠️ Con Pendientes</span>
          {totalPendingCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold">
              {totalPendingCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setFilter('occupied')}
          className={`px-3.5 py-2 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
            filter === 'occupied'
              ? 'bg-[#3A2418] text-[#FFF7EA] shadow-sm'
              : 'bg-white border border-[#DEC8AE] text-[#4A2E1F] hover:bg-[#FFF7EA]'
          }`}
        >
          Ocupadas ({occupiedCount})
        </button>

        <button
          onClick={() => setFilter('free')}
          className={`px-3.5 py-2 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
            filter === 'free'
              ? 'bg-emerald-700 text-white shadow-sm'
              : 'bg-white border border-[#DEC8AE] text-[#4A2E1F] hover:bg-[#FFF7EA]'
          }`}
        >
          Libres ({freeCount})
        </button>

        <button
          onClick={() => setFilter('bill')}
          className={`px-3.5 py-2 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
            filter === 'bill'
              ? 'bg-blue-700 text-white shadow-sm'
              : 'bg-white border border-[#DEC8AE] text-[#4A2E1F] hover:bg-[#FFF7EA]'
          }`}
        >
          Cuenta / Limpieza ({billCount + cleaningCount})
        </button>
      </div>

      {/* ============================================================== */}
      {/* CONDICIONAL: VISTA CROQUIS VS VISTA LISTA RÁPIDA               */}
      {/* ============================================================== */}
      {viewMode === 'croquis' ? (
        /* ============================================================== */
        /* VISTA CROQUIS: PLANO SENCILLO Y VISUAL DEL RESTAURANTE         */
        /* ============================================================== */
        <div className="bg-[#FAF4E8] p-3 sm:p-5 md:p-6 rounded-3xl border-2 border-[#E8D4BE] shadow-xs space-y-4 sm:space-y-6">
          {/* Barra arquitectónica de referencia espacial del plano */}
          <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] sm:text-xs font-bold text-[#5C3825] px-2.5 py-2 bg-white/80 rounded-2xl border border-[#E8D4BE]">
            <div className="flex items-center gap-1.5 bg-[#FFF7EA] border border-[#DEC8AE] px-3 py-1 rounded-xl shadow-2xs">
              <span className="text-base">🚪</span>
              <span>Acceso & Entrada</span>
            </div>

            <div className="flex items-center gap-1.5 bg-[#FFF7EA] border border-[#C9974D]/40 text-[#2B1B13] px-3 py-1 rounded-xl shadow-2xs">
              <span className="text-base">💰</span>
              <span>Caja & Cobro</span>
            </div>

            <div className="flex items-center gap-1.5 bg-[#FFF7EA] border border-[#DEC8AE] px-3 py-1 rounded-xl shadow-2xs">
              <span className="text-base">🍳</span>
              <span>Cocina & Despacho</span>
            </div>
          </div>

          {/* ============================================================== */}
          {/* CROQUIS ARQUITECTÓNICO: 3 ZONAS (SUPERIOR, CENTRAL, INFERIOR)  */}
          {/* ============================================================== */}
          {(() => {
            // Helper para obtener mesa operativa por número
            const getTableByNum = (num: number): TableRecord => {
              const found = operationalTables.find((t) => t.tableNumber === num);
              if (found) return found;
              return (
                DEFAULT_TABLES.find((t) => t.tableNumber === num) || {
                  tableId: `table-${num}`,
                  tableNumber: num,
                  label: `Mesa ${num}`,
                  status: 'LIBRE',
                  guestCount: 0,
                  waiterId: '',
                  waiterName: '',
                  needsTortillas: false,
                  needsDrinks: false,
                  needsSecondCourse: false,
                  needsThirdCourse: false,
                  needsBill: false,
                  updatedAt: new Date().toISOString(),
                  updatedBy: 'sistema',
                  updatedByName: 'Sistema',
                  restaurantId: 'alo-restaurante',
                  capacity: num === 6 ? 6 : 4,
                  location: 'salon',
                }
              );
            };

            // Helper para verificar compatibilidad con el filtro activo
            const matchesActiveFilter = (t: TableRecord) => {
              if (filter === 'all') return true;
              if (filter === 'pending') {
                return checkTableHasPending(t);
              }
              if (filter === 'occupied') return t.status === 'OCUPADA';
              if (filter === 'free') return t.status === 'LIBRE';
              if (filter === 'bill') return t.status === 'CUENTA' || t.status === 'LIMPIEZA';
              return true;
            };

            // Renderizado de tarjeta de mesa en el croquis (Mesas 1, 2, 4, 5, 7, 8, 9 cuadradas; Mesa 6 alargada)
            const renderCroquisCard = (
              tableNumber: number,
              variant: 'standard' | 'horizontal'
            ) => {
              const table = getTableByNum(tableNumber);
              const tableQrs = qrRequests.filter(
                (r) => r.tableNumber === tableNumber && r.status === 'PENDIENTE'
              );
              const hasQrCalling = tableQrs.some((r) => r.requestType === 'LLAMAR_MESERO');
              const hasQrTortillas = tableQrs.some((r) => r.requestType === 'TORTILLAS');
              const hasQrDrinks = tableQrs.some((r) => r.requestType === 'BEBIDAS');
              const hasQrSecond = tableQrs.some((r) => r.requestType === 'SEGUNDO_TIEMPO');
              const hasQrThird = tableQrs.some((r) => r.requestType === 'TERCER_TIEMPO');
              const hasQrBill = tableQrs.some((r) => r.requestType === 'PEDIR_CUENTA');

              const hasPending =
                hasQrCalling ||
                table.needsTortillas ||
                hasQrTortillas ||
                table.needsDrinks ||
                hasQrDrinks ||
                table.needsSecondCourse ||
                hasQrSecond ||
                table.needsThirdCourse ||
                hasQrThird ||
                table.needsBill ||
                hasQrBill;

              const isMatch = matchesActiveFilter(table);

              const courseLabel =
                table.currentCourse === '1ER_TIEMPO'
                  ? '1º Tiempo'
                  : table.currentCourse === '2DO_TIEMPO'
                  ? '2º Tiempo'
                  : table.currentCourse === '3ER_TIEMPO'
                  ? '3º Tiempo'
                  : table.currentCourse === 'FINALIZADO'
                  ? 'Finalizado'
                  : null;

              // Estilos de estado
              let blockBorder = 'border-[#DEC8AE]';
              let blockBg = 'bg-white';
              let badgeBg = 'bg-gray-100 text-gray-700 border-gray-300';

              if (table.status === 'LIBRE') {
                if (hasPending) {
                  blockBorder = 'border-amber-500 ring-2 ring-amber-400/80 shadow-md';
                  blockBg = 'bg-amber-50/40 hover:bg-amber-50/70';
                  badgeBg = 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
                } else {
                  blockBorder = 'border-emerald-300 hover:border-emerald-500';
                  blockBg = 'bg-[#FCFBF7] hover:bg-emerald-50/40';
                  badgeBg = 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold';
                }
              } else if (table.status === 'OCUPADA') {
                if (hasPending) {
                  blockBorder = 'border-amber-500 ring-2 ring-amber-400/80 shadow-md';
                  blockBg = 'bg-amber-50/40 hover:bg-amber-50/70';
                } else {
                  blockBorder = 'border-[#C9974D]/70 hover:border-[#C9974D]';
                  blockBg = 'bg-white hover:bg-[#FFF7EA]/40';
                }
                badgeBg = 'bg-[#3A2418] text-[#FFF7EA] border-[#C9974D]/40 font-bold';
              } else if (table.status === 'CUENTA') {
                blockBorder = 'border-blue-400 ring-2 ring-blue-300/60 shadow-xs';
                blockBg = 'bg-blue-50/50 hover:bg-blue-50/80';
                badgeBg = 'bg-blue-100 text-blue-900 border-blue-300 font-bold';
              } else if (table.status === 'LIMPIEZA') {
                blockBorder = 'border-amber-400';
                blockBg = 'bg-amber-50/50 hover:bg-amber-50/80';
                badgeBg = 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
              }

              // Altura homogénea para todas las filas para conservar la proporción visual y alineación perfecta
              const heightClass = 'min-h-[142px] sm:min-h-[155px]';
              const shapeBadge =
                variant === 'horizontal' ? (
                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-[#EEDBC5] text-[#5C3825] tracking-tight">
                    📏 Larga
                  </span>
                ) : null;

              return (
                <div
                  key={table.tableId}
                  id={`croquis-mesa-${table.tableNumber}`}
                  onClick={() => setSelectedTable(table)}
                  className={`w-full relative p-2.5 sm:p-3.5 rounded-2xl border-2 flex flex-col justify-between transition-all cursor-pointer select-none active:scale-[0.98] shadow-2xs hover:shadow-md ${heightClass} ${blockBorder} ${blockBg} ${
                    !isMatch ? 'opacity-30 grayscale-[50%] hover:opacity-85' : 'opacity-100'
                  }`}
                >
                  {/* Cintillo de alertas activas */}
                  {hasPending && (
                    <div className="absolute -top-2.5 left-2 right-2 bg-amber-500 text-[#2B1B13] px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 shadow-xs animate-pulse z-10">
                      <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#2B1B13]" />
                      <span>{hasQrCalling ? '¡Llaman mesero!' : '¡Pendiente!'}</span>
                    </div>
                  )}

                  {/* Encabezado: Número, distintivo y Estado */}
                  <div>
                    <div className={`flex items-start justify-between gap-1 ${hasPending ? 'mt-1' : ''}`}>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-serif font-bold text-base sm:text-lg text-[#2B1B13] leading-tight">
                            Mesa {table.tableNumber}
                          </h4>
                          {shapeBadge}
                        </div>
                        <span className="text-[9px] sm:text-[10px] uppercase font-bold text-[#A67632] tracking-wider block">
                          {table.location === 'terraza'
                            ? '🌿 Terraza'
                            : table.location === 'barra'
                            ? '☕ Barra'
                            : '🍽 Salón'}
                        </span>
                      </div>

                      <span
                        className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-lg border uppercase tracking-wider ${badgeBg}`}
                      >
                        {table.status}
                      </span>
                    </div>

                    {/* Contenido según estado */}
                    <div className="mt-1.5 space-y-1">
                      {table.status === 'LIBRE' && (
                        <div className="text-[10px] sm:text-[11px] text-[#5C3825]">
                          <span className="text-emerald-700 font-bold block mt-1">✨ Disponible</span>
                          {hasPending && (
                            <div className="mt-1 flex items-center gap-1 flex-wrap bg-amber-100/90 border border-amber-300 px-1.5 py-0.5 rounded-lg">
                              {hasQrCalling && (
                                <span title="Llamado de mesero vía QR" className="text-sm leading-none animate-bounce">
                                  🙋
                                </span>
                              )}
                              {(table.needsTortillas || hasQrTortillas) && (
                                <span title="Tortillas pendientes" className="text-sm leading-none">🌮</span>
                              )}
                              {(table.needsDrinks || hasQrDrinks) && (
                                <span title="Bebidas pendientes" className="text-sm leading-none">🥤</span>
                              )}
                              {(table.needsSecondCourse || hasQrSecond) && (
                                <span title="2º Tiempo pendiente" className="text-sm leading-none">🍽</span>
                              )}
                              {(table.needsThirdCourse || hasQrThird) && (
                                <span title="3º Tiempo pendiente" className="text-sm leading-none">🍮</span>
                              )}
                              {(table.needsBill || hasQrBill) && (
                                <span title="Cuenta pedida" className="text-sm leading-none">💳</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {table.status === 'OCUPADA' && (
                        <>
                          <div className="text-[10px] sm:text-[11px] text-[#5C3825] truncate">
                            <span className="font-medium">
                              👤 {table.waiterName || 'Sin mesero'}
                            </span>
                          </div>

                          <div className="text-[10px] sm:text-[11px] font-bold text-[#2B1B13]">
                            👥 {table.guestCount || 1} {table.guestCount === 1 ? 'persona' : 'personas'}
                          </div>

                          {courseLabel && (
                            <div className="text-[10px] sm:text-xs font-bold text-[#A67632]">
                              {courseLabel}
                            </div>
                          )}

                          {/* Iconos de pendientes activos */}
                          {hasPending && (
                            <div className="mt-1 flex items-center gap-1 flex-wrap bg-amber-100/90 border border-amber-300 px-1.5 py-0.5 rounded-lg">
                              {hasQrCalling && (
                                <span title="Llamado de mesero vía QR" className="text-sm leading-none animate-bounce">
                                  🙋
                                </span>
                              )}
                              {(table.needsTortillas || hasQrTortillas) && (
                                <span title="Tortillas pendientes" className="text-sm leading-none">
                                  🌮
                                </span>
                              )}
                              {(table.needsDrinks || hasQrDrinks) && (
                                <span title="Bebidas pendientes" className="text-sm leading-none">
                                  🥤
                                </span>
                              )}
                              {(table.needsSecondCourse || hasQrSecond) && (
                                <span title="2º Tiempo pendiente" className="text-sm leading-none">
                                  🍽
                                </span>
                              )}
                              {(table.needsThirdCourse || hasQrThird) && (
                                <span title="3º Tiempo pendiente" className="text-sm leading-none">
                                  🍮
                                </span>
                              )}
                              {(table.needsBill || hasQrBill) && (
                                <span title="Cuenta pedida" className="text-sm leading-none">
                                  💳
                                </span>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {table.status === 'CUENTA' && (
                        <div className="space-y-0.5">
                          <span className="text-[10px] sm:text-[11px] text-[#5C3825] block truncate">
                            👤 {table.waiterName || 'Sin mesero'}
                          </span>
                          <span className="text-[10px] sm:text-xs font-bold text-blue-800 block">
                            💳 Cuenta Solicitada
                          </span>
                          {hasPending && (
                            <div className="mt-1 flex items-center gap-1 flex-wrap bg-amber-100/90 border border-amber-300 px-1.5 py-0.5 rounded-lg">
                              {hasQrCalling && <span title="Llamado de mesero" className="text-sm animate-bounce">🙋</span>}
                              {(table.needsBill || hasQrBill) && <span title="Cuenta" className="text-sm">💳</span>}
                              {(table.needsDrinks || hasQrDrinks) && <span title="Bebidas" className="text-sm">🥤</span>}
                            </div>
                          )}
                        </div>
                      )}

                      {table.status === 'LIMPIEZA' && (
                        <div className="space-y-0.5">
                          <span className="text-[10px] sm:text-[11px] text-[#5C3825] block truncate">
                            👤 {table.waiterName || 'Personal'}
                          </span>
                          <span className="text-[10px] sm:text-xs font-bold text-amber-800 block">
                            🧹 En Limpieza
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pie del bloque: comensales y llamada a acción */}
                  <div className="pt-1.5 border-t border-[#DEC8AE]/50 mt-1.5 flex items-center justify-between text-[9px] sm:text-[10px] text-[#5C3825]">
                    <span className="truncate font-medium">
                      {table.status === 'OCUPADA'
                        ? `👥 ${table.guestCount || 1} ${table.guestCount === 1 ? 'persona' : 'personas'}`
                        : `Mesa #${table.tableNumber}`}
                    </span>
                    <span className="text-[#C9974D] font-bold shrink-0 ml-1">👆 Tocar</span>
                  </div>
                </div>
              );
            };

            // Renderizado del bloque estático de "Pantalla" (Área no operativa, mismo tamaño base de mesa larga)
            const renderPantallaBlock = () => {
              return (
                <div
                  id="croquis-bloque-pantalla"
                  className="w-full relative p-2.5 sm:p-3.5 rounded-2xl border-2 border-dashed border-[#D4B896] bg-[#F5ECE1]/90 flex flex-col justify-between select-none cursor-default min-h-[142px] sm:min-h-[155px] shadow-2xs"
                >
                  <div>
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#3A2418] text-[#FFF7EA] flex items-center justify-center shadow-xs">
                          <Tv className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300" />
                        </div>
                        <div>
                          <h4 className="font-serif font-bold text-base sm:text-lg text-[#2B1B13] leading-tight">
                            Pantalla
                          </h4>
                          <span className="text-[9px] sm:text-[10px] uppercase font-bold text-[#8C6228] tracking-wider block">
                            Área no operativa
                          </span>
                        </div>
                      </div>

                      <span className="text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-lg border border-[#DEC8AE] bg-[#FFF7EA] text-[#6B4B35] uppercase tracking-wider">
                        Audio / TV Salón
                      </span>
                    </div>

                    <div className="mt-2.5 text-[10px] sm:text-[11px] text-[#6B4B35] space-y-0.5">
                      <p className="font-medium flex items-center gap-1.5">
                        <span className="text-sm">📺</span>
                        <span>Pantalla de transmisión y ambientación visual</span>
                      </p>
                      <p className="text-[9px] sm:text-[10px] text-[#8C6228]">
                        Espacio físico permanente • Sin servicio de mesa
                      </p>
                    </div>
                  </div>

                  <div className="pt-1.5 border-t border-[#DEC8AE]/70 mt-1.5 flex items-center justify-between text-[9px] sm:text-[10px] text-[#7A583E]">
                    <span className="font-medium flex items-center gap-1">
                      <span>📍</span>
                      <span>Salón Principal (Frente)</span>
                    </span>
                    <span className="text-[#8C6228] font-bold uppercase tracking-wider">No asignable</span>
                  </div>
                </div>
              );
            };

            return (
              <div className="overflow-x-auto pb-2 -mx-1 px-1">
                <div className="min-w-[600px] sm:min-w-0 space-y-4 sm:space-y-5">
                  {/* --------------------------------------------------- */}
                  {/* 1. ZONA SUPERIOR: Mesa 7 | Mesa 8 | Mesa 9          */}
                  {/* --------------------------------------------------- */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#A67632]">
                      <span className="bg-[#EEDBC5] px-2.5 py-0.5 rounded-md text-[#4A2E1F]">
                        Zona Superior (Fondo Salón)
                      </span>
                      <div className="h-px bg-[#DEC8AE]/80 flex-1"></div>
                    </div>

                    <div className="grid grid-cols-12 gap-2.5 sm:gap-4 items-stretch">
                      {/* Mesa 7: Arriba a la Izquierda (Cuadrada) */}
                      <div className="col-span-3">
                        {renderCroquisCard(7, 'standard')}
                      </div>

                      {/* Mesa 8: Arriba al Centro (Cuadrada) */}
                      <div className="col-span-3 col-start-5">
                        {renderCroquisCard(8, 'standard')}
                      </div>

                      {/* Mesa 9: Arriba a la Derecha (Cuadrada, mismo tamaño que 7 y 8) */}
                      <div className="col-span-3 col-start-10">
                        {renderCroquisCard(9, 'standard')}
                      </div>
                    </div>
                  </div>

                  {/* Pasillo arquitectónico de servicio */}
                  <div className="relative py-0.5 flex items-center justify-center">
                    <div className="w-full border-t border-dashed border-[#DEC8AE]"></div>
                    <span className="absolute bg-[#FAF4E8] px-2.5 text-[9px] font-semibold text-[#A67632]/80 uppercase tracking-wider">
                      🚶 Pasillo de Servicio Salón
                    </span>
                  </div>

                  {/* --------------------------------------------------- */}
                  {/* 2. ZONA CENTRAL: Mesa 4 | Mesa 5 | Mesa 6 (Larga)   */}
                  {/* --------------------------------------------------- */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#A67632]">
                      <span className="bg-[#EEDBC5] px-2.5 py-0.5 rounded-md text-[#4A2E1F]">
                        Zona Central
                      </span>
                      <div className="h-px bg-[#DEC8AE]/80 flex-1"></div>
                    </div>

                    <div className="grid grid-cols-12 gap-2.5 sm:gap-4 items-stretch">
                      {/* Mesa 4: Centro Izquierda (Cuadrada) */}
                      <div className="col-span-3">
                        {renderCroquisCard(4, 'standard')}
                      </div>

                      {/* Mesa 5: Centro (Cuadrada) */}
                      <div className="col-span-3 col-start-5">
                        {renderCroquisCard(5, 'standard')}
                      </div>

                      {/* Mesa 6: Centro Derecha (Mesa Larga Horizontal) */}
                      <div className="col-span-5 col-start-8">
                        {renderCroquisCard(6, 'horizontal')}
                      </div>
                    </div>
                  </div>

                  {/* Pasillo arquitectónico de entrada */}
                  <div className="relative py-0.5 flex items-center justify-center">
                    <div className="w-full border-t border-dashed border-[#DEC8AE]"></div>
                    <span className="absolute bg-[#FAF4E8] px-2.5 text-[9px] font-semibold text-[#A67632]/80 uppercase tracking-wider">
                      🚶 Pasillo Principal
                    </span>
                  </div>

                  {/* --------------------------------------------------- */}
                  {/* 3. ZONA INFERIOR: Mesa 1 | Mesa 2 | Pantalla        */}
                  {/* --------------------------------------------------- */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#A67632]">
                      <span className="bg-[#EEDBC5] px-2.5 py-0.5 rounded-md text-[#4A2E1F]">
                        Zona Inferior (Frente / Entrada)
                      </span>
                      <div className="h-px bg-[#DEC8AE]/80 flex-1"></div>
                    </div>

                    <div className="grid grid-cols-12 gap-2.5 sm:gap-4 items-stretch">
                      {/* Mesa 1: Abajo a la Izquierda (Cuadrada) */}
                      <div className="col-span-3">
                        {renderCroquisCard(1, 'standard')}
                      </div>

                      {/* Mesa 2: Abajo al Centro (Cuadrada) */}
                      <div className="col-span-3 col-start-5">
                        {renderCroquisCard(2, 'standard')}
                      </div>

                      {/* Pantalla: Abajo Derecha (Bloque visual no operativo, mismo tamaño base que mesa 6) */}
                      <div className="col-span-5 col-start-8">
                        {renderPantallaBlock()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Leyenda explicativa al pie del Croquis */}
          <div className="pt-3 border-t border-[#E8D4BE]/70 flex items-center justify-between flex-wrap gap-2 text-[11px] text-[#5C3825]">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span>Libre</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3A2418]"></span>
                <span>Ocupada</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                <span>Cuenta</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                <span>Limpieza</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse ring-2 ring-amber-300"></span>
                <span className="font-bold text-amber-900">⚠️ Con Pendientes</span>
              </span>
              <span className="flex items-center gap-1 text-[#8C6228]">
                <span className="w-2.5 h-2.5 rounded-xs border border-dashed border-[#8C6228] bg-[#F5ECE1]"></span>
                <span className="font-medium">📺 Pantalla (No operativa)</span>
              </span>
            </div>

            <span className="text-[#A67632] italic">
              💡 Toca cualquier mesa para abrir su panel operativo
            </span>
          </div>
        </div>
      ) : (
        /* ============================================================== */
        /* VISTA LISTA RÁPIDA: OPERACIÓN DIRECTA CON BOTONES INTACTA      */
        /* ============================================================== */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredTables.map((table) => {
          const tableQrs = qrRequests.filter(
            (r) => r.tableNumber === table.tableNumber && r.status === 'PENDIENTE'
          );
          const hasQrCalling = tableQrs.some((r) => r.requestType === 'LLAMAR_MESERO');
          const hasQrTortillas = tableQrs.some((r) => r.requestType === 'TORTILLAS');
          const hasQrDrinks = tableQrs.some((r) => r.requestType === 'BEBIDAS');
          const hasQrSecond = tableQrs.some((r) => r.requestType === 'SEGUNDO_TIEMPO');
          const hasQrThird = tableQrs.some((r) => r.requestType === 'TERCER_TIEMPO');
          const hasQrBill = tableQrs.some((r) => r.requestType === 'PEDIR_CUENTA');

          const hasPending =
            hasQrCalling ||
            table.needsTortillas ||
            hasQrTortillas ||
            table.needsDrinks ||
            hasQrDrinks ||
            table.needsSecondCourse ||
            hasQrSecond ||
            table.needsThirdCourse ||
            hasQrThird ||
            table.needsBill ||
            hasQrBill;

          // Clases según estado
          let statusBadgeClass = 'bg-gray-100 text-gray-700 border-gray-300';
          let statusBorderClass = 'border-[#F4E3C8]';
          let statusBgCard = 'bg-white';

          if (table.status === 'LIBRE') {
            if (hasPending) {
              statusBadgeClass = 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
              statusBorderClass = 'border-amber-400 ring-2 ring-amber-400/60 shadow-lg';
              statusBgCard = 'bg-amber-50/40';
            } else {
              statusBadgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold';
              statusBorderClass = 'border-emerald-200 hover:border-emerald-400';
              statusBgCard = 'bg-white hover:bg-emerald-50/20';
            }
          } else if (table.status === 'OCUPADA') {
            statusBadgeClass = 'bg-[#3A2418] text-[#FFF7EA] border-[#C9974D]/40 font-bold';
            statusBorderClass = hasPending
              ? 'border-amber-400 ring-2 ring-amber-400/60 shadow-lg'
              : 'border-[#C9974D]/40';
            statusBgCard = hasPending ? 'bg-amber-50/30' : 'bg-white';
          } else if (table.status === 'CUENTA') {
            statusBadgeClass = 'bg-blue-100 text-blue-900 border-blue-300 font-bold';
            statusBorderClass = 'border-blue-400 ring-2 ring-blue-300';
            statusBgCard = 'bg-blue-50/40';
          } else if (table.status === 'LIMPIEZA') {
            statusBadgeClass = 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
            statusBorderClass = 'border-amber-300';
            statusBgCard = 'bg-amber-50/30';
          }

          return (
            <div
              key={table.tableId}
              onClick={() => setSelectedTable(table)}
              className={`rounded-3xl border-2 p-4 transition-all relative flex flex-col justify-between cursor-pointer shadow-sm hover:shadow-md ${statusBorderClass} ${statusBgCard}`}
            >
              {/* Alerta Destacada si tiene pendientes */}
              {hasPending && (
                <div className="absolute -top-3 left-4 right-4 bg-amber-500 text-[#2B1B13] px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center justify-between shadow-md animate-pulse z-10">
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {hasQrCalling ? '¡Comensal llama al mesero!' : '¡Atención requerida!'}
                  </span>
                  <span>{table.waiterName || 'Personal'}</span>
                </div>
              )}

              <div>
                {/* Cabecera de la Tarjeta */}
                <div className={`flex items-start justify-between gap-2 ${hasPending ? 'mt-2' : ''}`}>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#A67632] tracking-wider block">
                      {table.location === 'terraza'
                        ? '🌿 Terraza'
                        : table.location === 'barra'
                        ? '☕ Barra'
                        : '🍽 Salón'}
                    </span>
                    <h3 className="text-xl sm:text-2xl font-bold font-serif text-[#2B1B13]">
                      Mesa {table.tableNumber}
                    </h3>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-xl text-xs uppercase tracking-wider border ${statusBadgeClass}`}
                  >
                    {table.status}
                  </span>
                </div>

                {/* Contenido según Estado */}
                {table.status === 'LIBRE' ? (
                  <div className="my-5 text-center py-4 bg-[#FFF7EA]/60 rounded-2xl border border-dashed border-[#DEC8AE]">
                    <span className="text-xs sm:text-sm text-emerald-700 font-bold block">
                      ✨ Mesa Disponible
                    </span>
                    <span className="text-[11px] text-[#5C3825] font-medium block mt-1">
                      Toca para asignar y abrir servicio
                    </span>
                  </div>
                ) : (
                  <div className="my-3 space-y-2.5">
                    {/* Comensales y Mesero */}
                    <div className="flex items-center justify-between text-xs text-[#4A2E1F] bg-[#FFF7EA] p-2 rounded-xl border border-[#DEC8AE]/40">
                      <span className="flex items-center gap-1 font-bold">
                        <Users className="w-3.5 h-3.5 text-[#C9974D]" />
                        {table.guestCount} {table.guestCount === 1 ? 'persona' : 'personas'}
                      </span>
                      <span className="text-[11px] text-[#5C3825] font-medium truncate max-w-[120px]">
                        🧑‍🍳 {table.waiterName || 'Sin mesero'}
                      </span>
                    </div>

                    {/* Tiempo de Servicio Visual */}
                    {table.status === 'OCUPADA' && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-bold text-[#4A2E1F]">
                          <span>Tiempo de servicio:</span>
                          <span className="text-[#C9974D]">
                            {table.currentCourse === '1ER_TIEMPO'
                              ? '1er Tiempo (Sopa)'
                              : table.currentCourse === '2DO_TIEMPO'
                              ? '2do Tiempo (Arroz/Pasta)'
                              : table.currentCourse === '3ER_TIEMPO'
                              ? '3er Tiempo (Plato Fuerte)'
                              : table.currentCourse === 'FINALIZADO'
                              ? 'Finalizado / Postre'
                              : 'Por iniciar'}
                          </span>
                        </div>
                        {/* Indicador de progreso de 4 pasos */}
                        <div className="grid grid-cols-4 gap-1">
                          <div
                            className={`h-2 rounded-full ${
                              table.currentCourse ? 'bg-amber-500' : 'bg-gray-200'
                            }`}
                          ></div>
                          <div
                            className={`h-2 rounded-full ${
                              table.currentCourse === '2DO_TIEMPO' ||
                              table.currentCourse === '3ER_TIEMPO' ||
                              table.currentCourse === 'FINALIZADO'
                                ? 'bg-amber-500'
                                : 'bg-gray-200'
                            }`}
                          ></div>
                          <div
                            className={`h-2 rounded-full ${
                              table.currentCourse === '3ER_TIEMPO' ||
                              table.currentCourse === 'FINALIZADO'
                                ? 'bg-amber-500'
                                : 'bg-gray-200'
                            }`}
                          ></div>
                          <div
                            className={`h-2 rounded-full ${
                              table.currentCourse === 'FINALIZADO' ? 'bg-emerald-500' : 'bg-gray-200'
                            }`}
                          ></div>
                        </div>
                      </div>
                    )}

                    {/* PENDIENTES ACTIVOS EN TARJETA */}
                    {hasPending && (
                      <div className="bg-amber-100/90 border border-amber-300 rounded-xl p-2 space-y-1.5">
                        <span className="text-[10px] font-black uppercase text-amber-900 tracking-wider block">
                          Pendientes solicitados:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {hasQrCalling && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleResolveQrRequest(table.tableNumber, 'LLAMAR_MESERO', e);
                              }}
                              className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-emerald-600 text-white text-[11px] font-bold shadow-xs transition-all flex items-center gap-1 cursor-pointer animate-pulse"
                              title="Tocar para marcar llamado como atendido"
                            >
                              <span>🙋 Llamar mesero</span>
                              <CheckCircle2 className="w-3 h-3 ml-0.5" />
                            </button>
                          )}
                          {(table.needsTortillas || hasQrTortillas) && (
                            <button
                              onClick={(e) => handleTogglePending(table.tableId, 'needsTortillas', true, e)}
                              className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-emerald-600 text-[#2B1B13] hover:text-white text-[11px] font-bold shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                              title="Tocar para marcar como listo"
                            >
                              <span>🌮 Tortillas</span>
                              <CheckCircle2 className="w-3 h-3 ml-0.5" />
                            </button>
                          )}
                          {(table.needsDrinks || hasQrDrinks) && (
                            <button
                              onClick={(e) => handleTogglePending(table.tableId, 'needsDrinks', true, e)}
                              className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-emerald-600 text-[#2B1B13] hover:text-white text-[11px] font-bold shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                              title="Tocar para marcar como listo"
                            >
                              <span>🥤 Bebidas</span>
                              <CheckCircle2 className="w-3 h-3 ml-0.5" />
                            </button>
                          )}
                          {(table.needsSecondCourse || hasQrSecond) && (
                            <button
                              onClick={(e) =>
                                handleTogglePending(table.tableId, 'needsSecondCourse', true, e)
                              }
                              className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-emerald-600 text-[#2B1B13] hover:text-white text-[11px] font-bold shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                              title="Tocar para marcar como listo"
                            >
                              <span>🍽 2do tiempo</span>
                              <CheckCircle2 className="w-3 h-3 ml-0.5" />
                            </button>
                          )}
                          {(table.needsThirdCourse || hasQrThird) && (
                            <button
                              onClick={(e) =>
                                handleTogglePending(table.tableId, 'needsThirdCourse', true, e)
                              }
                              className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-emerald-600 text-[#2B1B13] hover:text-white text-[11px] font-bold shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                              title="Tocar para marcar como listo"
                            >
                              <span>🍮 3er tiempo</span>
                              <CheckCircle2 className="w-3 h-3 ml-0.5" />
                            </button>
                          )}
                          {(table.needsBill || hasQrBill) && (
                            <button
                              onClick={(e) => handleTogglePending(table.tableId, 'needsBill', true, e)}
                              className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-emerald-600 text-white text-[11px] font-bold shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                              title="Tocar para marcar como lista"
                            >
                              <span>💳 Cuenta</span>
                              <CheckCircle2 className="w-3 h-3 ml-0.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {table.notes && (
                      <p className="text-[11px] text-[#5C3825] italic truncate bg-[#FFF7EA] px-2 py-1 rounded-lg">
                        "{table.notes}"
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Botón de Acción Principal en Tarjeta */}
              <div className="pt-2 border-t border-[#F4E3C8]/60 mt-2">
                {table.status === 'LIBRE' ? (
                  <button
                    onClick={(e) => handleOpenOccupyModal(table, e)}
                    className="w-full py-2.5 px-3 rounded-2xl bg-[#3A2418] hover:bg-[#5C3825] text-[#FFF7EA] text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>🛎 Ocupar Mesa</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTable(table);
                      }}
                      className="flex-1 py-2 px-3 rounded-2xl bg-[#FFF7EA] hover:bg-[#F4E3C8] text-[#3A2418] border border-[#DEC8AE] text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Utensils className="w-3.5 h-3.5 text-[#C9974D]" />
                      <span>Atender / Gestionar</span>
                    </button>

                    {table.status === 'CUENTA' ? (
                      <button
                        onClick={(e) => handleSetCleaning(table.tableId, e)}
                        className="py-2 px-2.5 rounded-2xl bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-xs font-bold transition-all cursor-pointer"
                        title="Pasar a Limpieza"
                      >
                        🧹
                      </button>
                    ) : (
                      <button
                        onClick={(e) => handleFreeTable(table.tableId, e)}
                        className="py-2 px-2.5 rounded-2xl bg-gray-100 hover:bg-emerald-100 text-gray-700 hover:text-emerald-800 border border-gray-300 text-xs font-bold transition-all cursor-pointer"
                        title="Liberar Mesa"
                      >
                        ✨
                      </button>
                    )}
                  </div>
                )}

                {/* Hora de apertura / última actualización */}
                <div className="flex items-center justify-between text-[10px] text-gray-400 mt-2">
                  <span>
                    {table.openedAt ? `Abierta: ${table.openedAt}` : `Mesa #${table.tableNumber}`}
                  </span>
                  <span>{table.updatedByName ? `Por: ${table.updatedByName}` : ''}</span>
                </div>
              </div>
            </div>
          );
        })}
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL / PANEL DE GESTIÓN OPERATIVA COMPLETA DE MESA SELECCIONADA */}
      {/* ============================================================== */}
      {selectedTable && !isOccupyModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setSelectedTable(null)}
        >
          <div
            className="bg-[#FFF7EA] w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[#C9974D]/40 max-h-[92vh] flex flex-col overflow-hidden text-[#2B1B13]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Panel */}
            <div className="bg-[#3A2418] text-[#FFF7EA] p-4 sm:p-5 flex items-center justify-between border-b border-[#C9974D]/30">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#4A2E1F] border border-[#C9974D]/50 flex items-center justify-center font-serif font-bold text-xl text-[#C9974D]">
                  {selectedTable.tableNumber}
                </div>
                <div>
                  <h2 className="text-xl font-serif font-bold text-white">
                    Mesa {selectedTable.tableNumber}
                  </h2>
                  <div className="flex items-center gap-2 text-xs text-[#F4E3C8]/80">
                    <span className="uppercase tracking-wider font-semibold">
                      {selectedTable.location || 'Salón'}
                    </span>
                    {selectedTable.openedAt && (
                      <span>• Abierta a las {selectedTable.openedAt}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedTable(null)}
                  className="p-2 rounded-xl bg-[#4A2E1F] text-[#F4E3C8] hover:text-white hover:bg-[#5C3825] transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Contenido Operativo Scrollable */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
              {/* ESTADO GENERAL DE LA MESA */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#5C3825] block mb-2">
                  Estado General de la Mesa
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['LIBRE', 'OCUPADA', 'CUENTA', 'LIMPIEZA'] as TableStatus[]).map((st) => (
                    <button
                      key={st}
                      onClick={() =>
                        setTableStatus(selectedTable.tableId, st, {
                          id: currentUser.id,
                          name: currentUser.name,
                        })
                      }
                      className={`py-2.5 px-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer text-center ${
                        selectedTable.status === st
                          ? st === 'LIBRE'
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                            : st === 'OCUPADA'
                            ? 'bg-[#3A2418] text-[#FFF7EA] border-[#C9974D] shadow-sm'
                            : st === 'CUENTA'
                            ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                            : 'bg-amber-600 text-white border-amber-700 shadow-sm'
                          : 'bg-white border-[#DEC8AE] text-[#5C3825] hover:bg-[#FFF7EA]'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Solicitudes activas desde QR para esta mesa */}
              {(() => {
                const tableQrs = qrRequests.filter(
                  (r) => r.tableNumber === selectedTable.tableNumber && r.status === 'PENDIENTE'
                );
                if (tableQrs.length === 0) return null;

                return (
                  <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-3.5 space-y-2.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-600 animate-bounce" />
                        Solicitudes por QR desde la Mesa
                      </span>
                      <span className="text-[10px] font-bold bg-rose-200 text-rose-800 px-2 py-0.5 rounded-full">
                        {tableQrs.length} {tableQrs.length === 1 ? 'pendiente' : 'pendientes'}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {tableQrs.map((req) => (
                        <div
                          key={req.id}
                          className="flex items-center gap-2 bg-white border border-rose-200 rounded-xl px-2.5 py-1.5 text-xs shadow-xs"
                        >
                          <span className="font-bold text-[#2B1B13]">
                            {req.requestType === 'LLAMAR_MESERO'
                              ? '🙋 Llamar mesero'
                              : req.requestType === 'TORTILLAS'
                              ? '🌮 Tortillas'
                              : req.requestType === 'BEBIDAS'
                              ? '🥤 Bebidas'
                              : req.requestType === 'SEGUNDO_TIEMPO'
                              ? '🍽 2do Tiempo'
                              : req.requestType === 'TERCER_TIEMPO'
                              ? '🍮 3er Tiempo'
                              : '💳 Pedir Cuenta'}
                          </span>
                          <button
                            onClick={(e) => handleResolveQrRequest(selectedTable.tableNumber, req.requestType, e)}
                            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                            title="Marcar como atendida"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Atendido</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {selectedTable.status === 'LIBRE' ? (
                <div className="bg-white p-6 rounded-2xl border border-[#DEC8AE] text-center space-y-3">
                  <span className="text-4xl block">🛎</span>
                  <h3 className="font-serif font-bold text-lg text-[#2B1B13]">
                    Mesa {selectedTable.tableNumber} está Libre
                  </h3>
                  <p className="text-xs text-[#5C3825]">
                    Mesa lista para recibir comensales y registrar servicio.
                  </p>
                  <button
                    onClick={() => handleOpenOccupyModal(selectedTable)}
                    className="w-full py-3 rounded-2xl bg-[#3A2418] hover:bg-[#5C3825] text-[#FFF7EA] font-bold text-sm transition-all shadow-md cursor-pointer"
                  >
                    Ocupar Mesa Ahora
                  </button>
                </div>
              ) : (
                <>
                  {/* SECCIÓN 1: TIEMPOS DE SERVICIO (comida corrida / especialidades) */}
                  <div className="bg-white p-4 rounded-2xl border border-[#DEC8AE] space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-[#5C3825]">
                        Tiempo de Servicio
                      </label>
                      <span className="text-xs font-semibold text-[#A67632]">
                        {selectedTable.currentCourse || 'Sin iniciar'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button
                        onClick={() => handleCourseChange(selectedTable.tableId, '1ER_TIEMPO')}
                        className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                          selectedTable.currentCourse === '1ER_TIEMPO'
                            ? 'bg-amber-500 text-[#2B1B13] border-amber-600 font-extrabold shadow-sm'
                            : 'bg-[#FFF7EA]/60 border-[#DEC8AE] text-[#4A2E1F] hover:bg-[#FFF7EA]'
                        }`}
                      >
                        <span className="text-lg block mb-0.5">🥣</span>
                        <span className="text-xs font-bold block">1er Tiempo</span>
                        <span className="text-[10px] text-[#5C3825] block">Sopa / Consomé</span>
                      </button>

                      <button
                        onClick={() => handleCourseChange(selectedTable.tableId, '2DO_TIEMPO')}
                        className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                          selectedTable.currentCourse === '2DO_TIEMPO'
                            ? 'bg-amber-500 text-[#2B1B13] border-amber-600 font-extrabold shadow-sm'
                            : 'bg-[#FFF7EA]/60 border-[#DEC8AE] text-[#4A2E1F] hover:bg-[#FFF7EA]'
                        }`}
                      >
                        <span className="text-lg block mb-0.5">🍽</span>
                        <span className="text-xs font-bold block">2do Tiempo</span>
                        <span className="text-[10px] text-[#5C3825] block">Arroz / Pasta</span>
                      </button>

                      <button
                        onClick={() => handleCourseChange(selectedTable.tableId, '3ER_TIEMPO')}
                        className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                          selectedTable.currentCourse === '3ER_TIEMPO'
                            ? 'bg-amber-500 text-[#2B1B13] border-amber-600 font-extrabold shadow-sm'
                            : 'bg-[#FFF7EA]/60 border-[#DEC8AE] text-[#4A2E1F] hover:bg-[#FFF7EA]'
                        }`}
                      >
                        <span className="text-lg block mb-0.5">🥩</span>
                        <span className="text-xs font-bold block">3er Tiempo</span>
                        <span className="text-[10px] text-[#5C3825] block">Guisado / Fuerte</span>
                      </button>

                      <button
                        onClick={() => handleCourseChange(selectedTable.tableId, 'FINALIZADO')}
                        className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                          selectedTable.currentCourse === 'FINALIZADO'
                            ? 'bg-emerald-600 text-white border-emerald-700 font-extrabold shadow-sm'
                            : 'bg-[#FFF7EA]/60 border-[#DEC8AE] text-[#4A2E1F] hover:bg-[#FFF7EA]'
                        }`}
                      >
                        <span className="text-lg block mb-0.5">🍮</span>
                        <span className="text-xs font-bold block">Finalizado</span>
                        <span className="text-[10px] text-[#5C3825] block">Postre / Sobremesa</span>
                      </button>
                    </div>
                  </div>

                  {/* SECCIÓN 2: BOTONES RÁPIDOS DE LLAMADOS / ATENCIÓN (PENDIENTES) */}
                  <div className="bg-white p-4 rounded-2xl border border-[#DEC8AE] space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-[#5C3825]">
                        Botones Rápidos de Atención
                      </label>
                      <span className="text-[11px] text-[#A67632]">Tocar para pedir o resolver</span>
                    </div>

                    {(() => {
                      const hasQrTortillas = qrRequests.some(
                        (r) => r.tableNumber === selectedTable.tableNumber && r.requestType === 'TORTILLAS' && r.status === 'PENDIENTE'
                      );
                      const isTortillasActive = selectedTable.needsTortillas || hasQrTortillas;

                      const hasQrDrinks = qrRequests.some(
                        (r) => r.tableNumber === selectedTable.tableNumber && r.requestType === 'BEBIDAS' && r.status === 'PENDIENTE'
                      );
                      const isDrinksActive = selectedTable.needsDrinks || hasQrDrinks;

                      const hasQrSecond = qrRequests.some(
                        (r) => r.tableNumber === selectedTable.tableNumber && r.requestType === 'SEGUNDO_TIEMPO' && r.status === 'PENDIENTE'
                      );
                      const isSecondActive = selectedTable.needsSecondCourse || hasQrSecond;

                      const hasQrThird = qrRequests.some(
                        (r) => r.tableNumber === selectedTable.tableNumber && r.requestType === 'TERCER_TIEMPO' && r.status === 'PENDIENTE'
                      );
                      const isThirdActive = selectedTable.needsThirdCourse || hasQrThird;

                      const hasQrBill = qrRequests.some(
                        (r) => r.tableNumber === selectedTable.tableNumber && r.requestType === 'PEDIR_CUENTA' && r.status === 'PENDIENTE'
                      );
                      const isBillActive = selectedTable.needsBill || hasQrBill;

                      return (
                        <div className="space-y-2.5">
                          {/* Botón Tortillas */}
                          <div
                            className={`p-3 rounded-xl border-2 flex items-center justify-between transition-all ${
                              isTortillasActive
                                ? 'bg-amber-500/20 border-amber-500 text-amber-950 font-bold shadow-xs'
                                : 'bg-[#FFF7EA]/40 border-[#DEC8AE] text-[#4A2E1F]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="text-2xl">🌮</span>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-bold block">Tortillas</span>
                                  {hasQrTortillas && (
                                    <span className="text-[9px] font-black bg-rose-600 text-white px-1.5 py-0.5 rounded-full uppercase">
                                      QR
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-[#5C3825]">
                                  {isTortillasActive
                                    ? '🚨 ¡Mesa esperando tortillas calientes!'
                                    : 'No solicitadas'}
                                </span>
                              </div>
                            </div>

                            {isTortillasActive ? (
                              <button
                                onClick={() =>
                                  handleTogglePending(selectedTable.tableId, 'needsTortillas', true)
                                }
                                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Listo / Llevadas</span>
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  handleTogglePending(selectedTable.tableId, 'needsTortillas', false)
                                }
                                className="px-3 py-2 rounded-xl bg-[#3A2418] hover:bg-[#5C3825] text-[#FFF7EA] text-xs font-bold transition-all cursor-pointer"
                              >
                                Pedir Tortillas
                              </button>
                            )}
                          </div>

                          {/* Botón Bebidas */}
                          <div
                            className={`p-3 rounded-xl border-2 flex items-center justify-between transition-all ${
                              isDrinksActive
                                ? 'bg-amber-500/20 border-amber-500 text-amber-950 font-bold shadow-xs'
                                : 'bg-[#FFF7EA]/40 border-[#DEC8AE] text-[#4A2E1F]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="text-2xl">🥤</span>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-bold block">Bebidas</span>
                                  {hasQrDrinks && (
                                    <span className="text-[9px] font-black bg-rose-600 text-white px-1.5 py-0.5 rounded-full uppercase">
                                      QR
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-[#5C3825]">
                                  {isDrinksActive
                                    ? '🚨 ¡Bebidas o recarga solicitadas!'
                                    : 'No solicitadas'}
                                </span>
                              </div>
                            </div>

                            {isDrinksActive ? (
                              <button
                                onClick={() =>
                                  handleTogglePending(selectedTable.tableId, 'needsDrinks', true)
                                }
                                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Listo / Servidas</span>
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  handleTogglePending(selectedTable.tableId, 'needsDrinks', false)
                                }
                                className="px-3 py-2 rounded-xl bg-[#3A2418] hover:bg-[#5C3825] text-[#FFF7EA] text-xs font-bold transition-all cursor-pointer"
                              >
                                Pedir Bebidas
                              </button>
                            )}
                          </div>

                          {/* Botón Segundo Tiempo */}
                          <div
                            className={`p-3 rounded-xl border-2 flex items-center justify-between transition-all ${
                              isSecondActive
                                ? 'bg-amber-500/20 border-amber-500 text-amber-950 font-bold shadow-xs'
                                : 'bg-[#FFF7EA]/40 border-[#DEC8AE] text-[#4A2E1F]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="text-2xl">🍽</span>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-bold block">Segundo Tiempo</span>
                                  {hasQrSecond && (
                                    <span className="text-[9px] font-black bg-rose-600 text-white px-1.5 py-0.5 rounded-full uppercase">
                                      QR
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-[#5C3825]">
                                  {isSecondActive
                                    ? '🚨 ¡Clientes listos para sopa/arroz!'
                                    : 'No solicitado'}
                                </span>
                              </div>
                            </div>

                            {isSecondActive ? (
                              <button
                                onClick={() =>
                                  handleTogglePending(selectedTable.tableId, 'needsSecondCourse', true)
                                }
                                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Listo / Servido</span>
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  handleTogglePending(selectedTable.tableId, 'needsSecondCourse', false)
                                }
                                className="px-3 py-2 rounded-xl bg-[#3A2418] hover:bg-[#5C3825] text-[#FFF7EA] text-xs font-bold transition-all cursor-pointer"
                              >
                                Pedir 2do Tiempo
                              </button>
                            )}
                          </div>

                          {/* Botón Tercer Tiempo */}
                          <div
                            className={`p-3 rounded-xl border-2 flex items-center justify-between transition-all ${
                              isThirdActive
                                ? 'bg-amber-500/20 border-amber-500 text-amber-950 font-bold shadow-xs'
                                : 'bg-[#FFF7EA]/40 border-[#DEC8AE] text-[#4A2E1F]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="text-2xl">🍮</span>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-bold block">Tercer Tiempo / Postre</span>
                                  {hasQrThird && (
                                    <span className="text-[9px] font-black bg-rose-600 text-white px-1.5 py-0.5 rounded-full uppercase">
                                      QR
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-[#5C3825]">
                                  {isThirdActive
                                    ? '🚨 ¡Clientes listos para guisado o postre!'
                                    : 'No solicitado'}
                                </span>
                              </div>
                            </div>

                            {isThirdActive ? (
                              <button
                                onClick={() =>
                                  handleTogglePending(selectedTable.tableId, 'needsThirdCourse', true)
                                }
                                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Listo / Servido</span>
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  handleTogglePending(selectedTable.tableId, 'needsThirdCourse', false)
                                }
                                className="px-3 py-2 rounded-xl bg-[#3A2418] hover:bg-[#5C3825] text-[#FFF7EA] text-xs font-bold transition-all cursor-pointer"
                              >
                                Pedir 3er Tiempo
                              </button>
                            )}
                          </div>

                          {/* Botón Pedir Cuenta */}
                          <div
                            className={`p-3 rounded-xl border-2 flex items-center justify-between transition-all ${
                              isBillActive
                                ? 'bg-blue-50 border-blue-500 text-blue-950 font-bold shadow-xs'
                                : 'bg-[#FFF7EA]/40 border-[#DEC8AE] text-[#4A2E1F]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="text-2xl">💳</span>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-bold block">Pedir Cuenta</span>
                                  {hasQrBill && (
                                    <span className="text-[9px] font-black bg-rose-600 text-white px-1.5 py-0.5 rounded-full uppercase">
                                      QR
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-[#5C3825]">
                                  {isBillActive
                                    ? '🚨 ¡Comensales solicitaron la cuenta!'
                                    : 'No solicitada'}
                                </span>
                              </div>
                            </div>

                            {isBillActive ? (
                              <button
                                onClick={() =>
                                  handleTogglePending(selectedTable.tableId, 'needsBill', true)
                                }
                                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Listo / Entregada</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  handleTogglePending(selectedTable.tableId, 'needsBill', false);
                                  setTableStatus(selectedTable.tableId, 'CUENTA', {
                                    id: currentUser.id,
                                    name: currentUser.name,
                                  });
                                }}
                                className="px-3 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold transition-all cursor-pointer"
                              >
                                Pedir Cuenta
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* SECCIÓN 3: INFORMACIÓN OPERATIVA (COMENSALES, MESERO, NOTAS) */}
                  <div className="bg-white p-4 rounded-2xl border border-[#DEC8AE] space-y-3">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#5C3825] block">
                      Información de Servicio
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[11px] text-[#5C3825] font-semibold block mb-1">
                          Comensales reales:
                        </span>
                        <div className="flex items-center justify-between bg-[#FFF7EA] p-2 rounded-xl border border-[#DEC8AE]">
                          <div className="flex items-center gap-1.5 truncate">
                            <Users className="w-4 h-4 text-[#C9974D] shrink-0" />
                            <span className="font-bold text-xs sm:text-sm">
                              {selectedTable.guestCount || 1} {selectedTable.guestCount === 1 ? 'persona' : 'personas'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={async () => {
                                const newCount = Math.max(1, (selectedTable.guestCount || 1) - 1);
                                await updateTableGuestCount(selectedTable.tableId, newCount, {
                                  id: currentUser.id,
                                  name: currentUser.name,
                                });
                              }}
                              className="w-6 h-6 rounded-md bg-white border border-[#DEC8AE] font-bold text-xs flex items-center justify-center hover:bg-[#F4E3C8] cursor-pointer shadow-2xs"
                              title="Disminuir comensales"
                            >
                              -
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                const newCount = (selectedTable.guestCount || 1) + 1;
                                await updateTableGuestCount(selectedTable.tableId, newCount, {
                                  id: currentUser.id,
                                  name: currentUser.name,
                                });
                              }}
                              className="w-6 h-6 rounded-md bg-white border border-[#DEC8AE] font-bold text-xs flex items-center justify-center hover:bg-[#F4E3C8] cursor-pointer shadow-2xs"
                              title="Aumentar comensales"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] text-[#5C3825] font-semibold block mb-1">
                          Mesero responsable:
                        </span>
                        <div className="flex items-center gap-2 bg-[#FFF7EA] p-2 rounded-xl border border-[#DEC8AE]">
                          <User className="w-4 h-4 text-[#C9974D]" />
                          <span className="font-bold text-sm truncate">
                            {selectedTable.waiterName || 'Sin asignar'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] text-[#5C3825] font-semibold block mb-1">
                        Nota operativa o preferencia:
                      </span>
                      <input
                        type="text"
                        defaultValue={selectedTable.notes || ''}
                        onBlur={(e) =>
                          updateTableNotes(selectedTable.tableId, e.target.value, {
                            id: currentUser.id,
                            name: currentUser.name,
                          })
                        }
                        placeholder="Ej: Prefieren mesa junto a ventana, sin picante..."
                        className="w-full text-xs p-2.5 rounded-xl border border-[#DEC8AE] bg-[#FFF7EA] focus:outline-none focus:border-[#C9974D]"
                      />
                    </div>
                  </div>

                  <TableSessionAccountsPanel
                    table={selectedTable}
                    currentUser={currentUser}
                  />
                </>
              )}

              {/* ACCESO QR A LA MESA (Atención al Comensal) */}
              <div className="bg-white p-3.5 rounded-2xl border border-[#DEC8AE] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#FFF7EA] border border-[#C9974D]/30 flex items-center justify-center shrink-0 text-[#A67632]">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#2B1B13] block">
                      Código QR Mesa {selectedTable.tableNumber}
                    </span>
                    <span className="text-[11px] text-[#5C3825] truncate block font-mono">
                      {window.location.origin}/?table={selectedTable.tableNumber}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/?table=${selectedTable.tableNumber}`;
                      navigator.clipboard.writeText(url);
                      setCopiedTableQr(selectedTable.tableNumber);
                      setTimeout(() => setCopiedTableQr(null), 2500);
                    }}
                    className="flex-1 sm:flex-none px-3 py-1.5 rounded-xl border border-[#DEC8AE] bg-[#FFF7EA] hover:bg-[#F4E3C8] text-[#5C3825] text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    title="Copiar enlace directo"
                  >
                    {copiedTableQr === selectedTable.tableNumber ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">¡Copiado!</span>
                      </>
                    ) : (
                      <span>Copiar enlace QR</span>
                    )}
                  </button>

                  <a
                    href={`/?table=${selectedTable.tableNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl border border-[#DEC8AE] bg-[#FFF7EA] hover:bg-[#F4E3C8] text-[#5C3825] hover:text-[#2B1B13] transition-all flex items-center justify-center cursor-pointer"
                    title="Probar vista de comensal en nueva pestaña"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* AUDITORÍA Y ACCIONES DE FINALIZACIÓN */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between gap-2">
                  {selectedTable.status !== 'LIBRE' && (
                    <button
                      onClick={() => handleFreeTable(selectedTable.tableId)}
                      className="flex-1 py-3 px-4 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Liberar Mesa (Limpiar todo)</span>
                    </button>
                  )}

                  {(currentUser.role === 'DUEÑA' || currentUser.role === 'ADMINISTRADOR') &&
                    selectedTable.status === 'LIBRE' && (
                      <button
                        onClick={() => handleDeleteTable(selectedTable.tableId)}
                        className="py-3 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ml-auto"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Eliminar de distribución</span>
                      </button>
                    )}
                </div>

                <div className="text-[11px] text-gray-500 text-center">
                  Último cambio:{' '}
                  {new Date(selectedTable.updatedAt).toLocaleTimeString('es-MX', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  por{' '}
                  <strong className="text-[#3A2418]">
                    {selectedTable.updatedByName || 'Personal'}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL PARA OCUPAR MESA (Rápido y adaptado para celular) */}
      {/* ============================================================== */}
      {isOccupyModalOpen && selectedTable && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setIsOccupyModalOpen(false)}
        >
          <div
            className="bg-[#FFF7EA] w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[#C9974D]/40 p-5 sm:p-6 text-[#2B1B13]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#DEC8AE]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#3A2418] text-[#C9974D] flex items-center justify-center font-serif font-bold text-base">
                  {selectedTable.tableNumber}
                </div>
                <div>
                  <h3 className="text-lg font-serif font-bold">Ocupar Mesa {selectedTable.tableNumber}</h3>
                  <span className="text-[11px] text-[#5C3825]">
                    {selectedTable.location === 'terraza' ? 'Terraza' : 'Salón Principal'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsOccupyModalOpen(false)}
                className="p-2 rounded-xl text-gray-400 hover:text-[#2B1B13]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              {/* Selector de Comensales */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#5C3825] block mb-1.5">
                  Número de Comensales
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {[1, 2, 3, 4, 5, 6].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setOccupyGuests(num)}
                      className={`h-11 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                        occupyGuests === num
                          ? 'bg-[#3A2418] text-[#FFF7EA] shadow-sm'
                          : 'bg-white border border-[#DEC8AE] text-[#4A2E1F] hover:bg-[#FFF7EA]'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-[#5C3825]">¿Más de 6 personas?</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOccupyGuests(Math.max(1, occupyGuests - 1))}
                      className="w-8 h-8 rounded-lg bg-white border border-[#DEC8AE] font-bold text-sm cursor-pointer"
                    >
                      -
                    </button>
                    <span className="font-bold text-sm w-6 text-center">{occupyGuests}</span>
                    <button
                      type="button"
                      onClick={() => setOccupyGuests(occupyGuests + 1)}
                      className="w-8 h-8 rounded-lg bg-white border border-[#DEC8AE] font-bold text-sm cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Selector de Mesero Responsable */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#5C3825] block mb-1.5">
                  Mesero Responsable
                </label>
                <select
                  value={occupyWaiterId}
                  onChange={(e) => {
                    const found = staffList.find((s) => s.id === e.target.value);
                    setOccupyWaiterId(e.target.value);
                    setOccupyWaiterName(found ? found.name : currentUser.name);
                  }}
                  className="w-full p-2.5 rounded-xl border border-[#DEC8AE] bg-white text-xs font-bold text-[#2B1B13] focus:outline-none focus:border-[#C9974D]"
                >
                  <option value={currentUser.id}>{currentUser.name} (Tú)</option>
                  {staffList
                    .filter((s) => s.id !== currentUser.id)
                    .map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name} ({staff.role})
                      </option>
                    ))}
                </select>
              </div>

              {/* Nota opcional */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#5C3825] block mb-1.5">
                  Nota u Observación (Opcional)
                </label>
                <input
                  type="text"
                  value={occupyNotes}
                  onChange={(e) => setOccupyNotes(e.target.value)}
                  placeholder="Ej: Vienen con bebé, cumplen años, mesa junta..."
                  className="w-full p-2.5 rounded-xl border border-[#DEC8AE] bg-white text-xs text-[#2B1B13] focus:outline-none focus:border-[#C9974D]"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-[#DEC8AE]">
              <button
                type="button"
                onClick={() => setIsOccupyModalOpen(false)}
                className="flex-1 py-3 rounded-2xl bg-white border border-[#DEC8AE] text-xs font-bold text-[#5C3825] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmOccupy}
                className="flex-1 py-3 rounded-2xl bg-[#3A2418] hover:bg-[#5C3825] text-[#FFF7EA] text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                Abrir Mesa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL PARA AGREGAR NUEVA MESA A LA DISTRIBUCIÓN */}
      {/* ============================================================== */}
      {isAddTableModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsAddTableModalOpen(false)}
        >
          <form
            onSubmit={handleConfirmAddTable}
            className="bg-[#FFF7EA] w-full max-w-sm rounded-3xl shadow-2xl border border-[#C9974D]/40 p-6 text-[#2B1B13] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#DEC8AE]">
              <h3 className="text-lg font-serif font-bold">Agregar Nueva Mesa</h3>
              <button
                type="button"
                onClick={() => setIsAddTableModalOpen(false)}
                className="p-1.5 rounded-xl text-gray-400 hover:text-[#2B1B13]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {addTableError && (
              <div className="p-2.5 rounded-xl bg-rose-100 text-rose-800 text-xs font-bold">
                {addTableError}
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-[#5C3825] block mb-1">Número de Mesa:</label>
              <input
                type="number"
                min="1"
                required
                value={newTableNumber}
                onChange={(e) => setNewTableNumber(parseInt(e.target.value) || 1)}
                className="w-full p-2.5 rounded-xl border border-[#DEC8AE] bg-white text-sm font-bold text-[#2B1B13]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#5C3825] block mb-1">Capacidad orientativa:</label>
              <input
                type="number"
                min="1"
                max="20"
                required
                value={newTableCapacity}
                onChange={(e) => setNewTableCapacity(parseInt(e.target.value) || 4)}
                className="w-full p-2.5 rounded-xl border border-[#DEC8AE] bg-white text-sm font-bold text-[#2B1B13]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#5C3825] block mb-1">Zona / Ubicación:</label>
              <select
                value={newTableLocation}
                onChange={(e) =>
                  setNewTableLocation(e.target.value as 'salon' | 'terraza' | 'barra')
                }
                className="w-full p-2.5 rounded-xl border border-[#DEC8AE] bg-white text-xs font-bold text-[#2B1B13]"
              >
                <option value="salon">Salón Principal</option>
                <option value="terraza">Terraza / Exterior</option>
                <option value="barra">Barra / Rápido</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddTableModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-white border border-[#DEC8AE] text-xs font-bold text-[#5C3825] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-[#C9974D] hover:bg-[#A67632] text-[#2B1B13] text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                Guardar Mesa
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
