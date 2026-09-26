import React, { useState } from 'react';
import { BusinessOnboarding, DemoBusinessProfile } from './BusinessOnboarding';
import { registerBusiness } from '../../lib/businessAuthService';
import { getBusinessTemplateConfig } from '../../data/businessTemplates';

export const BusinessOnboardingDemo: React.FC = () => {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = () => {
    window.location.hash = '#business';
  };

  const handleComplete = async (profile: DemoBusinessProfile) => {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);

    try {
      await registerBusiness({
        businessName: profile.name,
        handle: profile.handle,
        email: profile.email,
        password: profile.password,
        logoUrl: profile.logoDataUrl,
        templateId: profile.type,
        capabilities: getBusinessTemplateConfig(profile.type).capabilities,
      });
      window.location.hash = '#business';
    } catch (err: any) {
      setError(err?.message || 'No se pudo crear el negocio. Intenta de nuevo.');
      setIsSaving(false);
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
