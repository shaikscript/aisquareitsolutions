import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Gauge,
  MessageSquare,
  Megaphone,
  Play,
  Target,
  TrendingUp,
} from 'lucide-react';
import {
  Badge,
  Button,
  ErrorState,
  Kpi,
  Loading,
  Metre,
  PageHeader,
  ScoreRing,
  StatusBadge,
} from '../../components/ui.jsx';
import { useFetch } from '../../lib/hooks.js';
import { formatDate, relativeTime, titleCase } from '../../lib/api.js';
import { useAuth } from '../../context/AppContext.jsx';

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

export default function PortalDashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch('/api/portal/overview');

  if (loading) return <Loading label="Preparing your workspace…" />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;

  const { stats, readiness, pendingAssessments, announcements, activity, profile } = data;
  const approved = readiness.filter((item) => item.status === 'approved').length;
  const readinessScore = readiness.length ? Math.round((approved / readiness.length) * 100) : 0;
  const guidelinePercent = stats.guidelinesTotal ? Math.round((stats.guidelinesAcknowledged / stats.guidelinesTotal) * 100) : 0;

  return (
    <>
      <PageHeader
        eyebrow={`${formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}`}
        title={`${greeting()}, ${String(profile.name).split(' ')[0]}.`}
        description={
          stats.inProgress
            ? 'You have an assessment in progress. The timer pauses if your connection drops.'
            : 'Your rubrics, assessments and readiness signals are in one place. Start with what is due.'
        }
        actions={
          <>
            <Link to="/portal/guidelines" className="btn btn--ghost btn--sm">
              <BookOpen size={14} /> Read guidelines
            </Link>
            <Link to="/portal/assessments" className="btn btn--primary btn--sm">
              <Target size={14} /> Assessments
            </Link>
          </>
        }
      />

      <div className="grid-kpi">
        <Kpi
          label="Open assessments"
          value={stats.openAssessments}
          suffix={stats.inProgress ? `· ${stats.inProgress} live` : ''}
          icon={Target}
          foot={<span>{stats.completed} completed to date</span>}
        />
        <Kpi
          label="Average score"
          value={stats.averagePercentage == null ? '—' : `${stats.averagePercentage}%`}
          icon={TrendingUp}
          accent="var(--mint)"
          foot={<span>Across released results</span>}
        />
        <Kpi
          label="Project readiness"
          value={`${approved}/${readiness.length}`}
          icon={BadgeCheck}
          accent="var(--lavender)"
          foot={<span>{readiness.filter((r) => r.status === 'pending_approval').length} awaiting approval</span>}
        />
        <Kpi
          label="Guidelines acknowledged"
          value={`${stats.guidelinesAcknowledged}/${stats.guidelinesTotal}`}
          icon={BookOpen}
          foot={<Metre value={guidelinePercent} style={{ marginTop: 6 }} />}
        />
      </div>

      <div className="page__section split">
        <div className="stack gap-4">
          <section>
            <div className="between" style={{ marginBottom: 12 }}>
              <h2 className="h4" style={{ fontSize: '0.92rem' }}>Due next</h2>
              <Link to="/portal/assessments" style={{ fontSize: '0.76rem', color: 'var(--faint)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                All assessments <ArrowRight size={12} />
              </Link>
            </div>

            {pendingAssessments.length ? (
              <div className="stack gap-2">
                {pendingAssessments.map((assessment) => (
                  <div className="card card--pad" key={assessment.id} style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        display: 'grid',
                        placeItems: 'center',
                        background: 'var(--accent-soft)',
                        border: '1px solid var(--accent-line)',
                        color: 'var(--lavender)',
                        flexShrink: 0,
                      }}
                    >
                      <FileText size={17} />
                    </span>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 500 }}>{assessment.title}</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--faint)', marginTop: 3, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Clock3 size={11} /> {assessment.isTimed ? `${assessment.timeLimitMinutes} min` : 'Untimed'}
                        </span>
                        <span>{assessment.questionCount} questions</span>
                        <span>{assessment.domain}</span>
                      </div>
                    </div>
                    <Link to="/portal/assessments" className="btn btn--ghost btn--sm">
                      Open <Play size={12} />
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card card--pad" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <CheckCircle2 size={18} style={{ color: 'var(--mint)' }} />
                <div>
                  <div style={{ fontSize: '0.86rem' }}>Nothing pending.</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--faint)' }}>New assessments appear here when your reviewer publishes them.</div>
                </div>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel__head">
              <span className="panel__title">Project readiness</span>
              <Link to="/portal/readiness" style={{ fontSize: '0.76rem', color: 'var(--faint)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Detail <ArrowUpRight size={12} />
              </Link>
            </div>
            <div className="list">
              {readiness.map((project) => (
                <div className="list__row" key={project.projectId}>
                  <div className="list__main">
                    <div className="list__title">
                      {project.project}
                      <StatusBadge status={project.status} />
                    </div>
                    <div className="list__sub">
                      {project.requirements.length
                        ? project.requirements.map((req) => (
                            <span key={req.assessmentId}>
                              {req.assessmentTitle} · {req.best == null ? 'not attempted' : `${req.best}%`} / {req.minimum}%
                            </span>
                          ))
                        : 'No assessment requirements linked yet'}
                    </div>
                  </div>
                  <div className="list__aside">
                    <Metre
                      value={
                        project.requirements.length
                          ? (project.requirements.filter((r) => r.met).length / project.requirements.length) * 100
                          : 0
                      }
                      style={{ width: 72 }}
                    />
                  </div>
                </div>
              ))}
              {!readiness.length ? <p style={{ padding: 20, fontSize: '0.82rem', color: 'var(--faint)' }}>No projects assigned yet.</p> : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel__head">
              <span className="panel__title">Recent activity</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--ghost)' }}>Last 8 events</span>
            </div>
            <div style={{ padding: '18px 20px' }}>
              {activity.length ? (
                <div className="timeline">
                  {activity.map((event, index) => (
                    <div className={`timeline__item ${index === 0 ? 'is-latest' : ''}`} key={`${event.createdAt}-${index}`}>
                      <strong style={{ color: 'var(--text-soft)', fontWeight: 500 }}>{titleCase(event.type)}</strong>
                      {event.detail ? ` · ${event.detail}` : ''}
                      <div style={{ fontSize: '0.7rem', color: 'var(--ghost)', marginTop: 2 }}>
                        {relativeTime(event.createdAt)} {event.area ? `· ${event.area}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '0.82rem', color: 'var(--faint)' }}>Your workspace activity will appear here.</p>
              )}
            </div>
          </section>
        </div>

        <div className="stack gap-4">
          <div className="panel" style={{ padding: 22 }}>
            <div className="between" style={{ marginBottom: 16 }}>
              <span className="panel__title">Readiness</span>
              <Badge tone="violet">{approved} approved</Badge>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <ScoreRing value={readinessScore} label="Cleared" size={116} />
              <div style={{ flex: 1 }}>
                {readiness.slice(0, 3).map((project) => (
                  <div key={project.projectId} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.76rem', marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-soft)' }}>{project.project}</span>
                      <span style={{ color: 'var(--faint)' }}>{titleCase(project.status)}</span>
                    </div>
                    <Metre
                      value={
                        project.requirements.length
                          ? (project.requirements.filter((r) => r.met).length / project.requirements.length) * 100
                          : 0
                      }
                    />
                  </div>
                ))}
                {!readiness.length ? <p style={{ fontSize: '0.78rem', color: 'var(--faint)' }}>No projects yet.</p> : null}
              </div>
            </div>
            <Link to="/portal/readiness" className="btn btn--ghost btn--sm" style={{ marginTop: 18, width: '100%' }}>
              View readiness detail <ArrowUpRight size={13} />
            </Link>
          </div>

          <div className="panel">
            <div className="panel__head">
              <span className="panel__title">Studio announcements</span>
              <Link to="/portal/announcements" className="icon-btn" aria-label="All announcements">
                <ArrowUpRight size={15} />
              </Link>
            </div>
            <div className="list">
              {announcements.map((item) => (
                <Link to="/portal/announcements" className="list__row" key={item.id}>
                  <div className="list__main">
                    <div className="list__title">{item.title}</div>
                    <div className="list__sub">
                      <Megaphone size={11} /> {item.category} · {relativeTime(item.publishedAt)}
                    </div>
                  </div>
                </Link>
              ))}
              {!announcements.length ? <p style={{ padding: 20, fontSize: '0.82rem', color: 'var(--faint)' }}>No announcements yet.</p> : null}
            </div>
          </div>

          <div className="panel" style={{ padding: 20 }}>
            <div className="panel__title" style={{ marginBottom: 12 }}>Quick actions</div>
            <div className="stack gap-2">
              {[
                { to: '/portal/guidelines', icon: BookOpen, label: 'Open the rubric library' },
                { to: '/portal/notifications', icon: Bell, label: `Notifications${stats.unreadNotifications ? ` · ${stats.unreadNotifications} new` : ''}` },
                { to: '/portal/feedback', icon: MessageSquare, label: 'Send feedback to the studio' },
                { to: '/portal/readiness', icon: CalendarClock, label: 'Check project readiness' },
              ].map((item) => (
                <Link key={item.to} to={item.to} className="nav-item" style={{ height: 38 }}>
                  <item.icon size={15} />
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="divider" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span className="avatar avatar--sm">{profile.name?.slice(0, 1)}</span>
              <div style={{ fontSize: '0.74rem', color: 'var(--faint)' }}>
                <span style={{ display: 'block', color: 'var(--text-soft)' }}>{profile.code}</span>
                {profile.department || 'Evaluator'}
              </div>
              <Gauge size={14} style={{ marginLeft: 'auto', color: 'var(--ghost)' }} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
