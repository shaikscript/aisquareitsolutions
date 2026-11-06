import React from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  History,
  Info,
  Layers,
  ShieldAlert,
} from 'lucide-react';
import {
  Badge,
  EmptyState,
  ErrorState,
  Loading,
  Metre,
  PageHeader,
  StatusBadge,
} from '../../components/ui.jsx';
import { useFetch } from '../../lib/hooks.js';
import { formatDate, titleCase } from '../../lib/api.js';

const STATUS_NOTE = {
  approved: 'You are cleared to work on live batches for this project.',
  in_preparation: 'Complete the linked assessments above the threshold to be cleared automatically.',
  pending_approval: 'An administrator will review your evidence and record a decision.',
  not_ready: 'Start with the guidelines, then the linked assessments. Readiness updates automatically.',
  revoked: 'This clearance was withdrawn. Contact your reviewer for the reason and next steps.',
};

export default function PortalReadiness() {
  const { data, loading, error, reload } = useFetch('/api/portal/readiness');

  if (loading) return <Loading label="Loading readiness records…" />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const projects = data?.projects || [];
  const approved = projects.filter((p) => p.status === 'approved').length;

  return (
    <>
      <PageHeader
        eyebrow="Project readiness"
        title="Readiness"
        description="Clearance to work on each project, with the exact thresholds, decision source and history that produced it."
        actions={<Badge tone={approved ? 'ok' : 'default'}>{approved}/{projects.length} cleared</Badge>}
      />

      {!projects.length ? (
        <EmptyState
          icon={BadgeCheck}
          title="No projects assigned yet"
          description="Once a reviewer adds you to a project, its readiness requirements appear here."
        />
      ) : null}

      <div className="stack gap-4">
        {projects.map((project) => {
          const met = project.requirements.filter((requirement) => requirement.met).length;
          const progress = project.requirements.length ? (met / project.requirements.length) * 100 : 0;
          return (
            <article className="panel" key={project.projectId}>
              <div className="panel__head">
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                    <span className="panel__title" style={{ fontSize: '1rem' }}>{project.name}</span>
                    <StatusBadge status={project.status} />
                    <Badge tone={project.approvalMode === 'manual' ? 'violet' : 'default'}>
                      {project.approvalMode === 'manual' ? 'Manual approval' : 'Automatic gate'}
                    </Badge>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--faint)', marginTop: 5 }}>
                    {project.description || project.clientNote}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="stat-label">Requirement coverage</div>
                  <div style={{ fontSize: '1.1rem', letterSpacing: '-0.03em' }}>{met}/{project.requirements.length}</div>
                </div>
              </div>

              <div style={{ padding: '18px 22px' }}>
                <Metre value={progress} tone={project.status === 'approved' ? 'ok' : undefined} />

                <p style={{ fontSize: '0.83rem', color: 'var(--muted)', margin: '12px 0 16px', display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                  {project.status === 'approved' ? (
                    <CheckCircle2 size={14} style={{ color: 'var(--mint)', marginTop: 2, flexShrink: 0 }} />
                  ) : project.status === 'revoked' ? (
                    <ShieldAlert size={14} style={{ color: 'var(--danger)', marginTop: 2, flexShrink: 0 }} />
                  ) : (
                    <Info size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                  )}
                  {STATUS_NOTE[project.status] || 'Status recorded.'}
                </p>

                <div className="grid-2" style={{ gap: 10 }}>
                  {project.requirements.map((requirement) => (
                    <div className="card" key={requirement.id} style={{ padding: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-soft)' }}>{requirement.title}</span>
                        {requirement.met ? (
                          <Badge tone="ok"><CheckCircle2 size={10} /> Met</Badge>
                        ) : (
                          <Badge tone="warn"><CircleDashed size={10} /> Needed</Badge>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
                        <Metre
                          value={requirement.best == null ? 0 : Math.min(100, (requirement.best / Math.max(1, requirement.minimum)) * 100)}
                          tone={requirement.met ? 'ok' : 'warn'}
                          style={{ flex: 1 }}
                        />
                        <span style={{ fontSize: '0.72rem', color: 'var(--faint)', whiteSpace: 'nowrap' }}>
                          {requirement.best == null ? '—' : `${requirement.best}%`} / {requirement.minimum}%
                        </span>
                      </div>
                      {!requirement.met ? (
                        <Link to="/portal/assessments" style={{ fontSize: '0.72rem', color: 'var(--lavender)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 9 }}>
                          Take assessment <CalendarClock size={11} />
                        </Link>
                      ) : null}
                    </div>
                  ))}
                  {!project.requirements.length ? (
                    <div className="banner" style={{ gridColumn: '1 / -1' }}>
                      <Layers size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontSize: '0.78rem' }}>No assessment thresholds linked. An administrator approves this project manually.</span>
                    </div>
                  ) : null}
                </div>

                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 18, fontSize: '0.72rem', color: 'var(--ghost)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <ClipboardCheck size={12} /> Decision source: {titleCase(project.decisionSource)}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <History size={12} /> Updated {formatDate(project.updatedAt)}
                  </span>
                  {project.notes ? <span>Note: {project.notes}</span> : null}
                </div>

                {project.history?.length ? (
                  <details style={{ marginTop: 14 }}>
                    <summary style={{ cursor: 'pointer', fontSize: '0.76rem', color: 'var(--faint)' }}>
                      Decision history ({project.history.length})
                    </summary>
                    <div className="timeline" style={{ marginTop: 12 }}>
                      {project.history.map((entry, index) => (
                        <div className={`timeline__item ${index === 0 ? 'is-latest' : ''}`} key={`${entry.createdAt}-${index}`}>
                          <span style={{ color: 'var(--text-soft)' }}>
                            {entry.previous ? `${titleCase(entry.previous)} → ` : ''}{titleCase(entry.next)}
                          </span>
                          <div style={{ fontSize: '0.7rem', color: 'var(--ghost)' }}>
                            {entry.actor} · {titleCase(entry.source)} · {formatDate(entry.createdAt)}
                            {entry.reason ? ` · ${entry.reason}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
