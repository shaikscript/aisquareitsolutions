import React from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, LogOut, ShieldCheck, Target } from 'lucide-react';
import Logo from '../../components/Logo.jsx';
import ProtectedRoute from '../../components/ProtectedRoute.jsx';
import { ThemeToggle } from '../../components/SiteChrome.jsx';
import { useAuth, useToast } from '../../context/AppContext.jsx';
import { initials } from '../../lib/api.js';

const TABS = [
  { to: '/exam-portal', label: 'Assessments', icon: Target, end: true },
  { to: '/exam-portal/results', label: 'Results', icon: ClipboardList },
];

export default function ExamPortalLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const location = useLocation();

  const signOut = async () => {
    await logout();
    toast('Signed out of the exam portal.', 'ok');
    navigate('/', { replace: true });
  };

  return (
    <ProtectedRoute allow={['candidate', 'employee']} loginPath="/exam-login">
      <div style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <header className="topbar" style={{ gap: 18 }}>
          <Link to="/exam-portal" aria-label="AI Square exam portal">
            <Logo size={28} />
          </Link>

          <nav style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}
                style={{ height: 36, padding: '0 12px' }}
              >
                <tab.icon size={15} />
                {tab.label}
              </NavLink>
            ))}
          </nav>

          <div className="topbar__right">
            <span className="chip" style={{ height: 30, fontSize: '0.7rem' }}>
              <ShieldCheck size={11} /> Candidate access
            </span>
            <ThemeToggle compact />
            <span className="avatar avatar--sm" title={user?.fullName}>{initials(user?.fullName)}</span>
            <button type="button" className="icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <main className="page" style={{ maxWidth: 1180, width: '100%', flex: 1 }}>
          {location.pathname.includes('/take/') ? (
            <Outlet />
          ) : (
            <>
              <div className="banner banner--violet" style={{ marginBottom: 18, background: 'var(--accent-soft)', borderColor: 'var(--accent-line)' }}>
                <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: '0.8rem' }}>
                  Candidate session for <strong style={{ color: 'var(--text)' }}>{user?.fullName}</strong> ({user?.code}). You only see
                  assessments assigned to you. Results are released by a reviewer.
                </span>
              </div>
              <Outlet />
            </>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
