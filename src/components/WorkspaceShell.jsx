import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  ChevronRight,
  Command,
  KeyRound,
  LogOut,
  Menu,
  Search,
  X,
} from 'lucide-react';
import Logo from './Logo.jsx';
import { Button, Field, Input, Modal } from './ui.jsx';
import { ThemeToggle } from './SiteChrome.jsx';
import { useAuth, useToast } from '../context/AppContext.jsx';
import { api, initials, relativeTime } from '../lib/api.js';
import { useFetch, useOnlineStatus } from '../lib/hooks.js';

function notificationIconClass(type) {
  if (type === 'assessment' || type === 'attempt') return 'badge--info';
  if (type === 'readiness' || type === 'result') return 'badge--ok';
  if (type === 'guideline') return 'badge--violet';
  return '';
}

function ChangePasswordModal({ open, onClose }) {
  const { toast } = useToast();
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (values.newPassword !== values.confirm) {
      setError('The new passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword: values.currentPassword, newPassword: values.newPassword },
      });
      toast('Password updated. Other sessions were signed out.', 'ok');
      setValues({ currentPassword: '', newPassword: '', confirm: '' });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change password"
      subtitle="At least 8 characters with a letter and a number. Other sessions sign out automatically."
      size="narrow"
    >
      <form onSubmit={submit} className="form-grid">
        <Field label="Current password" htmlFor="cp-current">
          <Input id="cp-current" type="password" value={values.currentPassword} onChange={(e) => setValues((p) => ({ ...p, currentPassword: e.target.value }))} required />
        </Field>
        <Field label="New password" htmlFor="cp-new">
          <Input id="cp-new" type="password" value={values.newPassword} onChange={(e) => setValues((p) => ({ ...p, newPassword: e.target.value }))} required minLength={8} />
        </Field>
        <Field label="Confirm new password" htmlFor="cp-confirm">
          <Input id="cp-confirm" type="password" value={values.confirm} onChange={(e) => setValues((p) => ({ ...p, confirm: e.target.value }))} required minLength={8} />
        </Field>
        {error ? <div className="auth__error">{error}</div> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button type="button" variant="quiet" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="iris" loading={loading}>Update password</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function WorkspaceShell({ nav, workspaceLabel, homeTo, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const online = useOnlineStatus();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const bellRef = useRef(null);

  const { data: notifications, reload: reloadNotifications } = useFetch('/api/portal/notifications', [], {
    enabled: Boolean(user),
  });

  useEffect(() => {
    setDrawerOpen(false);
    setBellOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!bellOpen) return undefined;
    const onClick = (event) => {
      if (!bellRef.current?.contains(event.target)) setBellOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [bellOpen]);

  const allItems = nav.flatMap((group) => group.items);
  const current = allItems.find((item) => item.to === location.pathname) || allItems.find((item) => location.pathname.startsWith(`${item.to}/`));

  const unread = notifications?.unread || 0;

  const signOut = async () => {
    await logout();
    toast('Signed out.', 'ok');
    navigate('/', { replace: true });
  };

  const markAllRead = async () => {
    await api('/api/portal/notifications/read-all', { method: 'POST' });
    reloadNotifications();
  };

  return (
    <div className={`app ${drawerOpen ? 'is-drawer-open' : ''}`}>
      <div className="sidebar__scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />

      <aside className="sidebar">
        <div className="sidebar__brand">
          <Link to={homeTo} aria-label="Workspace home">
            <Logo size={30} />
          </Link>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setDrawerOpen(false)}
            style={{ marginLeft: 'auto' }}
            aria-label="Close navigation"
          >
            <X size={17} />
          </button>
        </div>

        <div className="workspace-chip">
          <Command size={13} style={{ color: 'var(--lavender)' }} />
          <span>
            <strong>{workspaceLabel}</strong>
            <br />
            {user?.accountType === 'candidate' ? 'Candidate access' : user?.role === 'admin' ? 'Full control' : 'Employee access'}
          </span>
        </div>

        <nav className="sidebar__nav" aria-label="Workspace">
          {nav.map((group) => (
            <div className="nav-group" key={group.label}>
              {group.label ? <div className="nav-group__label">{group.label}</div> : null}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}
                >
                  <item.icon size={16} strokeWidth={1.8} />
                  <span>{item.label}</span>
                  {item.badge ? <span className="nav-item__badge">{item.badge}</span> : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar__foot">
          <Link to="/" className="nav-item" style={{ height: 34 }}>
            <ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} />
            <span style={{ fontSize: '0.78rem' }}>Back to website</span>
          </Link>
          <div className="user-card">
            <span className="avatar" aria-hidden="true">{initials(user?.fullName)}</span>
            <span className="user-card__meta">
              <strong>{user?.fullName || 'Account'}</strong>
              <span>{user?.code || user?.accountType}</span>
            </span>
            <div className="sidebar__utility">
              <ThemeToggle compact />
              <button type="button" className="icon-btn" aria-label="Sign out" title="Sign out" onClick={signOut}>
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="app__main">
        <header className="topbar">
          <button type="button" className="icon-btn topbar__burger" onClick={() => setDrawerOpen(true)} aria-label="Open navigation">
            <Menu size={18} />
          </button>
          <div className="topbar__title">
            {workspaceLabel}
            <span>/</span>
            {current?.label || 'Workspace'}
          </div>

          <div className="topbar__right">
            <div className="search-mini" aria-hidden="true">
              <Search size={13} />
              <input placeholder="Search workspace" tabIndex={-1} />
              <span className="kbd">⌘K</span>
            </div>

            <div className="bell" ref={bellRef}>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
                onClick={() => setBellOpen((v) => !v)}
              >
                <Bell size={17} />
                {unread ? <span className="bell__dot" /> : null}
              </button>

              {bellOpen ? (
                <div
                  className="panel"
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 'calc(100% + 10px)',
                    width: 340,
                    maxWidth: 'calc(100vw - 24px)',
                    zIndex: 60,
                    overflow: 'hidden',
                    animation: 'fadeUp 200ms var(--ease)',
                  }}
                >
                  <div className="panel__head" style={{ padding: '12px 14px' }}>
                    <span className="panel__title">Notifications</span>
                    <button type="button" className="btn btn--quiet btn--sm" onClick={markAllRead}>
                      <CheckCheck size={13} /> Read all
                    </button>
                  </div>
                  <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                    {notifications?.notifications?.length ? (
                      notifications.notifications.slice(0, 8).map((item) => (
                        <Link
                          key={item.id}
                          to={item.linkPath || '/'}
                          onClick={async () => {
                            if (!item.isRead) {
                              await api(`/api/portal/notifications/${item.id}/read`, { method: 'POST' });
                              reloadNotifications();
                            }
                            setBellOpen(false);
                          }}
                          style={{
                            display: 'flex',
                            gap: 10,
                            padding: '11px 14px',
                            borderBottom: '1px solid var(--line)',
                            alignItems: 'flex-start',
                            opacity: item.isRead ? 0.62 : 1,
                          }}
                        >
                          <span className={`badge ${notificationIconClass(item.type)}`} style={{ height: 8, width: 8, padding: 0, borderRadius: 999, marginTop: 6 }} />
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: '0.79rem', fontWeight: 500 }}>{item.title}</span>
                            <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>{item.message}</span>
                            <span style={{ display: 'block', fontSize: '0.66rem', color: 'var(--ghost)', marginTop: 4 }}>{relativeTime(item.createdAt)}</span>
                          </span>
                        </Link>
                      ))
                    ) : (
                      <p style={{ padding: 22, fontSize: '0.8rem', color: 'var(--faint)', textAlign: 'center' }}>
                        Nothing new. Calm inbox.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <button type="button" className="icon-btn" aria-label="Change password" title="Change password" onClick={() => setPasswordOpen(true)}>
              <KeyRound size={16} />
            </button>
          </div>
        </header>

        {!online ? (
          <div style={{ padding: '10px 16px 0' }}>
            <div className="banner banner--warn">You are offline. Saved work will sync when the connection returns.</div>
          </div>
        ) : null}

        {user?.mustChangePassword ? (
          <div style={{ padding: '10px 16px 0' }}>
            <div className="banner banner--warn" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span>This account is using a temporary password. Please set your own.</span>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => setPasswordOpen(true)}>
                Change now
              </button>
            </div>
          </div>
        ) : null}

        <main className="page">
          {children || <Outlet />}
        </main>
      </div>

      {nav.mobile?.length ? (
        <nav className="mobile-tabs" aria-label="Quick navigation">
          {nav.mobile.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'is-active' : '')}>
              <item.icon size={18} strokeWidth={1.8} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      ) : null}

      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}
