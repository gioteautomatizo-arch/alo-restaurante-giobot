import React, { useEffect, useState } from 'react';
import { getRestaurantInfo, ADMIN_DATA_EVENT } from '../lib/adminStorage';

interface LogoProps {
  variant?: 'full' | 'compact' | 'light' | 'dark' | 'icon-only';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'header';
  className?: string;
  alt?: string;
}

export const Logo: React.FC<LogoProps> = ({
  size = 'md',
  className = '',
  alt = 'Restaurante Calientito',
}) => {
  // Logo editable por el negocio (admin → Información). Si no hay, se usa el original.
  const [customLogo, setCustomLogo] = useState(() => getRestaurantInfo().logoUrl || '');
  useEffect(() => {
    const update = () => setCustomLogo(getRestaurantInfo().logoUrl || '');
    window.addEventListener(ADMIN_DATA_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(ADMIN_DATA_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);

  // Sizing maps to maintain exact proportions without clipping or deformation
  const heightClass = {
    xs: 'h-8 w-8',
    sm: 'h-[38px] sm:h-[42px] w-[38px] sm:w-[42px]',
    md: 'h-10 sm:h-12 w-10 sm:w-12',
    header: 'h-[60px] w-[60px] md:h-[68px] md:w-[68px] lg:h-[72px] lg:w-[72px]',
    lg: 'h-20 sm:h-24 w-20 sm:w-24',
    xl: 'h-28 sm:h-32 w-28 sm:w-32',
  }[size];

  return (
    <div className={`inline-flex items-center justify-center select-none ${className}`}>
      <img
        src={customLogo || '/logo-calientito.png'}
        onError={(event) => {
          if (customLogo) event.currentTarget.src = '/logo-calientito.png';
        }}
        alt={alt}
        className={`${heightClass} max-w-full aspect-square object-contain shrink-0`}
        loading="eager"
      />
    </div>
  );
};

