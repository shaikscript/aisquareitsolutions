import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Flag,
  ListChecks,
  Lock,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  Timer,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  Confirm,
  EmptyState,
  ErrorState,
  Loading,
  Modal,
  PageHeader,
  ScoreRing,
  StatusBadge,
  Textarea,
} from '../../components/ui.jsx';
import { api, formatDateTime, minutesLabel, titleCase } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../context/AppContext.jsx';

const STATE_META = {
  available: { label: 'Ready to start', tone: 'violet' },
  in_progress: { label: 'In progress', tone: 'warn' },
  passed: { label: 'Passed', tone: 'ok' },
  awaiting_retake: { label: 'Retake required', tone: 'danger' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  closed: { label: 'Closed', tone: 'danger' },
  not_assigned: { label: 'Not assigned', tone: 'default' },
};

export function PortalAssessments({ basePath = '/portal' }) {
  const { data, loading, error, reload } = useFetch('/api/portal/assessments');
  const [starting, setStarting] = useState(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const start = async (assessment) => {
    setStarting(assessment.id);
    try {
      const result = await api(`/api/portal/assessments/${assessment.id}/start`, { method: 'POST' });
      navigate(`${basePath}/take/${result.attemptId}`);
    } catch (err) {
      toast(err.message, 'error');
      reload();
    } finally {
      setStarting(null);
    }
  };

  if (loading) return <Loading label="Loading assessments…" />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const assessments = data?.assessments || [];
  const open = assessments.filter((a) => a.state === 'in_progress');
  const ready = assessments.filter((a) => a.state === 'available');
  const done = assessments.filter((a) => !['in_progress', 'available'].includes(a.state));

  return (
    <>
      <PageHeader
        eyebrow="Assessment centre"
        title={basePath === '/exam-portal' ? 'Your assessments' : 'Assessments'}
        description="Timed or untimed evaluation tasks. Answers auto-save; a dropped connection pauses the clock. Results are released by a reviewer."
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Badge tone="info">{assessments.length} assigned</Badge>
            <Badge tone={open.length ? 'warn' : 'default'}>{open.length} in progress</Badge>
          </div>
        }
      />

      {open.length ? (
        <div className="banner banner--warn" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Timer size={15} /> You have an attempt in progress. The timer continues until you submit.
          </span>
          <Link to={`${basePath}/take/${open[0].openAttemptId}`} className="btn btn--sm btn--primary">
            Resume now <ArrowRight size={13} />
          </Link>
        </div>
      ) : null}

      {ready.length ? (
        <section style={{ marginBottom: 26 }}>
          <h2 className="h4" style={{ marginBottom: 12, fontSize: '0.86rem', color: 'var(--muted)' }}>Ready to start</h2>
          <div className="assessment-grid">
            {ready.map((assessment) => (
              <article className="assessment-card" key={assessment.id}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <h3>{assessment.title}</h3>
                    <div style={{ fontSize: '0.76rem', color: 'var(--faint)', marginTop: 4 }}>{assessment.domain}</div>
                  </div>
                  <Badge tone={STATE_META[assessment.state].tone}>{STATE_META[assessment.state].label}</Badge>
                </div>

                <p style={{ fontSize: '0.83rem', color: 'var(--muted)', lineHeight: 1.55 }}>{assessment.instructions}</p>

                <div className="assessment-card__meta">
                  <span><Clock3 size={12} /> {assessment.isTimed ? `${assessment.timeLimitMinutes} minutes` : 'Untimed'}</span>
                  <span><ListChecks size={12} /> {assessment.questionCount} questions</span>
                  <span><ShieldCheck size={12} /> Pass {assessment.passingPercentage}%</span>
                  {assessment.retakeAvailable ? <span style={{ color: 'var(--amber)' }}><RotateCcw size={12} /> Retake authorised</span> : null}
                </div>

                <div className="assessment-card__foot">
                  <span style={{ fontSize: '0.72rem', color: 'var(--ghost)' }}>
                    {assessment.attemptCount ? `${assessment.attemptCount} previous attempt${assessment.attemptCount > 1 ? 's' : ''}` : 'First attempt'}
                  </span>
                  <Button variant="iris" size="sm" icon={Play} loading={starting === assessment.id} onClick={() => start(assessment)}>
                    Start assessment
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="h4" style={{ marginBottom: 12, fontSize: '0.86rem', color: 'var(--muted)' }}>
          {done.length ? 'Archive & status' : 'Nothing else assigned'}
        </h2>
        {done.length ? (
          <div className="panel">
            <div className="list">
              {done.map((assessment) => (
                <div className="list__row" key={assessment.id}>
                  <div className="list__main">
                    <div className="list__title">
                      {assessment.title}
                      <Badge tone={STATE_META[assessment.state]?.tone}>{STATE_META[assessment.state]?.label || titleCase(assessment.state)}</Badge>
                    </div>
                    <div className="list__sub">
                      <span>{assessment.domain}</span>
                      <span>·</span>
                      <span>{assessment.isTimed ? `${assessment.timeLimitMinutes} min` : 'Untimed'}</span>
                      <span>·</span>
                      <span>{assessment.questionCount} questions</span>
                      {assessment.bestPercentage != null ? <span>· best {assessment.bestPercentage}%</span> : null}
                    </div>
                  </div>
                  <div className="list__aside">
                    {assessment.openAttemptId ? (
                      <Link to={`${basePath}/take/${assessment.openAttemptId}`} className="btn btn--sm btn--ghost">
                        Resume
                      </Link>
                    ) : assessment.lastAttempt?.isReleased ? (
                      <Link to={`${basePath}/results`} className="btn btn--sm btn--ghost">
                        Result <ArrowUpRight size={12} />
                      </Link>
                    ) : assessment.state === 'awaiting_retake' ? (
                      <span className="badge badge--danger"><Lock size={10} /> Needs authorisation</span>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: 'var(--ghost)' }}>
                        {assessment.availableFrom && assessment.state === 'scheduled'
                          ? `Opens ${formatDateTime(assessment.availableFrom)}`
                          : 'Awaiting review'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="No other assessments"
            description="Completed assessment results appear here after a reviewer releases them."
          />
        )}
      </section>
    </>
  );
}

/* ─────────────────────────── runner ─────────────────────────── */

export function AssessmentRunner({ basePath = '/portal' }) {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, loading, error, reload } = useFetch(`/api/portal/attempts/${attemptId}`);
  const [answers, setAnswers] = useState({});
  const [current, setCurrent] = useState(0);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const timers = useRef({});
  const submitted = useRef(false);

  useEffect(() => {
    if (!data?.questions) return;
    const initial = {};
    data.questions.forEach((question) => {
      initial[question.id] = { value: question.answer?.value || '', reasoning: question.answer?.reasoning || '' };
    });
    setAnswers(initial);
    setRemaining(data.attempt.remainingSeconds);
  }, [data]);

  const persist = useCallback(
    async (questionId, value, reasoning) => {
      setSaving(true);
      try {
        await api(`/api/portal/attempts/${attemptId}/answers`, {
          method: 'PUT',
          body: { questionId, value, reasoning },
        });
        setLastSaved(new Date());
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        setSaving(false);
      }
    },
    [attemptId, toast]
  );

  const update = useCallback(
    (questionId, patch, { immediate = false } = {}) => {
      setAnswers((prev) => {
        const next = { ...prev, [questionId]: { ...prev[questionId], ...patch } };
        const entry = next[questionId];
        clearTimeout(timers.current[questionId]);
        if (immediate) persist(questionId, entry.value, entry.reasoning);
        else {
          timers.current[questionId] = setTimeout(() => persist(questionId, entry.value, entry.reasoning), 700);
        }
        return next;
      });
    },
    [persist]
  );

  const doSubmit = useCallback(
    async (automatic = false) => {
      if (submitted.current) return;
      submitted.current = true;
      setSubmitting(true);
      try {
        Object.values(timers.current).forEach(clearTimeout);
        const result = await api(`/api/portal/attempts/${attemptId}/submit`, { method: 'POST' });
        toast(
          automatic
            ? 'Time expired. Your attempt was submitted.'
            : result.requiresManualReview
              ? 'Submitted. Qualitative answers go to a reviewer before release.'
              : 'Submitted. Your result will appear once released.',
          'ok'
        );
        navigate(`${basePath}/results`, { replace: true });
      } catch (err) {
        submitted.current = false;
        toast(err.message, 'error');
        setSubmitting(false);
      }
    },
    [attemptId, basePath, navigate, toast]
  );

  useEffect(() => {
    if (data?.attempt?.status !== 'in_progress' || remaining == null) return undefined;
    if (remaining <= 0) {
      doSubmit(true);
      return undefined;
    }
    const timer = setInterval(() => {
      setRemaining((value) => {
        if (value == null) return value;
        if (value <= 1) {
          clearInterval(timer);
          doSubmit(true);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [data?.attempt?.status, remaining == null, doSubmit]);

  useEffect(() => {
    if (data?.attempt?.status !== 'in_progress') return undefined;
    const onOffline = () => {
      api(`/api/portal/attempts/${attemptId}/interruption`, { method: 'POST', body: { event: 'disconnect' } }).catch(() => {});
    };
    const onOnline = async () => {
      try {
        const result = await api(`/api/portal/attempts/${attemptId}/interruption`, {
          method: 'POST',
          body: { event: 'resume' },
        });
        if (result.remainingSeconds != null) setRemaining(result.remainingSeconds);
        toast('Connection restored — the timer was paused.', 'ok');
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [attemptId, data?.attempt?.status, toast]);

  useEffect(
    () => () => {
      Object.values(timers.current).forEach(clearTimeout);
    },
    []
  );

  if (loading) {
    return (
      <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center' }}>
        <Loading label="Opening your attempt…" />
      </div>
    );
  }
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;

  const { attempt, questions } = data;
  const question = questions[current];
  const answeredCount = questions.filter((q) => String(answers[q.id]?.value || '').trim().length > 0).length;
  const readOnly = attempt.status !== 'in_progress';

  const timerTone = remaining == null ? '' : remaining <= 60 ? 'timer--danger' : remaining <= 300 ? 'timer--warn' : '';

  return (
    <div className="runner">
      <header className="runner__top">
        <button
          type="button"
          className="icon-btn"
          aria-label="Leave assessment"
          onClick={() => (readOnly ? navigate(`${basePath}/results`) : setConfirmLeave(true))}
        >
          <ArrowLeft size={17} />
        </button>
        <div className="runner__title">
          <strong>{attempt.title}</strong>
          <span>
            {attempt.domain} · attempt {attempt.attemptNumber} · {attempt.isTimed ? `${attempt.timeLimitSeconds / 60} min` : 'untimed'}
          </span>
        </div>

        {attempt.isTimed && !readOnly ? (
          <div className={`timer ${timerTone}`} aria-live="polite">
            <Timer size={15} />
            {minutesLabel(remaining)}
          </div>
        ) : null}

        <Button
          variant="primary"
          size="sm"
          onClick={() => setConfirmSubmit(true)}
          disabled={readOnly || submitting}
          icon={Send}
        >
          {readOnly ? 'Submitted' : 'Submit'}
        </Button>
      </header>

      <div className="runner__body">
        <div className="stack gap-3" style={{ minWidth: 0 }}>
          {readOnly ? (
            <div className="banner banner--ok">
              <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                This attempt was {attempt.statusDetail.toLowerCase()} on {formatDateTime(attempt.submittedAt)}. It is now read-only.
              </span>
            </div>
          ) : null}

          <div className="question-shell">
            <div className="question-shell__head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge tone="violet">Question {current + 1} of {questions.length}</Badge>
                <Badge>{titleCase(question.type)}</Badge>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.75rem', color: 'var(--faint)' }}>
                <span>{question.marks} mark{question.marks === 1 ? '' : 's'}</span>
                {!readOnly ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {saving ? (
                      <>
                        <span className="spinner" style={{ width: 10, height: 10 }} /> Saving
                      </>
                    ) : lastSaved ? (
                      <>
                        <CheckCircle2 size={11} style={{ color: 'var(--mint)' }} /> Saved {lastSaved.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </>
                    ) : (
                      'Auto-save on'
                    )}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="question-shell__body">
              {question.scenario ? <div className="scenario">{question.scenario}</div> : null}
              <h2 className="question-prompt">{question.prompt}</h2>

              {question.type === 'mcq' || question.type === 'true_false' ? (
                <div className="options" role="radiogroup" aria-label="Answer options">
                  {(question.options || []).map((option, index) => {
                    const selected = answers[question.id]?.value === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`option ${selected ? 'is-selected' : ''}`}
                        disabled={readOnly}
                        onClick={() => update(question.id, { value: option }, { immediate: true })}
                      >
                        <span className="option__key">{String.fromCharCode(65 + index)}</span>
                        <span>{option}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="stack gap-3">
                  <Textarea
                    value={answers[question.id]?.value || ''}
                    onChange={(event) => update(question.id, { value: event.target.value })}
                    placeholder={question.type === 'practical_scenario' ? 'Write your full justification with rubric language…' : 'Type your answer…'}
                    rows={question.type === 'practical_scenario' ? 8 : 4}
                    disabled={readOnly}
                  />
                  {question.type === 'practical_scenario' ? (
                    <Textarea
                      value={answers[question.id]?.reasoning || ''}
                      onChange={(event) => update(question.id, { reasoning: event.target.value })}
                      placeholder="Optional: note the evidence you relied on (timestamps, fields, sources)."
                      rows={3}
                      disabled={readOnly}
                    />
                  ) : null}
                  {question.rubric ? (
                    <div className="banner">
                      <Flag size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontSize: '0.78rem' }}><strong style={{ color: 'var(--text)' }}>Scoring rubric:</strong> {question.rubric}</span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="question-nav">
              <Button
                variant="ghost"
                size="sm"
                icon={ChevronLeft}
                disabled={current === 0}
                onClick={() => setCurrent((value) => Math.max(0, value - 1))}
              >
                Previous
              </Button>
              <span className="autosave">
                {answeredCount} of {questions.length} answered
              </span>
              {current === questions.length - 1 ? (
                <Button variant="iris" size="sm" onClick={() => setConfirmSubmit(true)} disabled={readOnly} iconRight={Send}>
                  Review & submit
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setCurrent((value) => Math.min(questions.length - 1, value + 1))}
                  iconRight={ChevronRight}
                >
                  Next
                </Button>
              )}
            </div>
          </div>

          <p style={{ fontSize: '0.72rem', color: 'var(--ghost)', textAlign: 'center' }}>
            Answers are saved to your attempt every few seconds. Do not close this tab during a timed assessment.
          </p>
        </div>

        <aside className="palette">
          <div className="between" style={{ marginBottom: 10 }}>
            <span className="panel__title" style={{ fontSize: '0.84rem' }}>Question palette</span>
            <Badge tone={answeredCount === questions.length ? 'ok' : 'default'}>{answeredCount}/{questions.length}</Badge>
          </div>
          <div className="palette__grid">
            {questions.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`palette__btn ${index === current ? 'is-current' : ''} ${
                  String(answers[item.id]?.value || '').trim() ? 'is-answered' : ''
                }`}
                onClick={() => setCurrent(index)}
                aria-label={`Question ${index + 1}`}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <div className="palette__legend">
            <span><i className="now" /> Current question</span>
            <span><i className="on" /> Answered</span>
            <span><i /> Unanswered</span>
          </div>
          <div className="divider" />
          <Button variant="primary" block onClick={() => setConfirmSubmit(true)} disabled={readOnly} icon={Send}>
            Submit attempt
          </Button>
          <p style={{ fontSize: '0.68rem', color: 'var(--ghost)', marginTop: 10, lineHeight: 1.5 }}>
            Qualitative answers are reviewed manually. Released results appear under Results.
          </p>
        </aside>
      </div>

      <Confirm
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        onConfirm={() => {
          setConfirmSubmit(false);
          doSubmit(false);
        }}
        title="Submit this attempt?"
        message={`${answeredCount} of ${questions.length} questions have an answer. You cannot reopen the attempt after submitting.`}
        confirmLabel={submitting ? 'Submitting…' : 'Submit attempt'}
        tone="primary"
        loading={submitting}
      />

      <Confirm
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          navigate(`${basePath}/assessments`);
        }}
        title="Leave without submitting?"
        message="Your saved answers remain, and the timer keeps running. You can resume from the assessment list."
        confirmLabel="Leave assessment"
        tone="danger"
      />
    </div>
  );
}

/* ─────────────────────────── results ─────────────────────────── */

export function PortalResults({ basePath = '/portal' }) {
  const { data, loading, error, reload } = useFetch('/api/portal/results');
  const [openId, setOpenId] = useState(null);

  if (loading) return <Loading label="Loading results…" />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const results = data?.results || [];
  const released = results.filter((r) => r.isReleased);
  const pending = results.filter((r) => !r.isReleased);

  return (
    <>
      <PageHeader
        eyebrow="Result centre"
        title="Results"
        description="Released scores with reviewer comments and answer-level feedback. Results stay hidden until a reviewer releases them."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Badge tone="ok">{released.length} released</Badge>
            <Badge tone={pending.length ? 'warn' : 'default'}>{pending.length} pending</Badge>
          </div>
        }
      />

      {released.length ? (
        <div className="stack gap-3">
          {released.map((result) => (
            <ResultCard
              key={result.id}
              result={result}
              open={openId === result.id}
              onToggle={() => setOpenId(openId === result.id ? null : result.id)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title="No released results yet"
          description="Once a reviewer releases your attempt, the score and answer feedback appear here."
        />
      )}

      {pending.length ? (
        <section style={{ marginTop: 30 }}>
          <h2 className="h4" style={{ fontSize: '0.86rem', color: 'var(--muted)', marginBottom: 12 }}>Awaiting release</h2>
          <div className="panel">
            <div className="list">
              {pending.map((result) => (
                <div className="list__row" key={result.id}>
                  <div className="list__main">
                    <div className="list__title">
                      {result.title}
                      <StatusBadge status={result.requiresManualReview ? 'pending' : 'submitted'} />
                    </div>
                    <div className="list__sub">
                      Attempt {result.attemptNumber} · submitted {formatDateTime(result.submittedAt)}
                      {result.requiresManualReview ? ' · manual review in progress' : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--ghost)' }}>Hidden until released</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className="banner" style={{ marginTop: 24 }}>
        <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 2 }} />
        <span style={{ fontSize: '0.8rem' }}>
          Think a score is wrong? Send a message from{' '}
          <Link to={`${basePath === '/exam-portal' ? '/contact' : '/portal/feedback'}`} style={{ color: 'var(--text)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            feedback
          </Link>{' '}
          with the attempt reference. Reviews are revisitable.
        </span>
      </div>
    </>
  );
}

function ResultCard({ result, open, onToggle }) {
  const { data, loading } = useFetch(open ? `/api/portal/attempts/${result.id}` : null);
  const attempt = data?.attempt;
  const questions = data?.questions || [];

  return (
    <div className="panel">
      <div className="result-hero" style={{ border: 0, background: 'transparent', borderRadius: 0 }}>
        <ScoreRing value={result.percentage || 0} label={result.passed ? 'Passed' : 'Score'} size={92} />
        <div className="result-hero__meta">
          <h2>{result.title}</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.76rem', color: 'var(--faint)' }}>
            <span>{result.domain}</span>
            <span>·</span>
            <span>Attempt {result.attemptNumber}</span>
            <span>·</span>
            <span>Released {formatDateTime(result.releasedAt)}</span>
            <span>·</span>
            <span>Pass mark {result.passingPercentage}%</span>
          </div>
          {result.reviewerComment ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-soft)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', marginTop: 8 }}>
              <strong style={{ fontWeight: 500 }}>Reviewer:</strong> {result.reviewerComment}
            </p>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <Badge tone={result.passed ? 'ok' : 'danger'}>{result.passed ? 'Passed' : 'Not passed'}</Badge>
          {result.showAnswers ? (
            <Button variant="ghost" size="sm" onClick={onToggle} iconRight={open ? ChevronLeft : ArrowRight}>
              {open ? 'Hide detail' : 'View answers'}
            </Button>
          ) : null}
        </div>
      </div>

      {open ? (
        <div style={{ borderTop: '1px solid var(--line)', padding: '18px 20px' }}>
          {loading ? <Loading label="Loading attempt detail…" /> : null}
          {attempt && !attempt.releaseVisibility.answers ? (
            <div className="banner">Answer-level feedback was not released for this attempt.</div>
          ) : null}
          {questions.map((question, index) => (
            <div className="answer-block" key={question.id}>
              <div className="answer-block__head">
                <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>
                  {index + 1}. {question.prompt}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {question.answer?.isCorrect === true ? (
                    <Badge tone="ok"><CheckCircle2 size={10} /> Correct</Badge>
                  ) : question.answer?.isCorrect === false ? (
                    <Badge tone="danger"><XCircle size={10} /> Incorrect</Badge>
                  ) : (
                    <Badge tone="warn">Reviewed</Badge>
                  )}
                  <span style={{ fontSize: '0.75rem', color: 'var(--faint)' }}>
                    {question.answer?.awardedMarks ?? 0} / {question.marks}
                  </span>
                </div>
              </div>
              <div className="answer-block__body">
                <div style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ghost)' }}>Your answer</span>
                  <p>{question.answer?.value || <em style={{ color: 'var(--faint)' }}>No answer submitted</em>}</p>
                </div>
                {question.answer?.reasoning ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    <strong style={{ color: 'var(--text-soft)', fontWeight: 500 }}>Evidence note:</strong> {question.answer.reasoning}
                  </p>
                ) : null}
                {question.answer?.reviewerComment ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 6 }}>
                    <strong style={{ color: 'var(--text-soft)', fontWeight: 500 }}>Reviewer comment:</strong> {question.answer.reviewerComment}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
