import React, { useEffect, useState } from 'react';
import {
  Activity,
  Building2,
  Briefcase,
  CheckCheck,
  Inbox,
  Mail,
  Megaphone,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Confirm,
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
import { api, formatDateTime, relativeTime, titleCase } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../context/AppContext.jsx';

/* ─────────────────────────── jobs ─────────────────────────── */

const JOB_EMPTY = {
  title: '',
  domain: 'Search quality',
  employmentType: 'Part-time · Contract',
  workMode: 'Remote',
  location: 'Remote · India',
  description: '',
  responsibilities: '',
  qualifications: '',
  skills: '',
  status: 'draft',
};

export function AdminJobs() {
  const { data, loading, error, reload } = useFetch('/api/admin/jobs');
  const { toast } = useToast();
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(JOB_EMPTY);
  const [closeTarget, setCloseTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const jobs = data?.jobs || [];

  const open = (job) => {
    if (job) {
      setForm({
        title: job.title,
        domain: job.domain || '',
        employmentType: job.employmentType || '',
        workMode: job.workMode || '',
        location: job.location || '',
        description: job.description,
        responsibilities: job.responsibilities || '',
        qualifications: job.qualifications || '',
        skills: job.skills || '',
        status: job.status,
      });
      setEditor({ id: job.id });
    } else {
      setForm(JOB_EMPTY);
      setEditor({ id: null });
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      if (editor.id) await api(`/api/admin/jobs/${editor.id}`, { method: 'PATCH', body: form });
      else await api('/api/admin/jobs', { method: 'POST', body: form });
      toast(editor.id ? 'Role updated.' : 'Role created.', 'ok');
      setEditor(null);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/jobs/${closeTarget.id}`, { method: 'DELETE' });
      toast('Role closed.', 'ok');
      setCloseTarget(null);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Careers"
        title="Job openings"
        description="Published roles appear instantly on the public careers page. Applications flow into the talent pipeline."
        actions={<Button variant="primary" size="sm" icon={Plus} onClick={() => open(null)}>New role</Button>}
      />

      {loading ? <Loading /> : null}
      {error ? <ErrorState message={error.message} onRetry={reload} /> : null}

      {!loading && !error ? (
        jobs.length ? (
          <div className="panel" style={{ overflow: 'hidden' }}>
            <DataTable
              rows={jobs}
              columns={[
                {
                  key: 'title',
                  header: 'Role',
                  render: (row) => (
                    <div>
                      <div style={{ color: 'var(--text)', fontWeight: 500 }}>{row.title}</div>
                      <div style={{ fontSize: '0.73rem', color: 'var(--faint)' }}>{row.domain} · {row.location}</div>
                    </div>
                  ),
                },
                { key: 'type', header: 'Type', render: (row) => row.employmentType },
                { key: 'applications', header: 'Applications', render: (row) => row.applications },
                { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
                {
                  key: 'actions',
                  header: '',
                  render: (row) => (
                    <div className="row-actions">
                      <button type="button" className="icon-btn" title="Edit" onClick={() => open(row)}><Pencil size={14} /></button>
                      <button type="button" className="icon-btn" title="Close" onClick={() => setCloseTarget(row)}><Trash2 size={14} /></button>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        ) : (
          <EmptyState icon={Briefcase} title="No job openings" description="Create a role to start collecting applications." action={<Button variant="primary" icon={Plus} onClick={() => open(null)}>New role</Button>} />
        )
      ) : null}

      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.id ? 'Edit role' : 'New role'}
        subtitle="Responsibilities and qualifications are displayed as bullet lists — one per line."
        size="wide"
        footer={
          <>
            <Button variant="quiet" onClick={() => setEditor(null)} disabled={busy}>Cancel</Button>
            <Button variant="iris" onClick={save} loading={busy}>Save role</Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Title" required htmlFor="j-title">
            <Input id="j-title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
          </Field>
          <div className="field-row">
            <Field label="Domain" htmlFor="j-domain">
              <Input id="j-domain" value={form.domain} onChange={(e) => setForm((p) => ({ ...p, domain: e.target.value }))} />
            </Field>
            <Field label="Employment type" htmlFor="j-type">
              <Input id="j-type" value={form.employmentType} onChange={(e) => setForm((p) => ({ ...p, employmentType: e.target.value }))} />
            </Field>
          </div>
          <div className="field-row">
            <Field label="Work mode" htmlFor="j-mode">
              <Input id="j-mode" value={form.workMode} onChange={(e) => setForm((p) => ({ ...p, workMode: e.target.value }))} />
            </Field>
            <Field label="Location" htmlFor="j-location">
              <Input id="j-location" value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} />
            </Field>
          </div>
          <Field label="Description" required htmlFor="j-desc">
            <Textarea id="j-desc" rows={3} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          </Field>
          <Field label="Responsibilities" hint="One per line." htmlFor="j-resp">
            <Textarea id="j-resp" rows={4} value={form.responsibilities} onChange={(e) => setForm((p) => ({ ...p, responsibilities: e.target.value }))} />
          </Field>
          <Field label="Qualifications" hint="One per line." htmlFor="j-qual">
            <Textarea id="j-qual" rows={4} value={form.qualifications} onChange={(e) => setForm((p) => ({ ...p, qualifications: e.target.value }))} />
          </Field>
          <Field label="Skills" hint="Comma separated." htmlFor="j-skills">
            <Input id="j-skills" value={form.skills} onChange={(e) => setForm((p) => ({ ...p, skills: e.target.value }))} />
          </Field>
          <Field label="Status" htmlFor="j-status">
            <Select id="j-status" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="closed">Closed</option>
            </Select>
          </Field>
        </div>
      </Modal>

      <Confirm
        open={Boolean(closeTarget)}
        onClose={() => setCloseTarget(null)}
        onConfirm={close}
        title={`Close “${closeTarget?.title || ''}”?`}
        message="The role disappears from the careers page. Existing applications are preserved."
        confirmLabel="Close role"
        loading={busy}
      />
    </>
  );
}

/* ─────────────────────────── contact inbox ─────────────────────────── */

export function AdminMessages() {
  const { data, loading, error, reload } = useFetch('/api/admin/messages');
  const [filter, setFilter] = useState('all');
  const [detail, setDetail] = useState(null);
  const { toast } = useToast();

  const messages = (data?.messages || []).filter((message) => filter === 'all' || message.status === filter);

  const setStatus = async (message, status) => {
    try {
      await api(`/api/admin/messages/${message.id}`, { method: 'PATCH', body: { status } });
      toast(`Message marked ${status}.`, 'ok');
      setDetail(null);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Studio inbox"
        title="Contact messages"
        description="Enquiries from the public website. New messages also raise a notification in the console."
        actions={<Badge tone="info">{(data?.messages || []).filter((m) => m.status === 'unread').length} unread</Badge>}
      />

      <div className="toolbar">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'unread', label: 'Unread' },
            { value: 'read', label: 'Read' },
            { value: 'archived', label: 'Archived' },
          ]}
        />
      </div>

      {loading ? <Loading /> : null}
      {error ? <ErrorState message={error.message} onRetry={reload} /> : null}

      {!loading && !error ? (
        messages.length ? (
          <div className="panel">
            <div className="list">
              {messages.map((message) => (
                <button
                  type="button"
                  key={message.id}
                  className="list__row"
                  onClick={() => {
                    setDetail(message);
                    if (message.status === 'unread') setStatus(message, 'read');
                  }}
                  style={{ textAlign: 'left', width: '100%', opacity: message.status === 'archived' ? 0.6 : 1 }}
                >
                  <span className="avatar">{message.name.slice(0, 1)}</span>
                  <span className="list__main">
                    <span className="list__title">
                      {message.subject}
                      <StatusBadge status={message.status} />
                    </span>
                    <span className="list__sub">
                      {message.name} · {message.email} {message.company ? `· ${message.company}` : ''}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {message.message}
                    </span>
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--ghost)', flexShrink: 0 }}>{relativeTime(message.createdAt)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState icon={Mail} title="No messages in this view" description="Enquiries from the contact form arrive here." />
        )
      ) : null}

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.subject || ''}
        subtitle={detail ? `${detail.name} · ${detail.email} · ${formatDateTime(detail.createdAt)}` : ''}
        footer={
          <>
            <Button variant="quiet" onClick={() => setDetail(null)}>Close</Button>
            <Button variant="ghost" onClick={() => setStatus(detail, 'archived')}>Archive</Button>
            <a href={`mailto:${detail?.email}?subject=Re: ${encodeURIComponent(detail?.subject || '')}`} className="btn btn--iris btn--sm">
              <Send size={13} /> Reply by email
            </a>
          </>
        }
      >
        {detail ? (
          <div className="stack gap-3">
            <div className="meta-grid">
              <div className="meta-item"><small>Topic</small><span>{detail.topic || 'General'}</span></div>
              <div className="meta-item"><small>Company</small><span>{detail.company || '—'}</span></div>
              <div className="meta-item"><small>Status</small><span><StatusBadge status={detail.status} /></span></div>
            </div>
            <p className="prose">{detail.message}</p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

/* ─────────────────────────── announcements ─────────────────────────── */

const ANNOUNCE_EMPTY = { title: '', category: 'General update', body: '', status: 'published' };

export function AdminAnnouncements() {
  const { data, loading, error, reload } = useFetch('/api/admin/announcements');
  const { toast } = useToast();
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(ANNOUNCE_EMPTY);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const announcements = data?.announcements || [];

  const open = (item) => {
    if (item) {
      setForm({ title: item.title, category: item.category, body: item.body, status: item.status });
      setEditor({ id: item.id });
    } else {
      setForm(ANNOUNCE_EMPTY);
      setEditor({ id: null });
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      if (editor.id) await api(`/api/admin/announcements/${editor.id}`, { method: 'PUT', body: form });
      else await api('/api/admin/announcements', { method: 'POST', body: form });
      toast(editor.id ? 'Announcement updated.' : 'Announcement published.', 'ok');
      setEditor(null);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/announcements/${archiveTarget.id}`, { method: 'DELETE' });
      toast('Announcement archived.', 'ok');
      setArchiveTarget(null);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Studio comms"
        title="Announcements"
        description="Publishing notifies every active employee and pins the note in their announcements feed."
        actions={<Button variant="primary" size="sm" icon={Plus} onClick={() => open(null)}>New announcement</Button>}
      />

      {loading ? <Loading /> : null}
      {error ? <ErrorState message={error.message} onRetry={reload} /> : null}

      {!loading && !error ? (
        announcements.length ? (
          <div className="stack gap-3">
            {announcements.map((item) => (
              <article className="panel" key={item.id}>
                <div className="panel__head">
                  <div>
                    <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                      <Badge tone="violet">{item.category}</Badge>
                      <StatusBadge status={item.status} />
                      <span style={{ fontSize: '0.7rem', color: 'var(--ghost)' }}>{item.publishedAt ? formatDateTime(item.publishedAt) : 'Unpublished'}</span>
                    </div>
                    <span className="panel__title">{item.title}</span>
                  </div>
                  <div className="row-actions">
                    <button type="button" className="icon-btn" title="Edit" onClick={() => open(item)}><Pencil size={14} /></button>
                    <button type="button" className="icon-btn" title="Archive" onClick={() => setArchiveTarget(item)}><Trash2 size={14} /></button>
                  </div>
                </div>
                <div style={{ padding: '0 22px 18px', fontSize: '0.84rem', color: 'var(--muted)', lineHeight: 1.65, whiteSpace: 'pre-line' }}>
                  {item.body}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={Megaphone} title="No announcements" description="Publish a note for the studio." action={<Button variant="primary" icon={Plus} onClick={() => open(null)}>New announcement</Button>} />
        )
      ) : null}

      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.id ? 'Edit announcement' : 'New announcement'}
        size="wide"
        footer={
          <>
            <Button variant="quiet" onClick={() => setEditor(null)} disabled={busy}>Cancel</Button>
            <Button variant="iris" onClick={save} loading={busy}>Save announcement</Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Title" required htmlFor="an-title">
            <Input id="an-title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
          </Field>
          <div className="field-row">
            <Field label="Category" htmlFor="an-category">
              <Input id="an-category" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} />
            </Field>
            <Field label="Status" htmlFor="an-status">
              <Select id="an-status" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>
          </div>
          <Field label="Message" required htmlFor="an-body">
            <Textarea id="an-body" rows={6} value={form.body} onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      <Confirm
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={archive}
        title={`Archive “${archiveTarget?.title || ''}”?`}
        message="It disappears from employee announcement feeds. The record is preserved."
        confirmLabel="Archive"
        loading={busy}
      />
    </>
  );
}

/* ─────────────────────────── feedback ─────────────────────────── */

export function AdminFeedback() {
  const [filter, setFilter] = useState('all');
  const { data, loading, error, reload } = useFetch(`/api/admin/feedback?status=${filter}`, [filter]);
  const { toast } = useToast();
  const [detail, setDetail] = useState(null);
  const [status, setStatus] = useState('Under Review');
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);

  const open = (item) => {
    setDetail(item);
    setStatus(item.status);
    setResponse(item.response || '');
  };

  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/feedback/${detail.id}`, { method: 'PATCH', body: { status, response } });
      toast('Feedback updated.', 'ok');
      setDetail(null);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const items = data?.feedback || [];

  return (
    <>
      <PageHeader
        eyebrow="Employee voice"
        title="Feedback"
        description="Guideline problems, assessment concerns and portal issues raised from the employee workspace."
        actions={<Badge tone="info">{items.filter((i) => i.status === 'New').length} new</Badge>}
      />

      <div className="toolbar">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'New', label: 'New' },
            { value: 'Under Review', label: 'In review' },
            { value: 'Addressed', label: 'Addressed' },
            { value: 'Closed', label: 'Closed' },
          ]}
        />
      </div>

      {loading ? <Loading /> : null}
      {error ? <ErrorState message={error.message} onRetry={reload} /> : null}

      {!loading && !error ? (
        items.length ? (
          <div className="panel">
            <div className="list">
              {items.map((item) => (
                <div className="list__row" key={item.id}>
                  <span className="empty__icon" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }}>
                    <MessageSquare size={15} />
                  </span>
                  <div className="list__main">
                    <div className="list__title">
                      {item.subject}
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="list__sub">{item.identity} · {item.category} · {relativeTime(item.createdAt)}</div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 4 }}>{item.message}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => open(item)}>Respond</Button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState icon={Inbox} title="No feedback in this view" description="Employee feedback arrives here." />
        )
      ) : null}

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.subject || ''}
        subtitle={detail ? `${detail.identity} · ${detail.category}` : ''}
        footer={
          <>
            <Button variant="quiet" onClick={() => setDetail(null)} disabled={busy}>Cancel</Button>
            <Button variant="iris" onClick={save} loading={busy}>Save response</Button>
          </>
        }
      >
        {detail ? (
          <div className="form-grid">
            <p className="prose">{detail.message}</p>
            <Field label="Status" htmlFor="fb-status">
              <Select id="fb-status" value={status} onChange={(event) => setStatus(event.target.value)}>
                {['New', 'Under Review', 'Addressed', 'Closed'].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </Select>
            </Field>
            <Field label="Response to employee" hint="Visible in their feedback history. They are notified when marked Addressed." htmlFor="fb-response">
              <Textarea id="fb-response" rows={4} value={response} onChange={(event) => setResponse(event.target.value)} />
            </Field>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

/* ─────────────────────────── company profile ─────────────────────────── */

const SETTING_FIELDS = [
  ['company_mission', 'Mission', 'textarea'],
  ['company_vision', 'Vision', 'textarea'],
  ['company_values_json', 'Values (one per line)', 'values'],
  ['public_contact_email', 'Public email', 'text'],
  ['public_contact_phone', 'Public phone', 'text'],
  ['public_office_address', 'Studio address', 'textarea'],
  ['public_office_hours', 'Office hours', 'text'],
  ['public_map_link', 'Map link', 'text'],
  ['public_map_lat', 'Latitude', 'text'],
  ['public_map_lng', 'Longitude', 'text'],
  ['public_linkedin', 'LinkedIn URL', 'text'],
  ['public_careers_note', 'Careers note', 'text'],
  ['privacy_contact_note', 'Privacy contact note', 'textarea'],
];

export function AdminCompanyInfo() {
  const { data, loading, error, reload } = useFetch('/api/admin/settings');
  const { toast } = useToast();
  const [form, setForm] = useState(null);
  const [valuesText, setValuesText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data?.settings) return;
    setForm(data.settings);
    try {
      const parsed = JSON.parse(data.settings.company_values_json || '[]');
      setValuesText(Array.isArray(parsed) ? parsed.join('\n') : '');
    } catch {
      setValuesText('');
    }
  }, [data]);

  const save = async () => {
    setBusy(true);
    try {
      await api('/api/admin/settings', {
        method: 'PUT',
        body: {
          settings: {
            ...form,
            company_values_json: JSON.stringify(
              valuesText.split('\n').map((value) => value.trim()).filter(Boolean)
            ),
          },
        },
      });
      toast('Company profile updated across the public site.', 'ok');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!form) return null;

  return (
    <>
      <PageHeader
        eyebrow="Public presence"
        title="Company profile"
        description="These values drive the public site, contact page, footer and privacy notice. Changes are applied immediately."
        actions={<Button variant="primary" size="sm" onClick={save} loading={busy}>Save profile</Button>}
      />

      <div className="split">
        <div className="panel" style={{ padding: 'clamp(18px, 3vw, 26px)' }}>
          <div className="form-grid">
            {SETTING_FIELDS.map(([key, label, kind]) => (
              <Field key={key} label={label} htmlFor={`set-${key}`}>
                {kind === 'textarea' ? (
                  <Textarea
                    id={`set-${key}`}
                    rows={3}
                    value={form[key] || ''}
                    onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
                  />
                ) : kind === 'values' ? (
                  <Textarea
                    id={`set-${key}`}
                    rows={4}
                    value={valuesText}
                    onChange={(event) => setValuesText(event.target.value)}
                  />
                ) : (
                  <Input
                    id={`set-${key}`}
                    value={form[key] || ''}
                    onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
                  />
                )}
              </Field>
            ))}

            <label className="check">
              <input
                type="checkbox"
                checked={form.demo_mode === 'true'}
                onChange={(event) => setForm((prev) => ({ ...prev, demo_mode: event.target.checked ? 'true' : 'false' }))}
              />
              <span>Show demo credentials on the sign-in pages</span>
            </label>
            <p className="hint">Turn this off before going live with real accounts.</p>
          </div>
        </div>

        <div className="stack gap-4">
          <div className="panel" style={{ padding: 20 }}>
            <div className="panel__title" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
              <Building2 size={14} /> Live preview
            </div>
            <div className="card" style={{ padding: 16, borderRadius: 14 }}>
              <div className="eyebrow eyebrow--bare" style={{ marginBottom: 8 }}>Mission</div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-soft)', lineHeight: 1.55 }}>{form.company_mission}</p>
              <div className="divider" />
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'grid', gap: 6 }}>
                <span style={{ display: 'flex', gap: 7 }}><Mail size={13} /> {form.public_contact_email}</span>
                <span style={{ display: 'flex', gap: 7 }}><CheckCheck size={13} /> {form.public_office_hours}</span>
              </div>
            </div>
          </div>

          <div className="banner">
            <Activity size={15} style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: '0.79rem' }}>Changes are audited. The public site reads these values on every page load.</span>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────── activity ─────────────────────────── */

export function AdminActivity() {
  const { data, loading, error, reload } = useFetch('/api/admin/activity');
  const [tab, setTab] = useState('audit');

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const audit = data?.audit || [];
  const portal = data?.portal || [];

  return (
    <>
      <PageHeader
        eyebrow="Audit trail"
        title="Activity"
        description="Administrative actions and employee portal events. Append-only by design."
        actions={<Badge>{tab === 'audit' ? audit.length : portal.length} events</Badge>}
      />

      <div className="toolbar">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'audit', label: 'Admin actions' },
            { value: 'portal', label: 'Portal events' },
          ]}
        />
      </div>

      {tab === 'audit' ? (
        <div className="panel">
          <div className="list">
            {audit.map((entry) => (
              <div className="list__row" key={entry.id}>
                <div className="list__main">
                  <div className="list__title">
                    {entry.summary}
                    <Badge>{entry.action}</Badge>
                  </div>
                  <div className="list__sub">
                    <span>{entry.identity}</span>
                    <span>·</span>
                    <span>{entry.entityType}{entry.entityId ? ` #${entry.entityId}` : ''}</span>
                  </div>
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--faint)', flexShrink: 0 }}>{formatDateTime(entry.createdAt)}</span>
              </div>
            ))}
            {!audit.length ? <EmptyState icon={Activity} title="No admin actions yet" description="Actions are recorded automatically." /> : null}
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="list">
            {portal.map((entry) => (
              <div className="list__row" key={entry.id}>
                <div className="list__main">
                  <div className="list__title">
                    {titleCase(entry.eventType)}
                    {entry.detail ? <span style={{ fontSize: '0.76rem', color: 'var(--muted)', fontWeight: 400 }}>· {entry.detail}</span> : null}
                  </div>
                  <div className="list__sub">
                    <span>{entry.identity}</span>
                    {entry.area ? <><span>·</span><span>{entry.area}</span></> : null}
                  </div>
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--faint)', flexShrink: 0 }}>{formatDateTime(entry.createdAt)}</span>
              </div>
            ))}
            {!portal.length ? <EmptyState icon={Activity} title="No portal events yet" description="Employee activity appears here." /> : null}
          </div>
        </div>
      )}
    </>
  );
}
