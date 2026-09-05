import React, { useState, useEffect } from 'react';
import { StaffUser } from '../../types';
import {
  getAuthSession,
  logoutStaff,
  getCurrentShift,
  getExpenses,
  getInventory,
  getShiftsHistory,
  getActivityLogs,
  getShiftDisplayTime,
  ADMIN_DATA_EVENT,
} from '../../lib/adminStorage';
import {
  subscribeToSyncState,
  getSyncState,
  SyncState,
  getDeviceIdentifier,
} from '../../lib/firestoreService';
import {
  signInWithGoogle,
  signOutGoogle,
  subscribeToAuth,
  getCurrentAuthUser,
  isUserAuthenticated,
  auth,
} from '../../lib/firebase';
import { User as FirebaseUser } from 'firebase/auth';
import { ShiftControlView } from './ShiftControlView';
import { ExpensesView } from './ExpensesView';
import { CxcView } from './CxcView';
import { InventoryView } from './InventoryView';
import { DailyMenuEditorView } from './DailyMenuEditorView';
import { SobreView } from './SobreView';
import { ShiftHistoryView } from './ShiftHistoryView';
import { ActivityLogsView } from './ActivityLogsView';
import { StaffManagementView } from './StaffManagementView';
import { RestaurantInfoEditorView } from './RestaurantInfoEditorView';
import { VipClientsAdminView } from './VipClientsAdminView';
import { LocalDataMigrationModal } from './LocalDataMigrationModal';
import { TablesView } from './TablesView';
import {
  LayoutDashboard,
  Clock,
  Receipt,
  Mail,
  Package,
  Utensils,
  Store,
  History,
  Shield,
  Users,
  Star,
  LogOut,
  ArrowLeft,
  DollarSign,
  TrendingUp,
  CreditCard,
  Smartphone,
  Wallet,
  AlertCircle,
  Tablet,
  CheckCircle2,
  Cloud,
  CloudOff,
  RefreshCw,
  CloudUpload,
  Lock,
  Grid3X3,
} from 'lucide-react';

interface AdminDashboardProps {
  currentUser: StaffUser;
  onLogout: () => void;
  onExitToStore: () => void;
}

