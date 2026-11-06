import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ArrowUpRight,
  ChevronDown,
  Command,
  Mail,
  MapPin,
  Menu,
  Moon,
  Phone,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import Logo from './Logo.jsx';
import { Button } from './ui.jsx';
import { useTheme } from '../context/AppContext.jsx';
import { useMouseSpotlight, useScrollReveal } from '../lib/hooks.js';
import { NAV_LINKS, loadCompanyInfo, getCompanyInfoSync } from '../lib/content.js';
import { apiUrl } from '../lib/api.js';

function useCompanyInfo() {
  const [info, setInfo] = useState(getCompanyInfoSync());
  useEffect(() => {
    let active = true;
    loadCompanyInfo().then((data) => {
      if (active) setInfo(data);
    });
    return () => {
      active = false;
    };
  }, []);
  return info;
}

export function ThemeToggle({ compact = false }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="icon-btn"
      aria-label={theme === 'dark' ? 'Switch to daylight theme' : 'Switch to obsidian theme'}
      title={theme === 'dark' ? 'Daylight theme' : 'Obsidian theme'}
      style={compact ? { width: 32, height: 32 } : undefined}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

export function PortalMenu({ align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} iconRight={ChevronDown}>
        Sign in
      </Button>
      {open ? (
        <div
          className="portal-menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            [align]: 0,
            width: 258,
            zIndex: 40,
            borderRadius: 16,
            border: '1px solid var(--line-strong)',
            background: 'var(--panel-2)',
            boxShadow: 'var(--shadow-lg)',
            padding: 8,
            animation: 'fadeUp 200ms var(--ease)',
          }}
        >
          {[
            { to: '/login', label: 'Employee workspace', note: 'Guidelines, readiness, assessments', icon: ShieldCheck },
            { to: '/exam-login', label: 'Candidate exam portal', note: 'Assigned assessments & results', icon: Command },
            { to: '/admin/login', label: 'Admin console', note: 'People, work and quality control', icon: ShieldCheck },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              style={{
                display: 'flex',
                gap: 10,
                padding: '10px 10px',
                borderRadius: 10,
                alignItems: 'flex-start',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <item.icon size={15} style={{ marginTop: 3, color: 'var(--muted)' }} />
              <span>
                <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 500 }}>{item.label}</span>
                <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--faint)', marginTop: 1 }}>{item.note}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SiteNav() {
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <>
      <header className={`nav ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="nav__inner">
          <Link to="/" className="nav__brand" aria-label="AI Square home">
            <Logo size={28} />
            <span className="sr-only">AI Square IT Solutions</span>
          </Link>

          <nav className="nav__links" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) => `nav__link ${isActive ? 'is-active' : ''}`}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="nav__actions">
            <ThemeToggle compact />
            <PortalMenu />
            <Link to="/careers" className="btn btn--primary btn--sm" style={{ display: 'inline-flex' }}>
              Apply
              <ArrowUpRight size={14} />
            </Link>
            <button
              type="button"
              className="icon-btn nav__toggle"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((v) => !v)}
              style={{ display: menuOpen ? 'grid' : undefined }}
            >
              {menuOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </div>
      </header>

      {menuOpen ? (
        <div className="mobile-menu">
          <div className="eyebrow" style={{ marginBottom: 18 }}>Navigate</div>
          {NAV_LINKS.map((link, index) => (
            <Link key={link.to} to={link.to}>
              {link.label}
              <small>0{index + 1}</small>
            </Link>
          ))}
          <div className="mobile-menu__foot">
            <Link to="/careers" className="btn btn--iris btn--lg">
              Explore open roles
            </Link>
            <Link to="/login" className="btn btn--ghost btn--lg">
              Employee sign in
            </Link>
            <Link to="/admin/login" className="btn btn--quiet btn--sm">
              Administrator console
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SiteFooter() {
  const info = useCompanyInfo();
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="shell">
        <div className="footer__top">
          <div className="footer__brand">
            <Logo size={32} />
            <p>
              A human-in-the-loop evaluation studio. We train the people who teach intelligent systems to be
              accurate, safe and useful.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <a
                href={info.linkedin || '#'}
                target="_blank"
                rel="noreferrer"
                className="chip chip--interactive"
              >
                LinkedIn <ArrowUpRight size={12} />
              </a>
              <a href={`mailto:${info.email}`} className="chip chip--interactive">
                Email <ArrowUpRight size={12} />
              </a>
            </div>
          </div>

          <div className="footer__col">
            <h4>Studio</h4>
            <Link to="/about">About</Link>
            <Link to="/careers">Careers</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/careers">Open roles</Link>
          </div>

          <div className="footer__col">
            <h4>Portals</h4>
            <Link to="/login">Employee workspace</Link>
            <Link to="/exam-login">Candidate exams</Link>
            <Link to="/admin/login">Admin console</Link>
            <a href={apiUrl('/api/health')} target="_blank" rel="noreferrer">System status</a>
          </div>

          <div className="footer__col">
            <h4>Reach us</h4>
            <a href={`mailto:${info.email}`} style={{ display: 'flex', gap: 7 }}>
              <Mail size={13} style={{ marginTop: 6 }} /> {info.email}
            </a>
            <a href={`tel:${String(info.phone).replace(/\s/g, '')}`} style={{ display: 'flex', gap: 7 }}>
              <Phone size={13} style={{ marginTop: 6 }} /> {info.phone}
            </a>
            <span style={{ display: 'flex', gap: 7, fontSize: '0.84rem', color: 'var(--muted)', padding: '5px 0' }}>
              <MapPin size={13} style={{ marginTop: 6, flexShrink: 0 }} /> {info.address}
            </span>
          </div>
        </div>

        <div className="footer__wordmark">AISQUARE</div>

        <div className="footer__bottom">
          <span>© {year} AI Square IT Solutions. All rights reserved.</span>
          <div style={{ display: 'flex', gap: 18 }}>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/contact">Support</Link>
          </div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="dot dot--pulse" style={{ color: 'var(--mint)' }} /> Built in Hyderabad
          </span>
        </div>
      </div>
    </footer>
  );
}

export default function PublicLayout() {
  const { pathname } = useLocation();
  useScrollReveal([pathname]);
  useMouseSpotlight();

  useEffect(() => {
    if (!window.location.hash) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }, [pathname]);

  return (
    <div className="site" id="top">
      <SiteNav />
      <main className="site__main">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
