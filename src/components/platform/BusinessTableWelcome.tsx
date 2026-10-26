import React from 'react';

interface Props {
  businessName: string;
  tableNumber: number;
  guestCount: number | null;
  onGuestCount: (count: number) => void;
  onContinue: () => void;
}

/** Entrada al menú de mesa; no crea una sesión operativa ni ocupa mesas de otros negocios. */
export const BusinessTableWelcome: React.FC<Props> = ({ businessName, tableNumber, guestCount, onGuestCount, onContinue }) => (
  <main className="flex min-h-screen items-center justify-center bg-[#111111] px-5 py-8 text-[#F7F7F7]">
    <section className="w-full max-w-md rounded-3xl border border-[#D6A34A]/30 bg-[#1A1A1A] p-6 text-center">
      <p className="text-sm text-[#E3BC6B]">{businessName}</p>
      <h1 className="mt-3 text-3xl font-black">Mesa {tableNumber}</h1>
      <h2 className="mt-6 text-xl font-bold">¿Cuántas personas son?</h2>
      <p className="mt-2 text-sm text-[#B7B7B7]">Elige cuántas personas van a pedir antes de abrir el menú.</p>
      <div role="group" aria-label="Número de personas" className="mt-6 grid grid-cols-5 gap-2">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((count) => (
          <button key={count} type="button" aria-label={`${count} ${count === 1 ? 'persona' : 'personas'}`} aria-pressed={guestCount === count} onClick={() => onGuestCount(count)} className={`min-h-12 rounded-xl border text-lg font-bold ${guestCount === count ? 'border-[#D6A34A] bg-[#D6A34A] text-black' : 'border-white/20 bg-white/5 text-white'}`}>{count}</button>
        ))}
      </div>
      <button type="button" disabled={guestCount === null} onClick={onContinue} className="mt-6 w-full rounded-2xl bg-[#D6A34A] px-4 py-4 font-black text-black disabled:opacity-40">Ver menú de la mesa</button>
      <p className="mt-4 text-xs text-[#B7B7B7]">La mesa y el número de personas se enviarán con tu pedido.</p>
    </section>
  </main>
);
