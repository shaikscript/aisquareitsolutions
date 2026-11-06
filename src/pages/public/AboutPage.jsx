import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  BadgeCheck,
  BookOpenCheck,
  Compass,
  Fingerprint,
  GitBranch,
  GraduationCap,
  Layers,
  LineChart,
  Quote,
  ShieldCheck,
  Users,
} from 'lucide-react';

const VALUES = [
  {
    title: 'Rubric before opinion',
    body: 'Every decision traces back to a published criterion. When the rubric is ambiguous, fixing the rubric is the work — not improvising a score.',
  },
  {
    title: 'Evidence over intuition',
    body: 'Citations, timestamps, listing fields, transcript spans. We ask evaluators to point at the thing they saw, not describe a feeling about it.',
  },
  {
    title: 'Craft in every detail',
    body: 'The workspace, the writing, the handoff. A calm, precise environment produces calm, precise judgement.',
  },
  {
    title: 'Respect for the people behind the data',
    body: 'Evaluators are skilled professionals. Fair throughput targets, visible quality feedback and no invisible quota games.',
  },
];

const CAPABILITIES = [
  { icon: Layers, title: 'Multi-domain evaluation', body: 'Search, media, ads, maps, speech and generative output under one operating model.' },
  { icon: GitBranch, title: 'Versioned guidelines', body: 'Every rubric revision is archived and acknowledged individually — no silent rule changes.' },
  { icon: LineChart, title: 'Calibration analytics', body: 'Agreement scores, review backlog and readiness thresholds tracked per person and project.' },
  { icon: ShieldCheck, title: 'Safety gates', body: 'Impersonation, minors, sensitive attributes and locality handled as blocking checks.' },
  { icon: GraduationCap, title: 'Structured onboarding', body: 'Practical assessment before live work, with authorisation for controlled retakes.' },
  { icon: Users, title: 'Human review loop', body: 'Manual scoring on qualitative items, with written reviewer feedback on every release.' },
];

export default function AboutPage() {
  return (
    <>
      <section className="page-hero">
        <div className="aurora aurora--hero">
          <span />
          <span />
          <span />
        </div>
        <div className="shell" style={{ position: 'relative' }}>
          <div className="eyebrow" data-reveal>The studio</div>
          <h1 data-reveal style={{ '--reveal-delay': '80ms' }}>
            We build the human layer
            <br />
            that makes AI <em>accountable</em>.
          </h1>
          <p className="page-hero__lede" data-reveal style={{ '--reveal-delay': '160ms' }}>
            AI Square IT Solutions is an evaluation studio based in Hyderabad. We design rubrics, train
            evaluators and operate the quality systems that turn subjective model behaviour into a number you
            can defend.
          </p>
        </div>
      </section>

      <section className="section section--tight">
        <div className="shell">
          <div className="about-grid">
            <div data-reveal>
              <div className="eyebrow">Why we exist</div>
              <h2 className="h2" style={{ marginTop: 14 }}>
                Models got fluent.
                <br />
                Judgement did not
                <br />
                keep up.
              </h2>
            </div>
            <div data-reveal style={{ '--reveal-delay': '100ms' }}>
              <p className="lede" style={{ marginBottom: 18 }}>
                A generative system can now produce a thousand plausible answers before lunch. Deciding which
                of them is accurate, safe and genuinely useful is still slow, contextual human work — and it is
                the work that determines whether a product is trusted.
              </p>
              <p className="lede" style={{ marginBottom: 18 }}>
                We started AI Square to treat that work as a discipline rather than crowd labour. Our evaluators
                are trained against explicit rubrics, their decisions are reviewed, and every project has
                measurable readiness gates before a single live batch is touched.
              </p>
              <p className="lede">
                The result is a quality system partners can audit: who decided what, against which rubric
                version, with what evidence, and at what level of agreement.
              </p>
            </div>
          </div>

          <div className="about-stats" data-reveal>
            {[
              ['07', 'Evaluation domains'],
              ['94.2%', 'Calibration agreement'],
              ['12', 'Indian languages in scope'],
              ['< 24h', 'Review turnaround target'],
            ].map(([value, label]) => (
              <div key={label}>
                <div className="stat-value">{value}</div>
                <div className="stat-label" style={{ marginTop: 8 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="section-head" data-reveal>
            <div className="section-head__copy">
              <div className="eyebrow">Operating principles</div>
              <h2 className="h2">
                Four rules we do not <span className="serif">bend</span>.
              </h2>
            </div>
          </div>

          <div className="values" data-reveal>
            {VALUES.map((value, index) => (
              <div className="value-row" key={value.title}>
                <span className="value-row__num">0{index + 1}</span>
                <div>
                  <h3>{value.title}</h3>
                  <p>{value.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="shell">
          <div className="section-head" data-reveal>
            <div className="section-head__copy">
              <div className="eyebrow">What we run</div>
              <h2 className="h2">The operating system behind the judgement.</h2>
            </div>
            <Link to="/careers" className="btn btn--ghost">
              Work with us <ArrowUpRight size={14} />
            </Link>
          </div>

          <div className="grid-3">
            {CAPABILITIES.map((item, index) => (
              <div className="card card--pad card--hover" key={item.title} data-reveal style={{ '--reveal-delay': `${index * 50}ms` }}>
                <div className="doc-card__icon" style={{ marginBottom: 16 }}>
                  <item.icon size={17} />
                </div>
                <h3 className="h4" style={{ marginBottom: 8 }}>{item.title}</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.6 }}>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="quote-strip" style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-2xl)' }} data-reveal>
            <Quote size={20} style={{ margin: '0 auto 18px', color: 'var(--faint)' }} />
            <blockquote style={{ maxWidth: '24ch' }}>
              “The goal is not to grade faster. It is to make every grade <span>survive review</span>.”
            </blockquote>
            <cite>Studio operating note</cite>
          </div>
        </div>
      </section>

      <section className="section section--tight" style={{ paddingBottom: 'clamp(60px, 8vw, 120px)' }}>
        <div className="shell">
          <div className="cta-band" data-reveal>
            <div>
              <div className="eyebrow" style={{ marginBottom: 12 }}>Next step</div>
              <h2>
                See how your evaluation
                <br />
                programme could <span className="serif">run</span>.
              </h2>
              <p>Tell us the modality, volume and quality bar. We will map it to a rubric and a readiness plan.</p>
            </div>
            <div style={{ display: 'grid', gap: 10, minWidth: 220 }}>
              <Link to="/contact" className="btn btn--iris btn--lg">
                Start a conversation <ArrowUpRight size={16} />
              </Link>
              <Link to="/careers" className="btn btn--ghost btn--lg">
                Browse careers
              </Link>
            </div>
          </div>

          <div className="grid-4" style={{ marginTop: 18 }}>
            {[
              { icon: Fingerprint, title: 'Traceable', body: 'Every decision logged.' },
              { icon: BookOpenCheck, title: 'Documented', body: 'Rubrics versioned.' },
              { icon: BadgeCheck, title: 'Calibrated', body: 'Agreement measured.' },
              { icon: Compass, title: 'Local', body: 'Indian language depth.' },
            ].map((item) => (
              <div key={item.title} className="card card--pad" style={{ padding: 18 }}>
                <item.icon size={16} style={{ color: 'var(--muted)', marginBottom: 10 }} />
                <div className="h4">{item.title}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--faint)', marginTop: 3 }}>{item.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
