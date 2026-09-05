import React, { useState, useEffect } from 'react';
import { VipProfile, OrderType } from '../types';
import {
  createCloudVipProfile,
  recoverCloudVipProfile,
  updatePersonalVipInfo,
  migrateLocalVipProfileWithPin,
  refreshCloudVipProfile,
  clearVipProfile,
} from '../lib/vipStorage';
import { normalizePhone } from '../lib/vipCrypto';
import { getRestaurantInfo, ADMIN_DATA_EVENT } from '../lib/adminStorage';
import {
  X,
  Award,
  Utensils,
  Check,
  Star,
  User,
  Sparkles,
  Edit3,
  Trash2,
  ShieldCheck,
  Gift,
  Cloud,
  Lock,
  KeyRound,
  RefreshCw,
  Phone,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  HelpCircle,
} from 'lucide-react';
import { Logo } from './Logo';

interface VipCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCart: () => void;
  vipProfile: VipProfile | null;
  onProfileUpdated: () => void;
}

type ModalMode = 'view' | 'register' | 'recover' | 'edit' | 'migrate_pin';

export const VipCardModal: React.FC<VipCardModalProps> = ({
  isOpen,
  onClose,
  onOpenCart,
  vipProfile,
  onProfileUpdated,
}) => {
  const [restaurantInfo, setRestaurantInfo] = useState(getRestaurantInfo());
  const [mode, setMode] = useState<ModalMode>(vipProfile ? 'view' : 'register');

  // Form states para registro y edición
  const [customerName, setCustomerName] = useState<string>(vipProfile?.customerName || '');
  const [phone, setPhone] = useState<string>(vipProfile?.phone || '');
  const [pin, setPin] = useState<string>('');
  const [address, setAddress] = useState<string>(vipProfile?.address || '');
  const [reference, setReference] = useState<string>(vipProfile?.reference || '');
  const [preferredPayment, setPreferredPayment] = useState<'efectivo' | 'transferencia' | 'tarjeta'>(
    vipProfile?.preferredPayment || 'efectivo'
  );
  const [preferredOrderType, setPreferredOrderType] = useState<OrderType>(
    vipProfile?.preferredOrderType || 'pickup'
  );

  // Form states para recuperación
  const [recoverPhone, setRecoverPhone] = useState<string>('');
  const [recoverPin, setRecoverPin] = useState<string>('');

  // Form states para migración de tarjeta local antigua a la nube
  const [migrationPin, setMigrationPin] = useState<string>('');

  // Estados de carga y retroalimentación
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const handleUpdate = () => {
      setRestaurantInfo(getRestaurantInfo());
    };
    window.addEventListener(ADMIN_DATA_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener(ADMIN_DATA_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const stampsRequired = Math.max(1, restaurantInfo.vipStampsRequired ?? 5);
  const rewardDescription =
    restaurantInfo.vipRewardDescription ||
    'Al acumular 5 sellos, el cliente obtiene gratis un café americano o postre del día.';
  const stampSlots = Array.from({ length: stampsRequired }, (_, i) => i + 1);

  // Sincronizar estado cuando cambia vipProfile o se abre el modal
  useEffect(() => {
    if (vipProfile) {
      setCustomerName(vipProfile.customerName);
      setPhone(vipProfile.phone);
      setAddress(vipProfile.address || '');
      setReference(vipProfile.reference || '');
      setPreferredPayment(vipProfile.preferredPayment || 'efectivo');
      setPreferredOrderType(vipProfile.preferredOrderType || 'pickup');
      if (mode !== 'edit' && mode !== 'migrate_pin') {
        setMode('view');
      }
    } else {
      if (mode !== 'recover') {
        setMode('register');
      }
    }
    setErrorMsg(null);
    setSuccessMsg(null);
  }, [vipProfile, isOpen]);

  // Si tiene tarjeta en la nube, refrescar sellos automáticamente al abrir
  useEffect(() => {
    if (isOpen && vipProfile?.id) {
      handleSilentRefresh();
    }
  }, [isOpen]);

  const handleSilentRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshCloudVipProfile();
      onProfileUpdated();
    } catch {
      // Silencioso
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!isOpen) return null;

  // 1. Registro de Nueva Tarjeta en la Nube
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const normPhone = normalizePhone(phone);
    if (!customerName.trim()) {
      setErrorMsg('Por favor ingresa tu nombre completo.');
      return;
    }
    if (normPhone.length !== 10) {
      setErrorMsg('El número de teléfono debe tener exactamente 10 dígitos (ej: 5512345678).');
      return;
    }
    if (pin.length < 4) {
      setErrorMsg('El PIN de seguridad debe tener 4 dígitos numéricos.');
      return;
    }

    setIsBusy(true);
    try {
      await createCloudVipProfile({
        customerName,
        phone: normPhone,
        pin,
        address,
        reference,
        preferredPayment,
        preferredOrderType,
      });

      setSuccessMsg('🎉 ¡Tarjeta VIP creada con éxito y respaldada en la nube!');
      setPin('');
      onProfileUpdated();
      setMode('view');
    } catch (err: any) {
      console.error('Error al registrar tarjeta VIP:', err);
      setErrorMsg(err?.message || 'No se pudo crear la tarjeta en la nube. Intenta nuevamente.');
    } finally {
      setIsBusy(false);
    }
  };

  // 2. Recuperación de Tarjeta en la Nube (Otro celular / dispositivo)
  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const normPhone = normalizePhone(recoverPhone);
    if (normPhone.length !== 10) {
      setErrorMsg('Ingresa tu teléfono de 10 dígitos registrado.');
      return;
    }
    if (!recoverPin.trim()) {
      setErrorMsg('Ingresa tu PIN de 4 dígitos.');
      return;
    }

    setIsBusy(true);
    try {
      const recovered = await recoverCloudVipProfile(normPhone, recoverPin);
      setSuccessMsg(`✓ ¡Bienvenido de vuelta, ${recovered.customerName}! Tu tarjeta VIP ha sido recuperada.`);
      setRecoverPin('');
      onProfileUpdated();
      setMode('view');
    } catch (err: any) {
      console.error('Error al recuperar tarjeta VIP:', err);
      setErrorMsg(err?.message || 'No se encontró la tarjeta con este teléfono y PIN.');
    } finally {
      setIsBusy(false);
    }
  };

  // 3. Actualizar Datos Personales Permitidos
  const handleUpdatePersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!customerName.trim()) {
      setErrorMsg('El nombre es requerido.');
      return;
    }

    setIsBusy(true);
    try {
      await updatePersonalVipInfo({
        customerName,
        address,
        reference,
        preferredPayment,
        preferredOrderType,
      });

      setSuccessMsg('✓ Datos personales actualizados correctamente.');
      onProfileUpdated();
      setMode('view');
    } catch (err: any) {
      console.error('Error al actualizar datos:', err);
      setErrorMsg(err?.message || 'Error al guardar los cambios.');
    } finally {
      setIsBusy(false);
    }
  };

  // 4. Migración de Perfil Local sin PIN a la Nube
  const handleMigrateLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (migrationPin.length < 4) {
      setErrorMsg('El PIN debe tener al menos 4 dígitos.');
      return;
    }

    setIsBusy(true);
    try {
      await migrateLocalVipProfileWithPin(migrationPin);
      setSuccessMsg('🎉 ¡Tarjeta protegida y respaldada en la nube con éxito!');
      setMigrationPin('');
      onProfileUpdated();
      setMode('view');
    } catch (err: any) {
      console.error('Error al migrar perfil:', err);
      setErrorMsg(err?.message || 'No se pudo vincular la tarjeta a la nube.');
    } finally {
      setIsBusy(false);
    }
  };

  // 5. Borrado de tarjeta del dispositivo
  const handleClear = () => {
    if (
      window.confirm(
        '¿Deseas desvincular esta tarjeta de este dispositivo? Podrás volver a recuperarla en cualquier momento con tu teléfono y PIN.'
      )
    ) {
      clearVipProfile();
      onProfileUpdated();
      setMode('register');
    }
  };

  const currentStamps = vipProfile?.stamps || 0;
  const isRewardReady = vipProfile?.rewardAvailable || false;
  const isCloudSynced = Boolean(vipProfile?.id);
  const hasPendingValidationStamps = (vipProfile?.pendingStampsToValidate || 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2B1B13]/85 backdrop-blur-xs animate-fade-in">
      <div className="bg-[#2B1B13] text-[#FFF7EA] w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-[#C9974D]/40 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#3A2418] via-[#4A2E1F] to-[#3A2418] p-5 flex items-center justify-between border-b border-[#4E3222]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#C9974D] to-[#A86B3D] text-[#3A2418] font-black text-xl flex items-center justify-center shadow-md">
              ⭐
            </div>
            <div>
              <h2 className="text-xl font-black font-serif text-[#FFF7EA] flex items-center gap-1.5">
                Tarjeta VIP Calientito
              </h2>
              <p className="text-xs text-[#F4E3C8]">
                Sellos de lealtad & Recompensas respaldadas en la nube
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-[#3A2418] hover:bg-[#4A2E1F] text-[#C9974D] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notificaciones globales en el modal */}
        {errorMsg && (
          <div className="mx-5 mt-4 p-3 bg-rose-950/90 border border-rose-700/80 rounded-2xl text-rose-200 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-rose-300 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {successMsg && (
          <div className="mx-5 mt-4 p-3 bg-emerald-950/90 border border-emerald-700/80 rounded-2xl text-emerald-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* TARJETA VIP DIGITAL */}
          <div className="relative bg-gradient-to-br from-[#4A2E1F] via-[#3A2418] to-[#2B1B13] rounded-2xl p-5 border-2 border-[#C9974D] shadow-2xl overflow-hidden">
            <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-[#C9974D]/15 rounded-full blur-xl pointer-events-none" />

            <div className="flex items-start justify-between relative z-10">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest bg-[#C9974D] text-[#3A2418] px-2.5 py-0.5 rounded-full shadow-xs font-serif">
                    SOCIO VIP PREMIER
                  </span>
                  {isCloudSynced ? (
                    <span className="text-[9px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <Cloud className="w-2.5 h-2.5 text-emerald-400" /> Nube
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-md">
                      Local
                    </span>
                  )}
                </div>

                <div className="mt-2 bg-[#FFF7EA] px-2.5 py-1 rounded-xl inline-block shadow-md border border-[#C9974D]/30">
                  <Logo size="sm" variant="full" />
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-[#C9974D] font-mono block">ID MIEMBRO</span>
                <span className="text-sm font-black font-mono text-[#FFF7EA] tracking-wider">
                  {vipProfile?.memberId || 'VIP-NUEVO'}
                </span>

                {vipProfile?.id && (
                  <button
                    onClick={handleSilentRefresh}
                    disabled={isRefreshing}
                    className="mt-1 text-[10px] text-[#C9974D] hover:text-[#FFF7EA] flex items-center justify-end gap-1 ml-auto cursor-pointer"
                    title="Actualizar sellos desde la nube"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>Actualizar</span>
                  </button>
                )}
              </div>
            </div>

            {/* Datos del Titular */}
            <div className="mt-4 pt-3 border-t border-[#4E3222] flex items-center justify-between text-xs text-[#FFF7EA]">
              <div>
                <span className="text-[10px] text-[#C9974D] block">TITULAR</span>
                <strong className="text-sm text-white font-serif">
                  {vipProfile?.customerName || 'Ingresa tus datos'}
                </strong>
              </div>
              {vipProfile?.phone && (
                <div className="text-right">
                  <span className="text-[10px] text-[#C9974D] block">TELÉFONO</span>
                  <span className="font-semibold text-[#EAD9C4]">{vipProfile.phone}</span>
                </div>
              )}
            </div>

            {/* Grid de Sellos */}
            <div className="mt-4 pt-3 border-t border-[#4E3222]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#C9974D] flex items-center gap-1 font-serif">
                  <Award className="w-3.5 h-3.5 text-[#C9974D]" /> Sellos Acumulados ({stampsRequired} = 1 Recompensa)
                </span>
                <span className="text-xs font-black text-[#FFF7EA]">
                  {isRewardReady ? '¡1 RECOMPENSA LISTA!' : `${currentStamps} / ${stampsRequired}`}
                </span>
              </div>

              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(stampsRequired, 5)}, minmax(0, 1fr))`,
                }}
              >
                {stampSlots.map((slot) => {
                  const isFilled = slot <= currentStamps;
                  const isLastSlot = slot === stampsRequired;
                  return (
                    <div
                      key={slot}
                      className={`h-12 rounded-xl flex flex-col items-center justify-center border transition-all ${
                        isFilled
                          ? 'bg-gradient-to-tr from-[#C9974D] to-[#A86B3D] border-[#DEC8AE] text-[#3A2418] font-black shadow-md scale-102'
                          : isRewardReady && isLastSlot
                          ? 'bg-[#C9974D] border-[#FFF7EA] text-[#3A2418] animate-bounce'
                          : 'bg-[#3A2418] border-[#4E3222] text-[#C9974D]/40'
                      }`}
                    >
                      {isFilled ? (
                        <Utensils className="w-5 h-5 text-[#3A2418]" />
                      ) : isLastSlot ? (
                        <Gift className="w-5 h-5 text-[#C9974D]" />
                      ) : (
                        <span className="text-xs font-bold font-mono">{slot}</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {isRewardReady ? (
                <div className="mt-3 bg-[#C9974D]/20 border border-[#C9974D]/50 p-2.5 rounded-xl text-center text-xs font-bold text-[#F4E3C8] flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#C9974D] animate-spin" />
                  <span>¡Felicidades! Recompensa lista: {rewardDescription}</span>
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-[#EAD9C4] text-center font-medium">
                  {currentStamps === 0
                    ? '¡Los sellos acumulados te permiten canjear alimentos y postres gratis!'
                    : `Te faltan solo ${Math.max(0, stampsRequired - currentStamps)} pedido(s) para ganar: ${rewardDescription}.`}
                </p>
              )}

              {hasPendingValidationStamps && (
                <div className="mt-2 bg-amber-950/80 border border-amber-500/40 p-2 rounded-xl text-amber-200 text-[11px] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>
                    Tienes <strong>+{vipProfile?.pendingStampsToValidate} sellos</strong> locales pendientes de validación por el restaurante.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* CASO: Perfil local existente sin sincronización en la nube */}
          {vipProfile && !isCloudSynced && mode === 'view' && (
            <div className="bg-[#4A2E1F] border-2 border-[#C9974D] rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-[#C9974D] font-bold text-xs font-serif">
                <Lock className="w-4 h-4 text-[#C9974D]" />
                <span>Protege tu Tarjeta VIP en la Nube</span>
              </div>
              <p className="text-xs text-[#F4E3C8] leading-relaxed">
                Asigna un PIN de 4 dígitos para conservar tus sellos y poder recuperar tu tarjeta en cualquier otro teléfono o computadora.
              </p>
              <button
                onClick={() => setMode('migrate_pin')}
                className="w-full py-2.5 px-4 bg-[#C9974D] hover:bg-[#D4A55E] text-[#2B1B13] font-black text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <KeyRound className="w-4 h-4" />
                <span>Asignar PIN y Respaldar en la Nube</span>
              </button>
            </div>
          )}

          {/* VISTA 1: DETALLES DE PERFIL GUARDADO */}
          {vipProfile && mode === 'view' && (
            <div className="bg-[#3A2418]/90 border border-[#4E3222] rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#C9974D] flex items-center gap-1.5 font-serif">
                  <User className="w-4 h-4 text-[#C9974D]" /> Datos Guardados del Socio
                </h4>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMode('edit')}
                    className="text-xs text-[#C9974D] hover:text-white font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Editar Datos
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#EAD9C4]">
                <div className="bg-[#2B1B13] p-2.5 rounded-xl border border-[#4E3222]">
                  <span className="text-[10px] text-[#A86B3D] block font-bold">NOMBRE</span>
                  <strong className="text-[#FFF7EA]">{vipProfile.customerName}</strong>
                </div>

                <div className="bg-[#2B1B13] p-2.5 rounded-xl border border-[#4E3222]">
                  <span className="text-[10px] text-[#A86B3D] block font-bold">TELÉFONO</span>
                  <strong className="text-[#FFF7EA]">{vipProfile.phone}</strong>
                </div>

                {vipProfile.address && (
                  <div className="bg-[#2B1B13] p-2.5 rounded-xl border border-[#4E3222] sm:col-span-2">
                    <span className="text-[10px] text-[#A86B3D] block font-bold">DIRECCIÓN DE ENTREGA</span>
                    <strong className="text-[#FFF7EA]">{vipProfile.address}</strong>
                    {vipProfile.reference && (
                      <span className="text-[11px] text-[#C9974D] block italic">
                        Ref: {vipProfile.reference}
                      </span>
                    )}
                  </div>
                )}

                <div className="bg-[#2B1B13] p-2.5 rounded-xl border border-[#4E3222]">
                  <span className="text-[10px] text-[#A86B3D] block font-bold">PAGO PREFERIDO</span>
                  <strong className="text-[#FFF7EA] uppercase">{vipProfile.preferredPayment}</strong>
                </div>

                <div className="bg-[#2B1B13] p-2.5 rounded-xl border border-[#4E3222]">
                  <span className="text-[10px] text-[#A86B3D] block font-bold">MODALIDAD PREFERIDA</span>
                  <strong className="text-[#FFF7EA]">
                    {vipProfile.preferredOrderType === 'dine_in'
                      ? 'Restaurante'
                      : vipProfile.preferredOrderType === 'delivery'
                      ? 'Domicilio'
                      : 'Recoger'}
                  </strong>
                </div>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-between border-t border-[#4E3222] text-[11px] text-[#A86B3D] gap-2">
                <span>
                  Total pedidos acumulados: <strong>{vipProfile.totalOrders}</strong>
                </span>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setMode('recover')}
                    className="text-[#C9974D] hover:underline cursor-pointer"
                  >
                    Cambiar o recuperar otra tarjeta
                  </button>

                  <button
                    onClick={handleClear}
                    className="text-red-400 hover:text-red-300 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Desvincular
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* VISTA 2: FORMULARIO DE ASIGNACIÓN DE PIN (Migración de tarjeta local a la nube) */}
          {mode === 'migrate_pin' && (
            <form onSubmit={handleMigrateLocal} className="bg-[#3A2418]/90 border border-[#C9974D] rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#C9974D] flex items-center gap-1.5 font-serif">
                  <KeyRound className="w-4 h-4 text-[#C9974D]" /> Respaldo de Seguridad en la Nube
                </h4>
                <button
                  type="button"
                  onClick={() => setMode('view')}
                  className="text-xs text-[#A86B3D] hover:text-white"
                >
                  Cancelar
                </button>
              </div>

              <p className="text-xs text-[#F4E3C8]">
                Crea un PIN numérico de 4 dígitos para tu tarjeta con teléfono <strong>{vipProfile?.phone}</strong>.
              </p>

              <div>
                <label className="block text-[11px] font-bold text-[#F4E3C8] mb-1">
                  PIN de Seguridad (4 dígitos) *
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  placeholder="Ej: 1234"
                  value={migrationPin}
                  onChange={(e) => setMigrationPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2 text-xs bg-[#2B1B13] border border-[#4E3222] rounded-xl text-[#FFF7EA] font-mono tracking-widest placeholder-[#A86B3D] focus:outline-none focus:ring-2 focus:ring-[#C9974D]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMode('view')}
                  className="px-4 py-2 text-xs font-bold text-[#A86B3D] hover:text-[#FFF7EA]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isBusy || migrationPin.length < 4}
                  className="px-5 py-2.5 bg-gradient-to-r from-[#C9974D] to-[#A86B3D] text-[#3A2418] font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  <span>Guardar PIN en la Nube</span>
                </button>
              </div>
            </form>
          )}

          {/* VISTA 3: EDITAR DATOS PERSONALES */}
          {mode === 'edit' && (
            <form onSubmit={handleUpdatePersonal} className="bg-[#3A2418]/90 border border-[#4E3222] rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#C9974D] flex items-center gap-1.5 font-serif">
                  <Edit3 className="w-4 h-4 text-[#C9974D]" /> Editar Datos Personales
                </h4>
                <button
                  type="button"
                  onClick={() => setMode('view')}
                  className="text-xs text-[#A86B3D] hover:text-white"
                >
                  Cancelar
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#F4E3C8] mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#2B1B13] border border-[#4E3222] rounded-xl text-[#FFF7EA] focus:outline-none focus:ring-2 focus:ring-[#C9974D]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#A86B3D] mb-1">
                  Teléfono registrado (Protegido)
                </label>
                <input
                  type="text"
                  disabled
                  value={phone}
                  className="w-full px-3 py-2 text-xs bg-[#2B1B13]/60 border border-[#4E3222] rounded-xl text-[#A86B3D] cursor-not-allowed font-mono"
                />
                <span className="text-[10px] text-[#A86B3D] block mt-0.5">
                  El teléfono está vinculado criptográficamente a tus sellos.
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#F4E3C8] mb-1">
                  Dirección de Entrega
                </label>
                <input
                  type="text"
                  placeholder="Calle, número, colonia"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#2B1B13] border border-[#4E3222] rounded-xl text-[#FFF7EA] focus:outline-none focus:ring-2 focus:ring-[#C9974D]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#F4E3C8] mb-1">
                  Referencia de entrega
                </label>
                <input
                  type="text"
                  placeholder="Ej: Frente al parque"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#2B1B13] border border-[#4E3222] rounded-xl text-[#FFF7EA] focus:outline-none focus:ring-2 focus:ring-[#C9974D]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-[#F4E3C8] mb-1">
                    Método de Pago
                  </label>
                  <select
                    value={preferredPayment}
                    onChange={(e) => setPreferredPayment(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-[#2B1B13] border border-[#4E3222] rounded-xl text-[#FFF7EA] focus:outline-none focus:ring-2 focus:ring-[#C9974D]"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="transferencia">Transferencia</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#F4E3C8] mb-1">
                    Modalidad Favorita
                  </label>
                  <select
                    value={preferredOrderType}
                    onChange={(e) => setPreferredOrderType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-[#2B1B13] border border-[#4E3222] rounded-xl text-[#FFF7EA] focus:outline-none focus:ring-2 focus:ring-[#C9974D]"
                  >
                    <option value="pickup">Recoger</option>
                    <option value="dine_in">Restaurante</option>
                    <option value="delivery">Domicilio</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMode('view')}
                  className="px-4 py-2 text-xs font-bold text-[#A86B3D] hover:text-[#FFF7EA]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="px-5 py-2.5 bg-gradient-to-r from-[#C9974D] to-[#A86B3D] text-[#3A2418] font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Guardar Cambios</span>
                </button>
              </div>
            </form>
          )}

          {/* VISTA 4 & 5: TABS DE REGISTRO NUEVO VS RECUPERACIÓN */}
          {(mode === 'register' || mode === 'recover') && (
            <div className="space-y-4">
              {/* Botones de selección de modo */}
              <div className="grid grid-cols-2 p-1 bg-[#20140E] rounded-2xl border border-[#4E3222]">
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setErrorMsg(null);
                  }}
                  className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    mode === 'register'
                      ? 'bg-[#3A2418] text-[#FFF7EA] shadow-xs'
                      : 'text-[#A86B3D] hover:text-[#FFF7EA]'
                  }`}
                >
                  <Star className="w-3.5 h-3.5 text-[#C9974D]" />
                  <span>Nueva Tarjeta</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('recover');
                    setErrorMsg(null);
                  }}
                  className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    mode === 'recover'
                      ? 'bg-[#3A2418] text-[#FFF7EA] shadow-xs'
                      : 'text-[#A86B3D] hover:text-[#FFF7EA]'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5 text-[#C9974D]" />
                  <span>Ya tengo Tarjeta</span>
                </button>
              </div>

              {/* MODO REGISTRAR NUEVA TARJETA */}
              {mode === 'register' && (
                <form onSubmit={handleRegister} className="bg-[#3A2418]/90 border border-[#4E3222] rounded-2xl p-4 space-y-3">
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#C9974D] flex items-center gap-1.5 font-serif">
                      <Star className="w-4 h-4 text-[#C9974D]" /> Registro de Tarjeta VIP Cloud
                    </h4>
                    <p className="text-[11px] text-[#EAD9C4]">
                      Crea tu tarjeta para acumular sellos en cada compra y obtener recompensas gratis.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#F4E3C8] mb-1">
                      Tu Nombre Completo *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Carlos Ramírez"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[#2B1B13] border border-[#4E3222] rounded-xl text-[#FFF7EA] placeholder-[#A86B3D] focus:outline-none focus:ring-2 focus:ring-[#C9974D]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-[#F4E3C8] mb-1">
                        Teléfono (10 dígitos) *
                      </label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        required
                        placeholder="Ej: 5512345678"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                        className="w-full px-3 py-2 text-xs bg-[#2B1B13] border border-[#4E3222] rounded-xl text-[#FFF7EA] font-mono placeholder-[#A86B3D] focus:outline-none focus:ring-2 focus:ring-[#C9974D]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-[#F4E3C8] mb-1">
                        PIN de Seguridad (4 dígitos) *
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        required
                        placeholder="Crea un PIN (ej: 4821)"
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                        className="w-full px-3 py-2 text-xs bg-[#2B1B13] border border-[#4E3222] rounded-xl text-[#FFF7EA] font-mono tracking-widest placeholder-[#A86B3D] focus:outline-none focus:ring-2 focus:ring-[#C9974D]"
                      />
                    </div>
                  </div>

                  <p className="text-[10px] text-[#C9974D]/90 bg-[#2B1B13] p-2 rounded-xl border border-[#4E3222]">
                    💡 <strong>Seguridad:</strong> Tu teléfono y PIN te permitirán recuperar tus sellos si cambias de teléfono o borras tu navegador.
                  </p>

                  <div>
                    <label className="block text-[11px] font-bold text-[#F4E3C8] mb-1">
                      Dirección de Entrega (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Calle, número, colonia"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[#2B1B13] border border-[#4E3222] rounded-xl text-[#FFF7EA] placeholder-[#A86B3D] focus:outline-none focus:ring-2 focus:ring-[#C9974D]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-[#F4E3C8] mb-1">
                        Pago Preferido
                      </label>
                      <select
                        value={preferredPayment}
                        onChange={(e) => setPreferredPayment(e.target.value as any)}
                        className="w-full px-3 py-2 text-xs bg-[#2B1B13] border border-[#4E3222] rounded-xl text-[#FFF7EA] focus:outline-none focus:ring-2 focus:ring-[#C9974D]"
                      >
                        <option value="efectivo">Efectivo</option>
                        <option value="tarjeta">Tarjeta</option>
                        <option value="transferencia">Transferencia</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-[#F4E3C8] mb-1">
                        Modalidad Favorita
                      </label>
                      <select
                        value={preferredOrderType}
                        onChange={(e) => setPreferredOrderType(e.target.value as any)}
                        className="w-full px-3 py-2 text-xs bg-[#2B1B13] border border-[#4E3222] rounded-xl text-[#FFF7EA] focus:outline-none focus:ring-2 focus:ring-[#C9974D]"
                      >
                        <option value="pickup">Recoger</option>
                        <option value="dine_in">Restaurante</option>
                        <option value="delivery">Domicilio</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end">
                    <button
                      type="submit"
                      disabled={isBusy}
                      className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-[#C9974D] to-[#A86B3D] hover:from-[#d8a85e] hover:to-[#ba7845] text-[#3A2418] font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      <span>Crear Mi Tarjeta VIP Cloud</span>
                    </button>
                  </div>
                </form>
              )}

              {/* MODO RECUPERAR TARJETA EXISTENTE */}
              {mode === 'recover' && (
                <form onSubmit={handleRecover} className="bg-[#3A2418]/90 border border-[#4E3222] rounded-2xl p-4 space-y-3">
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#C9974D] flex items-center gap-1.5 font-serif">
                      <KeyRound className="w-4 h-4 text-[#C9974D]" /> Recuperar Tarjeta Registrada
                    </h4>
                    <p className="text-[11px] text-[#EAD9C4]">
                      Ingresa el teléfono registrado y el PIN de 4 dígitos para cargar tus sellos y datos en este dispositivo.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#F4E3C8] mb-1">
                      Teléfono Registrado (10 dígitos) *
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      required
                      placeholder="Ej: 5512345678"
                      value={recoverPhone}
                      onChange={(e) => setRecoverPhone(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-3 py-2 text-xs bg-[#2B1B13] border border-[#4E3222] rounded-xl text-[#FFF7EA] font-mono placeholder-[#A86B3D] focus:outline-none focus:ring-2 focus:ring-[#C9974D]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#F4E3C8] mb-1">
                      PIN de Seguridad (4 dígitos) *
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      placeholder="Ingresa tu PIN"
                      value={recoverPin}
                      onChange={(e) => setRecoverPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-3 py-2 text-xs bg-[#2B1B13] border border-[#4E3222] rounded-xl text-[#FFF7EA] font-mono tracking-widest placeholder-[#A86B3D] focus:outline-none focus:ring-2 focus:ring-[#C9974D]"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-end">
                    <button
                      type="submit"
                      disabled={isBusy || normalizePhone(recoverPhone).length !== 10 || !recoverPin}
                      className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-[#C9974D] to-[#A86B3D] hover:from-[#d8a85e] hover:to-[#ba7845] text-[#3A2418] font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
                      <span>Recuperar Mis Sellos & Tarjeta</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* EXPLICACIÓN DE BENEFICIOS */}
          <div className="bg-[#3A2418] border border-[#4E3222] rounded-2xl p-3.5 text-xs text-[#EAD9C4] space-y-1.5">
            <h4 className="font-bold text-[#C9974D] flex items-center gap-1.5 font-serif">
              <ShieldCheck className="w-4 h-4 text-[#C9974D]" />
              ¿Cómo funciona Calientito VIP Cloud?
            </h4>
            <p className="text-[11px] text-[#EAD9C4] leading-relaxed">
              1. <strong>Seguridad Determinística:</strong> Tu tarjeta se vincula a tu teléfono y PIN sin exponer datos sensibles.
              <br />
              2. <strong>Recuperación Multidispositivo:</strong> Cambia de celular o abre desde cualquier tablet ingresando tu teléfono y PIN.
              <br />
              3. <strong>Sellos Verificados:</strong> Los sellos son administrados de forma segura por el equipo de Restaurante Calientito.
              <br />
              4. <strong>Recompensas:</strong> {rewardDescription}
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-[#20140E] p-4 border-t border-[#4E3222] flex items-center justify-between gap-3">
          <span className="text-[11px] text-[#C9974D]/90">
            {vipProfile
              ? isCloudSynced
                ? '🟢 Vinculado en la nube'
                : '🟡 Tarjeta local'
              : 'Aún no has guardado tus datos'}
          </span>
          <button
            onClick={() => {
              onClose();
              onOpenCart();
            }}
            className="py-2.5 px-4 bg-[#4A2E1F] hover:bg-[#5C3825] text-[#FFF7EA] rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer border border-[#C9974D]/40"
          >
            <Utensils className="w-4 h-4 text-[#C9974D]" />
            <span>Ver mi Pedido / Comprar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
