import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, getToken, setToken } from '../lib/api.js';

/* ─────────────────────────── theme ─────────────────────────── */

const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {}, setTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const stored = window.localStorage.getItem('aisquare.theme');
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
      /* noop */
    }
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      window.localStorage.setItem('aisquare.theme', theme);
    } catch {
      /* noop */
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f7f4ec' : '#0b0b0c');
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme: setThemeState,
      toggleTheme: () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')),
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/* ─────────────────────────── toasts ─────────────────────────── */

const ToastContext = createContext({ toast: () => {} });

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const toast = useCallback(
    (message, tone = 'default', ttl = 4200) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((list) => [...list.slice(-3), { id, message, tone }]);
      const timer = setTimeout(() => dismiss(id), ttl);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss]
  );

  useEffect(() => () => timers.current.forEach((timer) => clearTimeout(timer)), []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`toast toast--${item.tone}`} onClick={() => dismiss(item.id)}>
            <span className="dot" style={{ marginTop: 7, color: item.tone === 'error' ? 'var(--danger)' : item.tone === 'ok' ? 'var(--ok)' : 'var(--accent)' }} />
            <span>{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* ─────────────────────────── auth ─────────────────────────── */

const AuthContext = createContext({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      try {
        const result = await api('/api/auth/me');
        setUser(result.user || null);
      } catch {
        setUser(null);
      }
      return null;
    }
    try {
      const result = await api('/api/auth/me');
      setUser(result.user || null);
      if (!result.user) setToken(null);
      return result.user;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      await refresh();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  useEffect(() => {
    const onUnauthenticated = () => setUser(null);
    window.addEventListener('aisquare:unauthenticated', onUnauthenticated);
    return () => window.removeEventListener('aisquare:unauthenticated', onUnauthenticated);
  }, []);

  const login = useCallback(async (scope, identifier, password) => {
    const result = await api(`/api/auth/${scope}/login`, {
      method: 'POST',
      body: { identifier, password },
    });
    setToken(result.token);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, refresh, setUser }), [user, loading, login, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
