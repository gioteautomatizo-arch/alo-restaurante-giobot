import React from 'react';
import { MapPin, Clock, MessageSquare, Instagram, Facebook, Map } from 'lucide-react';
import { Logo } from './Logo';

export const Footer: React.FC = () => {
  return (
    <footer
      id="contacto"
      className="bg-[#102017] text-stone-200 border-t border-[#1f3d2b] pt-7 pb-24 sm:pb-8 px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-3xl mx-auto flex flex-col items-center text-center space-y-4">
        {/* 1. Logotipo de ¡Aló! Restaurante */}
        <div className="inline-flex items-center justify-center">
          <Logo variant="compact" size="md" />
        </div>

        {/* 2. Dirección y Horario */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6 text-xs text-stone-300 font-light">
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#c4974f] shrink-0" />
            <span>Calle la Fama 12, Tlalpan, CDMX</span>
          </div>
          <span className="hidden sm:inline text-stone-600">•</span>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#c4974f] shrink-0" />
            <span>Lunes a domingo, 9:00 AM a 5:30 PM</span>
          </div>
        </div>

        {/* 3. Botón principal de WhatsApp */}
        <div className="w-full max-w-xs pt-1">
          <a
            href="https://wa.me/525574411437"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full px-4 py-2.5 rounded-2xl bg-[#25D366] hover:bg-[#20ba59] active:scale-98 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
          >
            <MessageSquare className="w-4 h-4 fill-white text-[#25D366]" />
            <span>Pedir por WhatsApp (55 7441 1437)</span>
          </a>
        </div>

        {/* 4. Iconos secundarios: Instagram, Facebook y Google Maps */}
        <div className="flex items-center justify-center gap-3 pt-1 text-xs">
          <a
            href="https://www.instagram.com/calientitocafe15?igsh=Z3hzdmViZDVka2ho"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-xl bg-[#183323] hover:bg-[#20442f] text-stone-200 hover:text-[#c4974f] border border-[#244c34] flex items-center gap-1.5 transition-colors"
            title="Instagram ¡Aló!"
          >
            <Instagram className="w-3.5 h-3.5 text-[#c4974f]" />
            <span className="font-medium">Instagram</span>
          </a>

          <a
            href="https://www.facebook.com/share/1Cvompzmgh/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-xl bg-[#183323] hover:bg-[#20442f] text-stone-200 hover:text-[#c4974f] border border-[#244c34] flex items-center gap-1.5 transition-colors"
            title="Facebook ¡Aló!"
          >
            <Facebook className="w-3.5 h-3.5 text-[#c4974f]" />
            <span className="font-medium">Facebook</span>
          </a>

          <a
            href="https://maps.google.com/?q=Calle+la+Fama+12,+14260+Tlalpan,+CDMX"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-xl bg-[#183323] hover:bg-[#20442f] text-stone-200 hover:text-[#c4974f] border border-[#244c34] flex items-center gap-1.5 transition-colors"
            title="Ubicación en Google Maps"
          >
            <Map className="w-3.5 h-3.5 text-[#c4974f]" />
            <span className="font-medium">Google Maps</span>
          </a>
        </div>

        {/* 5. Línea final de copyright */}
        <div className="w-full pt-4 border-t border-[#1f3d2b] text-[11px] text-stone-400 font-light">
          <p>© 2026 ¡Aló! Restaurante • Calle la Fama 12, Tlalpan, CDMX.</p>
        </div>
      </div>
    </footer>
  );
};

