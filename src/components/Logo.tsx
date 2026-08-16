import React from 'react';

interface LogoProps {
  variant?: 'full' | 'compact' | 'light' | 'dark' | 'icon-only';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({
  variant = 'full',
  size = 'md',
  className = '',
}) => {
  const isDark = variant === 'dark';
  const isLight = variant === 'light';

  // Sizing maps
  const heightClass = {
    sm: 'h-8',
    md: 'h-11',
    lg: 'h-16',
    xl: 'h-24',
  }[size];

  if (variant === 'icon-only') {
    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        <svg viewBox="0 0 100 100" className={`${heightClass} w-auto drop-shadow-xs`}>
          <circle cx="50" cy="50" r="46" fill={isLight ? '#ffffff' : '#1b3824'} />
          <text
            x="50"
            y="62"
            textAnchor="middle"
            fontFamily="'Playfair Display', Georgia, serif"
            fontWeight="900"
            fontSize="44"
            fill={isLight ? '#1b3824' : '#fcfaf6'}
          >
            ¡A!
          </text>
        </svg>
      </div>
    );
  }

  return (
    <div className={`inline-flex flex-col items-center select-none ${className}`}>
      {/* ¡ALÓ! Wordmark */}
      <div className="flex items-baseline tracking-tight">
        <span
          className={`font-serif font-black tracking-tight leading-none ${
            size === 'sm'
              ? 'text-xl'
              : size === 'md'
              ? 'text-2xl sm:text-3xl'
              : size === 'lg'
              ? 'text-4xl sm:text-5xl'
              : 'text-6xl sm:text-7xl'
          } ${
            isLight
              ? 'text-white drop-shadow-sm'
              : 'text-[#1b3824]'
          }`}
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          ¡ALÓ!
        </span>
      </div>

      {/* Decorative Olive Branch & Gold Bars */}
      <div className="flex items-center justify-center gap-1.5 w-full my-0.5">
        <span
          className={`h-[1.5px] rounded-full flex-1 ${
            isLight ? 'bg-[#d1a85b]' : 'bg-[#b48a44]'
          }`}
        />
        {/* Olive Branch SVG Illustration */}
        <svg
          viewBox="0 0 70 20"
          className={`${
            size === 'sm' ? 'w-7 h-2.5' : size === 'md' ? 'w-9 h-3' : 'w-14 h-4'
          } shrink-0`}
        >
          <path
            d="M 5,12 C 25,18 45,16 65,10"
            fill="none"
            stroke="#b48a44"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {/* Leaf 1 */}
          <path
            d="M 18,9 C 24,0 32,3 27,11 C 24,13 20,12 18,9 Z"
            fill={isLight ? '#4ade80' : '#1b3824'}
          />
          {/* Leaf 2 */}
          <path
            d="M 32,10 C 38,0 48,2 41,12 C 37,13 34,12 32,10 Z"
            fill={isLight ? '#86efac' : '#2e543c'}
          />
          {/* Leaf 3 */}
          <path
            d="M 46,12 C 55,4 63,8 57,15 C 53,16 48,15 46,12 Z"
            fill={isLight ? '#4ade80' : '#1b3824'}
          />
          {/* Olive fruit */}
          <ellipse
            cx="34"
            cy="16"
            rx="4"
            ry="2.5"
            transform="rotate(-15 34 16)"
            fill="#b48a44"
          />
        </svg>
        <span
          className={`h-[1.5px] rounded-full flex-1 ${
            isLight ? 'bg-[#d1a85b]' : 'bg-[#b48a44]'
          }`}
        />
      </div>

      {/* RESTAURANTE Subtitle */}
      <span
        className={`font-sans uppercase font-extrabold ${
          size === 'sm'
            ? 'text-[7px] tracking-[0.25em]'
            : size === 'md'
            ? 'text-[9px] sm:text-[10px] tracking-[0.3em]'
            : size === 'lg'
            ? 'text-xs tracking-[0.35em]'
            : 'text-sm tracking-[0.4em]'
        } ${
          isLight ? 'text-stone-200' : 'text-[#1b3824]'
        }`}
      >
        RESTAURANTE
      </span>
    </div>
  );
};
