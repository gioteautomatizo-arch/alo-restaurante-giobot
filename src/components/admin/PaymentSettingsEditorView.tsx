import React, { useEffect, useState } from 'react';
import { CheckCircle2, Landmark, Save, ShieldCheck } from 'lucide-react';
import { StaffUser } from '../../types';
import {
  EMPTY_PAYMENT_SETTINGS,
  PaymentSettings,
  savePaymentSettings,
  subscribeToPaymentSettings,
} from '../../lib/paymentSettingsService';

interface PaymentSettingsEditorViewProps {
  currentUser: StaffUser;
}

export const PaymentSettingsEditorView: React.FC<PaymentSettingsEditorViewProps> = ({ currentUser }) => {
  const [settings, setSettings] = useState<PaymentSettings>(EMPTY_PAYMENT_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeToPaymentSettings(setSettings), []);

  const updateField = (field: keyof PaymentSettings, value: string) => {
    setSettings((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await savePaymentSettings(settings, currentUser);
      setSettings(saved);
      setSuccess('Datos de transferencia actualizados y sincronizados.');
      window.setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'No se pudieron guardar los datos bancarios.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white rounded-3xl border border-[#F4E3C8] p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-violet-50 border border-violet-200 flex items-center justify-center shrink-0">
          <Landmark className="w-5 h-5 text-violet-700" />
        </div>
        <div>
          <h3 className="font-serif font-bold text-lg text-[#2B1B13]">Transferencias desde el QR</h3>
          <p className="text-xs text-[#6B4028] mt-0.5">
            Estos datos son los que verá el cliente al pedir la cuenta y elegir Transferencia.
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-3.5 py-3 text-[11px] text-emerald-900 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
        <span>Los comprobantes quedan visibles sólo para personal autenticado. El cliente nunca puede marcar su pago como confirmado.</span>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs font-bold text-[#5C3825]">
          Banco
          <input value={settings.bankName} onChange={(e) => updateField('bankName', e.target.value)} placeholder="Ej. BBVA" className="mt-1 w-full rounded-xl border border-[#DEC8AE] bg-[#FFFDF9] px-3 py-2.5 outline-none" />
        </label>

        <label className="text-xs font-bold text-[#5C3825]">
          Titular
          <input value={settings.accountHolder} onChange={(e) => updateField('accountHolder', e.target.value)} placeholder="Nombre del titular" className="mt-1 w-full rounded-xl border border-[#DEC8AE] bg-[#FFFDF9] px-3 py-2.5 outline-none" />
        </label>

        <label className="text-xs font-bold text-[#5C3825]">
          CLABE (18 dígitos)
          <input inputMode="numeric" value={settings.clabe} onChange={(e) => updateField('clabe', e.target.value.replace(/\D/g, '').slice(0, 18))} placeholder="000000000000000000" className="mt-1 w-full rounded-xl border border-[#DEC8AE] bg-[#FFFDF9] px-3 py-2.5 outline-none" />
        </label>

        <label className="text-xs font-bold text-[#5C3825]">
          Número de cuenta (opcional)
          <input value={settings.accountNumber} onChange={(e) => updateField('accountNumber', e.target.value)} placeholder="Cuenta bancaria" className="mt-1 w-full rounded-xl border border-[#DEC8AE] bg-[#FFFDF9] px-3 py-2.5 outline-none" />
        </label>

        <label className="sm:col-span-2 text-xs font-bold text-[#5C3825]">
          Instrucciones para el cliente
          <textarea rows={3} value={settings.transferInstructions} onChange={(e) => updateField('transferInstructions', e.target.value)} className="mt-1 w-full rounded-xl border border-[#DEC8AE] bg-[#FFFDF9] px-3 py-2.5 outline-none resize-y" />
        </label>

        {error && <div className="sm:col-span-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">{error}</div>}
        {success && <div className="sm:col-span-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{success}</div>}

        <button type="submit" disabled={busy} className="sm:col-span-2 rounded-2xl bg-[#3A2418] text-[#FFF7EA] py-3 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50">
          <Save className="w-4 h-4 text-[#C9974D]" />
          {busy ? 'Guardando…' : 'Guardar datos de transferencia'}
        </button>
      </form>
    </section>
  );
};
