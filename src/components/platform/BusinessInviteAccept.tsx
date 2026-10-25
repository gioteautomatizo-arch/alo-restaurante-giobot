import React, { useEffect, useRef, useState } from 'react';
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { acceptBusinessInvite, previewBusinessInvite, type InvitePreview } from '../../lib/businessInvitesService';

// Cada token tiene su propio ciclo de vida: una invitación anterior nunca debe
// dejar visible su vista previa, sus errores ni una confirmación en otra ruta.
export const BusinessInviteAccept: React.FC<{ token: string }> = ({ token }) => (
  <BusinessInviteAcceptForToken key={token} token={token} />
);

const BusinessInviteAcceptForToken: React.FC<{ token: string }> = ({ token }) => {
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState('');
  const [previewRetry, setPreviewRetry] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [user, setUser] = useState(auth.currentUser);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => { aliveRef.current = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    let active = true;
    setPreview(null);
    setPreviewError('');
    setPreviewLoading(true);
    previewBusinessInvite(token)
      .then(value => { if (active) setPreview(value); })
      .catch(err => { if (active) setPreviewError(err?.message || 'No pudimos consultar la invitación.'); })
      .finally(() => { if (active) setPreviewLoading(false); });
    return () => { active = false; };
  }, [token, previewRetry]);

  const authenticate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'signup') {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(result.user);
        if (aliveRef.current) setNotice('Cuenta creada. Revisa tu correo para verificarla antes de aceptar.');
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      if (aliveRef.current) setError(err?.message || 'No pudimos iniciar sesión.');
    } finally {
      busyRef.current = false;
      if (aliveRef.current) setBusy(false);
    }
  };

  const accept = async () => {
    if (busyRef.current || !preview) return;
    busyRef.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      const initialUser = auth.currentUser;
      if (!initialUser || initialUser.uid !== user?.uid) {
        throw new Error('La sesión cambió. Comprueba tu cuenta antes de aceptar.');
      }
      await initialUser.reload();
      if (!aliveRef.current) return;
      const refreshed = auth.currentUser;
      if (!refreshed || refreshed.uid !== initialUser.uid) {
        throw new Error('La sesión cambió. Comprueba tu cuenta antes de aceptar.');
      }
      if (!refreshed.emailVerified) {
        setError('Antes de continuar, abre el correo de verificación que te envió Firebase.');
        return;
      }
      await refreshed.getIdToken(true);
      if (!aliveRef.current) return;
      const result = await acceptBusinessInvite(token);
      if (aliveRef.current) window.location.hash = '#business/' + encodeURIComponent(result.businessId);
    } catch (err: any) {
      if (aliveRef.current) setError(err?.message || 'No pudimos activar tu acceso.');
    } finally {
      busyRef.current = false;
      if (aliveRef.current) setBusy(false);
    }
  };

  return <main className="min-h-screen bg-[#0F172A] px-4 py-10 text-white">
    <div className="mx-auto max-w-lg rounded-3xl border border-white/10 bg-[#171D2C] p-6 sm:p-8">
      <span className="text-xs font-bold uppercase tracking-widest text-amber-300">Gioteautomatizo · Equipo</span>
      <h1 className="mt-3 font-serif text-3xl font-black">Invitación de trabajo</h1>
      {previewLoading && <p role="status" className="mt-5 text-sm text-gray-300">Consultando invitación…</p>}
      {previewError && <div role="alert" className="mt-5 rounded-xl bg-red-950 p-3 text-sm text-red-100">
        <p>{previewError}</p>
        <button type="button" onClick={() => setPreviewRetry(value => value + 1)} className="mt-2 underline">Reintentar consulta</button>
      </div>}
      {preview && <div className="mt-5 rounded-xl bg-white/5 p-4 text-sm">
        <strong className="block text-lg">{preview.businessName}</strong>
        <span>Rol asignado: {preview.role} · Correo: {preview.emailHint}</span>
        <p className="mt-2 text-xs text-gray-300">Vigente hasta {new Date(preview.expiresAt).toLocaleString('es-MX')}</p>
      </div>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-950 p-3 text-sm text-red-100">{error}</p>}
      {notice && <p className="mt-4 rounded-xl bg-emerald-950 p-3 text-sm text-emerald-100">{notice}</p>}
      {preview && !user && <form onSubmit={authenticate} className="mt-5 space-y-3">
        <p className="text-sm text-gray-300">Usa tu propia cuenta con el correo al que te invitaron.</p>
        <input aria-label="Correo" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Tu correo" className="w-full rounded-xl bg-white p-3 text-gray-950" />
        <input aria-label="Contraseña" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={6} required value={password} onChange={e => setPassword(e.target.value)} placeholder="Tu contraseña" className="w-full rounded-xl bg-white p-3 text-gray-950" />
        <button disabled={busy} className="w-full rounded-xl bg-amber-300 p-3 font-bold text-black disabled:opacity-50">{mode === 'signup' ? 'Crear mi cuenta' : 'Entrar'}</button>
        <button type="button" disabled={busy} onClick={() => setMode(v => v === 'login' ? 'signup' : 'login')} className="w-full p-2 text-sm underline">{mode === 'login' ? 'No tengo cuenta, crear una' : 'Ya tengo cuenta'}</button>
      </form>}
      {preview && user && <div className="mt-5 space-y-3">
        <p className="text-sm">Cuenta actual: <strong>{user.email || 'Cuenta sin correo'}</strong></p>
        <p className="text-xs text-gray-300">La cuenta debe tener el mismo correo de la invitación y estar verificada.</p>
        <button type="button" disabled={busy} onClick={() => void accept()} className="w-full rounded-xl bg-amber-300 p-3 font-bold text-black disabled:opacity-50">Aceptar invitación</button>
        <button type="button" disabled={busy} onClick={() => void signOut(auth)} className="w-full rounded-xl border border-white/20 p-3 text-sm">Usar otra cuenta</button>
      </div>}
      <button type="button" onClick={() => { window.location.hash = '#business'; }} className="mt-6 text-sm text-gray-300 underline">Volver a negocios</button>
    </div>
  </main>;
};
