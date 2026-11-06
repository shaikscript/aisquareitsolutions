import React, { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Check as CheckIcon, ChevronRight, Copy, Loader2, Search, X } from 'lucide-react';
import { titleCase, statusTone } from '../lib/api.js';

/* ─────────────────────────── button ─────────────────────────── */

export function Button({
  children,
  variant = 'ghost',
  size,
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  block = false,
  className = '',
  as: Tag = 'button',
  ...props
}) {
  const classes = [
    'btn',
    `btn--${variant}`,
    size ? `btn--${size}` : '',
    block ? 'btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handleMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
  };

  return (
    <Tag className={classes} onPointerMove={handleMove} {...props}>
      {loading ? <span className="btn__spinner" aria-hidden="true" /> : Icon ? <Icon size={15} strokeWidth={1.9} /> : null}
      {children}
      {IconRight ? <IconRight size={15} strokeWidth={1.9} /> : null}
    </Tag>
  );
}

export function IconButton({ label, children, className = '', ...props }) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

/* ─────────────────────────── form ─────────────────────────── */

export function Field({ label, error, required, children, htmlFor, hint }) {
  return (
    <label className="field" htmlFor={htmlFor}>
      {label ? (
        <span className="label">
          {label}
          {required ? <strong>*</strong> : null}
        </span>
      ) : null}
      {children}
      {error ? <span className="error-text">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function Input({ error, className = '', ...props }) {
  return <input className={`input ${error ? 'input--error' : ''} ${className}`} {...props} />;
}

export function Textarea({ error, className = '', ...props }) {
  return <textarea className={`textarea ${error ? 'textarea--error' : ''} ${className}`} {...props} />;
}

export function Select({ error, className = '', children, ...props }) {
  return (
    <select className={`select ${error ? 'select--error' : ''} ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Check({ checked, onChange, children, ...props }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={onChange} {...props} />
      <span>{children}</span>
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', ...props }) {
  return (
    <div className="search-field">
      <Search size={15} />
      <input
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        {...props}
      />
    </div>
  );
}

/* ─────────────────────────── badges ─────────────────────────── */

export function Badge({ tone = 'default', children, ...props }) {
  return (
    <span className={`badge ${tone !== 'default' ? `badge--${tone}` : ''}`} {...props}>
      {children}
    </span>
  );
}

export function StatusBadge({ status, children }) {
  return <Badge tone={statusTone(status)}>{children || titleCase(status)}</Badge>;
}

export function Metre({ value = 0, tone, className = '' }) {
  return (
    <div className={`meter ${tone ? `meter--${tone}` : ''} ${className}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function ScoreRing({ value = 0, size = 120, label = 'Score', suffix = '%' }) {
  return (
    <div className="ring" style={{ '--value': Math.max(0, Math.min(100, value)), '--size': `${size}px` }}>
      <div className="ring__content">
        <div className="ring__value">
          {Number.isFinite(value) ? Math.round(value) : '—'}
          <span style={{ fontSize: '0.5em', color: 'var(--faint)' }}>{suffix}</span>
        </div>
        <div className="ring__label">{label}</div>
      </div>
    </div>
  );
}

/* ─────────────────────────── modal ─────────────────────────── */

export function Modal({ open, onClose, title, subtitle, children, footer, size, closeLabel = 'Close' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div
        className={`modal ${size === 'wide' ? 'modal--wide' : size === 'narrow' ? 'modal--narrow' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Dialog'}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal__head">
          <div>
            {title ? <div className="modal__title">{title}</div> : null}
            {subtitle ? <div className="modal__sub">{subtitle}</div> : null}
          </div>
          <IconButton label={closeLabel} onClick={onClose}>
            <X size={17} />
          </IconButton>
        </div>
        <div className="modal__body">{children}</div>
        {footer ? <div className="modal__foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Confirm({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', tone = 'danger', loading = false }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={message}
      size="narrow"
      footer={
        <>
          <Button variant="quiet" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="banner banner--warn">
        <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>This action is recorded in the workspace audit trail.</span>
      </div>
    </Modal>
  );
}

/* ─────────────────────────── states ─────────────────────────── */

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="empty">
      {Icon ? (
        <div className="empty__icon">
          <Icon size={20} />
        </div>
      ) : null}
      <h4>{title}</h4>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function Loading({ label = 'Loading workspace…' }) {
  return (
    <div className="loading-block">
      <Loader2 size={16} className="spin" style={{ animation: 'spin 900ms linear infinite' }} />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="empty">
      <div className="empty__icon" style={{ color: 'var(--danger)' }}>
        <AlertTriangle size={20} />
      </div>
      <h4>Something interrupted that request</h4>
      <p>{message || 'Please try again in a moment.'}</p>
      {onRetry ? (
        <Button size="sm" onClick={onRetry} icon={Loader2}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

/* ─────────────────────────── page furniture ─────────────────────────── */

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="page__head">
      <div>
        {eyebrow ? <div className="eyebrow" style={{ marginBottom: 10 }}>{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page__actions">{actions}</div> : null}
    </header>
  );
}

export function Kpi({ label, value, suffix, foot, icon: Icon, accent }) {
  return (
    <div className="kpi">
      <div className="kpi__label">
        <span>{label}</span>
        {Icon ? <Icon size={14} style={{ color: accent || 'var(--faint)' }} /> : null}
      </div>
      <div className="kpi__value">
        {value}
        {suffix ? <small>{suffix}</small> : null}
      </div>
      {foot ? <div className="kpi__foot">{foot}</div> : null}
    </div>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count != null ? ` · ${option.count}` : ''}
        </button>
      ))}
    </div>
  );
}

export function CopyField({ value, label }) {
  const [copied, setCopied] = useState(false);
  const id = useId();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  };
  return (
    <div className="field">
      {label ? <span className="label">{label}</span> : null}
      <div style={{ display: 'flex', gap: 6 }}>
        <input id={id} className="input mono" value={value} readOnly onFocus={(e) => e.target.select()} />
        <Button size="sm" variant="ghost" onClick={copy} icon={copied ? CheckIcon : Copy} aria-label="Copy">
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}

export function DataTable({ columns, rows, empty, rowKey = (row) => row.id, stack = true }) {
  if (!rows?.length) return empty || null;
  return (
    <div className="table-wrap">
      <table className={`table ${stack ? 'table--stack' : ''}`}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} style={column.width ? { width: column.width } : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key} data-label={column.header}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InlineLink({ to, children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--text)' }}>
      {children}
      <ChevronRight size={13} />
    </span>
  );
}

export function BarChart({ data = [], height = 120 }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <div className="chart" style={{ height }}>
        {data.map((item, index) => (
          <div
            key={`${item.label}-${index}`}
            className="chart__bar"
            style={{ height: `${Math.max(3, (item.value / max) * 100)}%` }}
            title={`${item.label}: ${item.value}`}
          >
            <span>{item.value}</span>
          </div>
        ))}
      </div>
      <div className="chart__labels">
        {data.map((item, index) => (
          <span key={`${item.label}-label-${index}`}>{index % Math.ceil(data.length / 7) === 0 ? item.label : ''}</span>
        ))}
      </div>
    </div>
  );
}
