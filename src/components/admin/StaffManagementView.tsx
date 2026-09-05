import React, { useState } from 'react';
import { StaffUser, UserRole } from '../../types';
import { getStaffUsers, saveStaffUsers, addActivityLog, formatLocalDate } from '../../lib/adminStorage';
import {
  Users,
  Plus,
  Shield,
  KeyRound,
  CheckCircle2,
  Lock,
  Phone,
  UserCheck,
  Edit2,
  Trash2,
} from 'lucide-react';

interface StaffManagementViewProps {
  currentUser: StaffUser;
  onRefreshStats: () => void;
}

export const StaffManagementView: React.FC<StaffManagementViewProps> = ({
  currentUser,
  onRefreshStats,
}) => {
  const [users, setUsers] = useState<StaffUser[]>(getStaffUsers());
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);

  // Form states
  const [name, setName] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [role, setRole] = useState<UserRole>('EMPLEADO');
  const [pin, setPin] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const refreshUsers = () => {
    setUsers(getStaffUsers());
  };

  React.useEffect(() => {
    const handleDataChange = () => {
      refreshUsers();
    };
    window.addEventListener('alo_admin_data_updated', handleDataChange);
    window.addEventListener('storage', handleDataChange);
    return () => {
      window.removeEventListener('alo_admin_data_updated', handleDataChange);
      window.removeEventListener('storage', handleDataChange);
    };
  }, []);

  const handleOpenAdd = () => {
    setEditingUser(null);
    setName('');
    setUsername('');
    setRole('EMPLEADO');
    setPin('');
    setPhone('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: StaffUser) => {
    setEditingUser(user);
    setName(user.name);
    setUsername(user.username);
    setRole(user.role);
    setPin(user.pin);
    setPhone(user.phone || '');
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !username.trim() || pin.length < 4) {
      alert('Por favor completa todos los campos requeridos y un PIN de al menos 4 dígitos.');
      return;
    }

    const currentList = getStaffUsers();

    if (editingUser) {
      // Update
      const updatedList = currentList.map((u) => {
        if (u.id === editingUser.id) {
          return {
            ...u,
            name: name.trim(),
            username: username.trim().toLowerCase(),
            role,
            pin: pin.trim(),
            phone: phone.trim(),
          };
        }
        return u;
      });

      await saveStaffUsers(updatedList);
      addActivityLog({
        userName: currentUser.name,
        userId: currentUser.id,
        userRole: currentUser.role,
        action: `${currentUser.name} actualizó datos del colaborador ${name} (${role})`,
        category: 'usuario',
      });
      setSuccessMsg(`Colaborador ${name} actualizado.`);
    } else {
      // Create
      const newUser: StaffUser = {
        id: `staff_${Date.now()}_${username.trim().toLowerCase()}`,
        name: name.trim(),
        username: username.trim().toLowerCase(),
        role,
        pin: pin.trim(),
        phone: phone.trim(),
        active: true,
        createdAt: formatLocalDate(new Date()),
      };

      await saveStaffUsers([...currentList, newUser]);
      addActivityLog({
        userName: currentUser.name,
        userId: currentUser.id,
        userRole: currentUser.role,
        action: `${currentUser.name} dio de alta a un nuevo colaborador: ${name} (${role})`,
        category: 'usuario',
      });
      setSuccessMsg(`Nuevo colaborador ${name} creado con éxito.`);
    }

    setTimeout(() => setSuccessMsg(null), 3000);
    setIsModalOpen(false);
    refreshUsers();
    onRefreshStats();
  };

  const handleToggleActive = async (user: StaffUser) => {
    if (user.id === currentUser.id) {
      alert('No puedes desactivar tu propia cuenta activa.');
      return;
    }

    const currentList = getStaffUsers();
    const updated = currentList.map((u) => {
      if (u.id === user.id) {
        return { ...u, active: !u.active };
      }
      return u;
    });

    await saveStaffUsers(updated);
    addActivityLog({
      userName: currentUser.name,
      userId: currentUser.id,
      userRole: currentUser.role,
      action: `${currentUser.name} cambió estado de ${user.name} a ${!user.active ? 'Activo' : 'Inactivo'}`,
      category: 'usuario',
    });
    refreshUsers();
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs sm:text-sm font-medium flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#F4E3C8] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFF7EA] text-[#A86B3D] text-xs font-bold uppercase tracking-wider mb-1 font-serif border border-[#F4E3C8]">
            <Users className="w-3.5 h-3.5" />
            <span>Permisos & Accesos</span>
          </div>
          <h2 className="font-serif font-bold text-xl sm:text-2xl text-[#2B1B13]">
            Equipo & Colaboradores del Restaurante
          </h2>
          <p className="text-xs text-[#6B4028] mt-0.5">
            Administra los roles, PINs de acceso para iPad/Móviles y niveles de seguridad del personal.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-5 py-3 rounded-2xl bg-[#3A2418] hover:bg-[#6B4028] text-[#FFF7EA] font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4 text-[#C9974D]" />
          <span>Nuevo Colaborador</span>
        </button>
      </div>

      {/* Lista de Colaboradores */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {users.map((u) => {
          const isMe = u.id === currentUser.id;
          return (
            <div
              key={u.id}
              className={`bg-white rounded-3xl border p-5 shadow-xs flex flex-col justify-between space-y-4 ${
                !u.active
                  ? 'opacity-60 border-stone-200 bg-stone-50'
                  : u.role === 'ADMINISTRADOR'
                  ? 'border-[#C9974D]/50 ring-1 ring-[#C9974D]/20'
                  : 'border-[#F4E3C8]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                      u.role === 'DUEÑA'
                        ? 'bg-[#C9974D] text-[#3A2418] border border-[#3A2418]/20'
                        : u.role === 'ADMINISTRADOR'
                        ? 'bg-[#3A2418] text-[#C9974D]'
                        : u.role === 'ENCARGADO'
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-emerald-100 text-emerald-900'
                    }`}
                  >
                    {u.role}
                  </span>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      u.active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {u.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#3A2418] text-[#C9974D] font-serif font-bold text-lg flex items-center justify-center shadow-xs">
                    {u.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-base text-[#2B1B13] flex items-center gap-1.5">
                      <span>{u.name}</span>
                      {isMe && (
                        <span className="text-[10px] bg-[#FFF7EA] text-[#A86B3D] font-sans px-1.5 py-0.5 rounded-sm border border-[#F4E3C8]">
                          (Tú)
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-[#A86B3D] font-mono">@{u.username}</p>
                  </div>
                </div>

                <div className="mt-4 space-y-1.5 text-xs text-[#6B4028] bg-[#FFF7EA] p-3 rounded-2xl border border-[#F4E3C8]">
                  <div className="flex items-center justify-between">
                    <span className="text-[#6B4028]">PIN de acceso:</span>
                    <span className="font-mono font-bold text-[#2B1B13]">•••• ({u.pin})</span>
                  </div>
                  {u.phone && (
                    <div className="flex items-center justify-between">
                      <span className="text-[#6B4028]">Teléfono:</span>
                      <span className="font-medium text-[#2B1B13]">{u.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F4E3C8]/60">
                <button
                  type="button"
                  onClick={() => handleToggleActive(u)}
                  disabled={isMe}
                  className="px-3 py-1.5 text-xs font-bold text-[#6B4028] hover:text-[#2B1B13] disabled:opacity-30 cursor-pointer"
                >
                  {u.active ? 'Desactivar' : 'Activar'}
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenEdit(u)}
                  className="px-4 py-1.5 bg-[#3A2418] hover:bg-[#6B4028] text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5 text-[#C9974D]" />
                  <span>Editar</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Crear / Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2B1B13]/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-[#FFF7EA] text-[#2B1B13] rounded-3xl shadow-2xl border border-[#C9974D]/40 overflow-hidden">
            <div className="bg-[#3A2418] text-[#FFF7EA] p-5 border-b border-[#4E3222] flex items-center justify-between">
              <h3 className="font-serif font-bold text-lg flex items-center gap-2">
                <Users className="w-5 h-5 text-[#C9974D]" />
                <span>{editingUser ? 'Editar Colaborador' : 'Nuevo Colaborador'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[#F4E3C8] hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider mb-1 font-serif">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Alondra Pérez"
                  className="w-full px-4 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-[#2B1B13] text-xs sm:text-sm font-medium focus:border-[#C9974D] focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider mb-1 font-serif">
                    Usuario / Alias *
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="alondra"
                    className="w-full px-4 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-[#2B1B13] text-xs font-medium focus:border-[#C9974D] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider mb-1 font-serif">
                    PIN Numérico (4-6 dígitos) *
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    required
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="••••"
                    className="w-full px-4 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-[#2B1B13] font-mono font-bold text-sm focus:border-[#C9974D] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider mb-1 font-serif">
                  Rol y Permisos
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-xs font-bold text-[#2B1B13] focus:border-[#C9974D] focus:outline-hidden"
                >
                  <option value="DUEÑA">👑 DUEÑA (Máxima autoridad & Acceso total)</option>
                  <option value="ADMINISTRADOR">🛡️ ADMINISTRADOR (Acceso total & Auditoría)</option>
                  <option value="ENCARGADO">⭐ ENCARGADO (Caja, Cortes, Menú & Gastos)</option>
                  <option value="EMPLEADO">👤 EMPLEADO (Operación, Comandas & Gastos turno)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2B1B13] uppercase tracking-wider mb-1 font-serif">
                  Teléfono de Contacto (Opcional)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="55 1234 5678"
                  className="w-full px-4 py-2.5 bg-white rounded-xl border border-[#F4E3C8] text-xs text-[#2B1B13] focus:border-[#C9974D] focus:outline-hidden"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 py-3 rounded-xl border border-[#F4E3C8] text-[#6B4028] font-bold text-xs hover:bg-[#F4E3C8]/40 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-3 rounded-xl bg-[#3A2418] hover:bg-[#6B4028] text-white font-bold text-xs shadow-md cursor-pointer"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
