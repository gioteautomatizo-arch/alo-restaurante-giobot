import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Bot, CheckCircle2, Clock3, Search, Settings2 } from 'lucide-react';
import type { BusinessModule } from '../../data/businessTemplates';

type Props = {
  businessName: string;
  templateName: string;
  modules: BusinessModule[];
  enabledCapabilities: string[];
  onBack: () => void;
  onOpen: (module: BusinessModule) => void;
};

const groupLabels: Record<BusinessModule['group'], string> = {
  VENTAS: 'Ventas',
  OPERACION: 'Operación',
  ADMINISTRACION: 'Administración',
  CLIENTES: 'Clientes',
  IA: 'IA',
};

export const BusinessModulesView: React.FC<Props> = ({
  businessName,
  templateName,
  modules,
  enabledCapabilities,
  onBack,
  onOpen,
}) => {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<'TODOS' | BusinessModule['group']>('TODOS');

  const filtered = useMemo(() => modules.filter((module) => {
    const matchesGroup = group === 'TODOS' || module.group === group;
    const haystack = (module.title + ' ' + module.description).toLocaleLowerCase('es-MX');
    return matchesGroup && haystack.includes(query.trim().toLocaleLowerCase('es-MX'));
  }), [modules, query, group]);

  return (
    <div className="min-h-screen bg-[#F5F1EA] text-[#201610]">
      <header className="sticky top-0 z-20 border-b border-[#E5D8C4] bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-3">
          <button onClick={onBack} className="rounded-xl border border-[#DEC8AE] px-3 py-2 text-xs font-bold text-[#6B4028] flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Negocio
          </button>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#A86B3D]">Ecosistema</p>
            <strong className="text-sm">{businessName}</strong>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-7 sm:py-9">
        <section className="rounded-[2rem] bg-[#111827] p-6 sm:p-8 text-white">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-white/10 p-3 text-amber-300"><Settings2 className="w-6 h-6" /></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-amber-300">Plantilla {templateName}</p>
              <h1 className="mt-1 font-serif text-3xl font-black">Todos los módulos de tu negocio</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
                El negocio se construye por capacidades. Puedes comenzar con lo esencial y activar el resto conforme crezca, sin cambiar de plataforma.
              </p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-2 sm:max-w-md">
            <div className="rounded-2xl bg-white/5 p-3"><strong className="block text-xl">{modules.length}</strong><span className="text-[10px] text-slate-400">módulos</span></div>
            <div className="rounded-2xl bg-white/5 p-3"><strong className="block text-xl">{modules.filter(m => enabledCapabilities.includes(m.capability)).length}</strong><span className="text-[10px] text-slate-400">habilitados</span></div>
            <div className="rounded-2xl bg-white/5 p-3"><strong className="block text-xl">{modules.filter(m => !enabledCapabilities.includes(m.capability)).length}</strong><span className="text-[10px] text-slate-400">por activar</span></div>
          </div>
        </section>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A86B3D]" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar módulo..." className="w-full rounded-xl border border-[#DEC8AE] bg-white py-3 pl-10 pr-4 text-sm outline-none focus:border-[#A86B3D]" />
          </div>
          <select value={group} onChange={e => setGroup(e.target.value as typeof group)} className="rounded-xl border border-[#DEC8AE] bg-white px-4 py-3 text-sm font-bold text-[#6B4028] outline-none">
            <option value="TODOS">Todos</option>
            {(Object.keys(groupLabels) as BusinessModule['group'][]).map(key => <option key={key} value={key}>{groupLabels[key]}</option>)}
          </select>
        </div>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(module => {
            const enabled = enabledCapabilities.includes(module.capability);
            return (
              <button key={module.id} onClick={() => onOpen(module)} className="group rounded-[1.5rem] border border-[#DEC8AE] bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-[#C9974D] hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-full border border-[#E8D8C4] bg-[#FFFDF9] px-2 py-1 text-[9px] font-black uppercase tracking-wide text-[#A86B3D]">{groupLabels[module.group]}</span>
                  {enabled ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Clock3 className="w-5 h-5 text-[#B89B7B]" />}
                </div>
                <h2 className="mt-4 font-serif text-lg font-black">{module.title}</h2>
                <p className="mt-1 min-h-10 text-xs leading-relaxed text-[#6B4028]">{module.description}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className={enabled ? 'text-[10px] font-black uppercase text-emerald-700' : 'text-[10px] font-black uppercase text-[#A86B3D]'}>{enabled ? 'Abrir módulo' : 'Preparar módulo'}</span>
                  <ArrowRight className="w-4 h-4 text-[#A86B3D] transition group-hover:translate-x-1" />
                </div>
              </button>
            );
          })}
        </section>

        {filtered.length === 0 && <div className="mt-6 rounded-2xl border border-[#DEC8AE] bg-white p-10 text-center text-sm text-[#6B4028]">No encontramos ese módulo.</div>}

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
          <Bot className="w-5 h-5 shrink-0 text-[#A86B3D]" />
          <p className="text-xs leading-relaxed text-amber-950"><strong>Modo 10X:</strong> los módulos están definidos como capacidades independientes para que podamos reutilizar el mismo núcleo en restaurantes, creperías, pizzerías, perfumes y futuros negocios.</p>
        </div>
      </main>
    </div>
  );
};
