import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Copy,
  FileText,
  Pencil,
  Plus,
  Send,
  Target,
  Trash2,
  Users,
} from 'lucide-react';
import {
  Badge,
  Button,
  Confirm,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  StatusBadge,
  Textarea,
} from '../../components/ui.jsx';
import { api, formatDate, titleCase } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../context/AppContext.jsx';

const EMPTY = {
  title: '',
  instructions: '',
  domain: 'Search Engine Evaluator',
  projectId: '',
  isTimed: true,
  timeLimitMinutes: 45,
  passingPercentage: 75,
  availableFrom: '',
  availableUntil: '',
  selectionMode: 'fixed',
  status: 'draft',
  questionIds: [],
};

const toLocalInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function AdminAssessments() {
  const { data, loading, error, reload } = useFetch('/api/admin/assessments');
  const { data: bank } = useFetch('/api/admin/question-bank');
  const { data: projects } = useFetch('/api/admin/projects');
  const { data: directory } = useFetch('/api/admin/directory');
  const { toast } = useToast();

  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [questionSearch, setQuestionSearch] = useState('');
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignedIds, setAssignedIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);

  const assessments = data?.assessments || [];
  const questions = bank?.questions?.filter((q) => q.status === 'active') || [];
  const people = directory?.people || [];

  const filteredQuestions = useMemo(
    () =>
      questions.filter(
        (question) =>
          !questionSearch ||
          question.prompt.toLowerCase().includes(questionSearch.toLowerCase()) ||
          (question.projectRef || '').toLowerCase().includes(questionSearch.toLowerCase())
      ),
    [questions, questionSearch]
  );

  const openCreate = () => {
    setForm(EMPTY);
    setEditor({ mode: 'create' });
  };

  const openEdit = async (assessment) => {
    setBusy(true);
    try {
      const result = await api(`/api/admin/assessments/${assessment.id}`);
      const detail = result.assessment;
      setForm({
        title: detail.title,
        instructions: detail.instructions,
        domain: detail.domain || '',
        projectId: detail.projectId || '',
        isTimed: detail.isTimed,
        timeLimitMinutes: detail.timeLimitMinutes || 45,
        passingPercentage: detail.passingPercentage,
        availableFrom: toLocalInput(detail.availableFrom),
        availableUntil: toLocalInput(detail.availableUntil),
        selectionMode: detail.selectionMode,
        status: detail.status,
        questionIds: detail.questions.map((q) => q.id),
      });
      setEditor({ mode: 'edit', assessment: detail });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    const body = {
      ...form,
      projectId: form.projectId || null,
      questionIds: form.questionIds,
      isTimed: Boolean(form.isTimed),
      timeLimitMinutes: Number(form.timeLimitMinutes) || null,
      passingPercentage: Number(form.passingPercentage),
    };
    try {
      if (editor.mode === 'create') {
        await api('/api/admin/assessments', { method: 'POST', body });
        toast('Assessment created.', 'ok');
      } else {
        await api(`/api/admin/assessments/${editor.assessment.id}`, { method: 'PUT', body });
        toast('Assessment updated.', 'ok');
      }
      setEditor(null);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/assessments/${statusTarget.id}/status`, {
        method: 'POST',
        body: { status: statusTarget.status === 'published' ? 'archived' : 'published' },
      });
      toast(statusTarget.status === 'published' ? 'Assessment archived.' : 'Assessment published.', 'ok');
      setStatusTarget(null);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async (assessment) => {
    try {
      await api(`/api/admin/assessments/${assessment.id}/duplicate`, { method: 'POST' });
      toast('Assessment duplicated as a draft.', 'ok');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const openAssign = async (assessment) => {
    setAssignTarget(assessment);
    setBusy(true);
    try {
      const result = await api(`/api/admin/assessments/${assessment.id}`);
      setAssignedIds(result.assessment.assignments.map((a) => a.userId));
    } catch {
      setAssignedIds([]);
    } finally {
      setBusy(false);
    }
  };

  const saveAssignments = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/assessments/${assignTarget.id}/assignments`, {
        method: 'PUT',
        body: { userIds: assignedIds },
      });
      toast('Assignments updated.', 'ok');
      setAssignTarget(null);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleQuestion = (id) =>
    setForm((prev) => ({
      ...prev,
      questionIds: prev.questionIds.includes(id)
        ? prev.questionIds.filter((value) => value !== id)
        : [...prev.questionIds, id],
    }));

  return (
    <>
      <PageHeader
        eyebrow="Assessments"
        title="Assessment builder"
        description="Compose an assessment from the question bank, set the timer and threshold, then publish and assign it."
        actions={
          <Button variant="primary" size="sm" icon={Plus} onClick={openCreate}>
            New assessment
          </Button>
        }
      />

      {loading ? <Loading label="Loading assessments…" /> : null}
      {error ? <ErrorState message={error.message} onRetry={reload} /> : null}

      {!loading && !error ? (
        assessments.length ? (
          <div className="stack gap-3">
            {assessments.map((assessment) => (
              <article className="panel" key={assessment.id}>
                <div className="panel__head">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span className="panel__title" style={{ fontSize: '0.98rem' }}>{assessment.title}</span>
                      <StatusBadge status={assessment.status} />
                      <Badge tone="violet">{assessment.domain || 'General'}</Badge>
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.74rem', color: 'var(--faint)', marginTop: 6 }}>
                      <span><FileText size={11} /> {assessment.questionCount} questions · {assessment.totalMarks} marks</span>
                      <span><Users size={11} /> {assessment.assignedCount} assigned</span>
                      <span><ClipboardList size={11} /> {assessment.attemptCount} attempts</span>
                      {assessment.pendingReview ? <span style={{ color: 'var(--amber)' }}>{assessment.pendingReview} awaiting review</span> : null}
                      <span>{assessment.isTimed ? `${assessment.timeLimitMinutes} min` : 'Untimed'} · pass {assessment.passingPercentage}%</span>
                    </div>
                  </div>
                  <div className="row-actions">
                    <button type="button" className="icon-btn" title="Edit" onClick={() => openEdit(assessment)}>
                      <Pencil size={14} />
                    </button>
                    <button type="button" className="icon-btn" title="Assign" onClick={() => openAssign(assessment)}>
                      <Users size={14} />
                    </button>
                    <button type="button" className="icon-btn" title="Duplicate" onClick={() => duplicate(assessment)}>
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title={assessment.status === 'published' ? 'Archive' : 'Publish'}
                      onClick={() => setStatusTarget(assessment)}
                    >
                      {assessment.status === 'published' ? <Trash2 size={14} /> : <Send size={14} />}
                    </button>
                  </div>
                </div>
                <div style={{ padding: '0 22px 16px', fontSize: '0.82rem', color: 'var(--muted)' }}>
                  {assessment.instructions}
                  <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Link to={`/admin/results?assessment=${assessment.id}`} className="btn btn--quiet btn--sm">
                      View attempts <ArrowUpRight size={12} />
                    </Link>
                    <Link to={`/admin/question-bank`} className="btn btn--quiet btn--sm">
                      Question bank
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Target}
            title="No assessments yet"
            description="Create one from the question bank, then publish and assign it to candidates or employees."
            action={<Button variant="primary" icon={Plus} onClick={openCreate}>New assessment</Button>}
          />
        )
      ) : null}

      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.mode === 'create' ? 'New assessment' : 'Edit assessment'}
        subtitle="Questions keep their marks from the bank. Publishing requires at least one question."
        size="wide"
        footer={
          <>
            <Button variant="quiet" onClick={() => setEditor(null)} disabled={busy}>Cancel</Button>
            <Button variant="iris" onClick={save} loading={busy} disabled={!form.questionIds.length}>
              Save assessment ({form.questionIds.length} questions)
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Title" required htmlFor="a-title">
            <Input id="a-title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Search Quality Calibration" />
          </Field>

          <Field label="Instructions" required htmlFor="a-instructions">
            <Textarea id="a-instructions" rows={3} value={form.instructions} onChange={(e) => setForm((p) => ({ ...p, instructions: e.target.value }))} />
          </Field>

          <div className="field-row">
            <Field label="Domain" htmlFor="a-domain">
              <Input id="a-domain" value={form.domain} onChange={(e) => setForm((p) => ({ ...p, domain: e.target.value }))} />
            </Field>
            <Field label="Linked project" htmlFor="a-project">
              <Select id="a-project" value={form.projectId} onChange={(e) => setForm((p) => ({ ...p, projectId: e.target.value }))}>
                <option value="">No project</option>
                {(projects?.projects || []).map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="field-row">
            <Field label="Passing percentage" htmlFor="a-pass">
              <Input id="a-pass" type="number" min="1" max="100" value={form.passingPercentage} onChange={(e) => setForm((p) => ({ ...p, passingPercentage: e.target.value }))} />
            </Field>
            <Field label="Status" htmlFor="a-status">
              <Select id="a-status" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>
          </div>

          <div className="field-row">
            <Field label="Timed" htmlFor="a-timed">
              <Select id="a-timed" value={form.isTimed ? 'yes' : 'no'} onChange={(e) => setForm((p) => ({ ...p, isTimed: e.target.value === 'yes' }))}>
                <option value="yes">Timed</option>
                <option value="no">Untimed</option>
              </Select>
            </Field>
            <Field label="Time limit (minutes)" htmlFor="a-minutes">
              <Input id="a-minutes" type="number" min="1" max="600" value={form.timeLimitMinutes} onChange={(e) => setForm((p) => ({ ...p, timeLimitMinutes: e.target.value }))} disabled={!form.isTimed} />
            </Field>
          </div>

          <div className="field-row">
            <Field label="Opens at" htmlFor="a-from">
              <Input id="a-from" type="datetime-local" value={form.availableFrom} onChange={(e) => setForm((p) => ({ ...p, availableFrom: e.target.value }))} />
            </Field>
            <Field label="Closes at" htmlFor="a-until">
              <Input id="a-until" type="datetime-local" value={form.availableUntil} onChange={(e) => setForm((p) => ({ ...p, availableUntil: e.target.value }))} />
            </Field>
          </div>

          <div className="field">
            <div className="between" style={{ marginBottom: 8 }}>
              <span className="label">Questions ({form.questionIds.length} selected)</span>
              <SearchInput value={questionSearch} onChange={setQuestionSearch} placeholder="Filter bank…" />
            </div>
            <div style={{ border: '1px solid var(--line)', borderRadius: 10, maxHeight: 260, overflowY: 'auto' }}>
              {filteredQuestions.map((question) => {
                const selected = form.questionIds.includes(question.id);
                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => toggleQuestion(question.id)}
                    style={{
                      display: 'flex',
                      width: '100%',
                      gap: 10,
                      textAlign: 'left',
                      padding: '11px 13px',
                      borderBottom: '1px solid var(--line)',
                      background: selected ? 'var(--accent-soft)' : 'transparent',
                      alignItems: 'flex-start',
                    }}
                  >
                    <span className={`option__key ${selected ? 'is-selected' : ''}`} style={selected ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' } : undefined}>
                      {selected ? <CheckCircle2 size={12} /> : '+'}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '0.81rem', color: 'var(--text-soft)', lineHeight: 1.45 }}>{question.prompt}</span>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--faint)', marginTop: 3 }}>
                        {titleCase(question.questionType)} · {question.marks} mark{question.marks === 1 ? '' : 's'} {question.projectRef ? `· ${question.projectRef}` : ''}
                      </span>
                    </span>
                  </button>
                );
              })}
              {!filteredQuestions.length ? (
                <p style={{ padding: 16, fontSize: '0.8rem', color: 'var(--faint)' }}>No active questions match.</p>
              ) : null}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(assignTarget)}
        onClose={() => setAssignTarget(null)}
        title={`Assign · ${assignTarget?.title || ''}`}
        subtitle="Employees see all published assessments. Assignments target candidate accounts and add explicit tracking."
        size="wide"
        footer={
          <>
            <Button variant="quiet" onClick={() => setAssignTarget(null)} disabled={busy}>Cancel</Button>
            <Button variant="iris" onClick={saveAssignments} loading={busy}>Save assignments</Button>
          </>
        }
      >
        <div className="toolbar">
          <Badge tone="violet">{assignedIds.length} assigned</Badge>
          <div className="toolbar__spacer" />
          <Button
            size="sm"
            variant="quiet"
            onClick={() => setAssignedIds(people.filter((p) => p.accountType === 'candidate').map((p) => p.id))}
          >
            Select all candidates
          </Button>
          <Button size="sm" variant="quiet" onClick={() => setAssignedIds([])}>Clear</Button>
        </div>
        <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
          {people.map((person) => (
            <label
              key={person.id}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={assignedIds.includes(person.id)}
                onChange={() =>
                  setAssignedIds((prev) => (prev.includes(person.id) ? prev.filter((id) => id !== person.id) : [...prev, person.id]))
                }
              />
              <span style={{ flex: 1, fontSize: '0.83rem' }}>{person.name}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--faint)' }}>{person.code} · {person.accountType}</span>
            </label>
          ))}
        </div>
      </Modal>

      <Confirm
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        onConfirm={setStatus}
        title={statusTarget?.status === 'published' ? 'Archive this assessment?' : 'Publish this assessment?'}
        message={
          statusTarget?.status === 'published'
            ? 'It disappears from employee and candidate portals. Existing attempts are preserved.'
            : 'It will appear in portals for everyone eligible. Make sure the questions and threshold are final.'
        }
        confirmLabel={statusTarget?.status === 'published' ? 'Archive' : 'Publish'}
        tone={statusTarget?.status === 'published' ? 'danger' : 'primary'}
        loading={busy}
      />
    </>
  );
}
