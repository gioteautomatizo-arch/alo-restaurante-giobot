import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { fetchPublicBusinessRating, recordPublicBusinessVisit,
  submitBusinessRating, type PublicBusinessRating } from '../../lib/businessEngagementClient';

/** Valoraciones visibles solo si el servicio de estadísticas está activado. */
export const BusinessRatingWidget: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [rating, setRating] = useState<PublicBusinessRating | null>(null);
  const [status, setStatus] = useState<'loading'|'ready'|'error'>('loading');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRating(null);
    setStatus('loading');
    setFeedback(null);
    void recordPublicBusinessVisit(businessId);
    void fetchPublicBusinessRating(businessId).then(value => {
      if (!cancelled) { setRating(value); setStatus('ready'); }
    }).catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [businessId]);

  const rate = async (stars: number) => {
    if (saving) return;
    setSaving(true); setFeedback(null);
    try {
      const updated = await submitBusinessRating(businessId, stars);
      setRating(updated); setFeedback('Tu calificación quedó guardada. Puedes cambiarla cuando quieras.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'No pudimos guardar tu calificación.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Calificaciones del negocio" className="mx-auto mt-4 max-w-5xl px-4">
      <div className="flex flex-col gap-2 rounded-2xl border border-current/15 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <strong className="text-sm">Calificaciones de clientes</strong>
          <p className="mt-1 text-xs opacity-75">
            {status === 'loading' ? 'Consultando calificaciones…' :
              status === 'error' ? 'No se pudieron cargar las calificaciones.' :
              rating?.count ? (
                <><Star className="inline h-3 w-3 fill-amber-400 text-amber-400" />
                  {' '}{rating.average?.toFixed(1)} / 5 · {rating.count} {rating.count === 1 ? 'valoración' : 'valoraciones'}
                </>
              ) : 'Este negocio aún no tiene calificaciones.'}
          </p>
        </div>
        <div className="flex flex-col items-start gap-1">
          <span className="text-[11px] font-semibold">Califica este negocio</span>
          <div className="flex gap-1" role="group" aria-label="Calificar de una a cinco estrellas">
            {[1,2,3,4,5].map(stars => (
              <button key={stars} type="button" aria-label={'Calificar con '+stars+' estrellas'}
                title={stars+' de 5'} disabled={saving || status !== 'ready'}
                onClick={() => void rate(stars)}
                className="rounded-lg p-1.5 text-amber-500 hover:bg-amber-500/10 disabled:opacity-40"
              ><Star className="h-5 w-5" /></button>
            ))}
          </div>
          <p className="text-[10px] opacity-65">Se requiere una cuenta; puedes cambiar tu voto.</p>
        </div>
      </div>
      {feedback && <p role="status" className="mt-2 text-xs">{feedback}</p>}
    </section>
  );
};
