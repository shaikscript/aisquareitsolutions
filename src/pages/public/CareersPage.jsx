import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CheckCircle2,
  FileText,
  MapPin,
  Plus,
  Sparkles,
  Upload,
  Wifi,
} from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  Select,
  Textarea,
} from '../../components/ui.jsx';
import { api, formatDate } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { DOMAINS } from '../../lib/content.js';
import { useToast } from '../../context/AppContext.jsx';

function ApplyForm({ job, onSuccess, onCancel }) {
  const { toast } = useToast();
  const [values, setValues] = useState({
    fullName: '',
    email: '',
    phone: '',
    location: '',
    portfolioUrl: '',
    educationExperience: '',
    coverLetter: '',
  });
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);

  const set = (key) => (event) => setValues((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!file) {
      setError('Attach your resume as a PDF, DOC or DOCX file (up to 5 MB).');
      return;
    }
    const body = new FormData();
    Object.entries(values).forEach(([key, value]) => body.append(key, value));
    if (job?.id) body.append('jobId', String(job.id));
    body.append('resume', file);

    setSubmitting(true);
    try {
      const result = await api('/api/public/applications', { method: 'POST', body, form: true });
      toast('Application received. We review every submission.', 'ok');
      onSuccess(result);
    } catch (err) {
      setError(err.message);
      toast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const pickFile = (event) => {
    const selected = event.target.files?.[0];
    if (selected) setFile(selected);
    setDragging(false);
  };

  return (
    <form onSubmit={submit} className="form-grid">
      <div className="field-row">
        <Field label="Full name" required htmlFor="apply-name">
          <Input id="apply-name" value={values.fullName} onChange={set('fullName')} placeholder="Your name" required minLength={2} />
        </Field>
        <Field label="Email" required htmlFor="apply-email">
          <Input id="apply-email" type="email" value={values.email} onChange={set('email')} placeholder="you@example.com" required />
        </Field>
      </div>
      <div className="field-row">
        <Field label="Phone" required htmlFor="apply-phone">
          <Input id="apply-phone" value={values.phone} onChange={set('phone')} placeholder="+91 …" required />
        </Field>
        <Field label="Location" htmlFor="apply-location">
          <Input id="apply-location" value={values.location} onChange={set('location')} placeholder="City, state" />
        </Field>
      </div>

      <Field label="Portfolio or profile" hint="Optional — a LinkedIn, portfolio or public work sample." htmlFor="apply-portfolio">
        <Input id="apply-portfolio" value={values.portfolioUrl} onChange={set('portfolioUrl')} placeholder="https://" />
      </Field>

      <Field label="Education & experience" required htmlFor="apply-exp">
        <Textarea
          id="apply-exp"
          value={values.educationExperience}
          onChange={set('educationExperience')}
          placeholder="Degrees, relevant roles, years of experience and languages you evaluate in."
          required
          minLength={20}
          rows={4}
        />
      </Field>

      <Field label="Why this domain?" hint="Two or three sentences is plenty. We value clear reasoning." htmlFor="apply-cover">
        <Textarea id="apply-cover" value={values.coverLetter} onChange={set('coverLetter')} rows={3} placeholder="Optional cover note" />
      </Field>

      <div className="field">
        <span className="label">Resume / CV <strong>*</strong></span>
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            const dropped = event.dataTransfer.files?.[0];
            if (dropped) setFile(dropped);
            setDragging(false);
          }}
          onClick={() => fileInput.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && fileInput.current?.click()}
          style={{
            border: `1px dashed ${dragging ? 'var(--accent)' : 'var(--line-strong)'}`,
            background: dragging ? 'var(--accent-soft)' : 'rgba(255,255,255,0.02)',
            borderRadius: 'var(--r-sm)',
            padding: '18px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            cursor: 'pointer',
            transition: 'all 180ms var(--ease)',
          }}
        >
          <span
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              display: 'grid',
              placeItems: 'center',
              border: '1px solid var(--line)',
              color: file ? 'var(--mint)' : 'var(--muted)',
              flexShrink: 0,
            }}
          >
            {file ? <FileText size={17} /> : <Upload size={17} />}
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: '0.84rem', color: file ? 'var(--text)' : 'var(--text-soft)' }}>
              {file ? file.name : 'Drop your resume here or click to browse'}
            </span>
            <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--faint)', marginTop: 2 }}>
              {file ? `${(file.size / 1024).toFixed(0)} KB · ${file.type || 'document'}` : 'PDF, DOC or DOCX · 5 MB max'}
            </span>
          </span>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.doc,.docx,application/pdf"
            onChange={pickFile}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {error ? <div className="auth__error">{error}</div> : null}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 4 }}>
        <Button type="button" variant="quiet" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" variant="iris" loading={submitting}>
          Submit application
        </Button>
      </div>
      <p className="form-note">
        We use your details only for recruitment. Resumes are stored privately and never shared with third
        parties.
      </p>
    </form>
  );
}

