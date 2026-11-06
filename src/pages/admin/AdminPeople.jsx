import React, { useMemo, useState } from 'react';
import {
  BadgeCheck,
  Download,
  KeyRound,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Badge,
  Button,
  Check,
  Confirm,
  CopyField,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  SearchInput,
  Segmented,
  Select,
  StatusBadge,
  Textarea,
  Check as Checkbox,
} from '../../components/ui.jsx';
import { api, formatDate, initials, titleCase } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../context/AppContext.jsx';

function PersonDetail({ personId, onClose, onChanged }) {
  const { data, loading, error } = useFetch(personId ? `/api/admin/employees/${personId}` : null);
  const [tab, setTab] = useState('overview');

  return (
    <Modal open={Boolean(personId)} onClose={onClose} title="Account detail" size="wide">
      {loading ? <Loading /> : null}
      {error ? <ErrorState message={error.message} /> : null}
      {data?.person ? (
        <>
          <div className="person-drawer">
            <span className="avatar avatar--lg">{initials(data.person.fullName)}</span>
            <div style={{ flex: 1 }}>
              <h3>{data.person.fullName}</h3>
              <p>
                {data.person.code} · {data.person.email} · @{data.person.username}
              </p>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <StatusBadge status={data.person.status} />
                <Badge tone="violet">{titleCase(data.person.accountType)}</Badge>
                {data.person.departmentNote ? <Badge>{data.person.departmentNote}</Badge> : null}
                {data.person.restrictToAssigned ? <Badge tone="info">Assigned exams only</Badge> : null}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onChanged}>Refresh</Button>
          </div>

          <div className="drawer-tabs">
            {[
              ['overview', 'Overview'],
              ['attempts', `Attempts (${data.person.attempts.length})`],
              ['readiness', `Readiness (${data.person.readiness.length})`],
              ['guidelines', 'Guidelines'],
            ].map(([key, label]) => (
              <button key={key} type="button" className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>

          <div className="tab-content">
            {tab === 'overview' ? (
              <div className="stack gap-4">
                <div className="meta-grid">
                  <div className="meta-item"><small>Created</small><span>{formatDate(data.person.createdAt)}</span></div>
                  <div className="meta-item"><small>Last login</small><span>{formatDate(data.person.lastLoginAt)}</span></div>
                  <div className="meta-item"><small>Last active</small><span>{formatDate(data.person.lastActiveAt)}</span></div>
                  <div className="meta-item"><small>Assignments</small><span>{data.person.assignments.length}</span></div>
                </div>
                <div>
                  <h4 className="h4" style={{ marginBottom: 8, fontSize: '0.85rem' }}>Assigned assessments</h4>
                  <div className="pill-row">
                    {data.person.assignments.length ? data.person.assignments.map((assignment) => (
                      <span className="chip" key={assignment.id}>{assignment.title}</span>
                    )) : <span style={{ fontSize: '0.8rem', color: 'var(--faint)' }}>No explicit assignments (sees all published).</span>}
                  </div>
                </div>
              </div>
            ) : null}

            {tab === 'attempts' ? (
              data.person.attempts.length ? (
                <div className="panel">
                  <div className="list">
                    {data.person.attempts.map((attempt) => (
                      <div className="list__row" key={attempt.id}>
                        <div className="list__main">
                          <div className="list__title">
                            {attempt.title}
                            <StatusBadge status={attempt.status} />
                            {attempt.released ? <Badge tone="ok">Released</Badge> : null}
                          </div>
                          <div className="list__sub">
                            <span>{attempt.percentage == null ? 'Not scored' : `${attempt.percentage}%`}</span>
                            <span>·</span>
                            <span>{formatDate(attempt.submittedAt)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState icon={BadgeCheck} title="No attempts yet" description="Assessment attempts will appear here." />
              )
            ) : null}

            {tab === 'readiness' ? (
              data.person.readiness.length ? (
                <div className="list panel">
                  {data.person.readiness.map((row) => (
                    <div className="list__row" key={row.projectId}>
                      <div className="list__main">
                        <div className="list__title">{row.name} <StatusBadge status={row.status} /></div>
                        <div className="list__sub">Updated {formatDate(row.updatedAt)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={BadgeCheck} title="No project records" description="Readiness decisions appear here." />
              )
            ) : null}

            {tab === 'guidelines' ? (
              <div className="list panel">
                {data.person.guidelineProgress.map((guideline) => (
                  <div className="list__row" key={guideline.id}>
                    <div className="list__main">
                      <div className="list__title">
                        {guideline.title}
                        <Badge>v{guideline.version}</Badge>
                      </div>
                      <div className="list__sub">
                        {guideline.acknowledged
                          ? 'Acknowledged'
                          : guideline.needsReview
                            ? `Read v${guideline.readVersion} — needs re-read`
                            : 'Not opened'}
                        {' · '}
                        {Math.round((guideline.secondsSpent || 0) / 60)} min spent
                      </div>
                    </div>
                    {guideline.acknowledged ? <Badge tone="ok">Ack</Badge> : <Badge tone="warn">Pending</Badge>}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </Modal>
  );
}

export default function AdminPeople({ mode = 'employee' }) {
  const isCandidate = mode === 'candidate';
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const query = `/api/admin/employees?type=${mode}&search=${encodeURIComponent(search)}&status=${status}`;
  const { data, loading, error, reload } = useFetch(query, [search, status]);
  const { data: directory } = useFetch('/api/admin/directory');

  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [promoteTarget, setPromoteTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const people = data?.people || [];
  const assessments = directory?.assessments?.filter((a) => a.status !== 'archived') || [];

  const emptyForm = {
    fullName: '',
    email: '',
    username: '',
    password: '',
    departmentNote: '',
    assessmentIds: [],
    restrictToAssigned: isCandidate,
  };
  const [form, setForm] = useState(emptyForm);
  const [bulk, setBulk] = useState({ text: '', assessmentIds: [] });

  const setField = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const toggleAssessment = (id) =>
    setForm((prev) => ({
      ...prev,
      assessmentIds: prev.assessmentIds.includes(id)
        ? prev.assessmentIds.filter((value) => value !== id)
        : [...prev.assessmentIds, id],
    }));

  const createPerson = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api('/api/admin/employees', {
        method: 'POST',
        body: { ...form, accountType: mode, password: form.password || undefined },
      });
      setCredentials(result.account);
      setCreateOpen(false);
      setForm(emptyForm);
      reload();
      toast(`${titleCase(mode)} account created.`, 'ok');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const submitBulk = async (event) => {
    event.preventDefault();
    const rows = bulk.text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [fullName, emailAddress, departmentNote] = line.split(/[,\t;]/).map((value) => (value || '').trim());
        return { fullName, email: emailAddress, departmentNote };
      })
      .filter((row) => row.fullName && row.email && !/email/i.test(row.email));

    if (!rows.length) {
      toast('Add at least one row in the form name, email, department.', 'error');
      return;
    }

    setBusy(true);
    try {
      const result = await api('/api/admin/employees/bulk', {
        method: 'POST',
        body: { rows, accountType: mode, assessmentIds: bulk.assessmentIds },
      });
      setCredentials({ batch: result.created, failed: result.failed });
      setBulkOpen(false);
      setBulk({ text: '', assessmentIds: [] });
      reload();
      toast(`${result.created.length} account${result.created.length === 1 ? '' : 's'} created.`, 'ok');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    setBusy(true);
    try {
      const result = await api(`/api/admin/employees/${resetTarget.id}/reset-password`, { method: 'POST' });
      setCredentials({ ...result, code: resetTarget.code });
      setResetTarget(null);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const doStatus = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/employees/${statusTarget.id}/status`, {
        method: 'POST',
        body: { status: statusTarget.status === 'active' ? 'deactivated' : 'active' },
      });
      toast('Account status updated.', 'ok');
      setStatusTarget(null);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/employees/${deleteTarget.id}`, { method: 'DELETE' });
      toast('Account removed.', 'ok');
      setDeleteTarget(null);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const doPromote = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/employees/${promoteTarget.id}/promote`, { method: 'POST', body: {} });
      toast('Candidate promoted to employee.', 'ok');
      setPromoteTarget(null);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    {
      key: 'person',
      header: 'Person',
      render: (row) => (
        <div className="cell-person">
          <span className="avatar">{initials(row.fullName)}</span>
          <span>
            <strong>{row.fullName}</strong>
            <span>{row.code} · {row.email}</span>
          </span>
        </div>
      ),
    },
    { key: 'department', header: 'Department', render: (row) => row.departmentNote || '—' },
    { key: 'assigned', header: 'Assigned', render: (row) => row.assignedAssessments },
    { key: 'attempts', header: 'Attempts', render: (row) => row.attempts },
    {
      key: 'average',
      header: 'Average',
      render: (row) => (row.averagePercentage == null ? '—' : `${row.averagePercentage}%`),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="row-actions">
          <button type="button" className="icon-btn" title="View" onClick={() => setDetailId(row.id)}>
            <Search size={14} />
          </button>
          <button type="button" className="icon-btn" title="Reset password" onClick={() => setResetTarget(row)}>
            <KeyRound size={14} />
          </button>
          {isCandidate ? (
            <button type="button" className="icon-btn" title="Promote to employee" onClick={() => setPromoteTarget(row)}>
              <UserPlus size={14} />
            </button>
          ) : null}
          <button type="button" className="icon-btn" title="Toggle status" onClick={() => setStatusTarget(row)}>
            <Power size={14} />
          </button>
          <button type="button" className="icon-btn" title="Delete" onClick={() => setDeleteTarget(row)}>
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="People"
        title={isCandidate ? 'Candidates' : 'Employees'}
        description={
          isCandidate
            ? 'Exam-only accounts, usually issued from the application pipeline. Promote a candidate once they are hired.'
            : 'Workspace accounts with guidelines, readiness and full assessment history.'
        }
        actions={
          <>
            <Button variant="ghost" size="sm" icon={Upload} onClick={() => setBulkOpen(true)}>
              Bulk import
            </Button>
            <Button variant="primary" size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>
              Add {isCandidate ? 'candidate' : 'employee'}
            </Button>
          </>
        }
      />

      <div className="toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, email, code…" />
        <Select value={status} onChange={(event) => setStatus(event.target.value)} className="filter-select">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="deactivated">Deactivated</option>
        </Select>
        <div className="toolbar__spacer" />
        <div style={{ display: 'flex', gap: 6 }}>
          <Badge tone="violet"><Users size={10} /> {data?.counts?.employee ?? 0} employees</Badge>
          <Badge tone="info">{data?.counts?.candidate ?? 0} candidates</Badge>
          <Badge>{data?.counts?.admin ?? 0} admins</Badge>
        </div>
      </div>

      {loading ? <Loading label="Loading people…" /> : null}
      {error ? <ErrorState message={error.message} onRetry={reload} /> : null}

      {!loading && !error ? (
        people.length ? (
          <div className="panel" style={{ overflow: 'hidden' }}>
            <DataTable columns={columns} rows={people} empty={null} />
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title={`No ${isCandidate ? 'candidates' : 'employees'} found`}
            description="Adjust the filters or add an account to get started."
            action={
              <Button variant="primary" size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>
                Add account
              </Button>
            }
          />
        )
      ) : null}

      {/* create */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={`Add ${isCandidate ? 'candidate' : 'employee'}`}
        subtitle="A one-time password is generated unless you set one. The person must change it at first sign-in."
        size="wide"
        footer={
          <>
            <Button variant="quiet" onClick={() => setCreateOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="iris" onClick={createPerson} loading={busy}>Create account</Button>
          </>
        }
      >
        <form onSubmit={createPerson} className="form-grid">
          <div className="field-row">
            <Field label="Full name" required htmlFor="p-name">
              <Input id="p-name" value={form.fullName} onChange={setField('fullName')} required />
            </Field>
            <Field label="Email" required htmlFor="p-email">
              <Input id="p-email" type="email" value={form.email} onChange={setField('email')} required />
            </Field>
          </div>
          <div className="field-row">
            <Field label="Username" hint="Leave blank to derive from the email." htmlFor="p-username">
              <Input id="p-username" value={form.username} onChange={setField('username')} placeholder="auto" />
            </Field>
            <Field label="Password" hint="Optional — otherwise generated." htmlFor="p-password">
              <Input id="p-password" value={form.password} onChange={setField('password')} placeholder="auto" minLength={8} />
            </Field>
          </div>
          <Field label="Department / note" htmlFor="p-dept">
            <Input id="p-dept" value={form.departmentNote} onChange={setField('departmentNote')} placeholder="e.g. Search Quality" />
          </Field>

          <div className="field">
            <span className="label">Assign assessments</span>
            <div className="stack gap-2" style={{ maxHeight: 200, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
              {assessments.map((assessment) => (
                <Checkbox
                  key={assessment.id}
                  checked={form.assessmentIds.includes(assessment.id)}
                  onChange={() => toggleAssessment(assessment.id)}
                >
                  {assessment.title} <span style={{ color: 'var(--faint)' }}>· {assessment.domain}</span>
                </Checkbox>
              ))}
              {!assessments.length ? <span style={{ fontSize: '0.8rem', color: 'var(--faint)' }}>No assessments yet.</span> : null}
            </div>
            <span className="hint">
              {isCandidate
                ? 'Candidates only see assessments assigned here.'
                : 'Employees can see all published assessments; assignments add explicit tracking.'}
            </span>
          </div>
        </form>
      </Modal>

      {/* bulk */}
      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Bulk import accounts"
        subtitle="One person per line: full name, email, department. Up to 200 rows."
        size="wide"
        footer={
          <>
            <Button variant="quiet" onClick={() => setBulkOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="iris" onClick={submitBulk} loading={busy}>Create accounts</Button>
          </>
        }
      >
        <div className="stack gap-4">
          <Field label="Rows" htmlFor="bulk-text" hint="Example: Meera Iyer, meera@example.com, Generative media">
            <Textarea
              id="bulk-text"
              rows={9}
              value={bulk.text}
              onChange={(event) => setBulk((prev) => ({ ...prev, text: event.target.value }))}
              placeholder={'Meera Iyer, meera@example.com, Generative media\nArjun Patel, arjun@example.com, Search quality'}
              className="mono"
              style={{ fontSize: '0.8rem' }}
            />
          </Field>

          <div className="field">
            <span className="label">Assign to every new account</span>
            <div className="pill-row">
              {assessments.map((assessment) => (
                <button
                  key={assessment.id}
                  type="button"
                  className={`chip chip--interactive ${bulk.assessmentIds.includes(assessment.id) ? 'chip--active' : ''}`}
                  onClick={() =>
                    setBulk((prev) => ({
                      ...prev,
                      assessmentIds: prev.assessmentIds.includes(assessment.id)
                        ? prev.assessmentIds.filter((id) => id !== assessment.id)
                        : [...prev.assessmentIds, assessment.id],
                    }))
                  }
                >
                  {assessment.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* credentials */}
      <Modal
        open={Boolean(credentials)}
        onClose={() => setCredentials(null)}
        title={credentials?.batch ? 'Accounts created' : 'Credentials issued'}
        subtitle="Copy these now — passwords are shown once and never stored in plain text."
        footer={<Button variant="primary" onClick={() => setCredentials(null)}>Done</Button>}
      >
        {credentials?.batch ? (
          <div className="stack gap-3">
            <div className="banner banner--ok">
              <Check size={15} /> {credentials.batch.length} created
              {credentials.failed?.length ? ` · ${credentials.failed.length} skipped` : ''}
            </div>
            <div className="table-wrap">
              <table className="table" style={{ minWidth: 0 }}>
                <thead>
                  <tr><th>Code</th><th>Username</th><th>Password</th></tr>
                </thead>
                <tbody>
                  {credentials.batch.map((account) => (
                    <tr key={account.id}>
                      <td className="mono">{account.code}</td>
                      <td className="mono">{account.username}</td>
                      <td className="mono">{account.password}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {credentials.failed?.length ? (
              <div className="banner banner--warn">
                <span>{credentials.failed.map((failure) => `Row ${failure.row}: ${failure.error}`).join(' · ')}</span>
              </div>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              icon={Download}
              onClick={() => {
                const csv = ['code,full_name,email,username,password,...'].length
                  ? `code,username,password\n${credentials.batch.map((a) => `${a.code},${a.username},${a.password}`).join('\n')}`
                  : '';
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = 'aisquare-credentials.csv';
                anchor.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download CSV
            </Button>
          </div>
        ) : credentials ? (
          <div className="stack gap-3">
            <div className="banner banner--ok"><Check size={15} /> Account {credentials.code} is active.</div>
            <CopyField label="Username" value={credentials.username} />
            <CopyField label="Temporary password" value={credentials.password} />
            <p className="hint">The account must change this password at first sign-in.</p>
          </div>
        ) : null}
      </Modal>

      <PersonDetail personId={detailId} onClose={() => setDetailId(null)} onChanged={reload} />

      <Confirm
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        onConfirm={doReset}
        title={`Reset password for ${resetTarget?.fullName || ''}?`}
        message="A one-time password will be generated and all active sessions will be signed out."
        confirmLabel="Reset password"
        tone="primary"
        loading={busy}
      />

      <Confirm
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        onConfirm={doStatus}
        title={`${statusTarget?.status === 'active' ? 'Deactivate' : 'Reactivate'} ${statusTarget?.fullName || ''}?`}
        message={
          statusTarget?.status === 'active'
            ? 'The account will lose access immediately and all sessions will be revoked.'
            : 'The account will regain access with its existing password.'
        }
        confirmLabel={statusTarget?.status === 'active' ? 'Deactivate' : 'Reactivate'}
        tone={statusTarget?.status === 'active' ? 'danger' : 'primary'}
        loading={busy}
      />

      <Confirm
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
        title={`Remove ${deleteTarget?.fullName || ''}?`}
        message="The account is soft-deleted, sessions are revoked and the email/username are released. History is preserved."
        confirmLabel="Remove account"
        loading={busy}
      />

      <Confirm
        open={Boolean(promoteTarget)}
        onClose={() => setPromoteTarget(null)}
        onConfirm={doPromote}
        title={`Promote ${promoteTarget?.fullName || ''} to employee?`}
        message="They gain the full workspace: guidelines, readiness, feedback and all published assessments."
        confirmLabel="Promote"
        tone="primary"
        loading={busy}
      />
    </>
  );
}
