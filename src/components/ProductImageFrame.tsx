import React from 'react';

interface ProductImageFrameProps {
  src?: string | null;
  alt: string;
  className?: string;
  imageClassName?: string;
  loading?: 'eager' | 'lazy';
}

/**
 * Mantiene intacto el tamaño del contenedor/tarjeta y compone la foto dentro de él.
 *
 * La capa de fondo llena el marco sin dejar huecos visuales y la capa principal usa
 * object-contain para conservar completa la taza, vaso o platillo. Así evitamos elegir
 * entre "producto cortado" (cover) y "producto demasiado pequeño" (contain puro).
 */
export const ProductImageFrame: React.FC<ProductImageFrameProps> = ({
  src,
  alt,
  className = '',
  imageClassName = '',
  loading = 'lazy',
}) => {
  return (
    <div className={`relative h-full w-full overflow-hidden bg-[#F4E3C8]/35 ${className}`}>
      {src ? (
        <>
          <img
            src={src}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-lg"
            loading={loading}
            decoding="async"
          />
          <div className="absolute inset-0 bg-[#FFF7EA]/18" aria-hidden="true" />
          <div className="relative z-[1] flex h-full w-full items-center justify-center overflow-hidden p-1.5 sm:p-2">
            <img
              src={src}
              alt={alt}
              className={`max-h-full max-w-full scale-[1.08] object-contain object-center drop-shadow-sm ${imageClassName}`}
              loading={loading}
              decoding="async"
            />
          </div>
        </>
      ) : null}
    </div>
  );
};
