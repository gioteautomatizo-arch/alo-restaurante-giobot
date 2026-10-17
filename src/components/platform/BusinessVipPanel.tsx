import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, getCurrentAuthUser } from '../../lib/firebase';
import { setBusinessPublication } from '../../lib/businessPublicProfileService';
import type { RestaurantTenant } from '../../lib/restaurantCore';
import type { StaffUser } from '../../types';
import { VipClientsAdminView } from '../admin/VipClientsAdminView';

const input = 'w-full rounded-xl border border-[#3A3022] bg-[#0B0B0B] px-3 py-3 text-sm text-[#F7F7F7] outline-none focus:border-[#D6A34A]';

/** Tarjeta VIP del negocio: configuración (dueño) y administración de socios y sellos. */
export const BusinessVipPanel: React.FC<{
  businessId: string;
  business: RestaurantTenant;
  isOwner: boolean;
  isPublished: boolean;
  onBusinessUpdated: (business: RestaurantTenant) => void;
}> = ({ businessId, business, isOwner, isPublished, onBusinessUpdated }) => {
  const b = business.branding;
  const [enabled, setEnabled] = useState(!!b.vipEnabled);
  const [programName, setProgramName] = useState(b.loyaltyProgramName || `${b.restaurantName} VIP`);
  const [stamps, setStamps] = useState(String(b.vipStampsRequired || 5));
  const [reward, setReward] = useState(b.vipRewardDescription || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const user = getCurrentAuthUser();
  const staff: StaffUser = {
    id: user?.uid || 'owner',
    name: user?.displayName || user?.email || 'Responsable',
    username: user?.email || 'owner',
    role: 'DUEÑA',
    active: true,
    createdAt: new Date().toISOString(),
  };

  const save = async () => {
    const count = Math.round(Number(stamps));
    if (!Number.isFinite(count) || count < 1 || count > 20) return setMessage('Los sellos deben ser entre 1 y 20.');
    setBusy(true);
    setMessage('');
    try {
      const updated: RestaurantTenant = {
        ...business,
        branding: { ...b, vipEnabled: enabled, loyaltyProgramName: programName.trim(), vipStampsRequired: count, vipRewardDescription: reward.trim() },
      };
      await updateDoc(doc(db, 'businesses', businessId), { branding: updated.branding });
      if (isPublished) await setBusinessPublication(businessId, updated, true);
      onBusinessUpdated(updated);
      setMessage(enabled ? 'Listo: tu tarjeta VIP ya aparece en tu página pública.' : 'Guardado. La tarjeta VIP no se muestra a tus clientes.');
    } catch (e) {
      console.warn('[BusinessVipPanel]', e);
      setMessage('No pudimos guardar. Solo el dueño puede cambiar la tarjeta VIP.');
    } finally {
      setBusy(false);
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
        {isOwner && <button type="button" disabled={busy} onClick={() => void save()} className="rounded-xl bg-[#D6A34A] px-5 py-3 text-sm font-black text-[#050505] disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar tarjeta VIP'}</button>}
      </section>

      <section className="rounded-2xl border border-[#3A3022] bg-[#111111] p-1 text-[#F7F7F7]">
        <VipClientsAdminView currentUser={staff} businessId={businessId} stampsRequiredOverride={Math.max(1, Math.round(Number(b.vipStampsRequired) || 5))} rewardOverride={b.vipRewardDescription} />
      </section>
    </div>
  );
};
