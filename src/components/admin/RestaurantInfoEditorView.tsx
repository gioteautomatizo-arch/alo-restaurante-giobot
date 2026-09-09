import React, { useState, useEffect } from 'react';
import { StaffUser, RestaurantInfo } from '../../types';
import { getRestaurantInfo, saveRestaurantInfo } from '../../lib/adminStorage';
import {
  Store,
  MapPin,
  Clock,
  Phone,
  Save,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Bot,
  Info,
  Tag,
  Truck,
  Award,
  ShieldCheck,
  Gift,
  Percent,
} from 'lucide-react';

interface RestaurantInfoEditorViewProps {
  currentUser: StaffUser;
  onRefreshStats?: () => void;
}

export const RestaurantInfoEditorView: React.FC<RestaurantInfoEditorViewProps> = ({
  currentUser,
  onRefreshStats,
}) => {
  const initialInfo = getRestaurantInfo();

  // Estados locales del formulario: Datos Generales
  const [address, setAddress] = useState<string>(initialInfo.address);
  const [openingHours, setOpeningHours] = useState<string>(initialInfo.openingHours);
  const [whatsapp, setWhatsapp] = useState<string>(initialInfo.whatsapp);

  // Estados locales del formulario: Promociones, Servicio y VIP
  const [ecoDiscountPercent, setEcoDiscountPercent] = useState<number>(initialInfo.ecoDiscountPercent ?? 10);
  const [ecoDiscountDescription, setEcoDiscountDescription] = useState<string>(
    initialInfo.ecoDiscountDescription || '10% de descuento si el cliente trae sus propios recipientes o termo.'
  );
  const [deliveryFee, setDeliveryFee] = useState<number>(initialInfo.deliveryFee ?? 25);
  const [vipStampsRequired, setVipStampsRequired] = useState<number>(initialInfo.vipStampsRequired ?? 5);
  const [vipRewardDescription, setVipRewardDescription] = useState<string>(
    initialInfo.vipRewardDescription || 'Al acumular 5 sellos, el cliente obtiene gratis un café americano o postre del día.'
  );
  const [servicePolicies, setServicePolicies] = useState<string>(
    initialInfo.servicePolicies || 'Servicio en comedor, para llevar y a domicilio. Formas de pago: efectivo, transferencia y tarjeta.'
  );
  const [activePromotions, setActivePromotions] = useState<string>(
    initialInfo.activePromotions || '10% de descuento por traer recipientes propios.'
  );

  const [lastSavedInfo, setLastSavedInfo] = useState<RestaurantInfo>(initialInfo);

  // Estados de retroalimentación
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sincronizar en tiempo real si otro dispositivo o Firestore actualiza la info
  useEffect(() => {
    const handleDataChange = () => {
      const latest = getRestaurantInfo();
      setLastSavedInfo(latest);
      // Solo sobreescribir campos si el usuario no está guardando activamente
      if (!isSaving) {
        setAddress(latest.address);
        setOpeningHours(latest.openingHours);
        setWhatsapp(latest.whatsapp);
        setEcoDiscountPercent(latest.ecoDiscountPercent ?? 10);
        setEcoDiscountDescription(
          latest.ecoDiscountDescription || '10% de descuento si el cliente trae sus propios recipientes o termo.'
        );
        setDeliveryFee(latest.deliveryFee ?? 25);
        setVipStampsRequired(latest.vipStampsRequired ?? 5);
        setVipRewardDescription(
          latest.vipRewardDescription || 'Al acumular 5 sellos, el cliente obtiene gratis un café americano o postre del día.'
        );
        setServicePolicies(
          latest.servicePolicies || 'Servicio en comedor, para llevar y a domicilio. Formas de pago: efectivo, transferencia y tarjeta.'
        );
        setActivePromotions(
          latest.activePromotions || '10% de descuento por traer recipientes propios.'
        );
      }
    };

    window.addEventListener('alo_admin_data_updated', handleDataChange);
    window.addEventListener('storage', handleDataChange);

    return () => {
      window.removeEventListener('alo_admin_data_updated', handleDataChange);
      window.removeEventListener('storage', handleDataChange);
    };
  }, [isSaving]);

  // Cálculo en vivo de whatsappRaw (solo dígitos)
  const previewWhatsappRaw = whatsapp.replace(/\D/g, '');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser.role === 'EMPLEADO') {
      setErrorMsg('Solo Encargados o Administradores tienen permisos para modificar la información del restaurante.');
      return;
    }

    const trimmedAddress = address.trim();
    const trimmedHours = openingHours.trim();
    const trimmedWhatsapp = whatsapp.trim();
    const cleanRaw = trimmedWhatsapp.replace(/\D/g, '');
    const cleanEcoDesc = ecoDiscountDescription.trim();
    const cleanRewardDesc = vipRewardDescription.trim();
    const cleanPolicies = servicePolicies.trim();
    const cleanPromos = activePromotions.trim();

    if (!trimmedAddress) {
      setErrorMsg('La dirección no puede estar vacía.');
      return;
    }
    if (!trimmedHours) {
      setErrorMsg('El horario de atención no puede estar vacío.');
      return;
    }
    if (!trimmedWhatsapp || cleanRaw.length < 8) {
      setErrorMsg('Por favor ingresa un número de WhatsApp válido.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    // Guardar referencia de los valores actuales antes del intento para rollback si Firestore falla
    const rollback = { ...lastSavedInfo };

    try {
      const updated = await saveRestaurantInfo(
        {
          restaurantId: 'alo-restaurante',
          address: trimmedAddress,
          openingHours: trimmedHours,
          whatsapp: trimmedWhatsapp,
          whatsappRaw: cleanRaw,
          ecoDiscountPercent: Number(ecoDiscountPercent) || 0,
          ecoDiscountDescription: cleanEcoDesc,
          deliveryFee: Number(deliveryFee) || 0,
          vipStampsRequired: Number(vipStampsRequired) || 5,
          vipRewardDescription: cleanRewardDesc,
          servicePolicies: cleanPolicies,
          activePromotions: cleanPromos,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.name,
        },
        currentUser
      );

      setLastSavedInfo(updated);
      setAddress(updated.address);
      setOpeningHours(updated.openingHours);
      setWhatsapp(updated.whatsapp);
      setEcoDiscountPercent(updated.ecoDiscountPercent ?? 10);
      setEcoDiscountDescription(updated.ecoDiscountDescription || '');
      setDeliveryFee(updated.deliveryFee ?? 25);
      setVipStampsRequired(updated.vipStampsRequired ?? 5);
      setVipRewardDescription(updated.vipRewardDescription || '');
      setServicePolicies(updated.servicePolicies || '');
      setActivePromotions(updated.activePromotions || '');

      // Mensaje de éxito requerido
      setSuccessMsg('Información actualizada y sincronizada');
      setTimeout(() => setSuccessMsg(null), 4000);

      if (onRefreshStats) {
        onRefreshStats();
      }
    } catch (err: any) {
      console.error('Error al guardar restaurant_info en Firestore:', err);

      // Revertir a los valores previos guardados (Requisito 8: rollback ante fallo)
      setAddress(rollback.address);
      setOpeningHours(rollback.openingHours);
      setWhatsapp(rollback.whatsapp);
      setEcoDiscountPercent(rollback.ecoDiscountPercent ?? 10);
      setEcoDiscountDescription(rollback.ecoDiscountDescription || '');
      setDeliveryFee(rollback.deliveryFee ?? 25);
      setVipStampsRequired(rollback.vipStampsRequired ?? 5);
      setVipRewardDescription(rollback.vipRewardDescription || '');
      setServicePolicies(rollback.servicePolicies || '');
      setActivePromotions(rollback.activePromotions || '');

      const message =
        err?.code === 'permission-denied'
          ? 'Permiso denegado por Firestore. Asegúrate de haber iniciado sesión con Google en el banner superior.'
          : err?.message || 'Ocurrió un error al guardar en la base de datos central de Firestore.';

      setErrorMsg(`Error al guardar: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToCurrent = () => {
    setAddress(lastSavedInfo.address);
    setOpeningHours(lastSavedInfo.openingHours);
    setWhatsapp(lastSavedInfo.whatsapp);
    setEcoDiscountPercent(lastSavedInfo.ecoDiscountPercent ?? 10);
    setEcoDiscountDescription(
      lastSavedInfo.ecoDiscountDescription || '10% de descuento si el cliente trae sus propios recipientes o termo.'
    );
    setDeliveryFee(lastSavedInfo.deliveryFee ?? 25);
    setVipStampsRequired(lastSavedInfo.vipStampsRequired ?? 5);
    setVipRewardDescription(
      lastSavedInfo.vipRewardDescription || 'Al acumular 5 sellos, el cliente obtiene gratis un café americano o postre del día.'
    );
    setServicePolicies(
      lastSavedInfo.servicePolicies || 'Servicio en comedor, para llevar y a domicilio. Formas de pago: efectivo, transferencia y tarjeta.'
    );
    setActivePromotions(
      lastSavedInfo.activePromotions || '10% de descuento por traer recipientes propios.'
    );
    setErrorMsg(null);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Mensaje de Éxito */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs sm:text-sm font-medium flex items-center gap-3 animate-in fade-in shadow-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}

      {/* Mensaje de Error Real (Sin falsos positivos) */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl text-xs sm:text-sm font-medium flex items-start gap-3 animate-in fade-in shadow-xs">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">No se pudieron guardar los cambios en Firestore</p>
            <p className="text-xs text-rose-800">{errorMsg}</p>
            <p className="text-[11px] text-rose-700 italic">Se han restablecido los valores anteriores para preservar la integridad.</p>
          </div>
        </div>
      )}

      {/* Cabecera de la Sección */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#F4E3C8] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFF7EA] text-[#A86B3D] text-xs font-bold uppercase tracking-wider mb-1 font-serif border border-[#F4E3C8]">
            <Store className="w-3.5 h-3.5 text-[#C9974D]" />
            <span>Datos Oficiales del Establecimiento</span>
          </div>
          <h2 className="font-serif font-bold text-xl sm:text-2xl text-[#2B1B13]">
            Información del Restaurante
          </h2>
          <p className="text-xs text-[#6B4028] mt-0.5">
            Administra dirección, horarios, WhatsApp, promociones vigentes, costo de envío y reglas de Calientito VIP. Todo se sincroniza en tiempo real con Tita y el carrito.
          </p>
        </div>

        {lastSavedInfo.updatedAt && (
          <div className="bg-[#FFF7EA] border border-[#F4E3C8] px-3.5 py-2 rounded-2xl text-right shrink-0">
            <span className="text-[10px] text-[#A86B3D] font-bold block uppercase tracking-wider">
              Última actualización
            </span>
            <span className="text-xs font-semibold text-[#2B1B13]">
              {new Date(lastSavedInfo.updatedAt).toLocaleDateString('es-MX', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {lastSavedInfo.updatedBy && (
              <span className="block text-[10px] text-[#6B4028]/80 truncate max-w-[150px]">
                por {lastSavedInfo.updatedBy}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Nota informativa sobre Tita */}
      <div className="bg-gradient-to-r from-[#FFFDF9] to-[#FFF7EA] border border-[#C9974D]/40 rounded-3xl p-4 sm:p-5 flex items-start gap-3.5 shadow-2xs">
        <div className="w-9 h-9 rounded-2xl bg-[#3A2418] text-[#C9974D] flex items-center justify-center shrink-0 shadow-xs">
          <Bot className="w-5 h-5" />
        </div>
        <div className="text-xs text-[#6B4028] space-y-1">
          <p className="font-bold text-[#2B1B13] flex items-center gap-1.5">
            <span>Sincronización directa con Tita y Carrito de Compras</span>
            <Sparkles className="w-3.5 h-3.5 text-[#C9974D]" />
          </p>
          <p>
            Cualquier cambio guardado aquí actualiza al instante las respuestas de Tita (promociones, reglas VIP, costos de envío, políticas) y los cálculos automáticos del carrito de compras.
          </p>
        </div>
      </div>

      {/* Formulario Principal de Edición */}
      <form onSubmit={handleSave} className="bg-white rounded-3xl border border-[#F4E3C8] p-6 sm:p-8 shadow-xs space-y-8">
        {/* ========================================================= */}
        {/* BLOQUE 1: DATOS BÁSICOS (DIRECCIÓN, HORARIO, WHATSAPP)    */}
        {/* ========================================================= */}
        <div className="space-y-5">
          <div className="border-b border-[#F4E3C8] pb-3">
            <h3 className="font-serif font-bold text-base text-[#2B1B13] flex items-center gap-2">
              <Store className="w-4 h-4 text-[#C9974D]" />
              <span>1. Contacto y Ubicación</span>
            </h3>
            <p className="text-xs text-[#6B4028]">
              Dirección oficial, horario comercial y teléfono de WhatsApp para pedidos.
            </p>
          </div>

          {/* Campo: Dirección */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider font-serif flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#C9974D]" />
              <span>Dirección Completa</span>
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={isSaving}
              placeholder="Calle la Fama 12, 14260 Tlalpan CDMX, México"
              className="w-full bg-[#FFFDF9] border border-[#F4E3C8] rounded-2xl p-3.5 text-sm font-medium text-[#2B1B13] focus:ring-2 focus:ring-[#C9974D] focus:border-[#C9974D] transition-all disabled:opacity-60"
              required
            />
          </div>

          {/* Campo: Horario de Servicio */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider font-serif flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#C9974D]" />
              <span>Horario de Atención</span>
            </label>
            <input
              type="text"
              value={openingHours}
              onChange={(e) => setOpeningHours(e.target.value)}
              disabled={isSaving}
              placeholder="Abiertos de 9:00 am a 5:30 pm"
              className="w-full bg-[#FFFDF9] border border-[#F4E3C8] rounded-2xl p-3.5 text-sm font-medium text-[#2B1B13] focus:ring-2 focus:ring-[#C9974D] focus:border-[#C9974D] transition-all disabled:opacity-60"
              required
            />
          </div>

          {/* Campo: WhatsApp de Pedidos */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider font-serif flex items-center gap-2">
              <Phone className="w-4 h-4 text-[#C9974D]" />
              <span>WhatsApp de Pedidos</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <input
                  type="text"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  disabled={isSaving}
                  placeholder="55 7441 1437"
                  className="w-full bg-[#FFFDF9] border border-[#F4E3C8] rounded-2xl p-3.5 text-sm font-medium text-[#2B1B13] focus:ring-2 focus:ring-[#C9974D] focus:border-[#C9974D] transition-all disabled:opacity-60"
                  required
                />
              </div>
              <div className="bg-[#FFF7EA] border border-[#F4E3C8] rounded-2xl px-3.5 py-2.5 flex flex-col justify-center">
                <span className="text-[10px] text-[#A86B3D] font-bold uppercase tracking-wider">
                  whatsappRaw:
                </span>
                <span className="font-mono text-xs font-bold text-[#3A2418] truncate">
                  {previewWhatsappRaw || '—'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* BLOQUE 2: PROMOCIONES, SERVICIO Y VIP                     */}
        {/* ========================================================= */}
        <div className="space-y-5 pt-4 border-t border-[#F4E3C8]">
          <div className="border-b border-[#F4E3C8] pb-3">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#FFF7EA] text-[#A86B3D] text-[11px] font-bold uppercase tracking-wider mb-1 font-serif border border-[#F4E3C8]">
              <Sparkles className="w-3 h-3 text-[#C9974D]" />
              <span>Segunda Etapa Dinámica</span>
            </div>
            <h3 className="font-serif font-bold text-base text-[#2B1B13] flex items-center gap-2">
              <Tag className="w-4 h-4 text-[#C9974D]" />
              <span>2. Promociones, Servicio y VIP</span>
            </h3>
            <p className="text-xs text-[#6B4028]">
              Configura el descuento ecológico, costo de envío a domicilio, beneficios de Calientito VIP y políticas de atención.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Descuento ecológico (%) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider font-serif flex items-center gap-2">
                <Percent className="w-4 h-4 text-[#C9974D]" />
                <span>Descuento Ecológico (%)</span>
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={ecoDiscountPercent}
                onChange={(e) => setEcoDiscountPercent(Number(e.target.value))}
                disabled={isSaving}
                className="w-full bg-[#FFFDF9] border border-[#F4E3C8] rounded-2xl p-3.5 text-sm font-medium text-[#2B1B13] focus:ring-2 focus:ring-[#C9974D] focus:border-[#C9974D] transition-all disabled:opacity-60"
                required
              />
              <p className="text-[11px] text-[#6B4028]">Porcentaje aplicado al traer recipientes propios.</p>
            </div>

            {/* Costo de envío */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider font-serif flex items-center gap-2">
                <Truck className="w-4 h-4 text-[#C9974D]" />
                <span>Costo de Envío a Domicilio ($ MXN)</span>
              </label>
              <input
                type="number"
                min="0"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(Number(e.target.value))}
                disabled={isSaving}
                className="w-full bg-[#FFFDF9] border border-[#F4E3C8] rounded-2xl p-3.5 text-sm font-medium text-[#2B1B13] focus:ring-2 focus:ring-[#C9974D] focus:border-[#C9974D] transition-all disabled:opacity-60"
                required
              />
              <p className="text-[11px] text-[#6B4028]">Tarifa fija de delivery sumada al carrito y comunicada por Tita.</p>
            </div>
          </div>

          {/* Descripción del descuento ecológico */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider font-serif flex items-center gap-2">
              <Tag className="w-4 h-4 text-[#C9974D]" />
              <span>Descripción del Descuento Ecológico</span>
            </label>
            <input
              type="text"
              value={ecoDiscountDescription}
              onChange={(e) => setEcoDiscountDescription(e.target.value)}
              disabled={isSaving}
              placeholder="10% de descuento si el cliente trae sus propios recipientes o termo."
              className="w-full bg-[#FFFDF9] border border-[#F4E3C8] rounded-2xl p-3.5 text-sm font-medium text-[#2B1B13] focus:ring-2 focus:ring-[#C9974D] focus:border-[#C9974D] transition-all disabled:opacity-60"
              required
            />
            <p className="text-[11px] text-[#6B4028]">Texto visible en la tarjeta sustentable del menú y explicado por Tita.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Sellos necesarios para recompensa VIP */}
            <div className="space-y-1.5 sm:col-span-1">
              <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider font-serif flex items-center gap-2">
                <Award className="w-4 h-4 text-[#C9974D]" />
                <span>Sellos VIP Necesarios</span>
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={vipStampsRequired}
                onChange={(e) => setVipStampsRequired(Number(e.target.value))}
                disabled={isSaving}
                className="w-full bg-[#FFFDF9] border border-[#F4E3C8] rounded-2xl p-3.5 text-sm font-medium text-[#2B1B13] focus:ring-2 focus:ring-[#C9974D] focus:border-[#C9974D] transition-all disabled:opacity-60"
                required
              />
              <p className="text-[11px] text-[#6B4028]">Número de compras para liberar premio (ej. 5).</p>
            </div>

            {/* Descripción de recompensa VIP */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider font-serif flex items-center gap-2">
                <Gift className="w-4 h-4 text-[#C9974D]" />
                <span>Descripción de la Recompensa VIP</span>
              </label>
              <input
                type="text"
                value={vipRewardDescription}
                onChange={(e) => setVipRewardDescription(e.target.value)}
                disabled={isSaving}
                placeholder="Al acumular 5 sellos, el cliente obtiene gratis un café americano o postre del día."
                className="w-full bg-[#FFFDF9] border border-[#F4E3C8] rounded-2xl p-3.5 text-sm font-medium text-[#2B1B13] focus:ring-2 focus:ring-[#C9974D] focus:border-[#C9974D] transition-all disabled:opacity-60"
                required
              />
              <p className="text-[11px] text-[#6B4028]">Premio otorgado al completar los sellos de la tarjeta.</p>
            </div>
          </div>

          {/* Políticas de servicio */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider font-serif flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#C9974D]" />
              <span>Políticas de Servicio y Formas de Pago</span>
            </label>
            <textarea
              rows={2}
              value={servicePolicies}
              onChange={(e) => setServicePolicies(e.target.value)}
              disabled={isSaving}
              placeholder="Servicio en comedor, para llevar y a domicilio. Formas de pago: efectivo, transferencia y tarjeta."
              className="w-full bg-[#FFFDF9] border border-[#F4E3C8] rounded-2xl p-3.5 text-sm font-medium text-[#2B1B13] focus:ring-2 focus:ring-[#C9974D] focus:border-[#C9974D] transition-all disabled:opacity-60"
              required
            />
            <p className="text-[11px] text-[#6B4028]">Modalidades de servicio disponibles y medios de pago recibidos.</p>
          </div>

          {/* Promociones vigentes */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider font-serif flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#C9974D]" />
              <span>Promociones Vigentes</span>
            </label>
            <textarea
              rows={2}
              value={activePromotions}
              onChange={(e) => setActivePromotions(e.target.value)}
              disabled={isSaving}
              placeholder="10% de descuento por traer recipientes propios."
              className="w-full bg-[#FFFDF9] border border-[#F4E3C8] rounded-2xl p-3.5 text-sm font-medium text-[#2B1B13] focus:ring-2 focus:ring-[#C9974D] focus:border-[#C9974D] transition-all disabled:opacity-60"
              required
            />
            <p className="text-[11px] text-[#6B4028]">Paquetes, descuentos y promociones que Tita debe comunicar al cliente.</p>
          </div>
        </div>

        {/* ========================================================= */}
        {/* PANEL DE VISTA PREVIA INTEGRAL                            */}
        {/* ========================================================= */}
        <div className="bg-[#FFFDF9] border border-[#F4E3C8] rounded-2xl p-4.5 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-[#A86B3D] uppercase tracking-wider font-serif">
            <Info className="w-3.5 h-3.5" />
            <span>Vista previa de cómo lo comunicará Tita y el sistema:</span>
          </div>
          <div className="text-xs text-[#2B1B13] bg-white border border-[#F4E3C8]/70 rounded-xl p-3 space-y-2 font-sans">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <p>📍 <strong>Ubicación:</strong> {address.trim() || '—'}</p>
              <p>🕒 <strong>Horario:</strong> {openingHours.trim() || '—'}</p>
              <p>📞 <strong>WhatsApp:</strong> {whatsapp.trim() || '—'}</p>
              <p>🚚 <strong>Envío a domicilio:</strong> ${deliveryFee} MXN</p>
              <p>🌿 <strong>Descuento eco:</strong> {ecoDiscountPercent}% ({ecoDiscountDescription})</p>
              <p>⭐ <strong>Reglas VIP:</strong> {vipStampsRequired} sellos ({vipRewardDescription})</p>
            </div>
            <div className="pt-2 border-t border-[#F4E3C8]/60 space-y-1">
              <p>📋 <strong>Políticas:</strong> {servicePolicies}</p>
              <p>🎉 <strong>Promociones:</strong> {activePromotions}</p>
            </div>
          </div>
        </div>

        {/* Acciones del Formulario */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#F4E3C8]">
          <button
            type="button"
            onClick={handleResetToCurrent}
            disabled={isSaving}
            className="w-full sm:w-auto px-5 py-3 rounded-2xl border border-[#F4E3C8] text-[#6B4028] hover:text-[#2B1B13] hover:bg-[#FFF7EA] font-semibold text-xs transition-all cursor-pointer disabled:opacity-50"
          >
            Restablecer valores actuales
          </button>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto bg-[#3A2418] hover:bg-[#2B1B13] text-[#FFF7EA] font-bold py-3.5 px-8 rounded-2xl transition-all shadow-md flex items-center justify-center gap-2.5 font-serif text-sm cursor-pointer disabled:opacity-60 active:scale-98"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-[#C9974D]" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 text-[#C9974D]" />
                <span>Guardar y Sincronizar</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
