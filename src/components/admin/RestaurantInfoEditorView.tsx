import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Award,
  Bot,
  CheckCircle2,
  Copy,
  Gift,
  Info,
  MapPin,
  Percent,
  Phone,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Store,
  Tag,
  Truck,
  Clock,
} from 'lucide-react';
import { StaffUser, RestaurantInfo } from '../../types';
import { getRestaurantInfo, saveRestaurantInfo } from '../../lib/adminStorage';
import {
  parseWeeklyPromotions,
  serializeWeeklyPromotions,
  WeeklyPromotionMap,
} from '../../lib/promotions';
import { WeeklyPromotionsEditor } from './WeeklyPromotionsEditor';
import {
  DAY_KEYS,
  DAY_LABELS,
  DayKey,
  WeeklySchedule,
  resolveWeeklySchedule,
  formatWeeklyScheduleSummary,
  getMexicoCityDateTime,
} from '../../lib/scheduleService';

interface RestaurantInfoEditorViewProps {
  currentUser: StaffUser;
  onRefreshStats?: () => void;
}

const DEFAULT_ECO = '10% de descuento si el cliente trae sus propios recipientes o termo.';
const DEFAULT_REWARD = 'Al acumular 5 sellos, el cliente obtiene gratis un café americano o postre del día.';
const DEFAULT_POLICIES = 'Servicio en comedor, para llevar y a domicilio. Formas de pago: efectivo, transferencia y tarjeta.';

