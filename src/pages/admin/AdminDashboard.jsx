import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  BadgeCheck,
  CheckCircle2,
  ClipboardList,
  FileStack,
  Inbox,
  Mail,
  Megaphone,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Badge,
  BarChart,
  Button,
  ErrorState,
  Kpi,
  Loading,
  Metre,
  PageHeader,
  StatusBadge,
} from '../../components/ui.jsx';
import { useFetch } from '../../lib/hooks.js';
import { formatDate, relativeTime, titleCase } from '../../lib/api.js';

export default function AdminDashboard() {
  const { data, loading, error, reload } = useFetch('/api/admin/overview');
  const { data: attemptData } = useFetch('/api/admin/attempts?status=pending');

  if (loading) return <Loading label="Loading studio metrics…" />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;

  const { kpis, pipeline, readiness, activitySeries, pendingAttempts, recentActivity, upcoming } = data;
  const pipelineTotal = pipeline.reduce((sum, item) => sum + item.count, 0);
  const readinessTotal = readiness.reduce((sum, item) => sum + item.count, 0);

  return (
    <>
      <PageHeader
        eyebrow={`${formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}`}
        title="Studio overview"
        description="Quality, people and pipeline at a glance. Anything needing a human decision is surfaced first."
        actions={
          <>
            <Link to="/admin/results" className="btn btn--ghost btn--sm">
              <ClipboardList size={14} /> Review queue
            </Link>
            <Link to="/admin/assessments" className="btn btn--primary btn--sm">
              <Target size={14} /> Assessments
            </Link>
          </>
        }
      />

      <div className="grid-kpi">
        <Kpi
          label="Active employees"
          value={kpis.activeEmployees}
          suffix={`· ${kpis.candidates} candidates`}
          icon={Users}
          foot={<span>{kpis.admins} administrator{kpis.admins === 1 ? '' : 's'}</span>}
        />
        <Kpi
          label="Pending review"
          value={kpis.pendingReview}
          icon={ShieldCheck}
          accent={kpis.pendingReview ? 'var(--amber)' : 'var(--mint)'}
          foot={<span>{kpis.unreleased} attempts unreleased</span>}
        />
        <Kpi
          label="Average score"
          value={kpis.averagePercentage == null ? '—' : `${kpis.averagePercentage}%`}
          icon={TrendingUp}
          accent="var(--mint)"
          foot={<span>Pass rate {kpis.passRate == null ? '—' : `${kpis.passRate}%`}</span>}
        />
        <Kpi
          label="Application pipeline"
          value={kpis.newApplications}
          suffix="new"
          icon={FileStack}
          foot={<span>{kpis.publishedJobs} roles live</span>}
        />
      </div>

      <div className="page__section split">
        <div className="stack gap-4">
          <div className="panel">
            <div className="panel__head">
              <span className="panel__title">Evaluation activity · 14 days</span>
              <div style={{ display: 'flex', gap: 12, fontSize: '0.7rem', color: 'var(--faint)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <i style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--violet-bright)' }} /> Attempts
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <i style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--mint)' }} /> Portal events
                </span>
              </div>
            </div>
            <div style={{ padding: '16px 22px 20px' }}>
              <BarChart
                height={150}
                data={activitySeries.map((item) => ({
                  label: item.day.slice(5),
                  value: item.attempts + item.events,
                }))}
              />
            </div>
          </div>

          <div className="panel">
            <div className="panel__head">
              <span className="panel__title">Needs a decision</span>
              <Badge tone={pendingAttempts.length ? 'warn' : 'ok'}>
                {pendingAttempts.length ? `${pendingAttempts.length} pending` : 'Clear'}
              </Badge>
            </div>
            <div className="list">
              {pendingAttempts.map((attempt) => (
                <div className="list__row" key={attempt.id}>
                  <div className="list__main">
                    <div className="list__title">
                      {attempt.employeeName}
                      <span style={{ fontSize: '0.7rem', color: 'var(--ghost)' }}>{attempt.employeeCode}</span>
                    </div>
                    <div className="list__sub">
                      <span>{attempt.title}</span>
                      <span>·</span>
                      <span>submitted {relativeTime(attempt.submittedAt)}</span>
                      <span>·</span>
                      <span>{attempt.percentage}% auto</span>
                    </div>
                  </div>
                  <Link to={`/admin/results?attempt=${attempt.id}`} className="btn btn--sm btn--ghost">
                    Review <ArrowUpRight size={12} />
                  </Link>
                </div>
              ))}
              {!pendingAttempts.length ? (
                <div style={{ padding: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CheckCircle2 size={17} style={{ color: 'var(--mint)' }} />
                  <div>
                    <div style={{ fontSize: '0.86rem' }}>Review queue is clear.</div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--faint)' }}>New qualitative attempts will appear here.</div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="panel">
            <div className="panel__head">
              <span className="panel__title">Recent admin activity</span>
              <Link to="/admin/activity" style={{ fontSize: '0.74rem', color: 'var(--faint)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Full log <ArrowUpRight size={12} />
              </Link>
            </div>
            <div style={{ padding: '16px 22px' }}>
              <div className="timeline">
                {recentActivity.map((entry, index) => (
                  <div className={`timeline__item ${index === 0 ? 'is-latest' : ''}`} key={`${entry.createdAt}-${index}`}>
                    <span style={{ color: 'var(--text-soft)' }}>{entry.summary}</span>
                    <div style={{ fontSize: '0.7rem', color: 'var(--ghost)', marginTop: 2 }}>
                      {entry.identity} · {relativeTime(entry.createdAt)}
                    </div>
                  </div>
                ))}
                {!recentActivity.length ? <p style={{ fontSize: '0.8rem', color: 'var(--faint)' }}>No actions recorded yet.</p> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="stack gap-4">
          <div className="panel" style={{ padding: 20 }}>
            <div className="between" style={{ marginBottom: 16 }}>
              <span className="panel__title">Readiness</span>
              <Badge tone="violet">{readinessTotal} records</Badge>
            </div>
            <div className="stack gap-3">
              {readiness.map((item) => (
                <div key={item.status}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: 5 }}>
                    <span style={{ color: 'var(--text-soft)' }}>{titleCase(item.status)}</span>
                    <span style={{ color: 'var(--faint)' }}>{item.count}</span>
                  </div>
                  <Metre
                    value={readinessTotal ? (item.count / readinessTotal) * 100 : 0}
                    tone={item.status === 'approved' ? 'ok' : item.status === 'revoked' ? 'warn' : undefined}
                  />
                </div>
              ))}
              {!readiness.length ? <p style={{ fontSize: '0.8rem', color: 'var(--faint)' }}>No readiness records yet.</p> : null}
            </div>
            <div className="divider" />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--muted)' }}>Active projects</span>
              <span>{kpis.activeProjects}</span>
            </div>
            <Link to="/admin/readiness" className="btn btn--ghost btn--sm" style={{ width: '100%', marginTop: 14 }}>
              Manage readiness <ArrowUpRight size={12} />
            </Link>
          </div>

          <div className="panel">
            <div className="panel__head">
              <span className="panel__title">Application pipeline</span>
              <Badge>{pipelineTotal}</Badge>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {pipeline.map((item) => (
                <div key={item.status} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                  <StatusBadge status={item.status} />
                  <Metre value={pipelineTotal ? (item.count / pipelineTotal) * 100 : 0} style={{ flex: 1 }} />
                  <span style={{ fontSize: '0.74rem', color: 'var(--faint)', width: 18, textAlign: 'right' }}>{item.count}</span>
                </div>
              ))}
              {!pipeline.length ? <p style={{ fontSize: '0.8rem', color: 'var(--faint)' }}>No applications yet.</p> : null}
              <Button variant="ghost" size="sm" as={Link} to="/admin/applications" style={{ width: '100%', marginTop: 12 }}>
                Open pipeline <ArrowUpRight size={12} />
              </Button>
            </div>
          </div>

          <div className="panel">
            <div className="panel__head">
              <span className="panel__title">Inbox</span>
            </div>
            <div className="list">
              <Link to="/admin/messages" className="list__row">
                <Mail size={15} style={{ color: 'var(--faint)' }} />
                <div className="list__main">
                  <div className="list__title">Contact messages</div>
                  <div className="list__sub">{kpis.unreadMessages} unread</div>
                </div>
              </Link>
              <Link to="/admin/feedback" className="list__row">
                <Inbox size={15} style={{ color: 'var(--faint)' }} />
                <div className="list__main">
                  <div className="list__title">Employee feedback</div>
                  <div className="list__sub">{kpis.openFeedback} open</div>
                </div>
              </Link>
            </div>
          </div>

          <div className="panel">
            <div className="panel__head">
              <span className="panel__title">Published assessments</span>
              <Badge tone="info">{kpis.publishedAssessments}</Badge>
            </div>
            <div className="list">
              {upcoming.map((assessment) => (
                <div className="list__row" key={assessment.id}>
                  <Target size={14} style={{ color: 'var(--faint)' }} />
                  <div className="list__main">
                    <div className="list__title" style={{ fontSize: '0.8rem' }}>{assessment.title}</div>
                    <div className="list__sub">{assessment.assigned} assigned</div>
                  </div>
                </div>
              ))}
              {!upcoming.length ? <p style={{ padding: 18, fontSize: '0.8rem', color: 'var(--faint)' }}>No published assessments.</p> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-4" style={{ marginTop: 18 }}>
        {[
          { to: '/admin/employees', icon: Users, label: 'Add employee', note: 'Single or bulk onboarding' },
          { to: '/admin/guidelines', icon: BadgeCheck, label: 'Publish guideline', note: 'Upload a PDF and version it' },
          { to: '/admin/question-bank', icon: Target, label: 'Write a question', note: 'MCQ, short answer or scenario' },
          { to: '/admin/announcements', icon: Megaphone, label: 'Announce', note: 'Notify every active employee' },
        ].map((item) => (
          <Link key={item.to} to={item.to} className="card card--pad card--hover" style={{ padding: 18 }}>
            <item.icon size={16} style={{ color: 'var(--muted)', marginBottom: 12 }} />
            <div className="h4" style={{ fontSize: '0.9rem' }}>{item.label}</div>
            <div style={{ fontSize: '0.74rem', color: 'var(--faint)', marginTop: 3 }}>{item.note}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
