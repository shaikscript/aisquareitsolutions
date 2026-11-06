import React, { useState } from 'react';
import {
  ArrowUpRight,
  FileStack,
  FileText,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  UserCheck,
} from 'lucide-react';
import {
  Badge,
  Button,
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
} from '../../components/ui.jsx';
import { api, formatDate, withSession } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../context/AppContext.jsx';

const STATUSES = ['New', 'Under Review', 'Shortlisted', 'Selected', 'Rejected'];

export default function AdminApplications() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useFetch(
    `/api/admin/applications?status=${filter}&search=${encodeURIComponent(search)}`,
    [filter, search]
  );
  const { data: directory } = useFetch('/api/admin/directory');
  const { toast } = useToast();

  const [detail, setDetail] = useState(null);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('New');
  const [issueOpen, setIssueOpen] = useState(false);
  const [assessmentIds, setAssessmentIds] = useState([]);
  const [credentials, setCredentials] = useState(null);
  const [busy, setBusy] = useState(false);

  const applications = data?.applications || [];
  const counts = data?.counts || {};
  const assessments = directory?.assessments?.filter((a) => a.status !== 'archived') || [];

  const openDetail = (application) => {
    setDetail(application);
    setStatus(application.status);
    setNotes(application.notes || '');
  };

  const saveStatus = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/applications/${detail.id}`, {
        method: 'PATCH',
        body: { status, adminNotes: notes },
      });
      toast('Application updated.', 'ok');
      setDetail(null);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const issueLogin = async () => {
    setBusy(true);
    try {
      const result = await api(`/api/admin/applications/${detail.id}/issue-login`, {
        method: 'POST',
        body: { assessmentIds },
      });
      setCredentials(result.account);
      setIssueOpen(false);
      setDetail(null);
      reload();
      toast('Exam credentials issued.', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    {
      key: 'person',
      header: 'Candidate',
      render: (row) => (
        <div>
          <div style={{ color: 'var(--text)', fontWeight: 500 }}>{row.fullName}</div>
          <div style={{ fontSize: '0.73rem', color: 'var(--faint)' }}>{row.email}</div>
        </div>
      ),
    },
    {
      key: 'position',
      header: 'Applied for',
      render: (row) => (
        <div>
          <div style={{ fontSize: '0.82rem' }}>{row.position}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--faint)' }}>{row.general ? 'General application' : 'Specific role'}</div>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (row) => row.phone },
    { key: 'created', header: 'Received', render: (row) => formatDate(row.createdAt) },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="row-actions">
          <Button variant="ghost" size="sm" onClick={() => openDetail(row)} icon={FileText}>
            Open
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Talent pipeline"
        title="Applications"
        description="Every application includes a private resume. Shortlist, issue an exam login, then promote the candidate once hired."
        actions={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Badge tone="info">{counts.New || 0} new</Badge>
            <Badge tone="warn">{counts['Under Review'] || 0} in review</Badge>
            <Badge tone="ok">{counts.Selected || 0} selected</Badge>
          </div>
        }
      />

      <div className="toolbar">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            ...STATUSES.map((value) => ({ value, label: value })),
          ]}
        />
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, email or role…" />
      </div>

      {loading ? <Loading label="Loading applications…" /> : null}
      {error ? <ErrorState message={error.message} onRetry={reload} /> : null}

      {!loading && !error ? (
        applications.length ? (
          <div className="panel" style={{ overflow: 'hidden' }}>
            <DataTable columns={columns} rows={applications} />
          </div>
        ) : (
          <EmptyState icon={FileStack} title="No applications here" description="New applications from the careers page land in this pipeline." />
        )
      ) : null}

      <Modal
        open={Boolean(detail) && !issueOpen}
        onClose={() => setDetail(null)}
        title={detail?.fullName || ''}
        subtitle={detail ? `${detail.position} · received ${formatDate(detail.createdAt)}` : ''}
        size="wide"
        footer={
          <>
            <a
              href={detail ? withSession(`/api/admin/applications/${detail.id}/resume`) : '#'}
              target="_blank"
              rel="noreferrer"
              className="btn btn--ghost btn--sm"
            >
              <FileText size={13} /> Resume
            </a>
            <div style={{ flex: 1 }} />
            <Button variant="quiet" onClick={() => setDetail(null)} disabled={busy}>Cancel</Button>
            <Button
              variant="ghost"
              onClick={() => {
                setIssueOpen(true);
                setAssessmentIds([]);
              }}
              disabled={busy || Boolean(detail?.candidateUserId)}
            >
              <KeyRound size={14} /> {detail?.candidateUserId ? 'Login issued' : 'Issue exam login'}
            </Button>
            <Button variant="iris" onClick={saveStatus} loading={busy}>Save</Button>
          </>
        }
      >
        {detail ? (
          <div className="stack gap-4">
            <div className="meta-grid">
              <div className="meta-item"><small>Email</small><span><a href={`mailto:${detail.email}`}>{detail.email}</a></span></div>
              <div className="meta-item"><small>Phone</small><span>{detail.phone}</span></div>
              <div className="meta-item"><small>Location</small><span>{detail.location || '—'}</span></div>
              <div className="meta-item"><small>Portfolio</small><span>{detail.portfolioUrl ? <a href={detail.portfolioUrl} target="_blank" rel="noreferrer">Link <ArrowUpRight size={10} /></a> : '—'}</span></div>
            </div>

            <div>
              <h4 className="h4" style={{ fontSize: '0.82rem', marginBottom: 6 }}>Education & experience</h4>
              <p className="prose">{detail.educationExperience}</p>
            </div>

            {detail.coverLetter ? (
              <div>
                <h4 className="h4" style={{ fontSize: '0.82rem', marginBottom: 6 }}>Cover note</h4>
                <p className="prose">{detail.coverLetter}</p>
              </div>
            ) : null}

            <div className="field-row">
              <Field label="Pipeline status" htmlFor="app-status">
                <Select id="app-status" value={status} onChange={(event) => setStatus(event.target.value)}>
                  {STATUSES.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Resume" htmlFor="app-resume">
                <div className="chip" style={{ height: 46, borderRadius: 12, justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <FileText size={13} /> {detail.resume?.name}
                  </span>
                  <span style={{ color: 'var(--faint)' }}>{Math.round((detail.resume?.size || 0) / 1024)} KB</span>
                </div>
              </Field>
            </div>

            <Field label="Internal notes" hint="Visible to administrators only." htmlFor="app-notes">
              <Textarea id="app-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        title="Issue candidate exam login"
        subtitle="Creates an exam-only account and optionally assigns assessments. The temporary password is shown once."
        footer={
          <>
            <Button variant="quiet" onClick={() => setIssueOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="iris" onClick={issueLogin} loading={busy}>Create exam account</Button>
          </>
        }
      >
        <div className="stack gap-4">
          <div className="banner"><UserCheck size={15} style={{ flexShrink: 0 }} /> {detail?.fullName} · {detail?.email}</div>
          <div className="field">
            <span className="label">Assign assessments</span>
            <div className="stack gap-2" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, maxHeight: 240, overflowY: 'auto' }}>
              {assessments.map((assessment) => (
                <label className="check" key={assessment.id}>
                  <input
                    type="checkbox"
                    checked={assessmentIds.includes(assessment.id)}
                    onChange={() =>
                      setAssessmentIds((prev) =>
                        prev.includes(assessment.id) ? prev.filter((id) => id !== assessment.id) : [...prev, assessment.id]
                      )
                    }
                  />
                  <span>{assessment.title} <span style={{ color: 'var(--faint)' }}>· {assessment.domain}</span></span>
                </label>
              ))}
            </div>
            <span className="hint">Candidates only see the assessments you assign here.</span>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(credentials)}
        onClose={() => setCredentials(null)}
        title="Candidate credentials"
        subtitle="Shown once. Send them through your usual secure channel."
        footer={<Button variant="primary" onClick={() => setCredentials(null)}>Done</Button>}
      >
        {credentials ? (
          <div className="stack gap-3">
            <div className="banner banner--ok"><KeyRound size={15} /> Account {credentials.code} created</div>
            <CopyField label="Username" value={credentials.username} />
            <CopyField label="Temporary password" value={credentials.password} />
            <p className="hint">Direct them to /exam-login. They must change the password at first sign-in.</p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
