import React, { useEffect, useRef, useState } from 'react';
import { BusinessOnboarding, DemoBusinessProfile } from './BusinessOnboarding';
import { registerBusiness } from '../../lib/businessAuthService';
import { auth } from '../../lib/firebase';
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
  // Una respuesta de una pestaña/ruta anterior no debe redirigir el formulario
  // nuevo si el usuario salió y volvió a #business-new antes de que terminara.
  const routeEpochRef = useRef(0);
  useEffect(() => {
    mountedRef.current = true;
    const onHashChange = (event: HashChangeEvent) => {
      if (new URL(event.newURL).hash !== '#business-new') routeEpochRef.current += 1;
    };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = () => {
    routeEpochRef.current += 1;
    window.location.hash = '#business';
  };

  const handleComplete = async (profile: DemoBusinessProfile) => {
    if (savingRef.current) return;
    savingRef.current = true;
    const requestRouteEpoch = routeEpochRef.current;
    setIsSaving(true);
    setError(null);

    try {
      const result = await registerBusiness({
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
      // La misma ruta puede haberse abandonado y reabierto mientras el
      // servidor respondía: el hash final, por sí solo, no identifica la vista.
      if (!mountedRef.current || routeEpochRef.current !== requestRouteEpoch
        || window.location.hash !== '#business-new') return;
      // Auth se comparte entre pestañas. Si otra cuenta quedó activa tras el
      // commit, no presentar su portal como el del propietario recién creado.
      if (auth.currentUser?.uid !== result.membership.userId) {
        setError('La cuenta activa cambió durante el registro. El negocio podría haberse guardado en la cuenta anterior. Revisa Mis negocios con el correo usado para el alta antes de reintentar.');
        return;
      }
      window.location.hash = '#business';
    } catch (err: any) {
      if (mountedRef.current && routeEpochRef.current === requestRouteEpoch
        && window.location.hash === '#business-new') {
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
