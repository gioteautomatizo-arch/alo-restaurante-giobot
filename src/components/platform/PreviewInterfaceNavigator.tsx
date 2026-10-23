import React, { useState } from 'react';
import { ChevronDown, Compass, ExternalLink, X } from 'lucide-react';

/**
 * Navegación EXCLUSIVA del entorno de desarrollo / AI Studio Preview.
 * No aparece en la app publicada ni concede permisos a negocios privados.
 * Ayuda a probar las rutas desde navegadores con teclado limitado (Xbox/iPad).
 */
export const PreviewInterfaceNavigator: React.FC = () => {
  const [open, setOpen] = useState(false);
  if (!import.meta.env.DEV) return null;

  const routes = [
    { label: 'Calientito · página pública', hash: '#negocio/alo-restaurante' },
    { label: 'Directorio · publicados', hash: '#explorar' },
    { label: 'Acceso para negocios', hash: '#business' },
    { label: 'Registrar negocio', hash: '#business-new' },
  ];

  return (
    <aside className="fixed bottom-4 right-4 z-[9999] w-[min(92vw,310px)] font-sans" aria-label="Navegación de prueba">
      {open && <div className="mb-2 rounded-2xl border border-amber-300 bg-[#171614] p-4 text-white shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <strong className="text-sm text-amber-300">Interfaces de prueba</strong>
          <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar accesos de prueba" className="rounded-lg p-1 text-white"><X className="h-4 w-4" /></button>
        </div>
        <nav className="space-y-2">
          {routes.map(({ label, hash }) => <a key={hash} href={hash} onClick={() => setOpen(false)} className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20">
            <span>{label}</span><ExternalLink className="h-4 w-4 shrink-0 text-amber-300" />
          </a>)}
        </nav>
        <p className="mt-3 text-xs leading-5 text-white/75">Los paneles privados necesitan iniciar sesión y tener membresía. En el directorio solo aparecen negocios publicados; las demos no publicadas no se muestran automáticamente.</p>
      </div>}
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="ml-auto flex min-h-12 items-center gap-2 rounded-full border border-amber-300 bg-[#171614] px-4 py-3 text-sm font-bold text-amber-200 shadow-xl">
        <Compass className="h-5 w-5" />
        {open ? 'Ocultar accesos' : 'Probar interfaces'}
        <ChevronDown className={open ? 'h-4 w-4 rotate-180' : 'h-4 w-4'} />
      </button>
    </aside>
  );
};
