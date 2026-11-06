import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  RotateCcw,
  ShieldCheck,
  TimerOff,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  ScoreRing,
  SearchInput,
  Segmented,
  StatusBadge,
  Textarea,
} from '../../components/ui.jsx';
import { api, formatDateTime, humanDuration, initials, titleCase } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../context/AppContext.jsx';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Needs review' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'in_progress', label: 'In progress' },
];

function ReviewModal({ attemptId, onClose, onChanged }) {
  const { data, loading, error, reload } = useFetch(attemptId ? `/api/admin/attempts/${attemptId}` : null);
  const { toast } = useToast();
  const [marks, setMarks] = useState({});
  const [comments, setComments] = useState({});
  const [overall, setOverall] = useState('');
  const [visibility, setVisibility] = useState({ showScore: true, showPass: true, showAnswers: true });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data?.questions) return;
    const nextMarks = {};
    const nextComments = {};
    data.questions.forEach((question) => {
      nextMarks[question.id] = question.answer?.awardedMarks ?? 0;
      nextComments[question.id] = question.answer?.reviewerComment || '';
    });
    setMarks(nextMarks);
    setComments(nextComments);
    setOverall(data.attempt.reviewerComment || '');
    setVisibility({
      showScore: data.attempt.releaseVisibility?.score ?? true,
      showPass: data.attempt.releaseVisibility?.pass ?? true,
      showAnswers: data.attempt.releaseVisibility?.answers ?? true,
    });
  }, [data]);

  if (!attemptId) return null;

  const saveReview = async (finalise = true) => {
    setBusy(true);
    try {
      const answers = Object.entries(marks).map(([questionId, awardedMarks]) => ({
        attemptQuestionId: Number(questionId),
        awardedMarks: Number(awardedMarks),
        comment: comments[questionId],
      }));
      const result = await api(`/api/admin/attempts/${attemptId}/review`, {
        method: 'POST',
        body: { answers, comment: overall, finalise },
      });
      toast(`Review saved · ${result.percentage}%`, 'ok');
      reload();
      onChanged?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const release = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/attempts/${attemptId}/release`, { method: 'POST', body: visibility });
      toast('Result released to the candidate.', 'ok');
      reload();
      onChanged?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const unrelease = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/attempts/${attemptId}/unrelease`, { method: 'POST' });
      toast('Release withdrawn.', 'ok');
      reload();
      onChanged?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Attempt review" subtitle="Award marks on qualitative answers, then release the result." size="wide">
      {loading ? <Loading /> : null}
      {error ? <ErrorState message={error.message} onRetry={reload} /> : null}
      {data?.attempt ? (
        <div className="stack gap-4">
          <div className="result-hero" style={{ padding: 18 }}>
            <ScoreRing
              value={data.attempt.percentage ?? 0}
              size={92}
              label={data.attempt.isReleased ? 'Released' : 'Auto score'}
            />
            <div className="result-hero__meta">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <Badge tone="violet">{data.attempt.domain || 'Assessment'}</Badge>
                <StatusBadge status={data.attempt.reviewStatus === 'pending' ? 'pending' : data.attempt.status} />
                {data.attempt.isReleased ? <Badge tone="ok">Released</Badge> : <Badge tone="warn">Unreleased</Badge>}
              </div>
              <h2 style={{ fontSize: '1.2rem' }}>{data.attempt.title}</h2>
              <div style={{ fontSize: '0.78rem', color: 'var(--faint)' }}>
                {data.attempt.employee.name} ({data.attempt.employee.code}) · attempt {data.attempt.attemptNumber} ·{' '}
                {formatDateTime(data.attempt.submittedAt || data.attempt.startedAt)} · {humanDuration(data.attempt.durationSeconds)}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 4 }}>
                {data.attempt.finalScore ?? 0} / {data.attempt.totalMarks} marks · pass mark {data.attempt.passingPercentage}%
              </div>
            </div>
          </div>

          {data.attempt.status === 'in_progress' ? (
            <div className="banner banner--warn">
              <TimerOff size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>This attempt is still in progress. You can close it if the candidate abandoned the session.</span>
            </div>
          ) : null}

          <div className="stack gap-3">
            {data.questions.map((question, index) => (
              <div className="answer-block" key={question.id}>
                <div className="answer-block__head">
                  <span style={{ fontSize: '0.83rem', fontWeight: 500, flex: 1, minWidth: 200 }}>
                    {index + 1}. {question.prompt}
                  </span>
                  <Badge>{titleCase(question.type)}</Badge>
                  <span style={{ fontSize: '0.75rem', color: 'var(--faint)' }}>/ {question.marks}</span>
                </div>
                <div className="answer-block__body">
                  {question.scenario ? <p style={{ fontStyle: 'italic', color: 'var(--faint)', marginBottom: 8 }}>{question.scenario}</p> : null}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: '0.66rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ghost)', marginBottom: 3 }}>Answer</div>
                    <p style={{ color: 'var(--text-soft)' }}>{question.answer?.value || <em style={{ color: 'var(--faint)' }}>No answer</em>}</p>
                  </div>
                  {question.answer?.reasoning ? (
                    <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 10 }}>
                      <strong style={{ fontWeight: 500 }}>Evidence note:</strong> {question.answer.reasoning}
                    </p>
                  ) : null}
                  {question.rubric ? (
                    <p style={{ fontSize: '0.76rem', color: 'var(--muted)', borderLeft: '2px solid var(--line-strong)', paddingLeft: 10, marginBottom: 10 }}>
                      <strong style={{ color: 'var(--text-soft)', fontWeight: 500 }}>Rubric:</strong> {question.rubric}
                    </p>
                  ) : null}

                  <div className="field-row">
                    <Field label="Awarded marks" htmlFor={`marks-${question.id}`}>
                      <Input
                        id={`marks-${question.id}`}
                        type="number"
                        step="0.5"
                        min="0"
                        max={question.marks}
                        value={marks[question.id] ?? 0}
                        onChange={(event) => setMarks((prev) => ({ ...prev, [question.id]: event.target.value }))}
                      />
                    </Field>
                    <Field label="Reviewer comment" htmlFor={`comment-${question.id}`}>
                      <Input
                        id={`comment-${question.id}`}
                        value={comments[question.id] || ''}
                        onChange={(event) => setComments((prev) => ({ ...prev, [question.id]: event.target.value }))}
                        placeholder="Shown to the candidate when released"
                      />
                    </Field>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Field label="Overall reviewer note" htmlFor="overall-note">
            <Textarea
              id="overall-note"
              rows={2}
              value={overall}
              onChange={(event) => setOverall(event.target.value)}
              placeholder="A short note on judgement quality."
            />
          </Field>

          <div className="panel" style={{ padding: 16 }}>
            <div className="panel__title" style={{ fontSize: '0.9rem', marginBottom: 10 }}>Release controls</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
              {[
                ['showScore', 'Show score'],
                ['showPass', 'Show pass/fail'],
                ['showAnswers', 'Show answer feedback'],
              ].map(([key, label]) => (
                <label className="check" key={key}>
                  <input
                    type="checkbox"
                    checked={visibility[key]}
                    onChange={(event) => setVisibility((prev) => ({ ...prev, [key]: event.target.checked }))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button size="sm" variant="ghost" onClick={() => saveReview(false)} loading={busy} icon={ShieldCheck}>
                Save as pending
              </Button>
              <Button size="sm" variant="primary" onClick={() => saveReview(true)} loading={busy} icon={CheckCircle2}>
                Finalise review
              </Button>
              {data.attempt.isReleased ? (
                <Button size="sm" variant="danger" onClick={unrelease} loading={busy} icon={EyeOff}>
                  Withdraw release
                </Button>
              ) : (
                <Button size="sm" variant="iris" onClick={release} loading={busy} icon={Eye}>
                  Release result
                </Button>
              )}
            </div>
          </div>

          {data.events?.length ? (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: '0.76rem', color: 'var(--faint)' }}>Attempt events ({data.events.length})</summary>
              <div className="timeline" style={{ marginTop: 12 }}>
                {data.events.map((event, index) => (
                  <div className={`timeline__item ${index === data.events.length - 1 ? 'is-latest' : ''}`} key={`${event.createdAt}-${index}`}>
                    <span style={{ color: 'var(--text-soft)' }}>{titleCase(event.type)}</span> {event.detail}
                    <div style={{ fontSize: '0.7rem', color: 'var(--ghost)' }}>{formatDateTime(event.createdAt)}</div>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

export default function AdminResults() {
  const [params] = useSearchParams();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useFetch(
    `/api/admin/attempts?status=${filter}&search=${encodeURIComponent(search)}`,
    [filter, search]
  );
  const [openId, setOpenId] = useState(params.get('attempt') ? Number(params.get('attempt')) : null);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const attempts = data?.attempts || [];
  const counts = data?.counts;

  const expire = async (attempt) => {
    setBusy(true);
    try {
      await api(`/api/admin/attempts/${attempt.id}/expire`, { method: 'POST' });
      toast('Attempt closed.', 'ok');
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
        eyebrow="Quality control"
        title="Results & review"
        description="Auto-scored items are marked instantly. Qualitative answers wait for a reviewer, and nothing reaches a candidate until it is released."
        actions={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Badge tone={counts?.pending ? 'warn' : 'ok'}>{counts?.pending || 0} pending</Badge>
            <Badge tone="info">{counts?.unreleased || 0} unreleased</Badge>
            <Badge>{counts?.total || 0} total</Badge>
          </div>
        }
      />

      <div className="toolbar">
        <Segmented options={FILTERS} value={filter} onChange={setFilter} label="Filter attempts" />
        <SearchInput value={search} onChange={setSearch} placeholder="Search person or assessment…" />
      </div>

      {loading ? <Loading label="Loading attempts…" /> : null}
      {error ? <ErrorState message={error.message} onRetry={reload} /> : null}

      {!loading && !error ? (
        attempts.length ? (
          <div className="panel" style={{ overflow: 'hidden' }}>
            <div className="table-wrap">
              <table className="table table--stack">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Assessment</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((attempt) => (
                    <tr key={attempt.id}>
                      <td data-label="Person">
                        <div className="cell-person">
                          <span className="avatar avatar--sm">{initials(attempt.employeeName)}</span>
                          <span>
                            <strong>{attempt.employeeName}</strong>
                            <span>{attempt.employeeCode} · {attempt.accountType}</span>
                          </span>
                        </div>
                      </td>
                      <td data-label="Assessment">
                        <div style={{ fontSize: '0.83rem' }}>{attempt.title}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--faint)' }}>attempt {attempt.attemptNumber}</div>
                      </td>
                      <td data-label="Score">
                        <span style={{ fontSize: '0.86rem' }}>{attempt.percentage == null ? '—' : `${attempt.percentage}%`}</span>
                        {attempt.passed != null ? (
                          <div style={{ fontSize: '0.68rem', color: attempt.passed ? 'var(--ok)' : 'var(--danger)' }}>
                            {attempt.passed ? 'passed' : 'not passed'}
                          </div>
                        ) : null}
                      </td>
                      <td data-label="Status">
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <StatusBadge status={attempt.status} />
                          {attempt.requiresManualReview && attempt.reviewStatus === 'pending' ? <Badge tone="warn">Review</Badge> : null}
                          {attempt.isReleased ? <Badge tone="ok">Released</Badge> : null}
                        </div>
                      </td>
                      <td data-label="Submitted" style={{ fontSize: '0.76rem' }}>{formatDateTime(attempt.submittedAt)}</td>
                      <td data-label="Actions">
                        <div className="row-actions">
                          {attempt.status === 'in_progress' ? (
                            <Button size="sm" variant="danger" onClick={() => expire(attempt)} disabled={busy}>
                              Close
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => setOpenId(attempt.id)} icon={ClipboardList}>
                              Review
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No attempts match this filter"
            description="Attempts appear here as employees and candidates submit assessments."
          />
        )
      ) : null}

      {openId ? (
        <ReviewModal
          attemptId={openId}
          onClose={() => setOpenId(null)}
          onChanged={reload}
        />
      ) : null}
    </>
  );
}
