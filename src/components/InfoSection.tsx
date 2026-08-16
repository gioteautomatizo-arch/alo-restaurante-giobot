import React from 'react';
import { MapPin, Clock, Phone, MessageSquare, Instagram, Facebook, ExternalLink, ShieldCheck } from 'lucide-react';
import { Logo } from './Logo';

export const InfoSection: React.FC = () => {
  return (
    <section id="contacto" className="w-full bg-white rounded-3xl border border-stone-200/90 p-5 sm:p-7 shadow-xs space-y-6">
      {/* Brand Mini Card */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-stone-100">
        <div className="flex items-center gap-3.5">
          <div className="bg-[#fcfaf6] p-2 rounded-2xl border border-[#b48a44]/30 shadow-xs shrink-0">
            <Logo size="sm" variant="full" />
          </div>
          <div>
            <h3 className="font-serif font-black text-lg text-stone-900 leading-tight">
              ¡Aló! Restaurante
            </h3>
            <p className="text-xs text-stone-500">
              Cocina casera, desayunos, comida corrida & café de grano
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <a
            href="https://maps.google.com/?q=Calle+la+Fama+12,+14260+Tlalpan,+CDMX"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <MapPin className="w-3.5 h-3.5 text-[#162e1e]" />
            <span>Cómo llegar (Maps)</span>
            <ExternalLink className="w-3 h-3 text-stone-400" />
          </a>
        </div>
      </div>

      {/* Grid of Key Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Ubicación */}
        <div className="bg-[#fcfaf6] p-4 rounded-2xl border border-stone-200/60 space-y-1.5">
          <div className="flex items-center gap-2 text-[#162e1e] font-black text-xs">
            <MapPin className="w-4 h-4 text-[#d1a85b]" />
            <span>Ubicación</span>
          </div>
          <p className="text-xs font-bold text-stone-800">
            Calle la Fama 12, 14260
          </p>
          <p className="text-xs text-stone-600">
            Tlalpan Centro, CDMX, México
          </p>
          <span className="inline-block text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded-full mt-1">
            Comedor · Domicilio · Para Llevar
          </span>
        </div>

        {/* 2. Horario */}
        <div className="bg-[#fcfaf6] p-4 rounded-2xl border border-stone-200/60 space-y-1.5">
          <div className="flex items-center gap-2 text-[#162e1e] font-black text-xs">
            <Clock className="w-4 h-4 text-[#d1a85b]" />
            <span>Horario de Servicio</span>
          </div>
          <p className="text-xs font-bold text-stone-800">
            9:00 AM a 5:30 PM
          </p>
          <p className="text-xs text-stone-600">
            Lunes a Domingo (Todos los días)
          </p>
          <span className="inline-block text-[10px] text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded-full mt-1">
            Fines de Semana: Pozole & Pancita
          </span>
        </div>

        {/* 3. Contacto Directo */}
        <div className="bg-[#fcfaf6] p-4 rounded-2xl border border-stone-200/60 space-y-2">
          <div className="flex items-center gap-2 text-[#162e1e] font-black text-xs">
            <Phone className="w-4 h-4 text-[#d1a85b]" />
            <span>Pedidos & Contacto</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://wa.me/525574411437"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-[#25D366] hover:bg-[#20ba59] text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5 fill-white" />
              <span>WhatsApp 55 7441 1437</span>
            </a>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <a
              href="https://www.instagram.com/calientitocafe15?igsh=Z3hzdmViZDVka2ho"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold text-stone-700 hover:text-[#b48a44] flex items-center gap-1 transition-colors"
            >
              <Instagram className="w-3.5 h-3.5 text-[#d1a85b]" /> Instagram
            </a>
            <span className="text-stone-300">•</span>
            <a
              href="https://www.facebook.com/share/1Cvompzmgh/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold text-stone-700 hover:text-[#b48a44] flex items-center gap-1 transition-colors"
            >
              <Facebook className="w-3.5 h-3.5 text-[#d1a85b]" /> Facebook
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
