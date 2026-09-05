import React, { useState, useEffect } from 'react';
import { StaffUser, VipProfile } from '../../types';
import { adminFetchVipProfiles, adminUpdateVipProfile } from '../../lib/vipStorage';
import { getRestaurantInfo, addActivityLog } from '../../lib/adminStorage';
import { isUserAuthenticated, auth } from '../../lib/firebase';
import {
  Star,
  Search,
  Plus,
  Minus,
  Gift,
  Award,
  Calendar,
  Clock,
  Phone,
  User,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Edit2,
  Check,
  X,
  ShieldCheck,
} from 'lucide-react';

interface VipClientsAdminViewProps {
  currentUser: StaffUser;
  onRefreshStats?: () => void;
}

export const VipClientsAdminView: React.FC<VipClientsAdminViewProps> = ({
  currentUser,
  onRefreshStats,
}) => {
  const [profiles, setProfiles] = useState<VipProfile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Modal para editar pedidos totales
  const [editingTotalOrdersProfile, setEditingTotalOrdersProfile] = useState<VipProfile | null>(null);
  const [customTotalOrders, setCustomTotalOrders] = useState<number>(0);

  const restaurantInfo = getRestaurantInfo();
  const stampsRequired = Math.max(1, restaurantInfo.vipStampsRequired || 5);
  const rewardDescription = restaurantInfo.vipRewardDescription || 'Café americano o postre gratis';

  const fetchProfiles = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await adminFetchVipProfiles();
      // Ordenar por última actualización o creación más reciente
      data.sort((a, b) => {
        const dateA = a.updatedAt || a.createdAt || '';
        const dateB = b.updatedAt || b.createdAt || '';
        return dateB.localeCompare(dateA);
      });
      setProfiles(data);
    } catch (err: any) {
      console.error('Error al cargar perfiles VIP:', err);
      setErrorMessage(
        err?.message ||
          'No se pudieron cargar los clientes VIP. Asegúrate de tener sesión iniciada con Google en el panel administrativo.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const showNotification = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  // Acción: Agregar 1 Sello
  const handleAddStamp = async (profile: VipProfile) => {
    if (!profile.id) return;
    setUpdatingId(profile.id);
    try {
      let newStamps = profile.stamps + 1;
      let newReward = profile.rewardAvailable;
      if (newStamps >= stampsRequired) {
        newStamps = 0;
        newReward = true;
      }

      await adminUpdateVipProfile(profile.id, {
        stamps: newStamps,
        totalOrders: profile.totalOrders + 1,
        rewardAvailable: newReward,
      });

      addActivityLog({
        userName: currentUser.name,
        userId: currentUser.id,
        userRole: currentUser.role,
        action: 'VIP_ADD_STAMP',
        category: 'turno',
        details: `Se sumó 1 sello a ${profile.customerName} (${profile.memberId}). Sellos: ${newStamps}/${stampsRequired}. Recompensa lista: ${newReward ? 'SÍ' : 'NO'}.`,
        previousValue: `${profile.stamps}`,
        newValue: `${newStamps}`,
      });

      showNotification(`✓ Sello agregado a ${profile.customerName} (${newStamps}/${stampsRequired})`);
      await fetchProfiles();
      if (onRefreshStats) onRefreshStats();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al agregar sello.');
    } finally {
      setUpdatingId(null);
    }
  };

  // Acción: Quitar 1 Sello
  const handleRemoveStamp = async (profile: VipProfile) => {
    if (!profile.id || profile.stamps <= 0) return;
    setUpdatingId(profile.id);
    try {
      const newStamps = Math.max(0, profile.stamps - 1);
      await adminUpdateVipProfile(profile.id, {
        stamps: newStamps,
      });

      addActivityLog({
        userName: currentUser.name,
        userId: currentUser.id,
        userRole: currentUser.role,
        action: 'VIP_REMOVE_STAMP',
        category: 'turno',
        details: `Se redujo 1 sello a ${profile.customerName} (${profile.memberId}). Sellos ahora: ${newStamps}/${stampsRequired}.`,
        previousValue: `${profile.stamps}`,
        newValue: `${newStamps}`,
      });

      showNotification(`✓ Sello descontado a ${profile.customerName}`);
      await fetchProfiles();
      if (onRefreshStats) onRefreshStats();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al quitar sello.');
    } finally {
      setUpdatingId(null);
    }
  };

  // Acción: Otorgar o Canjear Recompensa
  const handleToggleReward = async (profile: VipProfile, newStatus: boolean) => {
    if (!profile.id) return;
    setUpdatingId(profile.id);
    try {
      await adminUpdateVipProfile(profile.id, {
        rewardAvailable: newStatus,
      });

      addActivityLog({
        userName: currentUser.name,
        userId: currentUser.id,
        userRole: currentUser.role,
        action: newStatus ? 'VIP_GRANT_REWARD' : 'VIP_REDEEM_REWARD',
        category: 'turno',
        details: newStatus
          ? `Se marcó recompensa disponible para ${profile.customerName} (${profile.memberId}).`
          : `Se canjeó la recompensa de ${profile.customerName} (${profile.memberId}).`,
      });

      showNotification(
        newStatus
          ? `🎉 Recompensa marcada como DISPONIBLE para ${profile.customerName}`
          : `✓ Recompensa CANJEADA para ${profile.customerName}`
      );
      await fetchProfiles();
      if (onRefreshStats) onRefreshStats();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al actualizar recompensa.');
    } finally {
      setUpdatingId(null);
    }
  };

  // Acción: Aprobar sellos locales migrados pendientes
  const handleApprovePendingStamps = async (profile: VipProfile) => {
    if (!profile.id || !profile.pendingStampsToValidate) return;
    setUpdatingId(profile.id);
    try {
      const pending = profile.pendingStampsToValidate;
      let newStamps = profile.stamps + pending;
      let newReward = profile.rewardAvailable;

      if (newStamps >= stampsRequired) {
        newReward = true;
        newStamps = newStamps % stampsRequired;
      }

      await adminUpdateVipProfile(profile.id, {
        stamps: newStamps,
        pendingStampsToValidate: 0,
        rewardAvailable: newReward,
      });

      addActivityLog({
        userName: currentUser.name,
        userId: currentUser.id,
        userRole: currentUser.role,
        action: 'VIP_APPROVE_PENDING_STAMPS',
        category: 'turno',
        details: `Se aprobaron +${pending} sellos pendientes para ${profile.customerName}. Nuevos sellos: ${newStamps}/${stampsRequired}.`,
      });

      showNotification(`✓ Se aprobaron ${pending} sellos para ${profile.customerName}`);
      await fetchProfiles();
      if (onRefreshStats) onRefreshStats();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al aprobar sellos pendientes.');
    } finally {
      setUpdatingId(null);
    }
  };

  // Acción: Guardar ajuste manual de totalOrders
  const handleSaveTotalOrders = async () => {
    if (!editingTotalOrdersProfile || !editingTotalOrdersProfile.id) return;
    setUpdatingId(editingTotalOrdersProfile.id);
    try {
      const prev = editingTotalOrdersProfile.totalOrders;
      await adminUpdateVipProfile(editingTotalOrdersProfile.id, {
        totalOrders: customTotalOrders,
      });

      addActivityLog({
        userName: currentUser.name,
        userId: currentUser.id,
        userRole: currentUser.role,
        action: 'VIP_EDIT_ORDERS',
        category: 'turno',
        details: `Ajuste manual de total de compras para ${editingTotalOrdersProfile.customerName}: de ${prev} a ${customTotalOrders}.`,
      });

      showNotification(`✓ Total de compras actualizado a ${customTotalOrders}`);
      setEditingTotalOrdersProfile(null);
      await fetchProfiles();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al ajustar pedidos.');
    } finally {
      setUpdatingId(null);
    }
  };

  // Filtrado de búsqueda
  const filteredProfiles = profiles.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const phoneClean = p.phone.replace(/\D/g, '');
    return (
      p.customerName.toLowerCase().includes(q) ||
      phoneClean.includes(q) ||
      p.phone.includes(q) ||
      p.memberId.toLowerCase().includes(q)
    );
  });

  const totalRewardsReady = profiles.filter((p) => p.rewardAvailable).length;

  const isAuth = isUserAuthenticated() || auth.currentUser !== null;

  return (
    <div className="space-y-6">
      {/* Encabezado del Módulo */}
      <div className="bg-[#3A2418] text-[#FFF7EA] rounded-3xl p-6 sm:p-8 border border-[#4E3222] shadow-md relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#C9974D] font-bold uppercase tracking-wider font-serif flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 text-[#C9974D]" /> Gestión de Fidelidad
            </span>
            <span className="px-2 py-0.5 rounded-md bg-[#4A2E1F] text-[#F4E3C8] text-[10px] font-semibold border border-[#C9974D]/20">
              Calientito VIP Cloud
            </span>
          </div>
          <h1 className="font-serif font-bold text-2xl sm:text-3xl text-white">
            Clientes VIP & Sellos
          </h1>
          <p className="text-xs sm:text-sm text-[#F4E3C8] font-light max-w-xl">
            Consulta, busca y gestiona los sellos y recompensas de los socios VIP. Cada modificación se sincroniza inmediatamente con Firestore.
          </p>
        </div>

        <div className="flex items-center gap-3 relative z-10 shrink-0">
          <button
            onClick={fetchProfiles}
            disabled={isLoading}
            className="px-4 py-2.5 rounded-2xl bg-[#4A2E1F] hover:bg-[#5C3825] text-[#C9974D] font-bold text-xs border border-[#C9974D]/40 shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Actualizar Lista</span>
          </button>
        </div>
      </div>

      {/* Alertas */}
      {!isAuth && (
        <div className="bg-amber-950/80 border border-amber-500/50 rounded-2xl p-4 text-amber-200 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
          <span>
            <strong>Atención:</strong> Inicia sesión con Google en la barra superior para poder consultar y modificar las tarjetas VIP en Firestore.
          </span>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-950 border border-rose-800 rounded-2xl p-4 text-rose-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-300 hover:text-white text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-950 border border-emerald-800 rounded-2xl p-4 text-emerald-200 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Métricas rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-3xl border border-[#F4E3C8] shadow-xs">
          <span className="text-[11px] font-bold text-[#A86B3D] uppercase tracking-wider block">
            Total Socios VIP Registrados
          </span>
          <span className="font-serif font-black text-2xl text-[#2B1B13] mt-1 block">
            {profiles.length}
          </span>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-[#F4E3C8] shadow-xs">
          <span className="text-[11px] font-bold text-[#A86B3D] uppercase tracking-wider block">
            Recompensas Listas para Canje
          </span>
          <span className="font-serif font-black text-2xl text-emerald-700 mt-1 block flex items-center gap-2">
            <Gift className="w-5 h-5 text-emerald-600" />
            {totalRewardsReady}
          </span>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-[#F4E3C8] shadow-xs">
          <span className="text-[11px] font-bold text-[#A86B3D] uppercase tracking-wider block">
            Regla de Sellos Activa
          </span>
          <span className="font-serif font-bold text-sm text-[#3A2418] mt-1 block">
            {stampsRequired} sellos = {rewardDescription}
          </span>
        </div>
      </div>

      {/* Barra de Búsqueda */}
      <div className="bg-white p-4 rounded-3xl border border-[#F4E3C8] shadow-xs flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-[#A86B3D] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar socio VIP por nombre, teléfono a 10 dígitos o ID de miembro..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#FFF7EA] border border-[#F4E3C8] rounded-2xl text-xs text-[#2B1B13] placeholder-[#A86B3D] focus:outline-none focus:ring-2 focus:ring-[#C9974D]"
          />
        </div>
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="px-3 py-2 text-xs text-[#A86B3D] hover:text-[#2B1B13] font-semibold cursor-pointer"
          >
            Limpiar filtro
          </button>
        )}
      </div>

      {/* Lista de Clientes VIP */}
      {isLoading ? (
        <div className="bg-white rounded-3xl border border-[#F4E3C8] p-12 text-center text-[#A86B3D] flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-[#C9974D]" />
          <span className="text-xs font-semibold">Consultando clientes VIP en Firestore...</span>
        </div>
      ) : filteredProfiles.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#F4E3C8] p-12 text-center text-[#A86B3D] space-y-2">
          <Star className="w-8 h-8 text-[#C9974D]/40 mx-auto" />
          <h3 className="font-serif font-bold text-base text-[#2B1B13]">
            {searchQuery ? 'No se encontraron clientes con ese criterio' : 'No hay clientes VIP registrados aún'}
          </h3>
          <p className="text-xs text-[#6B4028] max-w-md mx-auto">
            {searchQuery
              ? 'Verifica el número de teléfono o el nombre ingresado.'
              : 'Cuando los clientes se registren o recuperen su tarjeta desde el modal de la tienda, aparecerán aquí listados.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredProfiles.map((profile) => {
            const isBusy = updatingId === profile.id;
            const hasPendingStamps = (profile.pendingStampsToValidate || 0) > 0;

            return (
              <div
                key={profile.id || profile.memberId}
                className={`bg-white rounded-3xl border transition-all p-5 shadow-xs flex flex-col justify-between gap-4 ${
                  profile.rewardAvailable
                    ? 'border-[#C9974D] bg-gradient-to-br from-white to-[#FFF7EA]'
                    : 'border-[#F4E3C8]'
                }`}
              >
                {/* Cabecera del Cliente */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold bg-[#3A2418] text-[#C9974D] px-2 py-0.5 rounded-md">
                        {profile.memberId}
                      </span>
                      {profile.rewardAvailable && (
                        <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <Gift className="w-3 h-3 text-emerald-600" /> ¡Premio Listo!
                        </span>
                      )}
                    </div>
                    <h3 className="font-serif font-bold text-lg text-[#2B1B13]">
                      {profile.customerName}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-[#6B4028]">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3 text-[#A86B3D]" />
                        <strong>{profile.phone}</strong>
                      </span>
                      {profile.phone && (
                        <a
                          href={`https://wa.me/52${profile.phone}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-emerald-700 hover:text-emerald-900 font-semibold underline"
                        >
                          WhatsApp
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="text-right text-[11px] text-[#A86B3D] space-y-0.5">
                    <span className="block">Alta: {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('es-MX') : 'Reciente'}</span>
                    {profile.updatedAt && (
                      <span className="text-[10px] text-[#A86B3D]/80 block">
                        Act: {new Date(profile.updatedAt).toLocaleDateString('es-MX')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Sellos Visuales */}
                <div className="bg-[#FFF7EA] p-3.5 rounded-2xl border border-[#F4E3C8] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#3A2418] flex items-center gap-1.5 font-serif">
                      <Award className="w-3.5 h-3.5 text-[#C9974D]" />
                      Sellos: {profile.stamps} / {stampsRequired}
                    </span>
                    <span className="text-[11px] text-[#6B4028]">
                      Compras registradas: <strong>{profile.totalOrders}</strong>
                    </span>
                  </div>

                  {/* Barra de progreso de sellos */}
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: stampsRequired }, (_, idx) => {
                      const isFilled = idx + 1 <= profile.stamps;
                      return (
                        <div
                          key={idx}
                          className={`h-7 flex-1 rounded-lg flex items-center justify-center font-bold text-xs border transition-all ${
                            isFilled
                              ? 'bg-[#C9974D] border-[#A86B3D] text-[#2B1B13] shadow-xs'
                              : 'bg-white border-[#F4E3C8] text-[#A86B3D]/50'
                          }`}
                        >
                          {isFilled ? '★' : idx + 1}
                        </div>
                      );
                    })}
                  </div>

                  {/* Notificación de sellos locales pendientes de validación */}
                  {hasPendingStamps && (
                    <div className="bg-amber-100 border border-amber-300 rounded-xl p-2 text-xs text-amber-900 flex items-center justify-between gap-2 mt-2">
                      <span className="flex items-center gap-1 text-[11px] font-semibold">
                        <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                        Tiene <strong>+{profile.pendingStampsToValidate}</strong> sellos locales pendientes de validar
                      </span>
                      <button
                        onClick={() => handleApprovePendingStamps(profile)}
                        disabled={isBusy}
                        className="px-2 py-1 bg-amber-800 hover:bg-amber-900 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-colors shrink-0"
                      >
                        Aprobar (+{profile.pendingStampsToValidate})
                      </button>
                    </div>
                  )}

                  {/* Dirección y notas personales */}
                  {profile.address && (
                    <p className="text-[11px] text-[#6B4028] pt-1 border-t border-[#F4E3C8]">
                      📍 <strong>Entrega:</strong> {profile.address} {profile.reference ? `(${profile.reference})` : ''}
                    </p>
                  )}
                </div>

                {/* Botones de Control Administrativo */}
                <div className="pt-2 border-t border-[#F4E3C8] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleAddStamp(profile)}
                      disabled={isBusy}
                      className="px-3 py-1.5 rounded-xl bg-[#3A2418] hover:bg-[#4E3222] text-[#FFF7EA] text-xs font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      title="Agregar 1 sello por consumo del cliente"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#C9974D]" />
                      <span>+1 Sello</span>
                    </button>

                    <button
                      onClick={() => handleRemoveStamp(profile)}
                      disabled={isBusy || profile.stamps <= 0}
                      className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-40"
                      title="Quitar 1 sello"
                    >
                      <Minus className="w-3.5 h-3.5" />
                      <span>-1</span>
                    </button>

                    <button
                      onClick={() => {
                        setEditingTotalOrdersProfile(profile);
                        setCustomTotalOrders(profile.totalOrders);
                      }}
                      className="p-1.5 rounded-xl bg-white hover:bg-[#FFF7EA] text-[#A86B3D] border border-[#F4E3C8] text-xs transition-all cursor-pointer"
                      title="Ajustar total de compras manualmente"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {profile.rewardAvailable ? (
                      <button
                        onClick={() => handleToggleReward(profile, false)}
                        disabled={isBusy}
                        className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="Canjear la recompensa al cliente"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Canjear Recompensa</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleToggleReward(profile, true)}
                        disabled={isBusy}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#FFF7EA] text-[#3A2418] border border-[#C9974D]/50 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="Otorgar recompensa de cortesía al cliente"
                      >
                        <Gift className="w-3.5 h-3.5 text-[#C9974D]" />
                        <span>Marcar Premio Listo</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal para editar total de compras */}
      {editingTotalOrdersProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 border border-[#F4E3C8] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#F4E3C8] pb-3">
              <h3 className="font-serif font-bold text-base text-[#2B1B13]">
                Ajustar Total de Compras
              </h3>
              <button
                onClick={() => setEditingTotalOrdersProfile(null)}
                className="text-[#A86B3D] hover:text-[#2B1B13]"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#6B4028]">
              Cliente: <strong>{editingTotalOrdersProfile.customerName}</strong> ({editingTotalOrdersProfile.memberId})
            </p>

            <div>
              <label className="block text-xs font-bold text-[#2B1B13] mb-1">
                Número de compras acumuladas:
              </label>
              <input
                type="number"
                min="0"
                value={customTotalOrders}
                onChange={(e) => setCustomTotalOrders(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-[#FFF7EA] border border-[#F4E3C8] rounded-xl text-sm font-bold text-[#2B1B13] focus:outline-none focus:ring-2 focus:ring-[#C9974D]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingTotalOrdersProfile(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#6B4028] hover:bg-[#FFF7EA]"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveTotalOrders}
                className="px-4 py-2 bg-[#3A2418] hover:bg-[#4E3222] text-[#FFF7EA] text-xs font-bold rounded-xl shadow-xs"
              >
                Guardar Ajuste
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
