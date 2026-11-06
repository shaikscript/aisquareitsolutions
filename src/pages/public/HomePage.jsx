import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BadgeCheck,
  CheckCircle2,
  CircleDot,
  Clock3,
  Compass,
  Film,
  Gauge,
  Layers,
  MapPinned,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Users,
} from 'lucide-react';
import Scene3D from '../../components/Scene3D.jsx';
import { Button } from '../../components/ui.jsx';
import { DOMAINS, PROCESS_STEPS } from '../../lib/content.js';

const QUEUE = [
  {
    label: 'Generative image · alignment',
    prompt: 'Chrome hummingbird, macro, neon flower — does the output follow every attribute?',
    score: 4.2,
    verdict: 'Minor attribute miss',
    icon: Film,
  },
  {
    label: 'Search · local intent',
    prompt: '“parking ticket appeal hyderabad” — can the user complete the task on this page?',
    score: 4.8,
    verdict: 'Task completable',
    icon: Search,
  },
  {
    label: 'Speech · naturalness',
    prompt: 'Synthetic voice, 12 seconds — rate pacing and pronunciation separately.',
    score: 3.6,
    verdict: 'Pacing artefact',
    icon: AudioLines,
  },
  {
    label: 'POI · business listing',
    prompt: 'Category, hours and coordinates for a HITEC City listing.',
    score: 4.5,
    verdict: 'Hours corrected',
    icon: MapPinned,
  },
];

function LiveConsole() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((value) => (value + 1) % QUEUE.length), 4200);
    return () => clearInterval(timer);
  }, []);

  const active = QUEUE[index];

  return (
    <div className="hero__console">
      <div className="hero__console-head">
        <span>Evaluation console</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--mint)', fontSize: '0.66rem' }}>
          <span className="dot dot--pulse" /> live rubric
        </span>
      </div>

      <div className="hero__console-item hero__console-item--active" key={active.label}>
        <small>{active.label}</small>
        <p style={{ marginBottom: 10 }}>{active.prompt}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span className="score-pill">
            <Star size={11} fill="currentColor" /> {active.score.toFixed(1)} / 5
          </span>
          <span style={{ fontSize: '0.68rem', color: 'var(--faint)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <active.icon size={12} /> {active.verdict}
          </span>
        </div>
      </div>

      <div className="hero__console-item" style={{ opacity: 0.62 }}>
        <small>Next in queue</small>
        <p>{QUEUE[(index + 1) % QUEUE.length].prompt}</p>
      </div>

      <div className="hero__console-foot">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <ShieldCheck size={12} /> Safety gate passed
        </span>
        <span>{index + 1} / {QUEUE.length} · 38s avg</span>
      </div>
    </div>
  );
}

