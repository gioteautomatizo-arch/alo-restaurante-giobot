import React, { useEffect, useState } from 'react';
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { acceptBusinessInvite, previewBusinessInvite, type InvitePreview } from '../../lib/businessInvitesService';

export const BusinessInviteAccept: React.FC<{ token: string }> = ({ token }) => {
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [user, setUser] = useState(auth.currentUser);
  const [busy, setBusy] = useState(false);

  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    let active = true;
    previewBusinessInvite(token).then(value => { if (active) setPreview(value); })
      .catch(err => { if (active) setError(err?.message || 'No pudimos consultar la invitación.'); });
    return () => { active = false; };
  }, [token]);

  const authenticate = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'signup') {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(result.user);
        setNotice('Cuenta creada. Revisa tu correo para verificarla antes de aceptar.');
      } else await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) { setError(err?.message || 'No pudimos iniciar sesión.'); }
    finally { setBusy(false); }
  };

  const accept = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      await user?.reload();
      const refreshed = auth.currentUser;
      if (!refreshed?.emailVerified) {
        setError('Antes de continuar, abre el correo de verificación que te envió Firebase.');
        return;
      }
      await refreshed.getIdToken(true);
      const result = await acceptBusinessInvite(token);
      window.location.hash = '#business/' + encodeURIComponent(result.businessId);
    } catch (err: any) { setError(err?.message || 'No pudimos activar tu acceso.'); }
    finally { setBusy(false); }
  };

  return <main className="min-h-screen bg-[#0F172A] px-4 py-10 text-white">
    <div className="mx-auto max-w-lg rounded-3xl border border-white/10 bg-[#171D2C] p-6 sm:p-8">
      <span className="text-xs font-bold uppercase tracking-widest text-amber-300">Gioteautomatizo · Equipo</span>
      <h1 className="mt-3 font-serif text-3xl font-black">Invitación de trabajo</h1>
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
        <button type="button" onClick={() => setMode(v => v === 'login' ? 'signup' : 'login')} className="w-full p-2 text-sm underline">{mode === 'login' ? 'No tengo cuenta, crear una' : 'Ya tengo cuenta'}</button>
      </form>}
      {preview && user && <div className="mt-5 space-y-3">
        <p className="text-sm">Cuenta actual: <strong>{user.email || 'Cuenta sin correo'}</strong></p>
        <p className="text-xs text-gray-300">La cuenta debe tener el mismo correo de la invitación y estar verificada.</p>
        <button type="button" disabled={busy} onClick={() => void accept()} className="w-full rounded-xl bg-amber-300 p-3 font-bold text-black disabled:opacity-50">Aceptar invitación</button>
        <button type="button" onClick={() => void signOut(auth)} className="w-full rounded-xl border border-white/20 p-3 text-sm">Usar otra cuenta</button>
      </div>}
      <button type="button" onClick={() => { window.location.hash = '#business'; }} className="mt-6 text-sm text-gray-300 underline">Volver a negocios</button>
    </div>
  </main>;
};
