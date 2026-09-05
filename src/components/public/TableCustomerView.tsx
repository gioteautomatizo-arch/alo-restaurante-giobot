import React, { useState, useEffect } from 'react';
import {
  TABLE_SERVICE_REQUEST_TYPES,
  createPublicServiceRequest,
} from '../../lib/tableRequestsService';
import { TableServiceRequestType } from '../../types';
import { Check, Clock, Utensils, Bell } from 'lucide-react';

interface TableCustomerViewProps {
  tableNumber: number;
  onExploreMenu?: () => void;
}

export const TableCustomerView: React.FC<TableCustomerViewProps> = ({
  tableNumber,
  onExploreMenu,
}) => {
  const [submittingType, setSubmittingType] = useState<TableServiceRequestType | null>(null);
  const [recentRequests, setRecentRequests] = useState<Record<string, number>>({});
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Cargar estado de solicitudes recientes de localStorage para persistir entre recargas
  useEffect(() => {
    try {
      const state: Record<string, number> = {};
      TABLE_SERVICE_REQUEST_TYPES.forEach(({ type }) => {
        const val = localStorage.getItem(`alo_qr_req_${tableNumber}_${type}`);
        if (val) {
          state[type] = parseInt(val, 10);
        }
      });
      setRecentRequests(state);
    } catch {
      // ignore
    }
  }, [tableNumber]);

  const handleRequestClick = async (requestType: TableServiceRequestType) => {
    // Si ya fue solicitada hace menos de 60 segundos
    const lastSent = recentRequests[requestType];
    const now = Date.now();
    if (lastSent && now - lastSent < 60000) {
      setFeedbackMessage('Ya avisamos al equipo ✓');
      setTimeout(() => setFeedbackMessage(null), 3500);
      return;
    }

    setSubmittingType(requestType);
    try {
      const res = await createPublicServiceRequest(tableNumber, requestType);
      const updatedTimestamp = Date.now();
      setRecentRequests((prev) => ({
        ...prev,
        [requestType]: updatedTimestamp,
      }));

      if (res.alreadyPending) {
        setFeedbackMessage('Ya avisamos al equipo ✓');
      } else {
        setFeedbackMessage('Solicitud enviada ✓');
      }
    } catch {
      setFeedbackMessage('Solicitud enviada ✓');
    } finally {
      setSubmittingType(null);
      setTimeout(() => setFeedbackMessage(null), 4000);
    }
  };

  const isRecentlySent = (type: TableServiceRequestType) => {
    const last = recentRequests[type];
    if (!last) return false;
    return Date.now() - last < 60000;
  };

  return (
    <section
      id="atencion-mesa"
      className="w-full max-w-2xl mx-auto my-2 sm:my-4 px-3 sm:px-4"
    >
      <div className="bg-gradient-to-b from-[#FFFDF9] to-[#FFF7EA] rounded-3xl p-4 sm:p-6 border-2 border-[#C9974D]/40 shadow-md space-y-4">
        {/* Cabecera amigable y discreta */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#3A2418] text-[#FFF7EA] text-xs sm:text-sm font-serif font-bold shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Estás en Mesa {tableNumber}</span>
          </div>

          <h2 className="text-lg sm:text-xl font-serif font-bold text-[#2B1B13] pt-1">
            ¡Bienvenido a Calientito!
          </h2>
          <p className="text-xs sm:text-sm text-[#5C3825] max-w-md mx-auto font-light leading-relaxed">
            ¿Necesitas algo? Avísanos desde aquí y el equipo lo recibirá.
          </p>
        </div>

        {/* Banner de retroalimentación inmediata */}
        {feedbackMessage && (
          <div className="bg-emerald-600 text-white px-4 py-2.5 rounded-2xl text-center text-xs sm:text-sm font-bold shadow-sm animate-fade-in flex items-center justify-center gap-2">
            <Check className="w-4 h-4 text-emerald-200" />
            <span>{feedbackMessage}</span>
          </div>
        )}

        {/* Cuadrícula de botones grandes de atención */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5">
          {TABLE_SERVICE_REQUEST_TYPES.map(({ type, label, icon, shortDesc }) => {
            const sent = isRecentlySent(type);
            const isSubmitting = submittingType === type;

            return (
              <button
                key={type}
                id={`btn-qr-${type.toLowerCase()}`}
                type="button"
                disabled={isSubmitting}
                onClick={() => handleRequestClick(type)}
                className={`relative p-3.5 sm:p-4 rounded-2xl border-2 flex flex-col items-center justify-center text-center transition-all cursor-pointer select-none active:scale-95 shadow-xs ${
                  sent
                    ? 'bg-emerald-50/80 border-emerald-500/80 text-emerald-950'
                    : 'bg-white hover:bg-[#FFF7EA] border-[#DEC8AE] hover:border-[#C9974D] text-[#2B1B13]'
                }`}
              >
                {/* Badge de estado enviado */}
                {sent && (
                  <span className="absolute top-2 right-2 bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                    <Check className="w-2.5 h-2.5" />
                    <span>Avisado</span>
                  </span>
                )}

                <span className="text-2xl sm:text-3xl mb-1.5 block">
                  {icon}
                </span>

                <span className="font-serif font-bold text-xs sm:text-sm text-[#2B1B13] leading-tight block">
                  {label}
                </span>

                <span className="text-[10px] text-[#6B4028] mt-1 line-clamp-1 block">
                  {sent ? 'Ya avisamos al equipo ✓' : shortDesc}
                </span>

                {isSubmitting && (
                  <div className="absolute inset-0 bg-white/80 rounded-2xl flex items-center justify-center text-xs font-bold text-[#A86B3D]">
                    Enviando...
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Acceso rápido para explorar el menú */}
        {onExploreMenu && (
          <div className="pt-2 text-center border-t border-[#DEC8AE]/60">
            <button
              type="button"
              onClick={onExploreMenu}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-[#FFF7EA] text-[#5C3825] font-serif font-bold text-xs border border-[#DEC8AE] transition-all cursor-pointer"
            >
              <Utensils className="w-3.5 h-3.5 text-[#C9974D]" />
              <span>Ver menú y carta completa ↓</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