function DomainTicker() {
  const items = [
    'Search relevance',
    'Generative image',
    'Video motion fidelity',
    'Speech naturalness',
    'POI validation',
    'Map intent',
    'Ads relevance',
    'Media discovery',
  ];
  const doubled = [...items, ...items];

  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker__track">
        {doubled.map((item, index) => (
          <span className="ticker__item" key={`${item}-${index}`}>
            <CircleDot size={10} /> <b>{item}</b> <span style={{ color: 'var(--ghost)' }}>·</span> calibration
          </span>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="aurora aurora--hero">
          <span />
          <span />
          <span />
        </div>
        <Scene3D className="hero__canvas" />
        <div className="hero__grid-lines" aria-hidden="true" />
        <div className="hero__veil" aria-hidden="true" />

        <div className="hero__inner">
          <div>
            <div className="hero__badge">
              <Sparkles size={13} />
              Human judgement for intelligent systems
              <ArrowUpRight size={12} style={{ opacity: 0.5 }} />
            </div>

            <h1>
              Human judgement
              <br />
              behind <em>intelligent</em>
              <br />
              systems.
            </h1>

            <p className="hero__lede">
              AI Square is an evaluation studio. We train evaluators, version the rubrics they work from, and
              measure the quality of every judgement — so the models behind search, media and voice get
              measurably better.
            </p>

            <div className="hero__actions">
              <Link to="/careers" className="btn btn--iris btn--lg">
                Explore evaluation roles
                <ArrowUpRight size={16} />
              </Link>
              <Link to="/about" className="btn btn--ghost btn--lg">
                Inside the studio
                <ArrowRight size={15} />
              </Link>
            </div>

            <div className="hero__meta">
              <div>
                <strong>07</strong>
                <span>Evaluation domains</span>
              </div>
              <div>
                <strong>94.2%</strong>
                <span>Calibration agreement</span>
              </div>
              <div>
                <strong>03</strong>
                <span>Connected portals</span>
              </div>
            </div>
          </div>

          <LiveConsole />
        </div>
      </section>

      <DomainTicker />

      <section className="section" id="domains">
        <div className="shell">
          <div className="section-head" data-reveal>
            <div className="section-head__copy">
              <div className="eyebrow">Evaluation domains</div>
              <h2 className="h2">
                Seven specialisms.
                <br />
                One standard of <span className="serif">evidence</span>.
              </h2>
              <p>
                Every domain has a published rubric, a calibration gate and a reviewer who checks judgement
                quality — not just throughput.
              </p>
            </div>
            <Link to="/careers" className="btn btn--ghost">
              View all roles <ArrowUpRight size={14} />
            </Link>
          </div>

          <div className="domains">
            {DOMAINS.map((domain, index) => (
              <Link
                key={domain.id}
                to={`/careers?domain=${encodeURIComponent(domain.short)}`}
                className="domain"
                data-reveal
                style={{ '--reveal-delay': `${index * 55}ms` }}
              >
                <div className="domain__top">
                  <span className="domain__icon">
                    <domain.Icon size={19} strokeWidth={1.7} />
                  </span>
                  <span className="domain__num">0{index + 1}</span>
                </div>
                <div>
                  <h3>{domain.title}</h3>
                  <p>{domain.summary}</p>
                </div>
                <span className="domain__arrow">
                  <ArrowUpRight size={14} />
                </span>
              </Link>
            ))}

            <Link to="/careers" className="domain domain--cta" data-reveal style={{ '--reveal-delay': '385ms' }}>
              <div className="domain__top">
                <span className="domain__icon">
                  <Compass size={19} strokeWidth={1.7} />
                </span>
                <span className="domain__num">08</span>
              </div>
              <div>
                <h3>Emerging multimodal tracks</h3>
                <p>
                  New cohorts open as partners bring new modalities. Submit a general application and we will
                  match you when the rubric is ready.
                </p>
              </div>
              <span className="domain__arrow">
                <ArrowUpRight size={14} />
              </span>
            </Link>
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="shell">
          <div className="showcase" data-reveal>
            <div className="showcase__grid">
              <div>
                <div className="eyebrow">The workspace</div>
                <h2 className="h2">
                  A portal built for <span className="serif">rigour</span>, not busywork.
                </h2>
                <p className="lede" style={{ fontSize: '0.94rem' }}>
                  Guidelines, assessments, readiness decisions and results live in one calm workspace. The same
                  system powers candidates, employees and the reviewers who keep quality honest.
                </p>

                <ul className="showcase__list">
                  {[
                    { title: 'Versioned guidelines', note: 'Acknowledgement tracked per person, per version.' },
                    { title: 'Timed assessments', note: 'Auto-save, disconnect protection and manual review.' },
                    { title: 'Project readiness', note: 'Threshold-based clearance with a full decision history.' },
                    { title: 'Quality analytics', note: 'Calibration agreement, pass rate and review backlog.' },
                  ].map((item) => (
                    <li key={item.title}>
                      <CheckCircle2 size={15} />
                      <span>
                        {item.title}
                        <small>{item.note}</small>
                      </span>
                    </li>
                  ))}
                </ul>

                <div style={{ display: 'flex', gap: 10, marginTop: 26, flexWrap: 'wrap' }}>
                  <Link to="/login" className="btn btn--primary">
                    Open employee workspace <ArrowUpRight size={14} />
                  </Link>
                  <Link to="/exam-login" className="btn btn--ghost">
                    Candidate exams
                  </Link>
                </div>
              </div>

              <div className="mock" aria-hidden="true">
                <div className="mock__bar">
                  <div className="mock__dots"><i /><i /><i /></div>
                  <div className="mock__url">aisquare.work/portal</div>
                  <span style={{ fontSize: '0.62rem', color: 'var(--faint)' }}>Obsidian</span>
                </div>
                <div className="mock__body">
                  <div className="mock__side">
                    <span className="on"><Gauge size={12} /> Overview</span>
                    <span><Layers size={12} /> Guidelines</span>
                    <span><Target size={12} /> Assessments</span>
                    <span><BadgeCheck size={12} /> Readiness</span>
                    <span><Users size={12} /> Feedback</span>
                  </div>
                  <div className="mock__main">
                    <div className="mock__row">
                      <div className="mock__kpi"><small>Readiness</small><b>2 / 3</b></div>
                      <div className="mock__kpi"><small>Average</small><b>91.4%</b></div>
                      <div className="mock__kpi"><small>To review</small><b>04</b></div>
                    </div>
                    <div className="mock__chart">
                      {[38, 52, 30, 64, 48, 72, 58, 84, 66, 92, 78, 96].map((height, index) => (
                        <i key={index} style={{ height: `${height}%` }} />
                      ))}
                    </div>
                    <div className="mock__list">
                      {[
                        ['Search Quality Calibration', 'Released · 96.7%'],
                        ['Generative Media · Practical', 'Awaiting review'],
                        ['Workspace Foundations', 'Not started'],
                      ].map(([title, note]) => (
                        <div key={title}>
                          <span>{title}</span>
                          <span style={{ color: 'var(--faint)', fontSize: '0.65rem' }}>{note}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="section-head" data-reveal>
            <div className="section-head__copy">
              <div className="eyebrow">How it works</div>
              <h2 className="h2">
                Trained before trusted.
                <br />
                Measured <span className="serif">always</span>.
              </h2>
            </div>
            <div className="chip">
              <Clock3 size={12} /> Typical ramp-up · 9 days
            </div>
          </div>

          <div className="process" data-reveal>
            {PROCESS_STEPS.map((step) => (
              <div className="process__step" key={step.step}>
                <div className="process__num">{step.step}</div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="quote-strip" data-reveal>
        <div className="shell">
          <blockquote>
            “A score without a reason is just an <span>opinion</span> wearing a number.”
          </blockquote>
          <cite>Evaluation rubric standards · v1.4</cite>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="cta-band" data-reveal>
            <div>
              <div className="eyebrow" style={{ marginBottom: 12 }}>Join the studio</div>
              <h2>
                Bring judgement to the
                <br />
                systems people <span className="serif">rely on</span>.
              </h2>
              <p>
                Part-time and full-time evaluation roles, remote across India. Structured onboarding, clear
                rubrics and a workspace that respects your attention.
              </p>
            </div>
            <div style={{ display: 'grid', gap: 10, minWidth: 220 }}>
              <Link to="/careers" className="btn btn--iris btn--lg">
                See open roles <ArrowUpRight size={16} />
              </Link>
              <Link to="/contact" className="btn btn--ghost btn--lg">
                Talk to the studio
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