export const RestaurantInfoEditorView: React.FC<RestaurantInfoEditorViewProps> = ({ currentUser, onRefreshStats }) => {
  const initialInfo = useMemo(() => getRestaurantInfo(), []);

  const [address, setAddress] = useState(initialInfo.address);
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule>(() =>
    resolveWeeklySchedule(initialInfo)
  );
  const [whatsapp, setWhatsapp] = useState(initialInfo.whatsapp);
  const [ecoDiscountPercent, setEcoDiscountPercent] = useState(initialInfo.ecoDiscountPercent ?? 10);
  const [ecoDiscountDescription, setEcoDiscountDescription] = useState(initialInfo.ecoDiscountDescription || DEFAULT_ECO);
  const [deliveryFee, setDeliveryFee] = useState(initialInfo.deliveryFee ?? 25);
  const [vipStampsRequired, setVipStampsRequired] = useState(initialInfo.vipStampsRequired ?? 5);
  const [vipRewardDescription, setVipRewardDescription] = useState(initialInfo.vipRewardDescription || DEFAULT_REWARD);
  const [servicePolicies, setServicePolicies] = useState(initialInfo.servicePolicies || DEFAULT_POLICIES);
  const [weeklyPromotions, setWeeklyPromotions] = useState<WeeklyPromotionMap>(() =>
    parseWeeklyPromotions(initialInfo.activePromotions)
  );
  const [lastSavedInfo, setLastSavedInfo] = useState<RestaurantInfo>(initialInfo);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const hydrate = (info: RestaurantInfo) => {
    setAddress(info.address);
    setWeeklySchedule(resolveWeeklySchedule(info));
    setWhatsapp(info.whatsapp);
    setEcoDiscountPercent(info.ecoDiscountPercent ?? 10);
    setEcoDiscountDescription(info.ecoDiscountDescription || DEFAULT_ECO);
    setDeliveryFee(info.deliveryFee ?? 25);
    setVipStampsRequired(info.vipStampsRequired ?? 5);
    setVipRewardDescription(info.vipRewardDescription || DEFAULT_REWARD);
    setServicePolicies(info.servicePolicies || DEFAULT_POLICIES);
    setWeeklyPromotions(parseWeeklyPromotions(info.activePromotions));
  };

  useEffect(() => {
    const handleDataChange = () => {
      if (isSaving) return;
      const latest = getRestaurantInfo();
      setLastSavedInfo(latest);
      hydrate(latest);
    };

    window.addEventListener('alo_admin_data_updated', handleDataChange);
    window.addEventListener('storage', handleDataChange);
    return () => {
      window.removeEventListener('alo_admin_data_updated', handleDataChange);
      window.removeEventListener('storage', handleDataChange);
    };
  }, [isSaving]);

  const previewWhatsappRaw = whatsapp.replace(/\D/g, '');
  const activePromotionsText = serializeWeeklyPromotions(weeklyPromotions);
  const currentMexicoDay = useMemo(() => getMexicoCityDateTime().dayKey, []);

  const handleToggleDayClosed = (day: DayKey, closed: boolean) => {
    setWeeklySchedule((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        closed,
      },
    }));
  };

  const handleUpdateDayTime = (day: DayKey, field: 'openTime' | 'closeTime', value: string) => {
    setWeeklySchedule((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
      },
    }));
  };

  const handleCopyDayToAll = (sourceDay: DayKey) => {
    const source = weeklySchedule[sourceDay];
    setWeeklySchedule((prev) => {
      const next = { ...prev };
      for (const key of DAY_KEYS) {
        next[key] = {
          closed: source.closed,
          openTime: source.openTime,
          closeTime: source.closeTime,
        };
      }
      return next;
    });
    setSuccessMsg(`Horario de ${DAY_LABELS[sourceDay]} copiado a todos los días de la semana.`);
    window.setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (currentUser.role === 'EMPLEADO') {
      setErrorMsg('Solo Encargados o Administradores pueden modificar la información del restaurante.');
      return;
    }

    const cleanAddress = address.trim();
    const cleanWhatsapp = whatsapp.trim();
    const cleanWhatsappRaw = cleanWhatsapp.replace(/\D/g, '');
    const summaryOpeningHours = formatWeeklyScheduleSummary(weeklySchedule);

    if (!cleanAddress || cleanWhatsappRaw.length < 8) {
      setErrorMsg('Revisa dirección y WhatsApp antes de guardar.');
      return;
    }

    setIsSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const updated = await saveRestaurantInfo(
        {
          restaurantId: 'alo-restaurante',
          address: cleanAddress,
          openingHours: summaryOpeningHours,
          weeklySchedule: weeklySchedule,
          whatsapp: cleanWhatsapp,
          whatsappRaw: cleanWhatsappRaw,
          ecoDiscountPercent: Number(ecoDiscountPercent) || 0,
          ecoDiscountDescription: ecoDiscountDescription.trim(),
          deliveryFee: Number(deliveryFee) || 0,
          vipStampsRequired: Math.max(1, Number(vipStampsRequired) || 5),
          vipRewardDescription: vipRewardDescription.trim(),
          servicePolicies: servicePolicies.trim(),
          activePromotions: activePromotionsText,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.name,
        },
        currentUser
      );

      setLastSavedInfo(updated);
      hydrate(updated);
      setSuccessMsg('Información y horario semanal actualizados y sincronizados');
      window.setTimeout(() => setSuccessMsg(null), 4000);
      onRefreshStats?.();
    } catch (error: any) {
      console.error('Error al guardar restaurant_info en Firestore:', error);
      hydrate(lastSavedInfo);
      setErrorMsg(error?.message || 'No se pudieron guardar los cambios.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = 'w-full bg-[#FFFDF9] border border-[#E7D7C4] rounded-2xl p-3.5 text-sm font-medium text-[#2B1B13] focus:ring-2 focus:ring-[#C9974D] focus:border-[#C9974D] disabled:opacity-60';
  const labelClass = 'flex items-center gap-2 text-xs font-bold text-[#2B1B13] uppercase tracking-wider font-serif';

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-sm font-medium flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl text-sm font-medium flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600" />
          {errorMsg}
        </div>
      )}

      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#F4E3C8] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFF7EA] text-[#A86B3D] text-xs font-bold uppercase tracking-wider mb-1 border border-[#F4E3C8]">
            <Store className="w-3.5 h-3.5" /> Datos oficiales del establecimiento
          </div>
          <h2 className="font-serif font-bold text-xl sm:text-2xl text-[#2B1B13]">Información del Restaurante</h2>
          <p className="text-xs text-[#6B4028] mt-1">Contacto, servicio, VIP y promociones semanales en una sola fuente de verdad.</p>
        </div>
        {lastSavedInfo.updatedAt && (
          <div className="bg-[#FFF7EA] border border-[#F4E3C8] px-3.5 py-2 rounded-2xl text-right shrink-0">
            <span className="text-[10px] text-[#A86B3D] font-bold block uppercase">Última actualización</span>
            <span className="text-xs font-semibold text-[#2B1B13]">{new Date(lastSavedInfo.updatedAt).toLocaleString('es-MX')}</span>
          </div>
        )}
      </div>

      <div className="bg-gradient-to-r from-[#FFFDF9] to-[#FFF7EA] border border-[#C9974D]/40 rounded-3xl p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-2xl bg-[#3A2418] text-[#C9974D] flex items-center justify-center shrink-0"><Bot className="w-5 h-5" /></div>
        <div className="text-xs text-[#6B4028]">
          <p className="font-bold text-[#2B1B13] flex items-center gap-1.5">Sincronización con Tita y la página pública <Sparkles className="w-3.5 h-3.5 text-[#C9974D]" /></p>
          <p className="mt-1">Al guardar, Tita y la portada usan las promociones y reglas actualizadas.</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-3xl border border-[#F4E3C8] p-5 sm:p-7 shadow-xs space-y-7">
        <section className="space-y-4">
          <div className="border-b border-[#F4E3C8] pb-3">
            <h3 className="font-serif font-bold text-base text-[#2B1B13] flex items-center gap-2"><Store className="w-4 h-4 text-[#C9974D]" />1. Contacto y ubicación</h3>
          </div>
          <div className="space-y-1.5"><label className={labelClass}><MapPin className="w-4 h-4 text-[#C9974D]" />Dirección completa</label><input value={address} onChange={(e) => setAddress(e.target.value)} disabled={isSaving} className={inputClass} /></div>
          {/* Horario de atención semanal de 7 días */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#F4E3C8] pb-2">
              <div>
                <label className={labelClass}>
                  <Clock className="w-4 h-4 text-[#C9974D]" />
                  Horario de atención por día (Lunes a Domingo)
                </label>
                <p className="text-xs text-[#6B4028] mt-0.5">
                  Establece las horas de apertura y cierre para cada día o márcalo como cerrado.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {DAY_KEYS.map((dayKey) => {
                const daySched = weeklySchedule[dayKey] || { closed: false, openTime: '09:00', closeTime: '17:30' };
                const isToday = currentMexicoDay === dayKey;

                return (
                  <div
                    key={dayKey}
                    className={`p-3 sm:p-3.5 rounded-2xl border transition-all ${
                      isToday
                        ? 'bg-[#FFF9EE] border-[#C9974D]/50 shadow-xs ring-1 ring-[#C9974D]/30'
                        : 'bg-[#FFFDF9] border-[#E7D7C4]'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Día */}
                      <div className="flex items-center gap-2 min-w-[110px]">
                        <span className="font-serif font-bold text-sm text-[#2B1B13]">
                          {DAY_LABELS[dayKey]}
                        </span>
                        {isToday && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#C9974D] text-[#FFF7EA]">
                            Hoy
                          </span>
                        )}
                      </div>

                      {/* Interruptor Cerrado */}
                      <label className="inline-flex items-center gap-2 cursor-pointer shrink-0 select-none bg-white px-2.5 py-1.5 rounded-xl border border-[#E7D7C4]">
                        <input
                          type="checkbox"
                          checked={daySched.closed}
                          onChange={(e) => handleToggleDayClosed(dayKey, e.target.checked)}
                          disabled={isSaving}
                          className="w-4 h-4 rounded text-[#A86B3D] focus:ring-[#C9974D] border-gray-300 cursor-pointer"
                        />
                        <span
                          className={`text-xs font-bold ${
                            daySched.closed ? 'text-rose-600' : 'text-[#6B4028]'
                          }`}
                        >
                          {daySched.closed ? 'Cerrado' : 'Abierto'}
                        </span>
                      </label>

                      {/* Horas de apertura y cierre */}
                      <div className="flex items-center gap-2 grow sm:justify-center">
                        {daySched.closed ? (
                          <span className="text-xs text-rose-500 font-semibold italic bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200">
                            Cerrado todo el día
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-[#8A6A55] font-medium">Apertura:</span>
                              <input
                                type="time"
                                value={daySched.openTime}
                                onChange={(e) => handleUpdateDayTime(dayKey, 'openTime', e.target.value)}
                                disabled={isSaving || daySched.closed}
                                className="bg-white border border-[#E7D7C4] rounded-xl px-2.5 py-1 text-xs font-semibold text-[#2B1B13] focus:ring-1 focus:ring-[#C9974D] focus:border-[#C9974D]"
                              />
                            </div>
                            <span className="text-xs text-[#8A6A55]">—</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-[#8A6A55] font-medium">Cierre:</span>
                              <input
                                type="time"
                                value={daySched.closeTime}
                                onChange={(e) => handleUpdateDayTime(dayKey, 'closeTime', e.target.value)}
                                disabled={isSaving || daySched.closed}
                                className="bg-white border border-[#E7D7C4] rounded-xl px-2.5 py-1 text-xs font-semibold text-[#2B1B13] focus:ring-1 focus:ring-[#C9974D] focus:border-[#C9974D]"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Botón Copiar a todos los días */}
                      <button
                        type="button"
                        onClick={() => handleCopyDayToAll(dayKey)}
                        disabled={isSaving}
                        title={`Copiar horario de ${DAY_LABELS[dayKey]} a toda la semana`}
                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold text-[#6B4028] hover:text-[#2B1B13] hover:bg-[#FFF7EA] border border-[#E7D7C4] transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                      >
                        <Copy className="w-3 h-3 text-[#C9974D]" />
                        <span>Copiar a todos</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5"><label className={labelClass}><Phone className="w-4 h-4 text-[#C9974D]" />WhatsApp de pedidos</label><input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} disabled={isSaving} className={inputClass} /><p className="text-[10px] text-[#8A6A55]">Número normalizado: {previewWhatsappRaw || '—'}</p></div>
        </section>

        <section className="space-y-4 border-t border-[#F4E3C8] pt-6">
          <div className="border-b border-[#F4E3C8] pb-3">
            <h3 className="font-serif font-bold text-base text-[#2B1B13] flex items-center gap-2"><Truck className="w-4 h-4 text-[#C9974D]" />2. Servicio y entrega</h3>
          </div>
          <div className="space-y-1.5"><label className={labelClass}><Truck className="w-4 h-4 text-[#C9974D]" />Costo de envío a domicilio ($ MXN)</label><input type="number" min="0" value={deliveryFee} onChange={(e) => setDeliveryFee(Number(e.target.value))} disabled={isSaving} className={inputClass} /></div>
          <div className="space-y-1.5"><label className={labelClass}><ShieldCheck className="w-4 h-4 text-[#C9974D]" />Políticas de servicio y formas de pago</label><textarea rows={2} value={servicePolicies} onChange={(e) => setServicePolicies(e.target.value)} disabled={isSaving} className={inputClass} /></div>
        </section>

        <section className="space-y-4 border-t border-[#F4E3C8] pt-6">
          <div className="border-b border-[#F4E3C8] pb-3"><h3 className="font-serif font-bold text-base text-[#2B1B13] flex items-center gap-2"><Award className="w-4 h-4 text-[#C9974D]" />3. Cliente VIP</h3></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5"><label className={labelClass}><Award className="w-4 h-4 text-[#C9974D]" />Sellos necesarios</label><input type="number" min="1" max="20" value={vipStampsRequired} onChange={(e) => setVipStampsRequired(Number(e.target.value))} disabled={isSaving} className={inputClass} /></div>
            <div className="space-y-1.5 sm:col-span-2"><label className={labelClass}><Gift className="w-4 h-4 text-[#C9974D]" />Recompensa VIP</label><input value={vipRewardDescription} onChange={(e) => setVipRewardDescription(e.target.value)} disabled={isSaving} className={inputClass} /></div>
          </div>
        </section>

        <section className="space-y-4 border-t border-[#F4E3C8] pt-6">
          <div className="border-b border-[#F4E3C8] pb-3"><h3 className="font-serif font-bold text-base text-[#2B1B13] flex items-center gap-2"><Percent className="w-4 h-4 text-[#C9974D]" />4. Descuento ecológico</h3></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5"><label className={labelClass}><Percent className="w-4 h-4 text-[#C9974D]" />Porcentaje</label><input type="number" min="0" max="100" value={ecoDiscountPercent} onChange={(e) => setEcoDiscountPercent(Number(e.target.value))} disabled={isSaving} className={inputClass} /></div>
            <div className="space-y-1.5 sm:col-span-2"><label className={labelClass}><Tag className="w-4 h-4 text-[#C9974D]" />Descripción</label><input value={ecoDiscountDescription} onChange={(e) => setEcoDiscountDescription(e.target.value)} disabled={isSaving} className={inputClass} /></div>
          </div>
        </section>

        <section className="space-y-4 border-t border-[#F4E3C8] pt-6">
          <div className="border-b border-[#F4E3C8] pb-3">
            <h3 className="font-serif font-bold text-base text-[#2B1B13] flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#C9974D]" />5. Promociones semanales</h3>
            <p className="text-xs text-[#6B4028] mt-1">La dueña solo escribe o cambia la promoción del día y guarda. No necesita editar código ni tocar el menú manualmente.</p>
          </div>
          <WeeklyPromotionsEditor value={weeklyPromotions} onChange={setWeeklyPromotions} disabled={isSaving} />
        </section>

        <section className="bg-[#FFFDF9] border border-[#F4E3C8] rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#A86B3D] uppercase"><Info className="w-3.5 h-3.5" />Vista previa del sistema</div>
          <div className="text-xs text-[#2B1B13] bg-white border border-[#F4E3C8]/70 rounded-xl p-3 space-y-1.5">
            <p>📍 <strong>Ubicación:</strong> {address || '—'}</p>
            <p>🕒 <strong>Horario:</strong> {formatWeeklyScheduleSummary(weeklySchedule)}</p>
            <p>🚚 <strong>Envío:</strong> ${deliveryFee} MXN</p>
            <p>⭐ <strong>VIP:</strong> {vipStampsRequired} sellos · {vipRewardDescription}</p>
            <p>🌿 <strong>Eco:</strong> {ecoDiscountPercent}% · {ecoDiscountDescription}</p>
            <div className="pt-2 border-t border-[#F4E3C8]/60 whitespace-pre-line">🎉 <strong>Promociones:</strong>{'\n'}{activePromotionsText}</div>
          </div>
        </section>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#F4E3C8]">
          <button type="button" onClick={() => hydrate(lastSavedInfo)} disabled={isSaving} className="w-full sm:w-auto px-5 py-3 rounded-2xl border border-[#F4E3C8] text-[#6B4028] hover:bg-[#FFF7EA] font-semibold text-xs disabled:opacity-50">Restablecer valores actuales</button>
          <button type="submit" disabled={isSaving} className="w-full sm:w-auto bg-[#3A2418] hover:bg-[#2B1B13] text-[#FFF7EA] font-bold py-3.5 px-8 rounded-2xl shadow-md flex items-center justify-center gap-2.5 text-sm disabled:opacity-60">
            {isSaving ? <><RefreshCw className="w-4 h-4 animate-spin text-[#C9974D]" />Guardando...</> : <><Save className="w-4 h-4 text-[#C9974D]" />Guardar y sincronizar</>}
          </button>
        </div>
      </form>
    </div>
  );
};
