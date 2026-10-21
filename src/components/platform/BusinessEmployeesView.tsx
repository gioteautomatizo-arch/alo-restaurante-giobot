import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, Lock, Plus, Shield, UserRound, UserRoundX } from 'lucide-react';
import type { BusinessPermission, BusinessRole } from '../../lib/restaurantCore';
import { BUSINESS_INVITES_ENABLED, createBusinessInvite, listBusinessInvites, revokeBusinessInvite, type PendingBusinessInvite } from '../../lib/businessInvitesService';
import {
  canManageEmployeeRole,
  createBusinessEmployee,
  getRolePermissions,
  listBusinessEmployees,
  MANAGEABLE_EMPLOYEE_ROLES,
  removeBusinessEmployee,
  updateBusinessEmployee,
} from '../../lib/businessEmployeeService';

const ROLE_LABELS: Record<BusinessRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  OWNER: 'Propietario',
  ADMIN: 'Administrador',
  MANAGER: 'Encargado',
  CASHIER: 'Caja',
  WAITER: 'Mesero',
  KITCHEN: 'Cocina',
  EMPLOYEE: 'Empleado',
  CLIENT: 'Cliente',
};

const PERMISSION_LABELS: Record<BusinessPermission, string> = {
  'platform.manage': 'Administrar plataforma',
  'business.view': 'Ver negocio',
  'business.manage': 'Administrar negocio',
  'catalog.view': 'Ver catálogo',
  'catalog.manage': 'Administrar catálogo',
  'orders.view': 'Ver pedidos',
  'orders.manage': 'Gestionar pedidos',
  'pos.use': 'Usar POS',
  'inventory.view': 'Ver inventario',
  'inventory.manage': 'Administrar inventario',
  'customers.view': 'Ver clientes',
  'customers.manage': 'Administrar clientes',
  'employees.view': 'Ver empleados',
  'employees.manage': 'Administrar empleados',
  'ai.use': 'Usar IA',
  'ai.manage': 'Administrar IA',
  'reports.view': 'Ver reportes',
};

const ROLE_DESCRIPTIONS: Record<BusinessRole, string> = {
  SUPER_ADMIN: 'Control de plataforma.',
  OWNER: 'Control total del negocio.',
  ADMIN: 'Administra la operación y al equipo.',
  MANAGER: 'Gestiona operación y personal operativo.',
  CASHIER: 'Caja, pedidos y clientes.',
  WAITER: 'Pedidos, POS y atención de clientes.',
  KITCHEN: 'Pedidos y operación de cocina.',
  EMPLOYEE: 'Consulta básica de operación.',
  CLIENT: 'Acceso de cliente.',
};

