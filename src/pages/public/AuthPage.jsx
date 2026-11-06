import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';
import Scene3D from '../../components/Scene3D.jsx';
import Logo from '../../components/Logo.jsx';
import { Button, Field, Input } from '../../components/ui.jsx';
import { useAuth, useTheme, useToast } from '../../context/AppContext.jsx';
import { api, apiUrl } from '../../lib/api.js';

const SCOPES = {
  employee: {
    title: 'Welcome back to the studio.',
    subtitle: 'Sign in to your employee workspace — guidelines, readiness, assessments and feedback.',
    action: 'Sign in to workspace',
    demo: { identifier: 'priya', password: 'aisquare-employee' },
    quote: '“The workspace is the rubric. Everything else is commentary.”',
    cite: 'Employee operating guide',
  },
  candidate: {
    title: 'Your evaluation starts here.',
    subtitle: 'Sign in with the candidate credentials issued to you after shortlisting.',
    action: 'Enter exam portal',
    demo: { identifier: 'candidate', password: 'aisquare-candidate' },
    quote: '“Read the task before the clock. The clock is not the difficulty.”',
    cite: 'Candidate assessment brief',
  },
  admin: {
    title: 'Administrator gateway.',
    subtitle: 'Manage people, rubrics, assessments and the quality record of the studio.',
    action: 'Open admin console',
    demo: { identifier: 'admin', password: 'aisquare-admin' },
    quote: '“Every judgement is provisional until it survives review.”',
    cite: 'Reviewer charter',
  },
};

const GATEWAYS = [
  { scope: 'employee', to: '/login', label: 'Employee' },
  { scope: 'candidate', to: '/exam-login', label: 'Candidate' },
  { scope: 'admin', to: '/admin/login', label: 'Admin' },
];

