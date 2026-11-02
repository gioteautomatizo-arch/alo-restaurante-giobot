import React, { useEffect, useRef, useState } from 'react';
import { getCurrentAuthUser } from '../../lib/firebase';
import { saveBusinessBranding } from '../../lib/businessBrandingService';
import { syncPublicProfileIfNeeded } from '../../lib/businessPublicProfileService';
import type { RestaurantTenant } from '../../lib/restaurantCore';
import type { StaffUser } from '../../types';
import type { BusinessRole } from '../../lib/restaurantCore';
import { legacyVipStaffRole } from '../../lib/businessVipPermissions';
import { VipClientsAdminView } from '../admin/VipClientsAdminView';

const input = 'w-full rounded-xl border border-[#3A3022] bg-[#0B0B0B] px-3 py-3 text-sm text-[#F7F7F7] outline-none focus:border-[#D6A34A]';

/** Tarjeta VIP del negocio: configuración (dueño) y administración de socios y sellos. */
export const BusinessVipPanel: React.FC<{
  businessId: string;
  business: RestaurantTenant;
  isOwner: boolean;
  managerRole: BusinessRole;
  isPublished: boolean;
  onBusinessUpdated: (business: RestaurantTenant) => void;
}> = ({ businessId, business, isOwner, managerRole, isPublished, onBusinessUpdated }) => {
  const b = business.branding;
  const [enabled, setEnabled] = useState(!!b.vipEnabled);
  const [programName, setProgramName] = useState(b.loyaltyProgramName || `${b.restaurantName} VIP`);
  const [stamps, setStamps] = useState(String(b.vipStampsRequired || 5));
  const [reward, setReward] = useState(b.vipRewardDescription || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  // El guardado pertenece a un UID y tenant. No confirmar respuestas tardías.
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const contextRef = useRef(businessId);
  contextRef.current = businessId;
  useEffect(() => () => { mountedRef.current = false; }, []);
  const isCurrent = (id: string, uid: string) =>
    mountedRef.current && contextRef.current === id && getCurrentAuthUser()?.uid === uid;

  const user = getCurrentAuthUser();
  const staff: StaffUser = {
    id: user?.uid || 'owner',
    name: user?.displayName || user?.email || 'Responsable',
    username: user?.email || 'owner',
    role: legacyVipStaffRole(managerRole),
    active: true,
    createdAt: new Date().toISOString(),
  };

  const save = async () => {
    if (!isOwner || busyRef.current) return;
    const uid = getCurrentAuthUser()?.uid;
    if (!uid) {
      setError('Tu sesión expiró. Inicia sesión nuevamente.');
      return;
    }
    const count = Math.round(Number(stamps));
    if (!Number.isFinite(count) || count < 1 || count > 20) {
      setError('Los sellos deben ser entre 1 y 20.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setMessage('');
    setError('');
    const updated: RestaurantTenant = {
      ...business,
      branding: { ...b, vipEnabled: enabled, loyaltyProgramName: programName.trim(), vipStampsRequired: count, vipRewardDescription: reward.trim() },
    };
    try {
      if (!isCurrent(businessId, uid)) throw new Error('La sesión cambió antes de guardar VIP.');
      // La escritura privada comparte el CAS de branding: no borrar ediciones
      // de identidad o VIP realizadas en otra pestaña ni cruzar tenants.
      await saveBusinessBranding(business, updated.branding);
      if (!isCurrent(businessId, uid)) return;
      // El guardado privado YA se confirmó. Una falla de sincronización pública
      // no debe ocultar este hecho ni dejar la vista con datos anteriores.
      onBusinessUpdated(updated);
      if (!isPublished) {
        setMessage('Tarjeta VIP guardada. La página pública está oculta.');
        return;
      }
      try {
        // A diferencia de publicar manualmente, la sincronización automática
        // nunca debe re-publicar una página ocultada desde otra sesión.
        if (!isCurrent(businessId, uid)) return;
        const synced = await syncPublicProfileIfNeeded(businessId, updated);
        if (isCurrent(businessId, uid)) {
          setMessage(synced
            ? 'Tarjeta VIP guardada y página pública actualizada.'
            : 'Tarjeta VIP guardada. Comprueba si tu página pública sigue publicada.');
        }
      } catch (syncError) {
        console.warn('[BusinessVipPanel] no se pudo sincronizar la página pública:', syncError);
        if (isCurrent(businessId, uid)) {
          setMessage('Tarjeta VIP guardada, pero no se confirmó la actualización pública. Revisa la publicación.');
        }
      }
    } catch (e) {
      console.warn('[BusinessVipPanel] guardado VIP rechazado:', e);
      if (isCurrent(businessId, uid)) {
        const reason = e && typeof e === 'object' && 'message' in e
          && typeof e.message === 'string' ? e.message : '';
        setError(reason.startsWith('CONFLICTO_IDENTIDAD:')
          ? reason.slice('CONFLICTO_IDENTIDAD:'.length).trim()
          : 'No se pudo guardar la tarjeta VIP. Revisa tus permisos o la conexión y reintenta.');
      }
    } finally {
      if (isCurrent(businessId, uid)) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#3A3022] bg-[#111111] p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg font-black text-[#F7F7F7]">Tarjeta VIP</h2>
            <p className="text-xs text-[#B7B7B7]">Tus clientes juntan sellos y ganan un premio. Se muestra en tu página pública.</p>
          </div>
          <button type="button" role="switch" aria-checked={enabled} aria-label="Activar tarjeta VIP" disabled={!isOwner} onClick={() => setEnabled((v) => !v)} className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${enabled ? 'bg-[#D6A34A]' : 'bg-[#3A3022]'}`}>
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
        <input value={programName} onChange={(e) => setProgramName(e.target.value)} disabled={!isOwner} placeholder="Nombre del programa (ej. Giomero VIP)" className={input} />
        <div className="grid grid-cols-3 gap-3">
          <input type="number" inputMode="numeric" min={1} max={20} value={stamps} onChange={(e) => setStamps(e.target.value)} disabled={!isOwner} aria-label="Sellos necesarios" className={input} />
          <input value={reward} onChange={(e) => setReward(e.target.value)} disabled={!isOwner} placeholder="Premio (ej. un taco gratis)" className={`${input} col-span-2`} />
        </div>
        <p className="text-[11px] text-[#B7B7B7]">Sellos necesarios para ganar el premio, y cuál es el premio.</p>
        {message && <p role="status" className="text-xs font-semibold text-[#E3BC6B]">{message}</p>}
        {error && <p role="alert" className="text-xs font-semibold text-red-300">{error}</p>}
        {isOwner && <button type="button" disabled={busy} onClick={() => void save()} className="rounded-xl bg-[#D6A34A] px-5 py-3 text-sm font-black text-[#050505] disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar tarjeta VIP'}</button>}
      </section>

      <section className="rounded-2xl border border-[#3A3022] bg-[#111111] p-1 text-[#F7F7F7]">
        <VipClientsAdminView currentUser={staff} businessId={businessId} stampsRequiredOverride={Math.max(1, Math.round(Number(b.vipStampsRequired) || 5))} rewardOverride={b.vipRewardDescription} programNameOverride={b.loyaltyProgramName || `${b.restaurantName} VIP`} />
      </section>
    </div>
  );
};
