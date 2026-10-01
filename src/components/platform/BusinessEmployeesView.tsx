import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, Lock, Plus, Shield, UserRound, UserRoundX } from 'lucide-react';
import type { BusinessPermission, BusinessRole } from '../../lib/restaurantCore';
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
  const [error, setError] = useState<string | null>(null);

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

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageEmployeeRole(managerRole, selectedRole)) {
      setError('Tu rol no puede asignar ese nivel de acceso.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createBusinessEmployee({ businessId, name, email, password, role: selectedRole });
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
    <div className="min-h-screen bg-[#F5F1EA] text-[#201610] px-4 py-6">
      <div className="mx-auto max-w-5xl">
        <button type="button" onClick={onBack} className="mb-5 rounded-xl border border-[#DEC8AE] bg-white px-3 py-2 text-xs font-bold text-[#6B4028]">← Volver al negocio</button>

        <section className="rounded-[2rem] border border-[#D9C5AC] bg-white p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wide text-[#A86B3D]">Equipo</span>
              <h1 className="mt-1 font-serif text-3xl font-black">Empleados y roles</h1>
              <p className="mt-2 text-sm text-[#6B4028]">Cada empleado tiene una cuenta propia y solo recibe los permisos de su rol.</p>
            </div>
            <button type="button" onClick={() => setShowForm((value) => !value)} className="rounded-2xl bg-[#3A2418] px-4 py-3 text-sm font-black text-white flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> Nuevo empleado
            </button>
          </div>

          {error && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>}

          {showForm && (
            <form onSubmit={create} className="mt-6 grid gap-4 rounded-2xl border border-[#E8D8C4] bg-[#FFFDF9] p-5 sm:grid-cols-2">
              <label className="text-sm font-bold">Nombre<input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 w-full rounded-xl border border-[#DEC8AE] p-3 font-normal" /></label>
              <label className="text-sm font-bold">Correo de acceso<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1 w-full rounded-xl border border-[#DEC8AE] p-3 font-normal" /></label>
              <label className="text-sm font-bold">Contraseña temporal<input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required className="mt-1 w-full rounded-xl border border-[#DEC8AE] p-3 font-normal" /></label>
              <label className="text-sm font-bold">Rol<select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as BusinessRole)} className="mt-1 w-full rounded-xl border border-[#DEC8AE] p-3 font-normal">{allowedRoles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></label>
              <div className="sm:col-span-2 flex items-center gap-2 text-xs text-[#6B4028]"><KeyRound className="w-4 h-4" /> Entrega esta contraseña al empleado para su primer acceso.</div>
              <button disabled={saving} className="sm:col-span-2 rounded-xl bg-[#A86B3D] px-4 py-3 font-black text-white disabled:opacity-50">{saving ? 'Creando…' : 'Crear acceso'}</button>
            </form>
          )}

          {loading ? (
            <div className="py-12 text-center text-sm text-[#6B4028]">Cargando equipo…</div>
          ) : (
            <div className="mt-6 space-y-3">
              {employees.length === 0 && <div className="rounded-2xl border border-dashed border-[#DEC8AE] p-8 text-center text-sm text-[#6B4028]">Todavía no hay empleados registrados.</div>}
              {employees.map((employee) => (
                <article key={employee.id} className="rounded-2xl border border-[#E8D8C4] bg-[#FFFDF9] p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-full bg-[#F1E2D0] flex items-center justify-center"><UserRound className="w-5 h-5 text-[#A86B3D]" /></div>
                      <div>
                        <strong className="block">{employee.name}</strong>
                        <span className="text-xs text-[#6B4028]">{employee.email}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={employee.role} onChange={(e) => void changeRole(employee.userId, e.target.value as BusinessRole)} className="rounded-xl border border-[#DEC8AE] bg-white px-3 py-2 text-xs font-bold">
                        {MANAGEABLE_EMPLOYEE_ROLES.filter((role) => canManageEmployeeRole(managerRole, role) || role === employee.role).map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                      </select>
                      <button type="button" onClick={() => void toggleActive(employee.userId, !employee.active)} className="rounded-xl border border-[#DEC8AE] px-3 py-2 text-xs font-black">{employee.active ? 'Activo' : 'Inactivo'}</button>
                      <button type="button" onClick={() => void remove(employee.userId)} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-black text-red-700"><UserRoundX className="inline w-4 h-4 mr-1" />Retirar</button>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold">
                      {employee.active ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Lock className="w-4 h-4 text-slate-500" />}
                      {employee.active ? 'Puede entrar al negocio' : 'Acceso bloqueado'}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {getRolePermissions(employee.role).map((permission) => (
                        <span key={permission} title={PERMISSION_LABELS[permission]} className="rounded-full bg-[#F4E7D8] px-2 py-1 text-[10px] font-bold text-[#6B4028]">{PERMISSION_LABELS[permission]}</span>
                      ))}
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-[#6B4028]"><strong>{ROLE_LABELS[employee.role]}:</strong> {ROLE_DESCRIPTIONS[employee.role]}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-5 rounded-[2rem] border border-[#D9C5AC] bg-white p-6">
          <div className="flex items-center gap-2"><Shield className="w-5 h-5 text-[#A86B3D]" /><h2 className="font-serif text-xl font-black">Roles protegidos</h2></div>
          <p className="mt-2 text-sm text-[#6B4028]">OWNER y SUPER_ADMIN no aparecen como roles asignables. Un empleado tampoco puede cambiar su propio rol desde este módulo.</p>
        </section>
      </div>
    </div>
  );
};