export const BusinessEmployeesView: React.FC<{
  businessId: string;
  managerRole: BusinessRole;
  onBack: () => void;
}> = ({ businessId, managerRole, onBack }) => {
  const [employees, setEmployees] = useState<Awaited<ReturnType<typeof listBusinessEmployees>>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedRole, setSelectedRole] = useState<BusinessRole>('EMPLOYEE');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountMode, setAccountMode] = useState<'new' | 'existing'>('new');
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState('');
  const [pendingInvites, setPendingInvites] = useState<PendingBusinessInvite[]>([]);

  const allowedRoles = useMemo(
    () => MANAGEABLE_EMPLOYEE_ROLES.filter((role) => canManageEmployeeRole(managerRole, role)),
    [managerRole],
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setEmployees(await listBusinessEmployees(businessId));
    } catch (err: any) {
      setError(err?.message || 'No pudimos cargar los empleados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [businessId]);
  useEffect(() => { if (BUSINESS_INVITES_ENABLED) void listBusinessInvites(businessId).then(setPendingInvites).catch(() => {}); }, [businessId]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageEmployeeRole(managerRole, selectedRole)) {
      setError('Tu rol no puede asignar ese nivel de acceso.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createBusinessEmployee({ businessId, name, email, password, role: selectedRole, accountMode });
      setName('');
      setEmail('');
      setPassword('');
      setSelectedRole(allowedRoles[allowedRoles.length - 1] || 'EMPLOYEE');
      setShowForm(false);
      await load();
    } catch (err: any) {
      setError(err?.message || 'No pudimos crear el empleado.');
    } finally {
      setSaving(false);
    }
  };

  const createInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageEmployeeRole(managerRole, selectedRole)) {
      setError('No tienes permiso para invitar a ese rol.');
      return;
    }
    setSaving(true); setError(null); setInviteLink('');
    try {
      const result = await createBusinessInvite(businessId, name, email, selectedRole as Parameters<typeof createBusinessInvite>[3]);
      // URL fragment: tokens are not part of the HTTP request path or analytics.
      setInviteLink(window.location.origin + window.location.pathname + '#invite/' + result.token);
      setPendingInvites(await listBusinessInvites(businessId));
    } catch (err: any) {
      setError(err?.message || 'No pudimos generar la invitación.');
    } finally { setSaving(false); }
  };

  const cancelInvite = async (id: string) => {
    if (!window.confirm('¿Cancelar esta invitación? El enlace dejará de funcionar.')) return;
    setError(null);
    try {
      await revokeBusinessInvite(businessId, id);
      setInviteLink('');
      setPendingInvites(await listBusinessInvites(businessId));
    } catch (err: any) { setError(err?.message || 'No pudimos cancelar la invitación.'); }
  };

  const changeRole = async (userId: string, role: BusinessRole) => {
    if (!canManageEmployeeRole(managerRole, role)) {
      setError('Tu rol no puede asignar ese nivel de acceso.');
      return;
    }
    try {
      await updateBusinessEmployee(businessId, userId, { role });
      await load();
    } catch (err: any) {
      setError(err?.message || 'No pudimos cambiar el rol.');
    }
  };

  const toggleActive = async (userId: string, active: boolean) => {
    try {
      await updateBusinessEmployee(businessId, userId, { active });
      await load();
    } catch (err: any) {
      setError(err?.message || 'No pudimos actualizar el acceso.');
    }
  };

  const remove = async (userId: string) => {
    if (!window.confirm('¿Retirar el acceso de este empleado al negocio? La cuenta de Firebase no se elimina.')) return;
    try {
      await removeBusinessEmployee(businessId, userId);
      await load();
    } catch (err: any) {
      setError(err?.message || 'No pudimos retirar al empleado.');
    }
  };

  return (
    <div className="text-[#F7F7F7] px-0 py-2">
      <div className="mx-auto max-w-5xl">
        <button data-biz-back type="button" onClick={onBack} className="mb-5 rounded-xl border border-[#3A3022] bg-[#111111] px-3 py-2 text-xs font-bold text-[#C8C8C8]">← Volver al negocio</button>

        <section className="rounded-[2rem] border border-[#3A3022] bg-[#111111] p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wide text-[#E3BC6B]">Equipo</span>
              <h1 className="mt-1 font-serif text-3xl font-black">Empleados y roles</h1>
              <p className="mt-2 text-sm text-[#C8C8C8]">Cada empleado tiene una cuenta propia y solo recibe los permisos de su rol.</p>
            </div>
            <button type="button" onClick={() => setShowForm((value) => !value)} className="rounded-2xl bg-[#D6A34A] px-4 py-3 text-sm font-black text-[#050505] flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> {BUSINESS_INVITES_ENABLED ? 'Invitar empleado' : 'Nuevo empleado'}
            </button>
          </div>

          {error && <div className="mt-5 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}

          {inviteLink && <div className="mt-5 rounded-xl border border-emerald-700/40 bg-emerald-950/30 p-4">
            <p className="text-sm font-bold">Invitación creada. Comparte el enlace únicamente con el empleado.</p>
            <input readOnly aria-label="Enlace de invitación" className="mt-2 w-full rounded-lg bg-black p-2 text-xs text-white" value={inviteLink} />
            <button type="button" onClick={() => void navigator.clipboard.writeText(inviteLink).catch(() => setError('Selecciona y copia el enlace manualmente.'))} className="mt-3 rounded-lg bg-amber-300 px-4 py-2 text-xs font-bold text-black">Copiar enlace</button>
            <p className="mt-2 text-xs text-gray-300">Vence en 72 horas. Solo funciona con el correo invitado y su cuenta verificada.</p>
          </div>}
          {BUSINESS_INVITES_ENABLED && pendingInvites.length > 0 && (
            <div className="mt-5 space-y-2 rounded-xl border border-white/10 p-4">
              <strong className="text-sm">Invitaciones pendientes</strong>
              {pendingInvites.map(invite => <div key={invite.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/5 p-3 text-xs">
                <span>{invite.name} · {invite.email} · {ROLE_LABELS[invite.role]} · {Date.now() > invite.expiresAt ? 'Vencida' : 'Pendiente'}</span>
                <button type="button" onClick={() => void cancelInvite(invite.id)} className="rounded-lg border border-red-300/30 px-3 py-2 text-red-200">Cancelar</button>
              </div>)}
            </div>
          )}
          {showForm && (
            <form onSubmit={BUSINESS_INVITES_ENABLED ? createInvite : create} className="mt-6 grid gap-4 rounded-2xl border border-[#3A3022] bg-[#0B0B0B] p-5 sm:grid-cols-2">
              <label className="text-sm font-bold">Nombre<input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 w-full rounded-xl border border-[#3A3022] bg-[#0B0B0B] p-3 font-normal text-[#F7F7F7]" /></label>
              <label className="text-sm font-bold">Correo de acceso<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1 w-full rounded-xl border border-[#3A3022] bg-[#0B0B0B] p-3 font-normal text-[#F7F7F7]" /></label>
              {!BUSINESS_INVITES_ENABLED && <label className="text-sm font-bold">Tipo de cuenta
                <select value={accountMode} onChange={(e) => setAccountMode(e.target.value as 'new' | 'existing')} className="mt-1 w-full rounded-xl border border-[#3A3022] bg-[#0B0B0B] p-3 font-normal text-[#F7F7F7]">
                  <option value="new">Crear cuenta nueva</option>
                  <option value="existing">Usar cuenta existente</option>
                </select>
              </label>}
              {!BUSINESS_INVITES_ENABLED && <label className="text-sm font-bold">{accountMode === 'new' ? 'Contraseña temporal' : 'Contraseña de la cuenta (opcional si usa Google)'}<input type="password" minLength={accountMode === 'new' ? 6 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} required={accountMode === 'new'} className="mt-1 w-full rounded-xl border border-[#3A3022] bg-[#0B0B0B] p-3 font-normal text-[#F7F7F7]" /></label>}
              <label className="text-sm font-bold">Rol<select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as BusinessRole)} className="mt-1 w-full rounded-xl border border-[#3A3022] bg-[#0B0B0B] p-3 font-normal text-[#F7F7F7]">{allowedRoles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></label>
              {!BUSINESS_INVITES_ENABLED && <div className="sm:col-span-2 flex items-center gap-2 text-xs text-[#C8C8C8]"><KeyRound className="w-4 h-4" /> {accountMode === 'new' ? 'Se creará una cuenta nueva con este correo.' : 'La cuenta existente se validará con su contraseña o, si usa Google, podrás seleccionar ese mismo correo en la ventana de Google.'}</div>}
              <button disabled={saving} className="sm:col-span-2 rounded-xl bg-[#D6A34A] px-4 py-3 font-black text-[#050505] disabled:opacity-50">{saving ? 'Guardando…' : BUSINESS_INVITES_ENABLED ? 'Generar invitación' : 'Crear acceso'}</button>
            </form>
          )}

          {loading ? (
            <div className="py-12 text-center text-sm text-[#C8C8C8]">Cargando equipo…</div>
          ) : (
            <div className="mt-6 space-y-3">
              {employees.length === 0 && <div className="rounded-2xl border border-dashed border-[#3A3022] p-8 text-center text-sm text-[#C8C8C8]">Todavía no hay empleados registrados.</div>}
              {employees.map((employee) => (
                <article key={employee.id} className="rounded-2xl border border-[#3A3022] bg-[#0B0B0B] p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-full bg-[#1A1A1A] flex items-center justify-center"><UserRound className="w-5 h-5 text-[#E3BC6B]" /></div>
                      <div>
                        <strong className="block">{employee.name}</strong>
                        <span className="text-xs text-[#C8C8C8]">{employee.email}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={employee.role} onChange={(e) => void changeRole(employee.userId, e.target.value as BusinessRole)} className="rounded-xl border border-[#3A3022] bg-[#0B0B0B] px-3 py-2 text-xs font-bold text-[#F7F7F7]">
                        {MANAGEABLE_EMPLOYEE_ROLES.filter((role) => canManageEmployeeRole(managerRole, role) || role === employee.role).map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                      </select>
                      <button type="button" onClick={() => void toggleActive(employee.userId, !employee.active)} className="rounded-xl border border-[#3A3022] px-3 py-2 text-xs font-black text-[#F7F7F7]">{employee.active ? 'Activo' : 'Inactivo'}</button>
                      <button type="button" onClick={() => void remove(employee.userId)} className="rounded-xl border border-rose-500/40 px-3 py-2 text-xs font-black text-rose-300"><UserRoundX className="inline w-4 h-4 mr-1" />Retirar</button>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold">
                      {employee.active ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4 text-[#B7B7B7]" />}
                      {employee.active ? 'Puede entrar al negocio' : 'Acceso bloqueado'}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {getRolePermissions(employee.role).map((permission) => (
                        <span key={permission} title={PERMISSION_LABELS[permission]} className="rounded-full bg-[#1A1A1A] px-2 py-1 text-[10px] font-bold text-[#C8C8C8]">{PERMISSION_LABELS[permission]}</span>
                      ))}
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-[#C8C8C8]"><strong>{ROLE_LABELS[employee.role]}:</strong> {ROLE_DESCRIPTIONS[employee.role]}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-5 rounded-[2rem] border border-[#3A3022] bg-[#111111] p-6">
          <div className="flex items-center gap-2"><Shield className="w-5 h-5 text-[#E3BC6B]" /><h2 className="font-serif text-xl font-black">Roles protegidos</h2></div>
          <p className="mt-2 text-sm text-[#C8C8C8]">OWNER y SUPER_ADMIN no aparecen como roles asignables. Un empleado tampoco puede cambiar su propio rol desde este módulo.</p>
        </section>
      </div>
    </div>
  );
};
