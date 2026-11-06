import React, { useState } from 'react';
import { KeyRound, Plus, Power, Shield, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Confirm,
  CopyField,
  DataTable,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  StatusBadge,
} from '../../components/ui.jsx';
import { api, formatDate, initials } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../context/AppContext.jsx';

export default function AdminAdmins() {
  const { data, loading, error, reload } = useFetch('/api/admin/admins');
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', username: '', password: '' });
  const [credentials, setCredentials] = useState(null);
  const [target, setTarget] = useState(null);
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);

  const create = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api('/api/admin/admins', { method: 'POST', body: form });
      setCredentials(result.account);
      setCreateOpen(false);
      setForm({ fullName: '', email: '', username: '', password: '' });
      reload();
      toast('Administrator created.', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    setBusy(true);
    try {
      if (action === 'reset') {
        const result = await api(`/api/admin/admins/${target.id}/reset-password`, { method: 'POST' });
        setCredentials({ ...result, code: target.code });
      } else if (action === 'status') {
        await api(`/api/admin/admins/${target.id}/status`, {
          method: 'POST',
          body: { status: target.status === 'active' ? 'deactivated' : 'active' },
        });
        toast('Administrator status updated.', 'ok');
      } else if (action === 'delete') {
        await api(`/api/admin/admins/${target.id}`, { method: 'DELETE' });
        toast('Administrator removed.', 'ok');
      }
      setAction(null);
      setTarget(null);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const admins = data?.admins || [];

  return (
    <>
      <PageHeader
        eyebrow="Access control"
        title="Administrators"
        description="Full-control accounts. The workspace always keeps at least one active administrator and blocks self-deactivation."
        actions={
          <Button variant="primary" size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>
            Add administrator
          </Button>
        }
      />

      {loading ? <Loading label="Loading administrators…" /> : null}
      {error ? <ErrorState message={error.message} onRetry={reload} /> : null}

      {!loading && !error ? (
        <div className="panel" style={{ overflow: 'hidden' }}>
          <DataTable
            rows={admins}
            columns={[
              {
                key: 'name',
                header: 'Administrator',
                render: (row) => (
                  <div className="cell-person">
                    <span className="avatar">{initials(row.fullName)}</span>
                    <span>
                      <strong>{row.fullName} {row.isSelf ? <Badge tone="violet">You</Badge> : null}</strong>
                      <span>{row.code} · {row.email}</span>
                    </span>
                  </div>
                ),
              },
              { key: 'username', header: 'Username', render: (row) => <span className="mono">@{row.username}</span> },
              { key: 'lastLogin', header: 'Last sign-in', render: (row) => formatDate(row.lastLoginAt) },
              { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
              {
                key: 'actions',
                header: '',
                render: (row) => (
                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      title="Reset password"
                      onClick={() => {
                        setTarget(row);
                        setAction('reset');
                      }}
                    >
                      <KeyRound size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Toggle status"
                      disabled={row.isSelf}
                      onClick={() => {
                        setTarget(row);
                        setAction('status');
                      }}
                    >
                      <Power size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Delete"
                      disabled={row.isSelf}
                      onClick={() => {
                        setTarget(row);
                        setAction('delete');
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </div>
      ) : null}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add administrator"
        subtitle="Administrators can see every person, assessment and result in the workspace."
        footer={
          <>
            <Button variant="quiet" onClick={() => setCreateOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="iris" onClick={create} loading={busy}>Create administrator</Button>
          </>
        }
      >
        <form onSubmit={create} className="form-grid">
          <Field label="Full name" required htmlFor="admin-name">
            <Input id="admin-name" value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} required />
          </Field>
          <Field label="Email" required htmlFor="admin-email">
            <Input id="admin-email" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required />
          </Field>
          <div className="field-row">
            <Field label="Username" hint="Auto-derived if blank." htmlFor="admin-username">
              <Input id="admin-username" value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} />
            </Field>
            <Field label="Password" required htmlFor="admin-password">
              <Input id="admin-password" type="text" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} required minLength={8} />
            </Field>
          </div>
          <div className="banner">
            <Shield size={15} style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: '0.8rem' }}>The password is shown once. The administrator must change it at first sign-in.</span>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(credentials)}
        onClose={() => setCredentials(null)}
        title="Administrator credentials"
        subtitle="Shown once. Share over a secure channel only."
        footer={<Button variant="primary" onClick={() => setCredentials(null)}>Done</Button>}
      >
        {credentials ? (
          <div className="stack gap-3">
            <div className="banner banner--ok"><Shield size={15} /> {credentials.code}</div>
            <CopyField label="Username" value={credentials.username} />
            <CopyField label="Password" value={credentials.password} />
          </div>
        ) : null}
      </Modal>

      <Confirm
        open={action === 'reset'}
        onClose={() => setAction(null)}
        onConfirm={run}
        title={`Reset password for ${target?.fullName || ''}?`}
        message="A new one-time password is generated and other sessions are signed out."
        confirmLabel="Reset password"
        tone="primary"
        loading={busy}
      />
      <Confirm
        open={action === 'status'}
        onClose={() => setAction(null)}
        onConfirm={run}
        title={`${target?.status === 'active' ? 'Deactivate' : 'Reactivate'} ${target?.fullName || ''}?`}
        message="At least one active administrator must remain at all times."
        confirmLabel={target?.status === 'active' ? 'Deactivate' : 'Reactivate'}
        tone={target?.status === 'active' ? 'danger' : 'primary'}
        loading={busy}
      />
      <Confirm
        open={action === 'delete'}
        onClose={() => setAction(null)}
        onConfirm={run}
        title={`Delete ${target?.fullName || ''}?`}
        message="The account is removed from the directory. The audit trail keeps their past actions."
        confirmLabel="Delete administrator"
        loading={busy}
      />
    </>
  );
}
