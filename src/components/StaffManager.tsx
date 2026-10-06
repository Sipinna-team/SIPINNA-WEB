import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../lib/api';
import type { AccountState, AdminRole, StaffMember, Zone } from '../lib/api';

const ROLE_LABELS: Record<AdminRole, string> = {
  administrador: 'Administrador',
  alimentador: 'Alimentador',
};

type Filter = 'todas' | AccountState;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'activada', label: 'Activas' },
];

const EMPTY_FORM = {
  nombre: '',
  rol: 'alimentador' as AdminRole,
  zona_id: '',
  email: '',
  telefono: '',
  password: '',
  activar: true,
};

// La API espera un número
function normalizePhone(value: string) {
  const compact = value.replace(/[\s()-]/g, '');
  return /^\d{10}$/.test(compact) ? `+52${compact}` : compact;
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('') || '?';
}

// Vista ampliada del perfil del administrador
// activación / suspensión y cambio de rol o zona.
export function StaffManager() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('todas');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; rol: AdminRole; zona_id: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();

    Promise.all([api.getStaff(abortController.signal), api.getZones(abortController.signal)])
      .then(([staffData, zoneData]) => {
        // Go serializa un slice vacío como null.
        setStaff(staffData.staff ?? []);
        setZones(zoneData.zones ?? []);
      })
      .catch((err) => {
        if (!abortController.signal.aborted) setError(errorMessage(err, 'No se pudo cargar el personal'));
      })
      .finally(() => {
        if (!abortController.signal.aborted) setLoading(false);
      });

    return () => abortController.abort();
  }, []);

  const counts = useMemo(
    () => ({
      todas: staff.length,
      pendiente: staff.filter((m) => m.estado_cuenta === 'pendiente').length,
      activada: staff.filter((m) => m.estado_cuenta === 'activada').length,
    }),
    [staff],
  );

  const visible = filter === 'todas' ? staff : staff.filter((m) => m.estado_cuenta === filter);

  function replaceMember(member: StaffMember) {
    setStaff((current) => current.map((m) => (m.id === member.id ? member : m)));
  }

  async function update(id: string, payload: Parameters<typeof api.updateStaff>[1]) {
    setBusyId(id);
    setError(null);
    try {
      const { staff: member } = await api.updateStaff(id, payload);
      replaceMember(member);
      return true;
    } catch (err) {
      setError(errorMessage(err, 'No se pudo actualizar la cuenta'));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const ok = await update(editing.id, {
      rol: editing.rol,
      zona_id: editing.rol === 'alimentador' ? editing.zona_id : '',
    });
    if (ok) setEditing(null);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!form.email.trim() && !form.telefono.trim()) {
      setFormError('Escribe un correo o un teléfono.');
      return;
    }
    if (form.rol === 'alimentador' && !form.zona_id) {
      setFormError('Un alimentador necesita una zona asignada.');
      return;
    }

    setSaving(true);
    try {
      const { staff: member } = await api.createStaff({
        ...form,
        nombre: form.nombre.trim(),
        email: form.email.trim(),
        telefono: form.telefono.trim() ? normalizePhone(form.telefono) : '',
        zona_id: form.rol === 'alimentador' ? form.zona_id : null,
      });
      setStaff((current) => [member, ...current]);
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err) {
      setFormError(errorMessage(err, 'No se pudo crear la cuenta'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="staff" aria-labelledby="staff-title">
      <div className="staff-header">
        <h3 id="staff-title" className="dashboard-subtitle">Gestionar administradores</h3>
        <button
          type="button"
          className="staff-button staff-button--primary"
          aria-expanded={showForm}
          onClick={() => {
            setShowForm((open) => !open);
            setFormError(null);
          }}
        >
          {showForm ? 'Cancelar' : 'Nueva cuenta'}
        </button>
      </div>

      {showForm && (
        <form className="staff-form" onSubmit={handleCreate}>
          <label className="staff-field staff-field--wide">
            Nombre completo
            <input
              required
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              autoComplete="off"
            />
          </label>
          <label className="staff-field">
            Rol
            <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value as AdminRole })}>
              <option value="alimentador">Alimentador</option>
              <option value="administrador">Administrador</option>
            </select>
          </label>
          <label className="staff-field">
            Zona
            <select
              value={form.rol === 'alimentador' ? form.zona_id : ''}
              disabled={form.rol !== 'alimentador'}
              onChange={(e) => setForm({ ...form, zona_id: e.target.value })}
            >
              <option value="">{form.rol === 'alimentador' ? 'Selecciona una zona' : 'Todas las zonas'}</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>{zone.name}</option>
              ))}
            </select>
          </label>
          <label className="staff-field">
            Correo
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              autoComplete="off"
            />
          </label>
          <label className="staff-field">
            Teléfono
            <input
              type="tel"
              placeholder="10 dígitos"
              value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              autoComplete="off"
            />
          </label>
          <label className="staff-field">
            Contraseña temporal
            <input
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="new-password"
            />
          </label>
          <label className="staff-check">
            <input
              type="checkbox"
              checked={form.activar}
              onChange={(e) => setForm({ ...form, activar: e.target.checked })}
            />
            Activar la cuenta ahora
          </label>
          {formError && <p className="staff-error staff-field--wide" role="alert">{formError}</p>}
          <div className="staff-form-actions">
            <button type="submit" className="staff-button staff-button--primary" disabled={saving}>
              {saving ? 'Creando…' : 'Crear cuenta'}
            </button>
          </div>
        </form>
      )}

      <div className="staff-filters" role="tablist" aria-label="Filtrar cuentas">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            className={`staff-filter${filter === key ? ' is-current' : ''}`}
            onClick={() => setFilter(key)}
          >
            {label} <span>{counts[key]}</span>
          </button>
        ))}
      </div>

      {error && <p className="staff-error" role="alert">{error}</p>}
      {loading && <p className="dashboard-muted">Cargando cuentas…</p>}
      {!loading && visible.length === 0 && !error && (
        <p className="dashboard-muted">No hay cuentas en esta lista.</p>
      )}

      <ul className="staff-list">
        {visible.map((member) => {
          const isEditing = editing?.id === member.id;
          const busy = busyId === member.id;
          return (
            <li key={member.id} className="staff-item">
              <span className="dashboard-recent-avatar" aria-hidden="true">{initials(member.nombre)}</span>
              <span className="staff-who">
                <strong>{member.nombre || 'Sin nombre'}</strong>
                <span className="dashboard-muted">{member.email || member.telefono || 'Sin contacto'}</span>
              </span>

              {isEditing ? (
                <span className="staff-edit">
                  <select
                    aria-label="Rol"
                    value={editing.rol}
                    onChange={(e) => setEditing({ ...editing, rol: e.target.value as AdminRole })}
                  >
                    <option value="alimentador">Alimentador</option>
                    <option value="administrador">Administrador</option>
                  </select>
                  {editing.rol === 'alimentador' && (
                    <select
                      aria-label="Zona"
                      value={editing.zona_id}
                      onChange={(e) => setEditing({ ...editing, zona_id: e.target.value })}
                    >
                      <option value="">Selecciona una zona</option>
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>{zone.name}</option>
                      ))}
                    </select>
                  )}
                </span>
              ) : (
                <span className="staff-role">
                  <span>{ROLE_LABELS[member.rol] ?? member.rol}</span>
                  <span className="dashboard-muted">
                    {member.rol === 'administrador' ? 'Todas las zonas' : member.zona_nombre || 'Sin zona'}
                  </span>
                </span>
              )}

              <span className={`staff-status staff-status--${member.estado_cuenta}`}>
                {member.estado_cuenta === 'activada' ? 'Activa' : 'Pendiente'}
              </span>

              <span className="staff-actions">
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      className="staff-button staff-button--primary"
                      disabled={busy || (editing.rol === 'alimentador' && !editing.zona_id)}
                      onClick={saveEdit}
                    >
                      Guardar
                    </button>
                    <button type="button" className="staff-button" disabled={busy} onClick={() => setEditing(null)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    {member.estado_cuenta === 'pendiente' ? (
                      <button
                        type="button"
                        className="staff-button staff-button--primary"
                        disabled={busy}
                        onClick={() => update(member.id, { estado_cuenta: 'activada' })}
                      >
                        Activar
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="staff-button"
                        disabled={busy}
                        onClick={() => update(member.id, { estado_cuenta: 'pendiente' })}
                      >
                        Suspender
                      </button>
                    )}
                    <button
                      type="button"
                      className="staff-button"
                      disabled={busy}
                      onClick={() => setEditing({ id: member.id, rol: member.rol, zona_id: member.zona_id ?? '' })}
                    >
                      Editar
                    </button>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
