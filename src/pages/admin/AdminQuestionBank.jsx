import React, { useMemo, useState } from 'react';
import { HelpCircle, Pencil, Plus, Search, Trash2 } from 'lucide-react';
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
  Segmented,
  Select,
  Textarea,
} from '../../components/ui.jsx';
import { api, titleCase } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../context/AppContext.jsx';

const TYPES = [
  { value: 'all', label: 'All' },
  { value: 'mcq', label: 'Multiple choice' },
  { value: 'true_false', label: 'True / false' },
  { value: 'short_answer', label: 'Short answer' },
  { value: 'practical_scenario', label: 'Practical scenario' },
];

const EMPTY = {
  questionType: 'mcq',
  prompt: '',
  scenario: '',
  options: ['', '', '', ''],
  correctAnswer: '',
  acceptableAnswers: '',
  rubric: '',
  marks: 2,
  explanation: '',
  projectRef: 'Search Engine Evaluator',
  status: 'active',
};

export default function AdminQuestionBank() {
  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useFetch(
    `/api/admin/question-bank?type=${type}&search=${encodeURIComponent(search)}`,
    [type, search]
  );
  const { toast } = useToast();
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);

  const questions = data?.questions || [];

  const openCreate = () => {
    setForm(EMPTY);
    setEditor({ mode: 'create' });
  };

  const openEdit = (question) => {
    setForm({
      questionType: question.questionType,
      prompt: question.prompt,
      scenario: question.scenario || '',
      options: question.options?.length ? question.options : ['', '', '', ''],
      correctAnswer: question.correctAnswer || '',
      acceptableAnswers: (question.acceptableAnswers || []).join(', '),
      rubric: question.rubric || '',
      marks: question.marks,
      explanation: question.explanation || '',
      projectRef: question.projectRef || '',
      status: question.status,
    });
    setEditor({ mode: 'edit', question });
  };

  const save = async () => {
    setBusy(true);
    const body = {
      questionType: form.questionType,
      prompt: form.prompt,
      scenario: form.scenario,
      options: form.questionType === 'mcq' ? form.options.filter(Boolean) : undefined,
      correctAnswer: form.correctAnswer,
      acceptableAnswers:
        form.questionType === 'short_answer'
          ? form.acceptableAnswers.split(',').map((value) => value.trim()).filter(Boolean)
          : undefined,
      rubric: form.rubric,
      marks: Number(form.marks),
      explanation: form.explanation,
      projectRef: form.projectRef,
      status: form.status,
    };
    try {
      if (editor.mode === 'create') {
        await api('/api/admin/question-bank', { method: 'POST', body });
        toast('Question added to the bank.', 'ok');
      } else {
        await api(`/api/admin/question-bank/${editor.question.id}`, { method: 'PATCH', body });
        toast('Question revised.', 'ok');
      }
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
      await api(`/api/admin/question-bank/${archiveTarget.id}`, {
        method: 'PATCH',
        body: {
          questionType: archiveTarget.questionType,
          prompt: archiveTarget.prompt,
          scenario: archiveTarget.scenario,
          options: archiveTarget.options,
          correctAnswer: archiveTarget.correctAnswer,
          acceptableAnswers: archiveTarget.acceptableAnswers,
          rubric: archiveTarget.rubric,
          marks: archiveTarget.marks,
          explanation: archiveTarget.explanation,
          projectRef: archiveTarget.projectRef,
          status: archiveTarget.status === 'active' ? 'archived' : 'active',
        },
      });
      toast(`Question ${archiveTarget.status === 'active' ? 'archived' : 'restored'}.`, 'ok');
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
        eyebrow="Assessment content"
        title="Question bank"
        description="Reusable questions across every domain. Marks, rubrics and acceptable answers live here; assessments reference them."
        actions={
          <Button variant="primary" size="sm" icon={Plus} onClick={openCreate}>
            New question
          </Button>
        }
      />

      <div className="toolbar">
        <Segmented options={TYPES} value={type} onChange={setType} label="Question type" />
        <SearchInput value={search} onChange={setSearch} placeholder="Search prompt or domain…" />
        <div className="toolbar__spacer" />
        <Badge tone="violet">{questions.length} shown</Badge>
      </div>

      {loading ? <Loading label="Loading question bank…" /> : null}
      {error ? <ErrorState message={error.message} onRetry={reload} /> : null}

      {!loading && !error ? (
        questions.length ? (
          <div className="stack gap-2">
            {questions.map((question) => (
              <article className="card" key={question.id} style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 7 }}>
                      <Badge tone="violet">{titleCase(question.questionType)}</Badge>
                      <Badge>{question.marks} mark{question.marks === 1 ? '' : 's'}</Badge>
                      {question.projectRef ? <Badge tone="info">{question.projectRef}</Badge> : null}
                      {question.status !== 'active' ? <Badge tone="danger">Archived</Badge> : null}
                      <span style={{ fontSize: '0.7rem', color: 'var(--ghost)' }}>used in {question.usage} assessment{question.usage === 1 ? '' : 's'}</span>
                    </div>
                    <p style={{ fontSize: '0.88rem', color: 'var(--text-soft)', lineHeight: 1.55 }}>{question.prompt}</p>
                    {question.scenario ? (
                      <p style={{ fontSize: '0.78rem', color: 'var(--faint)', marginTop: 6, fontStyle: 'italic' }}>{question.scenario}</p>
                    ) : null}
                    {question.options?.length ? (
                      <div className="pill-row" style={{ marginTop: 9 }}>
                        {question.options.map((option) => (
                          <span
                            key={option}
                            className="chip"
                            style={option === question.correctAnswer ? { borderColor: 'var(--accent-line)', color: 'var(--lavender)' } : undefined}
                          >
                            {option}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {question.acceptableAnswers?.length ? (
                      <div style={{ fontSize: '0.74rem', color: 'var(--faint)', marginTop: 8 }}>
                        Accepts: {question.acceptableAnswers.join(' · ')}
                      </div>
                    ) : null}
                  </div>
                  <div className="row-actions">
                    <button type="button" className="icon-btn" title="Edit" onClick={() => openEdit(question)}>
                      <Pencil size={14} />
                    </button>
                    <button type="button" className="icon-btn" title={question.status === 'active' ? 'Archive' : 'Restore'} onClick={() => setArchiveTarget(question)}>
                      {question.status === 'active' ? <Trash2 size={14} /> : <HelpCircle size={14} />}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={HelpCircle}
            title="No questions match"
            description="Adjust the filters or write a new question to start the bank."
            action={<Button variant="primary" size="sm" icon={Plus} onClick={openCreate}>New question</Button>}
          />
        )
      ) : null}

      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.mode === 'create' ? 'New question' : 'Edit question'}
        subtitle="Auto-scored types are MCQ, true/false and short answer. Practical scenarios route to manual review."
        size="wide"
        footer={
          <>
            <Button variant="quiet" onClick={() => setEditor(null)} disabled={busy}>Cancel</Button>
            <Button variant="iris" onClick={save} loading={busy}>
              {editor?.mode === 'create' ? 'Add question' : 'Save question'}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <div className="field-row">
            <Field label="Question type" htmlFor="q-type">
              <Select id="q-type" value={form.questionType} onChange={(e) => setForm((p) => ({ ...p, questionType: e.target.value }))}>
                {TYPES.filter((t) => t.value !== 'all').map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Marks" htmlFor="q-marks">
              <Input id="q-marks" type="number" min="0.5" step="0.5" value={form.marks} onChange={(e) => setForm((p) => ({ ...p, marks: e.target.value }))} />
            </Field>
          </div>

          <Field label="Scenario context" hint="Optional context shown above the prompt." htmlFor="q-scenario">
            <Textarea id="q-scenario" rows={2} value={form.scenario} onChange={(e) => setForm((p) => ({ ...p, scenario: e.target.value }))} />
          </Field>

          <Field label="Prompt" required htmlFor="q-prompt">
            <Textarea id="q-prompt" rows={3} value={form.prompt} onChange={(e) => setForm((p) => ({ ...p, prompt: e.target.value }))} required />
          </Field>

          {form.questionType === 'mcq' ? (
            <div className="field">
              <span className="label">Options <strong>*</strong></span>
              <div className="stack gap-2">
                {form.options.map((option, index) => (
                  <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="option__key">{String.fromCharCode(65 + index)}</span>
                    <input
                      className="input"
                      value={option}
                      onChange={(event) =>
                        setForm((prev) => {
                          const options = [...prev.options];
                          options[index] = event.target.value;
                          return { ...prev, options };
                        })
                      }
                      placeholder={`Option ${index + 1}`}
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      title="Set as correct"
                      onClick={() => setForm((prev) => ({ ...prev, correctAnswer: option }))}
                    >
                      <Search size={13} />
                    </button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() => setForm((prev) => ({ ...prev, options: [...prev.options, ''] }))}
                >
                  + Add option
                </Button>
              </div>
            </div>
          ) : null}

          {form.questionType === 'mcq' || form.questionType === 'true_false' ? (
            <Field label="Correct answer" required htmlFor="q-correct">
              {form.questionType === 'true_false' ? (
                <Select id="q-correct" value={form.correctAnswer} onChange={(e) => setForm((p) => ({ ...p, correctAnswer: e.target.value }))}>
                  <option value="">Choose…</option>
                  <option value="True">True</option>
                  <option value="False">False</option>
                </Select>
              ) : (
                <Select id="q-correct" value={form.correctAnswer} onChange={(e) => setForm((p) => ({ ...p, correctAnswer: e.target.value }))}>
                  <option value="">Choose…</option>
                  {form.options.filter(Boolean).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}

          {form.questionType === 'short_answer' ? (
            <Field label="Acceptable answers" hint="Comma separated. Auto-scoring checks whether the answer contains any phrase." htmlFor="q-accept">
              <Input id="q-accept" value={form.acceptableAnswers} onChange={(e) => setForm((p) => ({ ...p, acceptableAnswers: e.target.value }))} placeholder="intent drift, shifts the goal" />
            </Field>
          ) : null}

          {form.questionType === 'practical_scenario' ? (
            <Field label="Scoring rubric" hint="What a full-mark answer must contain. Reviewers see this while scoring." htmlFor="q-rubric">
              <Textarea id="q-rubric" rows={3} value={form.rubric} onChange={(e) => setForm((p) => ({ ...p, rubric: e.target.value }))} />
            </Field>
          ) : null}

          <Field label="Explanation" hint="Shown in released results." htmlFor="q-explainer">
            <Textarea id="q-explainer" rows={2} value={form.explanation} onChange={(e) => setForm((p) => ({ ...p, explanation: e.target.value }))} />
          </Field>

          <Field label="Domain / project reference" htmlFor="q-domain">
            <Input id="q-domain" value={form.projectRef} onChange={(e) => setForm((p) => ({ ...p, projectRef: e.target.value }))} placeholder="Search Engine Evaluator" />
          </Field>
        </div>
      </Modal>

      <Confirm
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={archive}
        title={`${archiveTarget?.status === 'active' ? 'Archive' : 'Restore'} this question?`}
        message="Archived questions stay attached to existing assessments but disappear from new selections."
        confirmLabel={archiveTarget?.status === 'active' ? 'Archive' : 'Restore'}
        tone={archiveTarget?.status === 'active' ? 'danger' : 'primary'}
        loading={busy}
      />
    </>
  );
}
