import React, { useState } from 'react';
import { StaffUser } from '../../types';
import { getStaffUsers, loginStaff, ADMIN_DATA_EVENT } from '../../lib/adminStorage';
import { getCurrentAuthUser, signInWithGoogle, subscribeToAuth } from '../../lib/firebase';
import { User as FirebaseUser } from 'firebase/auth';
import { Lock, User, KeyRound, ShieldAlert, Check, X, Tablet, Smartphone, Sparkles, Cloud, RefreshCw } from 'lucide-react';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: StaffUser) => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [selectedUser, setSelectedUser] = useState<string>('gio');
  const [customUsername, setCustomUsername] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [rememberDevice, setRememberDevice] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [cloudUser, setCloudUser] = useState<FirebaseUser | null>(getCurrentAuthUser());
  const [isConnectingCloud, setIsConnectingCloud] = useState<boolean>(false);
  const [, setStaffRefresh] = useState(0);

  React.useEffect(() => {
    const unsubAuth = subscribeToAuth(setCloudUser);
    const refresh = () => setStaffRefresh((v) => v + 1);
    window.addEventListener(ADMIN_DATA_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      unsubAuth();
      window.removeEventListener(ADMIN_DATA_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  if (!isOpen) return null;

  const staffList = getStaffUsers();

  const handleConnectCloud = async () => {
    setError(null);
    setIsConnectingCloud(true);
    try {
      await signInWithGoogle(false);
      setStaffRefresh((v) => v + 1);
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setError(err?.message || 'No se pudo conectar este celular con Firebase.');
      }
    } finally {
      setIsConnectingCloud(false);
    }
  };

  const handleQuickUserSelect = (username: string) => {
    setSelectedUser(username);
    setCustomUsername('');
    setPin('');
    setError(null);
  };

  const handleNumpadPress = (digit: string) => {
    if (pin.length < 6) {
      setPin((prev) => prev + digit);
      setError(null);
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClearPin = () => {
    setPin('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!cloudUser) {
      setError('Primero conecta este celular con Google para recibir mesas y comandas en tiempo real.');
      return;
    }

    const targetUser = selectedUser === 'custom' ? customUsername.trim() : selectedUser;
    if (!targetUser) {
      setError('Por favor selecciona o escribe tu usuario.');
      return;
    }

    if (!pin) {
      setError('Por favor ingresa tu PIN / contraseña de acceso.');
      return;
    }

    setIsSubmitting(true);
    const result = loginStaff(targetUser, pin, rememberDevice);
    setIsSubmitting(false);

    if (result.success && result.user) {
      onLoginSuccess(result.user);
      onClose();
    } else {
      setError(result.error || 'Credenciales inválidas. Revisa tu PIN.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2B1B13]/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#FFF7EA] text-[#2B1B13] rounded-3xl shadow-2xl border border-[#F4E3C8] overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-[#3A2418] text-[#FFF7EA] px-6 py-5 flex items-center justify-between border-b border-[#4E3222]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#4A2E1F] border border-[#C9974D]/50 flex items-center justify-center text-[#C9974D] shadow-inner">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif font-bold text-lg text-[#FFF7EA] flex items-center gap-2">
                Acceso al Restaurante
              </h2>
              <p className="text-xs text-[#F4E3C8] font-light">
                Panel Administrativo & Control Operativo
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#F4E3C8] hover:text-white hover:bg-[#4A2E1F] transition-colors cursor-pointer"
            aria-label="Cerrar modal de acceso"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
            cloudUser
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <Cloud className={`w-5 h-5 shrink-0 ${cloudUser ? 'text-emerald-600' : 'text-amber-600'}`} />
              <div className="min-w-0">
                <strong className="block text-xs">{cloudUser ? 'Celular conectado en tiempo real' : 'Conecta este celular'}</strong>
                <span className="block text-[10px] truncate">
                  {cloudUser ? (cloudUser.email || cloudUser.displayName || 'Google conectado') : 'Necesario para recibir solicitudes y comandas.'}
                </span>
              </div>
            </div>
            {!cloudUser && (
              <button
                type="button"
                onClick={handleConnectCloud}
                disabled={isConnectingCloud}
                className="px-3 py-2 rounded-xl bg-[#3A2418] text-[#FFF7EA] text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0"
              >
                {isConnectingCloud ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5 text-[#C9974D]" />}
                <span>{isConnectingCloud ? 'Conectando…' : 'Conectar Google'}</span>
              </button>
            )}
          </div>

          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs flex items-start gap-2.5 animate-shake">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Seleccionar Colaborador */}
          <div>
            <label className="block text-xs font-bold text-[#6B4028] uppercase tracking-wider mb-2 flex items-center gap-1.5 font-serif">
              <User className="w-3.5 h-3.5 text-[#C9974D]" />
              <span>1. Selecciona tu perfil</span>
            </label>

            <div className="grid grid-cols-3 gap-2">
              {staffList.map((st) => {
                const isSelected = selectedUser === st.username;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => handleQuickUserSelect(st.username)}
                    className={`p-3 rounded-2xl border text-left flex flex-col transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#3A2418] text-[#FFF7EA] border-[#C9974D] shadow-md scale-[1.02]'
                        : 'bg-white text-[#2B1B13] border-[#F4E3C8] hover:border-[#C9974D]/60 hover:bg-[#FAF5ED]'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="font-bold text-xs truncate">{st.name}</span>
                      {isSelected && <Check className="w-3 h-3 text-[#C9974D]" />}
                    </div>
                    <span
                      className={`text-[9px] uppercase font-bold tracking-tight px-1.5 py-0.5 rounded-full inline-block w-max ${
                        isSelected
                          ? 'bg-[#4A2E1F] text-[#C9974D]'
                          : 'bg-[#FFF7EA] text-[#6B4028] border border-[#F4E3C8]'
                      }`}
                    >
                      {st.role === 'DUEÑA' ? 'Dueña' : st.role === 'ADMINISTRADOR' ? 'Admin' : st.role === 'ENCARGADO' ? 'Encargado' : st.role === 'CAJA' ? 'Caja' : st.role === 'MESERO' ? 'Mesero' : st.role === 'COCINA' ? 'Cocina' : 'Empleado'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. PIN / Contraseña */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-[#6B4028] uppercase tracking-wider flex items-center gap-1.5 font-serif">
                <KeyRound className="w-3.5 h-3.5 text-[#C9974D]" />
                <span>2. Ingresa tu PIN / contraseña</span>
              </label>

              <span className="text-[10px] text-[#A86B3D] font-medium">
                {pin.length} de 4 dígitos
              </span>
            </div>

            {/* Display del PIN */}
            <div className="flex items-center justify-center gap-3 py-3 px-4 bg-white rounded-2xl border border-[#F4E3C8] shadow-inner mb-3">
              {[0, 1, 2, 3].map((idx) => {
                const filled = pin.length > idx;
                return (
                  <div
                    key={idx}
                    className={`w-4 h-4 rounded-full transition-all duration-150 ${
                      filled
                        ? 'bg-[#3A2418] scale-110 shadow-xs'
                        : 'bg-[#F4E3C8] border border-[#E8D8C4]'
                    }`}
                  />
                );
              })}
            </div>

            {/* Numpad Táctil para iPad & Móvil */}
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((key) => {
                const isSpecial = key === 'C' || key === '⌫';
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      if (key === 'C') handleClearPin();
                      else if (key === '⌫') handleBackspace();
                      else handleNumpadPress(key);
                    }}
                    className={`py-3.5 rounded-2xl text-base font-bold transition-all active:scale-95 flex items-center justify-center cursor-pointer ${
                      isSpecial
                        ? 'bg-[#F4E3C8]/60 text-[#3A2418] hover:bg-[#F4E3C8] border border-[#F4E3C8] text-sm'
                        : 'bg-white text-[#2B1B13] hover:bg-[#FFF7EA] border border-[#F4E3C8] shadow-2xs text-lg'
                    }`}
                  >
                    {key}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Recordar Sesión en iPad / Celular */}
          <div className="bg-white/80 p-3.5 rounded-2xl border border-[#F4E3C8] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#3A2418] text-[#C9974D] flex items-center justify-center shrink-0">
                <Tablet className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-[#2B1B13]">
                  Mantener abierta en iPad de caja
                </span>
                <span className="text-[10px] text-[#6B4028]">
                  (En celulares personales puedes cerrar sesión al salir)
                </span>
              </div>
            </div>

            <input
              type="checkbox"
              id="remember"
              checked={rememberDevice}
              onChange={(e) => setRememberDevice(e.target.checked)}
              className="w-5 h-5 accent-[#3A2418] rounded cursor-pointer"
            />
          </div>

          {/* Botón Entrar */}
          <button
            type="submit"
            disabled={isSubmitting || pin.length < 4 || !cloudUser}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#3A2418] via-[#4A2E1F] to-[#2B1B13] hover:from-[#4A2E1F] hover:to-[#3A2418] active:scale-98 disabled:opacity-50 text-[#FFF7EA] font-bold text-sm sm:text-base shadow-xl flex items-center justify-center gap-2 border border-[#C9974D]/40 transition-all cursor-pointer"
          >
            <Lock className="w-4 h-4 text-[#C9974D]" />
            <span>{isSubmitting ? 'Verificando...' : 'Entrar a Administración'}</span>
          </button>

          <div className="text-center pt-1 border-t border-[#F4E3C8]">
            <p className="text-[10px] text-[#6B4028]">
              Por seguridad, las credenciales nunca se muestran en pantalla.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};