type AdminTab =
  | 'resumen'
  | 'mesas'
  | 'turno'
  | 'gastos'
  | 'sobre'
  | 'cxc'
  | 'vip_clients'
  | 'inventario'
  | 'menu_dia'
  | 'info_restaurante'
  | 'historial'
  | 'bitacora'
  | 'usuarios';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  onLogout,
  onExitToStore,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('resumen');
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState<boolean>(false);
  const [syncState, setSyncState] = useState<SyncState>(getSyncState());
  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(getCurrentAuthUser());
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);

  const device = getDeviceIdentifier();

  useEffect(() => {
    const unsubSync = subscribeToSyncState((state) => {
      setSyncState(state);
    });

    const unsubAuth = subscribeToAuth((user) => {
      setGoogleUser(user);
      if (user) {
        setAuthErrorMessage(null);
      }
    });

    const handleDataChange = () => {
      setRefreshTrigger((prev) => prev + 1);
    };

    window.addEventListener(ADMIN_DATA_EVENT, handleDataChange);
    window.addEventListener('storage', handleDataChange);

    return () => {
      unsubSync();
      unsubAuth();
      window.removeEventListener(ADMIN_DATA_EVENT, handleDataChange);
      window.removeEventListener('storage', handleDataChange);
    };
  }, []);

  const handleRefreshStats = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleGoogleLogin = async () => {
    setIsAuthenticating(true);
    setAuthErrorMessage(null);
    try {
      await signInWithGoogle(false);
    } catch (err: any) {
      console.error('Error al iniciar sesión con Google:', err);
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        setAuthErrorMessage(err?.message || 'No se pudo completar el inicio de sesión con Google');
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await signOutGoogle();
    } catch (err: any) {
      console.error('Error al desconectar Google:', err);
    }
  };

  const currentShift = getCurrentShift();
  const shiftExpenses = currentShift ? getExpenses(currentShift.id) : [];
  const totalExpensesToday = shiftExpenses.reduce((sum, e) => sum + e.amount, 0);
  const inventoryList = getInventory();
  const totalConsumptionItems = inventoryList.reduce((sum, i) => sum + i.consumption, 0);

  // Tabs de navegación según rol
  const tabs = [
    { id: 'resumen', label: 'Resumen', icon: LayoutDashboard, roleMin: 'EMPLEADO' },
    { id: 'mesas', label: 'Mesas', icon: Grid3X3, roleMin: 'EMPLEADO' },
    { id: 'turno', label: 'Control de Turno', icon: Clock, roleMin: 'EMPLEADO' },
    { id: 'gastos', label: 'Gastos & Comprobantes', icon: Receipt, roleMin: 'EMPLEADO' },
    { id: 'sobre', label: 'Sobre / Resguardo', icon: Mail, roleMin: 'EMPLEADO' },
    { id: 'cxc', label: 'CXC', icon: CreditCard, roleMin: 'EMPLEADO' },
    { id: 'vip_clients', label: 'Clientes VIP', icon: Star, roleMin: 'EMPLEADO' },
    { id: 'inventario', label: 'Inventario de Papel', icon: Package, roleMin: 'EMPLEADO' },
    { id: 'menu_dia', label: 'Menú del Día', icon: Utensils, roleMin: 'ENCARGADO' },
    { id: 'info_restaurante', label: 'Info Restaurante', icon: Store, roleMin: 'ENCARGADO' },
    { id: 'historial', label: 'Historial de Cortes', icon: History, roleMin: 'ENCARGADO' },
    { id: 'bitacora', label: 'Bitácora & Auditoría', icon: Shield, roleMin: 'ENCARGADO' },
    { id: 'usuarios', label: 'Colaboradores & PINs', icon: Users, roleMin: 'ADMINISTRADOR' },
  ].filter((t) => {
    if (t.roleMin === 'ADMINISTRADOR') return currentUser.role === 'DUEÑA' || currentUser.role === 'ADMINISTRADOR';
    if (t.roleMin === 'ENCARGADO') return currentUser.role === 'DUEÑA' || currentUser.role === 'ADMINISTRADOR' || currentUser.role === 'ENCARGADO';
    return true;
  });

  const canMigrate = currentUser.role === 'DUEÑA' || currentUser.role === 'ADMINISTRADOR';

  return (
    <div className="min-h-screen bg-[#FFF7EA] text-[#2B1B13] flex flex-col font-sans selection:bg-[#C9974D] selection:text-[#2B1B13]">
      {/* Banner de Alerta en caso de Error de Firestore */}
      {syncState.status === 'error' && syncState.errorMessage && (
        <div className="bg-rose-950 border-b border-rose-800 text-rose-200 px-4 py-2 text-xs flex items-center justify-between gap-3 sticky top-0 z-50">
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              <strong>Error al guardar el cambio o sincronizar:</strong> {syncState.errorMessage}
            </span>
          </div>
        </div>
      )}

      {/* Barra Superior Administrativa */}
      <header className="sticky top-0 z-40 bg-[#3A2418] text-[#FFF7EA] border-b border-[#4E3222] shadow-md px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onExitToStore}
            className="p-2 rounded-xl bg-[#4A2E1F] hover:bg-[#5C3825] text-[#FFF7EA] border border-[#C9974D]/30 transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer"
            title="Volver a la vista pública del restaurante"
          >
            <ArrowLeft className="w-4 h-4 text-[#C9974D]" />
            <span className="hidden sm:inline">Ver Menú Público</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="font-serif font-bold text-lg sm:text-xl tracking-tight text-[#FFF7EA]">
              Restaurante Calientito <span className="text-[#C9974D] font-normal text-sm sm:text-base font-sans">| Administración</span>
            </span>

            {/* Pill de Estado de Turno */}
            {currentShift ? (
              <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-[#4A2E1F] text-[#F4E3C8] border border-[#C9974D]/40">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Turno {currentShift.shiftType} Abierto ({getShiftDisplayTime(currentShift)})
              </span>
            ) : (
              <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-[#2B1B13] text-amber-300 border border-amber-500/30">
                ⚠️ Sin Turno Abierto
              </span>
            )}
          </div>
        </div>

        {/* Indicadores de Sincronización, Perfil & Acciones */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Indicador de Estados de Autenticación y Sincronización */}
          <div className="flex items-center">
            {!syncState.isOnline ? (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-300 text-[11px] font-bold"
                title="Sin conexión de red a internet."
              >
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                <span className="hidden sm:inline">🔴 Sin conexión</span>
              </span>
            ) : isAuthenticating || syncState.status === 'authenticating' ? (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-950/80 border border-amber-500/50 text-amber-300 text-[11px] font-bold"
                title="Autenticando con Google en Firebase..."
              >
                <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                <span className="hidden sm:inline">🟡 Autenticando…</span>
              </span>
            ) : !googleUser || !isUserAuthenticated() ? (
              <button
                onClick={handleGoogleLogin}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#4A2E1F] hover:bg-[#5C3825] border border-amber-500/60 text-amber-200 text-[11px] font-bold transition-all cursor-pointer shadow-xs"
                title="No autenticado en Firebase. Haz clic para iniciar sesión con Google y sincronizar con Firestore."
              >
                <Lock className="w-3 h-3 text-amber-400" />
                <span>🔒 No autenticado</span>
                <span className="hidden md:inline bg-amber-500/20 text-amber-300 text-[9px] px-1.5 py-0.5 rounded border border-amber-500/30">
                  Iniciar sesión Google
                </span>
              </button>
            ) : syncState.status === 'synced' ? (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 text-[11px] font-bold"
                title={`🟢 Sincronizado en tiempo real con Firestore (${syncState.activeListenersCount}/8 módulos). Conectado como: ${googleUser.email || googleUser.displayName || 'Google User'}`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="hidden sm:inline">🟢 Sincronizado</span>
              </span>
            ) : syncState.status === 'syncing' ? (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-300 text-[11px] font-bold"
                title={`🟡 Sincronizando cambios en vivo con Firestore (${syncState.activeListenersCount}/8 módulos)...`}
              >
                <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                <span className="hidden sm:inline">🟡 Sincronizando… ({syncState.activeListenersCount}/8)</span>
              </span>
            ) : syncState.status === 'error' ? (
              (isUserAuthenticated() || auth.currentUser !== null) ? (
                <button
                  onClick={() => {
                    // Si el usuario sigue autenticado, notificamos reintento de sincronización
                    setRefreshTrigger((p) => p + 1);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-950/80 border border-rose-500/60 text-rose-300 text-[11px] font-bold cursor-pointer"
                  title={`Error: ${syncState.errorMessage || 'Error al guardar el cambio'}. Haz clic para reintentar.`}
                >
                  <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
                  <span className="hidden sm:inline">⚠️ Error al guardar el cambio. Reintentar</span>
                  <span className="text-[9px] bg-rose-900/60 text-rose-200 px-1 py-0.5 rounded ml-0.5 hidden md:inline">Reintentar</span>
                </button>
              ) : (
                <button
                  onClick={handleGoogleLogin}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-950/80 border border-rose-500/60 text-rose-300 text-[11px] font-bold cursor-pointer"
                  title="Sesión no iniciada o caducada. Haz clic para reconectar Google."
                >
                  <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
                  <span className="hidden sm:inline">Reconectar Google</span>
                </button>
              )
            ) : (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-950/80 border border-amber-500/40 text-amber-300 text-[11px] font-bold"
                title="🔒 No autenticado"
              >
                <span>🔒 No autenticado</span>
              </span>
            )}
          </div>

          {/* Información de Cuenta Google Conectada */}
          {googleUser && (
            <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#4A2E1F]/80 border border-[#C9974D]/30 text-[11px] text-[#F4E3C8]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span className="truncate max-w-[130px]" title={googleUser.email || ''}>{googleUser.email}</span>
              <button
                onClick={handleGoogleLogout}
                className="text-rose-300 hover:text-rose-100 text-[10px] underline ml-1 cursor-pointer"
                title="Cerrar sesión de Google"
              >
                Desconectar
              </button>
            </div>
          )}

          {/* Botón de Migrar Datos Locales (Exclusivo DUEÑA / ADMINISTRADOR) */}
          {canMigrate && (
            <button
              onClick={() => setIsMigrationModalOpen(true)}
              className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-[#4A2E1F] hover:bg-[#5C3825] text-[#C9974D] border border-[#C9974D]/40 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              title="Herramienta de migración de datos locales a Firestore"
            >
              <CloudUpload className="w-4 h-4" />
              <span className="hidden lg:inline">Migrar datos locales</span>
            </button>
          )}

          <div className="text-right hidden sm:block pl-1">
            <span className="font-bold text-xs text-[#FFF7EA] block">{currentUser.name}</span>
            <span className="text-[10px] text-[#C9974D] uppercase tracking-wider font-semibold">
              {currentUser.role}
            </span>
          </div>

          <div className="w-9 h-9 rounded-2xl bg-[#4A2E1F] border border-[#C9974D]/50 flex items-center justify-center font-serif font-bold text-sm text-[#C9974D]">
            {currentUser.name.charAt(0)}
          </div>

          <button
            onClick={onLogout}
            className="p-2 rounded-xl text-[#F4E3C8] hover:text-white hover:bg-[#4A2E1F] transition-all cursor-pointer"
            title="Cerrar sesión administrativa"
            aria-label="Cerrar sesión"
          >
            <LogOut className="w-4 h-4 text-rose-400" />
          </button>
        </div>
      </header>

      {/* Navegación por Pestañas (Horizontal scroll para iPad y Celulares) */}
      <nav className="bg-white border-b border-[#F4E3C8] px-4 sm:px-8 py-2.5 overflow-x-auto shadow-2xs sticky top-[57px] z-30">
        <div className="flex items-center gap-1.5 max-w-7xl mx-auto min-w-max">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as AdminTab)}
                className={`px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#3A2418] text-[#FFF7EA] shadow-sm scale-[1.01]'
                    : 'text-[#6B4028] hover:text-[#2B1B13] hover:bg-[#FFF7EA]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#C9974D]' : 'text-[#A86B3D]'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Contenido Principal */}
      <main className="flex-1 p-4 sm:p-8 max-w-7xl mx-auto w-full">
        {/* Banner de Autenticación con Google cuando no hay sesión activa de Firebase */}
        {!googleUser && (
          <div className="bg-gradient-to-r from-[#3A2418] to-[#4A2E1F] border-2 border-[#C9974D]/70 rounded-3xl p-5 sm:p-6 text-[#FFF7EA] shadow-xl mb-6 flex flex-col md:flex-row md:items-center justify-between gap-5 animate-in fade-in duration-300">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#2B1B13] border border-[#C9974D]/60 flex items-center justify-center text-[#C9974D] shrink-0 shadow-inner">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wider font-bold text-[#C9974D] font-serif">
                    Autenticación en la Nube
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                    🔒 No autenticado
                  </span>
                </div>
                <h2 className="font-serif font-bold text-lg sm:text-xl text-white">
                  Iniciar sesión con Google para operar Firestore
                </h2>
                <p className="text-xs sm:text-sm text-[#F4E3C8] font-light max-w-2xl">
                  Has ingresado con el PIN de <strong>{currentUser.name}</strong> ({currentUser.role}). Para activar la sincronización en tiempo real y guardar aperturas de turno, gastos y cortes en la base de datos central de Firestore, inicia sesión con Google.
                </p>
                {authErrorMessage && (
                  <p className="text-xs text-rose-300 bg-rose-950/80 border border-rose-700/60 rounded-xl px-3 py-2 mt-2 font-medium">
                    ⚠️ {authErrorMessage}
                  </p>
                )}
              </div>
            </div>

            <div className="shrink-0">
              <button
                onClick={handleGoogleLogin}
                disabled={isAuthenticating}
                className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-white hover:bg-[#FAF5ED] text-[#2B1B13] font-bold text-xs sm:text-sm shadow-lg transition-all active:scale-95 flex items-center justify-center gap-3 border border-[#F4E3C8] cursor-pointer disabled:opacity-60"
              >
                {isAuthenticating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-[#C9974D]" />
                    <span>🟡 Autenticando…</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Iniciar sesión con Google</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'resumen' && (
          <div className="space-y-6">
            {/* Banner de Bienvenida y Estado Rápido */}
            <div className="bg-[#3A2418] text-[#FFF7EA] rounded-3xl p-6 sm:p-8 border border-[#4E3222] shadow-md relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1 relative z-10">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#C9974D] font-bold uppercase tracking-wider font-serif">
                    Panel de Operaciones en Caja
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-[#4A2E1F] text-[#F4E3C8] text-[10px] font-semibold border border-[#C9974D]/20">
                    Dispositivo: {device.name}
                  </span>
                </div>
                <h1 className="font-serif font-bold text-2xl sm:text-3xl text-white">
                  Hola, {currentUser.name}
                </h1>
                <p className="text-xs sm:text-sm text-[#F4E3C8] font-light max-w-lg">
                  {currentShift
                    ? `Turno ${currentShift.shiftType} activo a cargo de ${currentShift.responsibleUser}.${
                        googleUser && syncState.status === 'synced'
                          ? ' Sincronizado en vivo con la nube de Firestore.'
                          : ' Inicia sesión con Google para sincronizar este turno con Firestore.'
                      }`
                    : 'Apertura un nuevo turno para iniciar el arqueo y control de pedidos en caja.'}
                </p>
              </div>

              <div className="flex items-center gap-3 relative z-10 shrink-0">
                {currentShift ? (
                  <button
                    onClick={() => setActiveTab('turno')}
                    className="px-5 py-3 rounded-2xl bg-[#C9974D] hover:bg-[#d6aa5f] text-[#3A2418] font-bold text-xs sm:text-sm shadow-md active:scale-95 transition-all cursor-pointer flex items-center gap-2"
                  >
                    <Clock className="w-4 h-4" />
                    <span>Gestionar Turno Activo</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setActiveTab('turno')}
                    className="px-5 py-3 rounded-2xl bg-gradient-to-r from-[#C77B4A] to-[#A86B3D] hover:from-[#d68a57] hover:to-[#ba7845] text-white font-bold text-xs sm:text-sm shadow-md active:scale-95 transition-all cursor-pointer flex items-center gap-2"
                  >
                    <Clock className="w-4 h-4" />
                    <span>Aperturar Turno Ahora</span>
                  </button>
                )}
              </div>
            </div>

            {/* Tarjetas Métricas Clave */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Ventas Totales Turno */}
              <div className="bg-white p-5 rounded-3xl border border-[#F4E3C8] shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#A86B3D] uppercase tracking-wider">
                    Ventas del Turno
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-[#FFF7EA] text-[#3A2418] border border-[#F4E3C8] flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-[#A86B3D]" />
                  </div>
                </div>
                <span className="font-serif font-black text-2xl text-[#2B1B13] block">
                  ${(currentShift?.totalSales || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-[#6B4028] block">
                  Efectivo: ${(currentShift?.salesCash || 0).toFixed(2)} | Tarjeta: ${(currentShift?.salesCard || 0).toFixed(2)}
                </span>
              </div>

              {/* Gastos del Turno */}
              <div className="bg-white p-5 rounded-3xl border border-[#F4E3C8] shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#A86B3D] uppercase tracking-wider">
                    Gastos Turno Actual
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center">
                    <Receipt className="w-4 h-4" />
                  </div>
                </div>
                <span className="font-serif font-black text-2xl text-rose-700 block">
                  ${totalExpensesToday.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-[#6B4028] block">
                  {shiftExpenses.length} comprobantes registrados
                </span>
              </div>

              {/* Efectivo Esperado en Caja */}
              <div className="bg-white p-5 rounded-3xl border border-[#F4E3C8] shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#A86B3D] uppercase tracking-wider">
                    Efectivo en Caja
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center">
                    <Wallet className="w-4 h-4" />
                  </div>
                </div>
                <span className="font-serif font-black text-2xl text-[#2B1B13] block">
                  ${(currentShift?.expectedCash || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-[#6B4028] block">
                  Fondo Inicial: ${(currentShift?.initialCashFund || 0).toFixed(2)}
                </span>
              </div>

              {/* Artículos Consumidos */}
              <div className="bg-white p-5 rounded-3xl border border-[#F4E3C8] shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#A86B3D] uppercase tracking-wider">
                    Consumo Inventario
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-[#FFF7EA] text-[#3A2418] border border-[#F4E3C8] flex items-center justify-center">
                    <Package className="w-4 h-4 text-[#A86B3D]" />
                  </div>
                </div>
                <span className="font-serif font-black text-2xl text-[#2B1B13] block">
                  {totalConsumptionItems} <span className="text-sm font-normal text-[#6B4028]">piezas</span>
                </span>
                <span className="text-[11px] text-[#6B4028] block">
                  {inventoryList.length} artículos en catálogo
                </span>
              </div>
            </div>

            {/* Accesos Rápidos de Trabajo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                onClick={() => setActiveTab('gastos')}
                className="bg-white p-5 rounded-3xl border border-[#F4E3C8] hover:border-[#C9974D] text-left transition-all hover:shadow-md cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-2xl bg-[#FFF7EA] text-[#3A2418] group-hover:bg-[#3A2418] group-hover:text-[#C9974D] border border-[#F4E3C8] flex items-center justify-center mb-3 transition-colors">
                  <Receipt className="w-5 h-5" />
                </div>
                <h3 className="font-serif font-bold text-base text-[#2B1B13]">
                  Registrar Salida de Dinero
                </h3>
                <p className="text-xs text-[#6B4028] mt-1">
                  Registra compras de cafetería, cocina, garrafones o proveedores.
                </p>
              </button>

              <button
                onClick={() => setActiveTab('sobre')}
                className="bg-white p-5 rounded-3xl border border-[#F4E3C8] hover:border-[#C9974D] text-left transition-all hover:shadow-md cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-2xl bg-[#FFF7EA] text-[#3A2418] group-hover:bg-[#3A2418] group-hover:text-[#C9974D] border border-[#F4E3C8] flex items-center justify-center mb-3 transition-colors">
                  <Mail className="w-5 h-5" />
                </div>
                <h3 className="font-serif font-bold text-base text-[#2B1B13]">
                  Sobre / Resguardo
                </h3>
                <p className="text-xs text-[#6B4028] mt-1">
                  Control del dinero físico en resguardo de la dueña, conteos y gastos.
                </p>
              </button>

              <button
                onClick={() => setActiveTab('inventario')}
                className="bg-white p-5 rounded-3xl border border-[#F4E3C8] hover:border-[#C9974D] text-left transition-all hover:shadow-md cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-2xl bg-[#FFF7EA] text-[#3A2418] group-hover:bg-[#3A2418] group-hover:text-[#C9974D] border border-[#F4E3C8] flex items-center justify-center mb-3 transition-colors">
                  <Package className="w-5 h-5" />
                </div>
                <h3 className="font-serif font-bold text-base text-[#2B1B13]">
                  Capturar Conteo de Insumos
                </h3>
                <p className="text-xs text-[#6B4028] mt-1">
                  Actualiza vasos (8oz, 12oz, 16oz), panadería, refrescos y cigarros.
                </p>
              </button>

              <button
                onClick={() => setActiveTab('mesas')}
                className="bg-white p-5 rounded-3xl border border-[#F4E3C8] hover:border-[#C9974D] text-left transition-all hover:shadow-md cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-2xl bg-[#FFF7EA] text-[#3A2418] group-hover:bg-[#3A2418] group-hover:text-[#C9974D] border border-[#F4E3C8] flex items-center justify-center mb-3 transition-colors">
                  <Grid3X3 className="w-5 h-5" />
                </div>
                <h3 className="font-serif font-bold text-base text-[#2B1B13]">
                  Mesas del Restaurante
                </h3>
                <p className="text-xs text-[#6B4028] mt-1">
                  Control visual en tiempo real de mesas, tiempos de servicio y llamados rápidos.
                </p>
              </button>

              <button
                onClick={() => setActiveTab('menu_dia')}
                className="bg-white p-5 rounded-3xl border border-[#F4E3C8] hover:border-[#C9974D] text-left transition-all hover:shadow-md cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-2xl bg-[#FFF7EA] text-[#3A2418] group-hover:bg-[#3A2418] group-hover:text-[#C9974D] border border-[#F4E3C8] flex items-center justify-center mb-3 transition-colors">
                  <Utensils className="w-5 h-5" />
                </div>
                <h3 className="font-serif font-bold text-base text-[#2B1B13]">
                  Actualizar Menú del Día
                </h3>
                <p className="text-xs text-[#6B4028] mt-1">
                  Publica el guisado, sopa, agua fresca y postre para los comensales.
                </p>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'mesas' && (
          <TablesView currentUser={currentUser} />
        )}

        {activeTab === 'turno' && (
          <ShiftControlView currentUser={currentUser} onRefreshStats={handleRefreshStats} />
        )}

        {activeTab === 'gastos' && (
          <ExpensesView currentUser={currentUser} onRefreshStats={handleRefreshStats} />
        )}

        {activeTab === 'sobre' && (
          <SobreView currentUser={currentUser} onRefreshStats={handleRefreshStats} />
        )}

        {activeTab === 'cxc' && (
          <CxcView currentUser={currentUser} onRefreshStats={handleRefreshStats} />
        )}

        {activeTab === 'vip_clients' && (
          <VipClientsAdminView currentUser={currentUser} onRefreshStats={handleRefreshStats} />
        )}

        {activeTab === 'inventario' && (
          <InventoryView currentUser={currentUser} onRefreshStats={handleRefreshStats} />
        )}

        {activeTab === 'menu_dia' && (
          <DailyMenuEditorView currentUser={currentUser} onRefreshStats={handleRefreshStats} />
        )}

        {activeTab === 'info_restaurante' && (
          <RestaurantInfoEditorView currentUser={currentUser} onRefreshStats={handleRefreshStats} />
        )}

        {activeTab === 'historial' && <ShiftHistoryView />}

        {activeTab === 'bitacora' && <ActivityLogsView currentUser={currentUser} />}

        {activeTab === 'usuarios' && (
          <StaffManagementView currentUser={currentUser} onRefreshStats={handleRefreshStats} />
        )}
      </main>

      {/* Modal de Migración de Datos Locales */}
      <LocalDataMigrationModal
        isOpen={isMigrationModalOpen}
        onClose={() => setIsMigrationModalOpen(false)}
        currentUser={currentUser}
        onMigrationComplete={handleRefreshStats}
      />
    </div>
  );
};
