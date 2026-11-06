import React from 'react';

export function LogoMark({ size = 32, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="aisq-mark" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F3E3BE" />
          <stop offset="0.52" stopColor="#D9A441" />
          <stop offset="1" stopColor="#8A6520" />
        </linearGradient>
      </defs>
      <rect x="1.6" y="1.6" width="36.8" height="36.8" rx="10.4" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.1" />
      <path
        d="M20.6 3.4h8.4a7.6 7.6 0 0 1 7.6 7.6v9.4h-8.4a7.6 7.6 0 0 1-7.6-7.6V3.4Z"
        fill="url(#aisq-mark)"
      />
      <rect x="7.4" y="27.2" width="10.2" height="4.2" rx="2.1" fill="#D9A441" />
      <circle cx="20" cy="20" r="2.3" fill="currentColor" />
    </svg>
  );
}

export default function Logo({ size = 30, showText = true, subtitle = 'IT Solutions', className = '' }) {
  return (
    <span className={`logo ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: 'var(--text)' }}>
      <LogoMark size={size} />
      {showText ? (
        <span style={{ lineHeight: 1.1 }}>
          <strong
            style={{
              display: 'block',
              fontSize: size <= 26 ? '0.72rem' : '0.8rem',
              letterSpacing: '0.14em',
              fontWeight: 600,
            }}
          >
            AISQUARE
          </strong>
          <small
            style={{
              display: 'block',
              fontSize: '0.55rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--faint)',
              marginTop: 2,
            }}
          >
            {subtitle}
          </small>
        </span>
      ) : null}
    </span>
  );
}
