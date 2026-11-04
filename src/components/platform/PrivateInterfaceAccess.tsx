import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, LockKeyhole, ShieldCheck, Store } from 'lucide-react';
import type { User } from 'firebase/auth';
import { auth, subscribeToAuth } from '../../lib/firebase';
import { isPlatformAdmin } from '../../lib/businessAuthService';

/**
 * Entrada PRIVADA recuperable por enlace guardado: /#mis-interfaces.
 * No añade pestañas al portal público. El menú solo se entrega a UID
 * autorizado por platformAdmins/{uid}, nunca por PIN/localStorage ni DEV.
 */
export const PrivateInterfaceAccess: React.FC = () => {
  const [current, setCurrent] = useState<User | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [status, setStatus] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const [checkedUid, setCheckedUid] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => subscribeToAuth(user => {
    setCurrent(user);
    setCheckedAuth(true);
  }), []);

  useEffect(() => {
    const uid = current?.uid;
    const request = ++requestRef.current;
    setStatus('checking');
    setCheckedUid(null);
    if (!uid) return;
    void isPlatformAdmin(uid).then(allowed => {
      if (requestRef.current !== request || auth.currentUser?.uid !== uid) return;
      setCheckedUid(uid);
      setStatus(allowed ? 'allowed' : 'denied');
    }).catch(() => {
      if (requestRef.current !== request || auth.currentUser?.uid !== uid) return;
      setCheckedUid(uid);
      setStatus('denied');
    });
    return () => { requestRef.current++; };
  }, [current?.uid]);

  const authorized = !!current && auth.currentUser?.uid === current.uid
    && checkedUid === current.uid && status === 'allowed';

  const routes = [
    { label: 'Calientito · administración (usuario y PIN)', hash: '#admin' },
    { label: 'Calientito · página para mostrar', hash: '#negocio/alo-restaurante' },
    { label: 'Mi panel Gioteautomatizo', hash: '#platform-admin' },
    { label: 'Mis negocios', hash: '#business' },
    { label: 'Registrar negocio', hash: '#business-new' },
    { label: 'Directorio', hash: '#explorar' },
  ];

  return (
    <main className="min-h-screen bg-[#0B1020] px-4 py-10 text-white">
      <div className="mx-auto max-w-xl rounded-3xl border border-white/15 bg-white/5 p-6 shadow-xl">
        <div className="flex items-center gap-3 text-amber-300">
          <ShieldCheck className="h-7 w-7" />
          <h1 className="font-serif text-2xl font-bold">Mis interfaces privadas</h1>
        </div>
        {!checkedAuth || (!!current && (status === 'checking' || checkedUid !== current.uid)) ? (
          <p className="mt-5 text-sm text-slate-200">Verificando tu cuenta de plataforma…</p>
        ) : !current ? (
          <>
            <p className="mt-5 text-sm text-slate-200">
              Para recuperar las interfaces, inicia sesión con tu cuenta administradora
              de Gioteautomatizo. El acceso de Calientito por PIN es independiente.
            </p>
            <a className="mt-5 inline-flex rounded-xl bg-amber-300 px-4 py-3 text-sm font-bold text-[#0B1020]"
              href="#business">Iniciar sesión</a>
          </>
        ) : !authorized ? (
          <>
            <div role="alert" className="mt-5 flex items-start gap-3 text-sm text-slate-200">
              <LockKeyhole className="h-5 w-5 shrink-0 text-amber-300" />
              Esta cuenta no tiene un permiso Super Admin confirmado.
              Entra con la cuenta correcta o revisa la autorización en Firebase.
            </div>
            <a className="mt-5 inline-flex rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold"
              href="#business">Ir a mis negocios / cambiar cuenta</a>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm text-slate-200">
              Este acceso es privado. Puedes guardar este enlace en favoritos:
              <span className="mt-1 block font-mono text-xs text-amber-300">/#mis-interfaces</span>
            </p>
            <nav aria-label="Interfaces privadas de la plataforma" className="mt-6 grid gap-3">
              {routes.map(route => (
                <a key={route.hash} href={route.hash}
                  className="flex items-center justify-between rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold hover:bg-white/20">
                  <span>{route.label}</span>
                  <Store className="h-4 w-4 text-amber-300" />
                </a>
              ))}
            </nav>
          </>
        )}
        <a className="mt-7 inline-flex items-center gap-2 text-xs text-slate-300 underline" href="#business">
          <ArrowLeft className="h-3.5 w-3.5" /> Volver
        </a>
      </div>
    </main>
  );
};
