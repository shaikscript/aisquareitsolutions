import React, { useState } from 'react';
import {
  Bell,
  CheckCheck,
  ClipboardList,
  Megaphone,
  MessageSquare,
  Send,
  Sparkles,
} from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
} from '../../components/ui.jsx';
import { api, formatDateTime, relativeTime } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../context/AppContext.jsx';

export function PortalAnnouncements() {
  const { data, loading, error, reload } = useFetch('/api/portal/announcements');
  const [filter, setFilter] = useState('All');

  if (loading) return <Loading label="Loading announcements…" />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const announcements = data?.announcements || [];
  const categories = ['All', ...Array.from(new Set(announcements.map((a) => a.category)))];
  const visible = filter === 'All' ? announcements : announcements.filter((a) => a.category === filter);

  return (
    <>
      <PageHeader
        eyebrow="Studio comms"
        title="Announcements"
        description="Schedule changes, rubric releases and quality notes from the studio team."
        actions={<Badge tone="violet"><Megaphone size={10} /> {announcements.length} published</Badge>}
      />

      <div className="toolbar">
        <div className="segmented">
          {categories.map((category) => (
            <button key={category} type="button" aria-pressed={filter === category} onClick={() => setFilter(category)}>
              {category}
            </button>
          ))}
        </div>
      </div>

      {visible.length ? (
        <div className="stack gap-3">
          {visible.map((item) => (
            <article className="panel" key={item.id}>
              <div className="panel__head">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                    <Badge tone="violet">{item.category}</Badge>
                    <span style={{ fontSize: '0.7rem', color: 'var(--ghost)' }}>{relativeTime(item.publishedAt)}</span>
                  </div>
                  <span className="panel__title" style={{ fontSize: '1.02rem' }}>{item.title}</span>
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--faint)' }}>{item.author}</span>
              </div>
              <div style={{ padding: '18px 22px', fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                {item.body}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={Megaphone} title="No announcements in this category" description="Studio updates appear here as they are published." />
      )}
    </>
  );
}

export function PortalNotifications() {
  const { data, loading, error, reload } = useFetch('/api/portal/notifications');
  const { toast } = useToast();

  if (loading) return <Loading label="Loading notifications…" />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const notifications = data?.notifications || [];

  const markAll = async () => {
    await api('/api/portal/notifications/read-all', { method: 'POST' });
    toast('All notifications marked as read.', 'ok');
    reload();
  };

  const markOne = async (id) => {
    await api(`/api/portal/notifications/${id}/read`, { method: 'POST' });
    reload();
  };

  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        description="Assessment releases, readiness decisions and studio announcements."
        actions={
          <Button variant="ghost" size="sm" icon={CheckCheck} onClick={markAll} disabled={!data?.unread}>
            Mark all read
          </Button>
        }
      />

      {notifications.length ? (
        <div className="panel">
          <div className="list">
            {notifications.map((item) => (
              <div className="list__row" key={item.id} style={{ opacity: item.isRead ? 0.62 : 1 }}>
                <span
                  className="empty__icon"
                  style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, color: item.isRead ? 'var(--faint)' : 'var(--lavender)' }}
                >
                  {item.type === 'announcement' ? <Megaphone size={15} /> : item.type === 'result' ? <CheckCheck size={15} /> : <Bell size={15} />}
                </span>
                <div className="list__main">
                  <div className="list__title">
                    {item.title}
                    {!item.isRead ? <span className="dot" style={{ color: 'var(--mint)' }} /> : null}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 3 }}>{item.message}</div>
                  <div className="list__sub">
                    <span>{formatDateTime(item.createdAt)}</span>
                    <span>·</span>
                    <span>{item.type}</span>
                  </div>
                </div>
                {!item.isRead ? (
                  <Button variant="quiet" size="sm" onClick={() => markOne(item.id)}>
                    Mark read
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState icon={Bell} title="Nothing here yet" description="You will be notified when results or announcements are published." />
      )}
    </>
  );
}

const CATEGORIES = ['Guideline problem', 'Assessment concern', 'Portal usability', 'Work preparation', 'Suggestion'];

export function PortalFeedback() {
  const { data, loading, error, reload } = useFetch('/api/portal/feedback');
  const { toast } = useToast();
  const [values, setValues] = useState({ category: CATEGORIES[0], subject: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      await api('/api/portal/feedback', { method: 'POST', body: values });
      toast('Feedback sent to the studio reviewers.', 'ok');
      setValues({ category: CATEGORIES[0], subject: '', message: '' });
      reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Talk to the studio"
        title="Feedback"
        description="Flag a guideline problem, a portal issue or an assessment concern. Feedback is read by a reviewer, not a bot."
      />

      <div className="split">
        <div className="panel" style={{ padding: 'clamp(18px, 3vw, 26px)' }}>
          <form onSubmit={submit} className="form-grid">
            <Field label="Category" htmlFor="fb-category">
              <Select
                id="fb-category"
                value={values.category}
                onChange={(event) => setValues((prev) => ({ ...prev, category: event.target.value }))}
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </Select>
            </Field>

            <Field label="Subject" required htmlFor="fb-subject">
              <input
                id="fb-subject"
                className="input"
                value={values.subject}
                onChange={(event) => setValues((prev) => ({ ...prev, subject: event.target.value }))}
                placeholder="One line that names the issue"
                required
                minLength={4}
                maxLength={160}
              />
            </Field>

            <Field label="Detail" required hint="Include the guide version, assessment or page you were on." htmlFor="fb-message">
              <Textarea
                id="fb-message"
                value={values.message}
                onChange={(event) => setValues((prev) => ({ ...prev, message: event.target.value }))}
                placeholder="What happened, what you expected, and what would fix it."
                rows={6}
                required
                minLength={15}
              />
            </Field>

            {formError ? <div className="auth__error">{formError}</div> : null}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="form-note"><Sparkles size={11} /> No anonymous feedback — your code is attached.</span>
              <Button type="submit" variant="iris" loading={submitting} icon={Send}>
                Send feedback
              </Button>
            </div>
          </form>
        </div>

        <div className="panel">
          <div className="panel__head">
            <span className="panel__title">Your feedback</span>
            <Badge>{data?.feedback?.length || 0}</Badge>
          </div>
          {loading ? <Loading label="Loading feedback…" /> : null}
          {error ? <ErrorState message={error.message} onRetry={reload} /> : null}
          {!loading && !data?.feedback?.length ? (
            <EmptyState icon={MessageSquare} title="No feedback yet" description="Anything you send will appear here with its status." />
          ) : null}
          <div className="list">
            {data?.feedback?.map((item) => (
              <div key={item.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{item.subject}</span>
                  <StatusBadge status={item.status} />
                </div>
                <div className="list__sub" style={{ marginTop: 4 }}>
                  <span>{item.category}</span>
                  <span>·</span>
                  <span>{relativeTime(item.createdAt)}</span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 7, lineHeight: 1.55 }}>{item.message}</p>
                {item.response ? (
                  <div style={{ marginTop: 9, borderLeft: '2px solid var(--accent)', paddingLeft: 11 }}>
                    <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--faint)' }}>Studio response</div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-soft)', marginTop: 3 }}>{item.response}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
