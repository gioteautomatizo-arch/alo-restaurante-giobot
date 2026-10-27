import React, { useEffect, useRef, useState } from 'react';
import { BusinessOnboarding, DemoBusinessProfile } from './BusinessOnboarding';
import { registerBusiness } from '../../lib/businessAuthService';
import { getBusinessTemplateConfig } from '../../data/businessTemplates';

// Un rechazo de Firestore no demuestra que Auth no haya creado la cuenta ni
// que una respuesta de red perdida no haya confirmado el lote. No atribuir
// automáticamente permission-denied a una congelación de registros.
function registrationErrorMessage(err: unknown): string {
  const failure = err as { code?: string; message?: string } | null;
  if (failure?.code === 'permission-denied' || failure?.code === 'firestore/permission-denied') {
    return 'No pudimos confirmar el alta. El registro podría estar temporalmente restringido o tu cuenta no tener permisos. Tu cuenta de acceso podría existir: revisa Mis negocios con el mismo correo antes de reintentar.';
  }
  if (failure?.code === 'unavailable' || failure?.code === 'deadline-exceeded' || failure?.code === 'auth/network-request-failed') {
    return 'No recibimos confirmación del alta por un problema de conexión. Es posible que el negocio sí se haya guardado. Revisa Mis negocios con el mismo correo antes de reintentar para evitar duplicados.';
  }
  return typeof failure?.message === 'string' && failure.message
    ? failure.message
    : 'No pudimos confirmar el alta. Revisa Mis negocios antes de reintentar.';
}

export const BusinessOnboardingDemo: React.FC = () => {
  const [isSaving, setIsSaving] = useState(false);
  // Ref síncrona: dos callbacks antes del próximo render no pueden duplicar el alta.
  const savingRef = useRef(false);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = () => {
    window.location.hash = '#business';
  };

  const handleComplete = async (profile: DemoBusinessProfile) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    setError(null);

    try {
      await registerBusiness({
        businessName: profile.name,
        businessType: profile.businessType,
        handle: profile.handle,
        email: profile.email,
        password: profile.password,
        logoUrl: profile.logoDataUrl,
        templateId: profile.type,
        capabilities: getBusinessTemplateConfig(profile.type).capabilities,
        assistantName: profile.assistantName,
        assistantMode: profile.assistantMode,
      });
      // Una respuesta tardía no debe secuestrar otra ruta ni un componente desmontado.
      if (mountedRef.current && window.location.hash === '#business-new') window.location.hash = '#business';
    } catch (err: any) {
      if (mountedRef.current && window.location.hash === '#business-new') {
        setError(registrationErrorMessage(err));
      }
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setIsSaving(false);
    }
  };

  return (
    <div>
      {error && (
        <div role="alert" style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 50 }} className="max-w-sm w-[92%] rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 shadow-lg">
          <p>{error}</p>
          <button type="button" onClick={handleCancel} className="mt-3 rounded-xl bg-rose-800 px-4 py-2 text-xs font-bold text-white">Revisar mis negocios</button>
        </div>
      )}
      <BusinessOnboarding onCancel={handleCancel} onComplete={handleComplete} />
      {isSaving && (
        <div style={{ position: 'fixed', inset: 0 }} className="bg-black/40 flex items-center justify-center z-40">
          <div className="rounded-2xl bg-white px-6 py-4 text-sm font-bold text-[#2B1B13]">Creando tu negocio…</div>
        </div>
      )}
    </div>
  );
};
