import React from 'react';
import { MapPin, Clock, Instagram, Facebook, Heart, Leaf, Phone, MessageSquare } from 'lucide-react';
import { Logo } from './Logo';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#122518] text-stone-200 border-t border-[#1f402c] pt-10 pb-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
        {/* Col 1: Brand */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Logo variant="compact" size="md" />
          </div>
          <p className="text-xs text-stone-400 leading-relaxed">
            Nuestra prioridad es brindarte una experiencia culinaria casera, cálida y deliciosa. Atendidos personalmente por <strong>Giobot</strong>, tu anfitrión virtual en <strong>¡Aló! Restaurante</strong>.
          </p>
          <div className="pt-1 flex flex-wrap items-center gap-2 text-stone-300">
            <a
              href="https://wa.me/525574411437"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-xl bg-[#1a3824] hover:bg-[#234d32] transition-colors flex items-center gap-1.5 text-xs font-semibold text-[#d1a85b]"
            >
              <MessageSquare className="w-4 h-4 text-emerald-400" /> WhatsApp: 55 7441 1437
            </a>
            <a
              href="https://www.instagram.com/calientitocafe15?igsh=Z3hzdmViZDVka2ho"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-xl bg-[#1a3824] hover:bg-[#234d32] transition-colors flex items-center gap-1.5 text-xs font-semibold text-stone-200"
            >
              <Instagram className="w-4 h-4 text-[#d1a85b]" /> Instagram
            </a>
            <a
              href="https://www.facebook.com/share/1Cvompzmgh/"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-xl bg-[#1a3824] hover:bg-[#234d32] transition-colors flex items-center gap-1.5 text-xs font-semibold text-stone-200"
            >
              <Facebook className="w-4 h-4 text-[#d1a85b]" /> Facebook
            </a>
          </div>
        </div>

        {/* Col 2: Horarios y Ubicación */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#d1a85b]">
            Ubicación & Servicios
          </h4>
          <div className="text-xs space-y-2 text-stone-300">
            <p className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-[#d1a85b] shrink-0 mt-0.5" />
              <span>
                <strong>Calle la Fama 12, 14260</strong><br />
                Tlalpan CDMX, México
              </span>
            </p>
            <p className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#d1a85b] shrink-0" />
              Lunes a Domingo: 9:00 AM - 5:30 PM
            </p>
            <p className="flex items-center gap-2 text-emerald-300 font-semibold">
              <Phone className="w-4 h-4 text-[#d1a85b] shrink-0" />
              Sucursal, Domicilio y Anticipa tu orden
            </p>
          </div>
        </div>

        {/* Col 3: Promoción Ecológica */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <Leaf className="w-4 h-4 text-emerald-400" /> Sustentabilidad (10% OFF)
          </h4>
          <p className="text-xs text-stone-300 leading-relaxed">
            Cuidamos nuestro entorno en Tlalpan. Trae tus propios recipientes o termo para tu comida para llevar y recibe un <strong>10% DE DESCUENTO</strong> inmediato en tu cuenta.
          </p>
        </div>

        {/* Col 4: Especialidades de la Casa */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#d1a85b]">
            Especialidades ¡Aló!
          </h4>
          <ul className="text-xs text-stone-300 space-y-1.5">
            <li>• Café de Olla Tradicional & Capuchinos</li>
            <li>• Chilaquiles Verdes/Rojos & Enfrijoladas</li>
            <li>• Comida Corrida Completa ($90)</li>
            <li>• Arma tu Ensalada Fresca ($90)</li>
            <li>• Pozole (Sábados) & Pancita (Domingos)</li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto pt-4 border-t border-[#1f402c] flex flex-col sm:flex-row items-center justify-between text-xs text-stone-400 gap-2">
        <p>© 2026 ¡Aló! Restaurante • Calle la Fama 12, Tlalpan CDMX.</p>
        <p className="flex items-center gap-1">
          Hecho con <Heart className="w-3.5 h-3.5 text-[#d1a85b] fill-[#d1a85b]" /> y la atención de <strong>Giobot</strong>
        </p>
      </div>
    </footer>
  );
};
