import React, { useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  FileUp,
  History,
  Pencil,
  Plus,
  RefreshCw,
} from 'lucide-react';
import {
  Badge,
  Button,
  Check,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Metre,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
} from '../../components/ui.jsx';
import { api, formatDate, titleCase, withSession } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../context/AppContext.jsx';

const EMPTY = { title: '', category: 'Core evaluation', summary: '', requiresAck: true, status: 'draft', changeNote: '' };

export default function AdminGuidelines() {
  const { data, loading, error, reload } = useFetch('/api/admin/guidelines');
  const { toast } = useToast();
  const [editor, setEditor] = useState(null); // null | {mode:'create'|'edit', guideline}
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const guidelines = data?.guidelines || [];

  const openCreate = () => {
    setForm(EMPTY);
    setFile(null);
    setEditor({ mode: 'create' });
  };

  const openEdit = (guideline) => {
    setForm({
      title: guideline.title,
      category: guideline.category,
      summary: guideline.summary || '',
      requiresAck: guideline.requiresAck,
      status: guideline.status,
      changeNote: '',
    });
    setFile(null);
    setEditor({ mode: 'edit', guideline });
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = new FormData();
      body.append('title', form.title);
      body.append('category', form.category);
      body.append('summary', form.summary);
      body.append('requiresAck', form.requiresAck ? '1' : '0');
      body.append('status', form.status);
      body.append('changeNote', form.changeNote || '');
      if (file) body.append('file', file);

      if (editor.mode === 'create') {
        if (!file) {
          toast('Attach the guideline PDF.', 'error');
          setBusy(false);
          return;
        }
        await api('/api/admin/guidelines', { method: 'POST', body, form: true });
        toast('Guideline published.', 'ok');
      } else {
        await api(`/api/admin/guidelines/${editor.guideline.id}`, { method: 'PUT', body, form: true });
        toast(file || form.changeNote ? 'Guideline updated — new version recorded.' : 'Guideline metadata saved.', 'ok');
      }
      setEditor(null);
      setFile(null);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (guideline, status) => {
    try {
      await api(`/api/admin/guidelines/${guideline.id}/status`, { method: 'POST', body: { status } });
      toast(`“${guideline.title}” set to ${status}.`, 'ok');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const columns = [
    {
      key: 'title',
      header: 'Guideline',
      render: (row) => (
        <div>
          <div style={{ color: 'var(--text)', fontWeight: 500 }}>{row.title}</div>
          <div style={{ fontSize: '0.74rem', color: 'var(--faint)' }}>{row.category} · v{row.version} · {row.fileName}</div>
        </div>
      ),
    },
    {
      key: 'ack',
      header: 'Acknowledgement',
      render: (row) => (
        <div style={{ minWidth: 120 }}>
          <Metre value={row.audience ? (row.acknowledged / row.audience) * 100 : 0} tone="ok" />
          <div style={{ fontSize: '0.7rem', color: 'var(--faint)', marginTop: 4 }}>
            {row.acknowledged}/{row.audience} employees
          </div>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'updated', header: 'Updated', render: (row) => formatDate(row.updatedAt) },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="row-actions">
          <a
            href={withSession(`/api/admin/guidelines/${row.id}/file`)}
            target="_blank"
            rel="noreferrer"
            className="icon-btn"
            title="Open PDF"
          >
            <ArrowUpRight size={14} />
          </a>
          <button type="button" className="icon-btn" title="Edit / new version" onClick={() => openEdit(row)}>
            <Pencil size={14} />
          </button>
          {row.status !== 'published' ? (
            <button type="button" className="icon-btn" title="Publish" onClick={() => setStatus(row, 'published')}>
              <Check size={14} />
            </button>
          ) : (
            <button type="button" className="icon-btn" title="Archive" onClick={() => setStatus(row, 'archived')}>
              <History size={14} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Rubric library"
        title="Guidelines"
        description="Upload a PDF, publish it to the workspace and let version control handle the rest. Employees acknowledge each version individually."
        actions={
          <Button variant="primary" size="sm" icon={Plus} onClick={openCreate}>
            New guideline
          </Button>
        }
      />

      {loading ? <Loading label="Loading guidelines…" /> : null}
      {error ? <ErrorState message={error.message} onRetry={reload} /> : null}

      {!loading && !error ? (
        guidelines.length ? (
          <div className="panel" style={{ overflow: 'hidden' }}>
            <DataTable columns={columns} rows={guidelines} />
          </div>
        ) : (
          <EmptyState
            icon={BookOpen}
            title="No guidelines yet"
            description="Upload the first rubric PDF and publish it to the workspace."
            action={<Button variant="primary" icon={Plus} onClick={openCreate}>New guideline</Button>}
          />
        )
      ) : null}

      <div className="grid-3" style={{ marginTop: 18 }}>
        {[
          { title: 'Versioned by design', body: 'Replacing the PDF or editing the summary bumps the version and asks every employee to re-read.' },
          { title: 'Acknowledgement tracking', body: 'See exactly who has read the current version, and how long they spent with it.' },
          { title: 'Publish deliberately', body: 'Draft first, publish when ready. Publishing sends a notification to every active employee.' },
        ].map((item) => (
          <div key={item.title} className="card card--pad" style={{ padding: 18 }}>
            <div className="h4" style={{ fontSize: '0.85rem', marginBottom: 5 }}>{item.title}</div>
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.55 }}>{item.body}</p>
          </div>
        ))}
      </div>

      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.mode === 'create' ? 'New guideline' : `Edit · ${editor?.guideline?.title || ''}`}
        subtitle={
          editor?.mode === 'create'
            ? 'PDF only, up to 15 MB. Draft is private until published.'
            : 'Uploading a replacement file or changing the title/summary creates a new version.'
        }
        size="wide"
        footer={
          <>
            <Button variant="quiet" onClick={() => setEditor(null)} disabled={busy}>Cancel</Button>
            <Button variant="iris" onClick={save} loading={busy}>
              {editor?.mode === 'create' ? 'Upload guideline' : 'Save changes'}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Title" required htmlFor="g-title">
            <Input id="g-title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
          </Field>
          <div className="field-row">
            <Field label="Category" htmlFor="g-category">
              <Input id="g-category" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} placeholder="Core evaluation" />
            </Field>
            <Field label="Status" htmlFor="g-status">
              <Select id="g-status" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>
          </div>
          <Field label="Summary" hint="One or two sentences shown on the guideline card." htmlFor="g-summary">
            <Textarea id="g-summary" rows={3} value={form.summary} onChange={(e) => setForm((p) => ({ ...p, summary: e.target.value }))} />
          </Field>

          <div className="field">
            <span className="label">{editor?.mode === 'create' ? 'PDF document' : 'Replace PDF (optional)'}</span>
            <div
              onClick={() => fileRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
              style={{
                border: '1px dashed var(--line-strong)',
                borderRadius: 'var(--r-sm)',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
              }}
            >
              <span className="empty__icon" style={{ width: 34, height: 34, borderRadius: 9 }}>
                {file ? <Check size={15} style={{ color: 'var(--mint)' }} /> : <FileUp size={15} />}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '0.83rem' }}>{file ? file.name : 'Choose a PDF file'}</span>
                <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--faint)' }}>
                  {file ? `${(file.size / 1024).toFixed(0)} KB` : 'PDF · 15 MB max'}
                </span>
              </span>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                style={{ display: 'none' }}
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
            </div>
          </div>

          <Field label="Change note" hint="Short note for the version history." htmlFor="g-note">
            <Input id="g-note" value={form.changeNote} onChange={(e) => setForm((p) => ({ ...p, changeNote: e.target.value }))} placeholder="e.g. Added temporal coherence scoring" />
          </Field>

          <label className="check">
            <input
              type="checkbox"
              checked={form.requiresAck}
              onChange={(e) => setForm((p) => ({ ...p, requiresAck: e.target.checked }))}
            />
            <span>Require acknowledgement from every employee</span>
          </label>

          {form.status === 'published' ? (
            <div className="banner">
              <RefreshCw size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: '0.8rem' }}>Publishing notifies every active employee and makes the document visible in their workspace.</span>
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