export default function CareersPage() {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState(params.get('domain') || 'All');
  const [openId, setOpenId] = useState(null);
  const [applyTarget, setApplyTarget] = useState(null);
  const [success, setSuccess] = useState(null);
  const { data, loading, error, reload } = useFetch('/api/public/jobs');

  useEffect(() => {
    setFilter(params.get('domain') || 'All');
  }, [params]);

  const jobs = data?.jobs || [];
  const domains = useMemo(() => ['All', ...Array.from(new Set(jobs.map((job) => job.domain).filter(Boolean)))], [jobs]);
  const visible = filter === 'All' ? jobs : jobs.filter((job) => job.domain === filter);

  const changeFilter = (value) => {
    setFilter(value);
    if (value === 'All') setParams({}, { replace: true });
    else setParams({ domain: value }, { replace: true });
  };

  return (
    <>
      <section className="page-hero">
        <div className="aurora aurora--hero">
          <span />
          <span />
          <span />
        </div>
        <div className="shell" style={{ position: 'relative' }}>
          <div className="eyebrow" data-reveal>Careers</div>
          <h1 data-reveal style={{ '--reveal-delay': '80ms' }}>
            Evaluate the work
            <br />
            everyone will <em>use</em>.
          </h1>
          <p className="page-hero__lede" data-reveal style={{ '--reveal-delay': '160ms' }}>
            Part-time and full-time roles across seven evaluation domains. Remote-first, rubric-led, with a
            workspace that shows you exactly how your judgement is measured.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 26, flexWrap: 'wrap' }} data-reveal>
            <span className="chip"><Wifi size={12} /> Remote-first</span>
            <span className="chip"><MapPin size={12} /> India</span>
            <span className="chip"><BriefcaseBusiness size={12} /> {jobs.length} open roles</span>
            <span className="chip"><Sparkles size={12} /> Structured onboarding</span>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="shell">
          <div className="toolbar" data-reveal>
            <div className="segmented" aria-label="Filter roles by domain">
              {domains.map((domain) => (
                <button
                  key={domain}
                  type="button"
                  aria-pressed={filter === domain}
                  onClick={() => changeFilter(domain)}
                >
                  {domain}
                </button>
              ))}
            </div>
            <div className="toolbar__spacer" />
            <Button variant="ghost" size="sm" onClick={() => setApplyTarget({ id: null, title: 'General evaluator application' })}>
              <Plus size={14} /> General application
            </Button>
          </div>

          {loading ? <Loading label="Loading open roles…" /> : null}
          {error ? <ErrorState message={error.message} onRetry={reload} /> : null}

          {!loading && !error ? (
            visible.length ? (
              <div className="role-list" data-reveal>
                {visible.map((job) => {
                  const open = openId === job.id;
                  return (
                    <article key={job.id} className={`role ${open ? 'is-open' : ''}`}>
                      <button
                        type="button"
                        className="role__head"
                        onClick={() => setOpenId(open ? null : job.id)}
                        aria-expanded={open}
                      >
                        <div>
                          <div className="role__title">
                            {job.title}
                            <Badge tone="violet">{job.employmentType}</Badge>
                          </div>
                          <div className="role__meta" style={{ marginTop: 5 }}>
                            <MapPin size={12} /> {job.location} · {job.workMode}
                          </div>
                        </div>
                        <div className="role__domain">{job.domain}</div>
                        <div className="role__meta">Posted {formatDate(job.createdAt, { month: 'short', day: 'numeric' })}</div>
                        <span className="role__toggle">
                          <Plus size={15} />
                        </span>
                      </button>

                      <div className="role__panel">
                        <div className="role__inner">
                          <div>
                            <p>{job.description}</p>

                            {job.responsibilities?.length ? (
                              <>
                                <h4>What you will do</h4>
                                <ul>
                                  {job.responsibilities.map((item) => (
                                    <li key={item}>{item}</li>
                                  ))}
                                </ul>
                              </>
                            ) : null}

                            {job.qualifications?.length ? (
                              <>
                                <h4>What we look for</h4>
                                <ul>
                                  {job.qualifications.map((item) => (
                                    <li key={item}>{item}</li>
                                  ))}
                                </ul>
                              </>
                            ) : null}
                          </div>

                          <div className="role__aside">
                            <h4 style={{ marginTop: 0 }}>Skills</h4>
                            <div className="pill-row">
                              {job.skills?.map((skill) => (
                                <span key={skill} className="chip">{skill}</span>
                              ))}
                            </div>

                            <h4>Logistics</h4>
                            <ul style={{ listStyle: 'none', padding: 0 }}>
                              <li style={{ paddingLeft: 0 }}>{job.employmentType}</li>
                              <li style={{ paddingLeft: 0 }}>{job.workMode} · {job.location}</li>
                              <li style={{ paddingLeft: 0 }}>Rubric training and calibration provided</li>
                            </ul>

                            <Button
                              variant="iris"
                              onClick={() => setApplyTarget(job)}
                              style={{ width: '100%', marginTop: 18 }}
                            >
                              Apply for this role <ArrowUpRight size={14} />
                            </Button>
                            <p className="form-note" style={{ marginTop: 10 }}>
                              One application per role. We reply to every candidate within 10 working days.
                            </p>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={BriefcaseBusiness}
                title="No roles in this domain right now"
                description="Submit a general application and we will match you with the next cohort that opens."
                action={
                  <Button variant="primary" onClick={() => setApplyTarget({ id: null, title: 'General evaluator application' })}>
                    Submit general application
                  </Button>
                }
              />
            )
          ) : null}

          <div className="grid-3" style={{ marginTop: 40 }}>
            {[
              { title: 'Rubric-led onboarding', body: 'Read the guideline, acknowledge the version, clear a practical calibration before live work.' },
              { title: 'Visible quality bar', body: 'Your results and reviewer comments are released inside the workspace, not hidden in email.' },
              { title: 'Respectful throughput', body: 'Targets are designed around careful judgement, not keystrokes. Quality is the metric.' },
            ].map((item) => (
              <div className="card card--pad" key={item.title}>
                <CheckCircle2 size={16} style={{ color: 'var(--mint)', marginBottom: 12 }} />
                <h3 className="h4" style={{ marginBottom: 6 }}>{item.title}</h3>
                <p style={{ fontSize: '0.84rem', color: 'var(--muted)', lineHeight: 1.6 }}>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Modal
        open={Boolean(applyTarget)}
        onClose={() => {
          setApplyTarget(null);
          setSuccess(null);
        }}
        title={success ? 'Application received' : `Apply · ${applyTarget?.title || ''}`}
        subtitle={
          success
            ? 'You will receive an email when a reviewer has looked at your application.'
            : 'We review every application manually. Take a moment with the experience section — it matters more than a polished cover letter.'
        }
        size="wide"
        footer={
          success ? (
            <Button
              variant="primary"
              onClick={() => {
                setApplyTarget(null);
                setSuccess(null);
              }}
            >
              Close
            </Button>
          ) : null
        }
      >
        {success ? (
          <div className="success-panel">
            <div className="success-panel__icon">
              <CheckCircle2 size={22} />
            </div>
            <h3 className="h3">Thank you, {success.name || 'candidate'}.</h3>
            <p className="lede" style={{ fontSize: '0.9rem' }}>
              Your application for <strong style={{ color: 'var(--text)' }}>{success.position}</strong> is in the
              review queue. Keep this reference for any follow-up.
            </p>
            <div className="chip mono" style={{ fontSize: '0.8rem' }}>{success.reference}</div>
            <p className="form-note">
              Shortlisted candidates receive an exam login for a practical assessment in the same domain.
            </p>
          </div>
        ) : (
          <ApplyForm
            job={applyTarget}
            onCancel={() => setApplyTarget(null)}
            onSuccess={(result) => setSuccess({ ...result, name: 'there' })}
          />
        )}
      </Modal>
    </>
  );
}
