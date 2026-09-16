import React from 'react';
import { BusinessOnboarding, DemoBusinessProfile } from './BusinessOnboarding';

const DEMO_BUSINESS_PROFILE_KEY = 'giote_business_new_profile_v1';

export const BusinessOnboardingDemo: React.FC = () => {
  const handleCancel = () => {
    window.location.hash = '#business';
  };

  const handleComplete = (profile: DemoBusinessProfile) => {
    try {
      localStorage.setItem(DEMO_BUSINESS_PROFILE_KEY, JSON.stringify(profile));
    } catch {
      // El onboarding sigue funcionando aunque el navegador bloquee storage.
    }

    window.location.hash = '#business';
  };

  return <BusinessOnboarding onCancel={handleCancel} onComplete={handleComplete} />;
};
