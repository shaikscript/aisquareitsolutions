import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  History,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  StatusBadge,
} from '../../components/ui.jsx';
import { api, formatDate, withSession } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../context/AppContext.jsx';

export function PortalGuidelines() {
  const { data, loading, error, reload } = useFetch('/api/portal/guidelines');
  const [filter, setFilter] = useState('All');

  const guidelines = data?.guidelines || [];
  const categories = useMemo(() => ['All', ...Array.from(new Set(guidelines.map((g) => g.category)))], [guidelines]);
  const visible = filter === 'All' ? guidelines : guidelines.filter((g) => g.category === filter);

  const acknowledged = guidelines.filter((g) => g.acknowledged).length;
  const needsReview = guidelines.filter((g) => g.needsReview).length;

  if (loading) return <Loading label="Opening the rubric library…" />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <>
      <PageHeader
        eyebrow="Rubric library"
        title="Guidelines"
        description="Every published rubric, versioned and acknowledged. Re-read a document whenever a new version appears — your acknowledgement is tracked per version."
        actions={<Badge tone={acknowledged === guidelines.length ? 'ok' : 'warn'}>{acknowledged}/{guidelines.length} acknowledged</Badge>}
      />

      {needsReview ? (
        <div className="banner banner--warn" style={{ marginBottom: 16 }}>
          <History size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{needsReview} guideline{needsReview > 1 ? 's have' : ' has'} a new version. Open and acknowledge to stay current.</span>
        </div>
      ) : null}

      <div className="toolbar">
        <div className="segmented" aria-label="Filter guidelines">
          {categories.map((category) => (
            <button key={category} type="button" aria-pressed={filter === category} onClick={() => setFilter(category)}>
              {category}
            </button>
          ))}
        </div>
        <div className="toolbar__spacer" />
        <span style={{ fontSize: '0.75rem', color: 'var(--faint)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <ShieldCheck size={12} /> Published rubrics only
        </span>
      </div>

      {visible.length ? (
        <div className="doc-grid">
          {visible.map((guideline) => (
            <Link to={`/portal/guidelines/${guideline.id}`} className="doc-card" key={guideline.id}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <span className="doc-card__icon">
                  <FileText size={17} />
                </span>
                {guideline.acknowledged ? (
                  <Badge tone="ok"><CheckCircle2 size={10} /> Read</Badge>
                ) : guideline.needsReview ? (
                  <Badge tone="warn">New version</Badge>
                ) : (
                  <Badge>Unread</Badge>
                )}
              </div>
              <div>
                <h3>{guideline.title}</h3>
                <p style={{ marginTop: 6 }}>{guideline.summary}</p>
              </div>
              <div className="doc-card__foot">
                <span>{guideline.category} · v{guideline.version}</span>
                <span>{formatDate(guideline.updatedAt, { month: 'short', day: 'numeric' })}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={BookOpen}
          title="Nothing in this category yet"
          description="New rubrics appear here as soon as an administrator publishes them."
        />
      )}
    </>
  );
}

export function PortalGuidelineDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const { data, loading, error, reload } = useFetch(`/api/portal/guidelines/${id}`);
  const [acknowledging, setAcknowledging] = useState(false);
  const openedAt = useRef(Date.now());

  useEffect(() => {
    openedAt.current = Date.now();
  }, [id]);

  if (loading) return <Loading label="Loading guideline…" />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data?.guideline) return null;

  const guideline = data.guideline;
  const seconds = Math.max(30, Math.round((Date.now() - openedAt.current) / 1000));

  const acknowledge = async () => {
    setAcknowledging(true);
    try {
      await api(`/api/portal/guidelines/${guideline.id}/acknowledge`, {
        method: 'POST',
        body: { secondsSpent: seconds },
      });
      toast('Acknowledgement recorded for this version.', 'ok');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setAcknowledging(false);
    }
  };

  return (
    <>
      <Link to="/portal/guidelines" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: 'var(--faint)', marginBottom: 18 }}>
        <ArrowLeft size={13} /> All guidelines
      </Link>

      <PageHeader
        eyebrow={`${guideline.category} · v${guideline.version}`}
        title={guideline.title}
        description={guideline.summary}
        actions={
          <>
            <a href={withSession(guideline.pdfUrl)} target="_blank" rel="noreferrer" className="btn btn--ghost btn--sm">
              <ExternalLink size={13} /> Open PDF
            </a>
            <a href={withSession(guideline.pdfUrl)} download className="btn btn--ghost btn--sm">
              <Download size={13} /> Download
            </a>
          </>
        }
      />

      <div className="split">
        <div className="panel" style={{ overflow: 'hidden' }}>
          <div className="panel__head">
            <span className="panel__title" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <Layers size={14} /> Document viewer
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--faint)' }}>
              {guideline.fileName} · {guideline.fileSize ? `${Math.round(guideline.fileSize / 1024)} KB` : 'PDF'}
            </span>
          </div>
          <iframe
            title={guideline.title}
            src={withSession(guideline.pdfUrl)}
            style={{ width: '100%', height: 'min(70vh, 760px)', border: 0, background: 'var(--panel-2)' }}
          />
        </div>

        <div className="stack gap-4">
          <div className="panel" style={{ padding: 20 }}>
            <div className="between" style={{ marginBottom: 12 }}>
              <span className="panel__title">Acknowledgement</span>
              <StatusBadge status={guideline.acknowledged ? 'approved' : 'pending'} />
            </div>
            <p style={{ fontSize: '0.83rem', color: 'var(--muted)', marginBottom: 16 }}>
              {guideline.acknowledged
                ? 'You have acknowledged this version. If the rubric changes, the workspace will ask you to re-read it.'
                : 'Confirm that you have read this version and will apply it to live work. This is recorded in the audit trail.'}
            </p>
            <Button
              variant={guideline.acknowledged ? 'ghost' : 'iris'}
              block
              loading={acknowledging}
              onClick={acknowledge}
              icon={CheckCircle2}
            >
              {guideline.acknowledged ? 'Acknowledge again' : 'I have read this guideline'}
            </Button>
            <div className="divider" />
            <div className="meta-grid">
              <div className="meta-item">
                <small>Version</small>
                <span>v{guideline.version}</span>
              </div>
              <div className="meta-item">
                <small>Published</small>
                <span>{formatDate(guideline.updatedAt)}</span>
              </div>
              <div className="meta-item">
                <small>Requires ack</small>
                <span>{guideline.requiresAck ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel__head">
              <span className="panel__title">Version history</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--ghost)' }}>{guideline.history.length} versions</span>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div className="timeline">
                {guideline.history.map((version, index) => (
                  <div className="timeline__item" key={version.version} style={index === 0 ? { fontWeight: 500, color: 'var(--text-soft)' } : undefined}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>v{version.version}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--ghost)' }}>{formatDate(version.createdAt)}</span>
                    </div>
                    {version.changeNote}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="banner">
            <BookOpen size={15} style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: '0.79rem' }}>
              Unsure how a rule applies to a specific task? Escalate with the task reference rather than guessing —{' '}
              <Link to="/portal/feedback" style={{ color: 'var(--text)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                send feedback
              </Link>
              .
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