export default function AuthPage({ scope }) {
  const config = SCOPES[scope];
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { theme } = useTheme();
  const { login, user, loading: authLoading } = useAuth();

  const [values, setValues] = useState({ identifier: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [info, setInfo] = useState(null);
  const [bootstrap, setBootstrap] = useState({ needed: false, loading: true, form: { token: '', fullName: '', email: '', username: '', password: '' } });

  const from = location.state?.from || null;

  useEffect(() => {
    let active = true;
    fetch(apiUrl('/api/public/info'))
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => active && setInfo(data))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (scope !== 'admin') return;
    fetch(apiUrl('/api/auth/setup-status'))
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setBootstrap((prev) => ({ ...prev, needed: Boolean(data?.needsBootstrap), loading: false })))
      .catch(() => setBootstrap((prev) => ({ ...prev, loading: false })));
  }, [scope]);

  useEffect(() => {
    if (!authLoading && user) {
      const target = from || user.homePath || '/portal';
      navigate(target, { replace: true });
    }
  }, [authLoading, user, from, navigate]);

  const demoAvailable = info?.demoMode;
  const set = (key) => (event) => setValues((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const signedIn = await login(scope, values.identifier.trim(), values.password);
      toast(`Signed in as ${signedIn.fullName}`, 'ok');
      navigate(from || signedIn.homePath || '/portal', { replace: true });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  const fillDemo = () => {
    setValues(config.demo);
    setError('');
  };

  const submitBootstrap = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await api('/api/auth/bootstrap-admin', { method: 'POST', body: bootstrap.form });
      toast('Workspace initialised. You are signed in as the first administrator.', 'ok');
      window.localStorage.setItem('aisquare.session', result.token);
      window.location.assign(apiUrl('/admin'));
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  const visualQuote = useMemo(() => config.quote, [config]);

  return (
    <div className="auth">
      <aside className="auth__visual">
        <Scene3D variant="auth" className="auth__canvas" intensity={0.75} />
        <div className="auth__visual-content" style={{ position: 'relative', zIndex: 1 }}>
          <Link to="/" style={{ display: 'inline-flex' }}>
            <Logo size={32} />
          </Link>
          <div style={{ marginTop: 'clamp(40px, 9vh, 110px)', maxWidth: 460 }}>
            <span className="eyebrow eyebrow--bare" style={{ color: 'var(--muted)' }}>
              <Sparkles size={12} /> AI Square workspace
            </span>
            <p
              style={{
                marginTop: 18,
                fontSize: 'clamp(1.6rem, 2.8vw, 2.4rem)',
                lineHeight: 1.14,
                letterSpacing: '-0.035em',
              }}
            >
              One system for the people,
              <br />
              the rubrics and the
              <br />
              <span className="serif" style={{ color: 'var(--lavender)' }}>quality record.</span>
            </p>
          </div>
        </div>

        <div className="auth__quote" style={{ position: 'relative', zIndex: 1 }}>
          <blockquote>{visualQuote}</blockquote>
          <cite>{config.cite}</cite>
          <div style={{ display: 'flex', gap: 8, marginTop: 28, flexWrap: 'wrap' }}>
            <span className="chip"><ShieldCheck size={12} /> Scrypt hashed</span>
            <span className="chip"><BadgeCheck size={12} /> Audited actions</span>
          </div>
        </div>
      </aside>

      <div className="auth__form-side">
        <div className="auth__form-wrap">
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.75rem',
              color: 'var(--faint)',
              marginBottom: 30,
            }}
          >
            <ArrowLeft size={13} /> Back to aisquare.work
          </Link>

          <div className="auth__gateways" role="tablist" aria-label="Choose a portal">
            {GATEWAYS.map((gateway) => (
              <Link
                key={gateway.scope}
                to={gateway.to}
                className={gateway.scope === scope ? 'is-active' : ''}
                role="tab"
                aria-selected={gateway.scope === scope}
              >
                {gateway.label}
              </Link>
            ))}
          </div>

          {scope === 'admin' && bootstrap.needed ? (
            <>
              <h1>Initialise the workspace</h1>
              <p>
                No administrator exists yet. Create the first admin account. If your deployment sets
                <code style={{ margin: '0 4px', color: 'var(--text)' }}>ADMIN_BOOTSTRAP_TOKEN</code>, use it here.
              </p>
              <form onSubmit={submitBootstrap} className="auth__form">
                <Field label="Setup token" htmlFor="boot-token">
                  <Input
                    id="boot-token"
                    value={bootstrap.form.token}
                    onChange={(event) => setBootstrap((prev) => ({ ...prev, form: { ...prev.form, token: event.target.value } }))}
                    placeholder="Deployment setup token"
                    required
                  />
                </Field>
                <Field label="Full name" htmlFor="boot-name">
                  <Input
                    id="boot-name"
                    value={bootstrap.form.fullName}
                    onChange={(event) => setBootstrap((prev) => ({ ...prev, form: { ...prev.form, fullName: event.target.value } }))}
                    required
                  />
                </Field>
                <Field label="Email" htmlFor="boot-email">
                  <Input
                    id="boot-email"
                    type="email"
                    value={bootstrap.form.email}
                    onChange={(event) => setBootstrap((prev) => ({ ...prev, form: { ...prev.form, email: event.target.value } }))}
                    required
                  />
                </Field>
                <Field label="Username" htmlFor="boot-username">
                  <Input
                    id="boot-username"
                    value={bootstrap.form.username}
                    onChange={(event) => setBootstrap((prev) => ({ ...prev, form: { ...prev.form, username: event.target.value } }))}
                    required
                  />
                </Field>
                <Field label="Password" hint="At least 8 characters with a letter and a number." htmlFor="boot-password">
                  <Input
                    id="boot-password"
                    type="password"
                    value={bootstrap.form.password}
                    onChange={(event) => setBootstrap((prev) => ({ ...prev, form: { ...prev.form, password: event.target.value } }))}
                    required
                  />
                </Field>
                {error ? <div className="auth__error">{error}</div> : null}
                <Button type="submit" variant="iris" size="lg" loading={submitting} block>
                  Create administrator
                </Button>
              </form>
            </>
          ) : (
            <>
              <h1>{config.title}</h1>
              <p>{config.subtitle}</p>

              <form onSubmit={submit} className="auth__form">
                <Field label="Username or email" htmlFor="auth-identifier">
                  <div style={{ position: 'relative' }}>
                    <User size={15} style={{ position: 'absolute', left: 13, top: 15, color: 'var(--faint)' }} />
                    <Input
                      id="auth-identifier"
                      value={values.identifier}
                      onChange={set('identifier')}
                      placeholder="your.username"
                      autoComplete="username"
                      required
                      style={{ paddingLeft: 38 }}
                    />
                  </div>
                </Field>

                <Field label="Password" htmlFor="auth-password">
                  <div style={{ position: 'relative' }}>
                    <Lock size={15} style={{ position: 'absolute', left: 13, top: 15, color: 'var(--faint)' }} />
                    <Input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      value={values.password}
                      onChange={set('password')}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required
                      style={{ paddingLeft: 38, paddingRight: 42 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="icon-btn"
                      style={{ position: 'absolute', right: 4, top: 5, width: 32, height: 32 }}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </Field>

                {error ? <div className="auth__error">{error}</div> : null}

                <Button type="submit" variant="iris" size="lg" loading={submitting} iconRight={ArrowRight} block>
                  {config.action}
                </Button>
              </form>

              <div className="auth__foot">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <KeyRound size={12} /> Need a reset? Ask your administrator.
                </span>
                <Link to="/contact">Support</Link>
              </div>

              {demoAvailable ? (
                <div className="auth__demo">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <Sparkles size={12} /> <strong>Demo workspace</strong>
                  </div>
                  Use <strong>{config.demo.identifier}</strong> / <strong>{config.demo.password}</strong> to explore.
                  <br />
                  <button type="button" onClick={fillDemo}>Fill credentials</button>
                </div>
              ) : null}
            </>
          )}

          <div style={{ marginTop: 30, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--ghost)' }}>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <span style={{ marginLeft: 'auto', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {theme === 'dark' ? 'Obsidian' : 'Daylight'} theme
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
