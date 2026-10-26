import React, { useEffect, useRef, useState } from 'react';
import { BusinessOnboarding, DemoBusinessProfile } from './BusinessOnboarding';
import { registerBusiness } from '../../lib/businessAuthService';
import { getBusinessTemplateConfig } from '../../data/businessTemplates';

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
        setError(err?.message || 'No se pudo crear el negocio. Intenta de nuevo.');
      }
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setIsSaving(false);
    }
  };

  return (
    <div>
      {error && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 50 }} className="max-w-sm w-[92%] rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 shadow-lg">
          {error}
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
