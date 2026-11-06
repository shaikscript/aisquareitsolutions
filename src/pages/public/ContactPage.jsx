import React, { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Clock,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Send,
} from 'lucide-react';
import { Button, Field, Input, Select, Textarea } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useToast } from '../../context/AppContext.jsx';
import { getCompanyInfoSync, loadCompanyInfo } from '../../lib/content.js';

const TOPICS = [
  'Evaluation capacity',
  'Careers & applications',
  'Portal or exam support',
  'Partnership',
  'Privacy request',
  'Something else',
];

export default function ContactPage() {
  const { toast } = useToast();
  const [info, setInfo] = useState(getCompanyInfoSync());
  const [values, setValues] = useState({ name: '', email: '', company: '', topic: TOPICS[0], subject: '', message: '' });
  const [status, setStatus] = useState({ submitting: false, error: '', reference: '' });

  useEffect(() => {
    let active = true;
    loadCompanyInfo().then((data) => active && setInfo(data));
    return () => {
      active = false;
    };
  }, []);

  const set = (key) => (event) => setValues((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setStatus({ submitting: true, error: '', reference: '' });
    try {
      const result = await api('/api/public/contact', { method: 'POST', body: values });
      setStatus({ submitting: false, error: '', reference: result.reference });
      setValues({ name: '', email: '', company: '', topic: TOPICS[0], subject: '', message: '' });
      toast('Message sent — the studio replies within one working day.', 'ok');
    } catch (error) {
      setStatus({ submitting: false, error: error.message, reference: '' });
      toast(error.message, 'error');
    }
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
          <div className="eyebrow" data-reveal>Contact</div>
          <h1 data-reveal style={{ '--reveal-delay': '80ms' }}>
            Tell us what needs
            <br />
            better <em>judgement</em>.
          </h1>
          <p className="page-hero__lede" data-reveal style={{ '--reveal-delay': '160ms' }}>
            Evaluation capacity, calibration design, portal support or a career question — write to the studio and
            a human will answer, usually within one working day.
          </p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="shell">
          <div className="contact-grid">
            <div data-reveal>
              <div className="contact-info">
                <div className="contact-info__item">
                  <Mail size={17} />
                  <div>
                    <small>Email</small>
                    <a href={`mailto:${info.email}`}>{info.email}</a>
                  </div>
                </div>
                <div className="contact-info__item">
                  <Phone size={17} />
                  <div>
                    <small>Phone</small>
                    <a href={`tel:${String(info.phone).replace(/\s/g, '')}`}>{info.phone}</a>
                  </div>
                </div>
                <div className="contact-info__item">
                  <MapPin size={17} />
                  <div>
                    <small>Studio</small>
                    <p>{info.address}</p>
                  </div>
                </div>
                <div className="contact-info__item">
                  <Clock size={17} />
                  <div>
                    <small>Hours</small>
                    <p>{info.hours}</p>
                  </div>
                </div>
                <div className="contact-info__item">
                  <Building2 size={17} />
                  <div>
                    <small>Working style</small>
                    <p>{info.careersNote}</p>
                  </div>
                </div>
              </div>

              <div className="map-card">
                <a href={info.mapLink} target="_blank" rel="noreferrer">
                  Open in maps <ArrowUpRight size={12} />
                </a>
                <div className="map-card__pin">
                  <i />
                  <strong style={{ fontSize: '0.86rem' }}>AISQUARE Studio</strong>
                  <span style={{ color: 'var(--faint)', fontSize: '0.75rem' }}>HITEC City · Hyderabad</span>
                  <span style={{ color: 'var(--ghost)', fontSize: '0.68rem' }} className="mono">
                    {info.lat && info.lng ? `${info.lat.toFixed(4)}, ${info.lng.toFixed(4)}` : '17.4483, 78.3915'}
                  </span>
                </div>
                <Navigation size={14} style={{ position: 'absolute', left: 16, bottom: 16, color: 'var(--faint)' }} />
              </div>
            </div>

            <div className="form-card" data-reveal style={{ '--reveal-delay': '90ms' }}>
              {status.reference ? (
                <div className="success-panel">
                  <div className="success-panel__icon">
                    <CheckCircle2 size={22} />
                  </div>
                  <h2 className="h3">Message received.</h2>
                  <p className="lede" style={{ fontSize: '0.9rem' }}>
                    Your reference is <strong style={{ color: 'var(--text)' }} className="mono">{status.reference}</strong>.
                    We reply from {info.email} — check spam if a day passes quietly.
                  </p>
                  <Button variant="ghost" onClick={() => setStatus({ submitting: false, error: '', reference: '' })}>
                    Send another message
                  </Button>
                </div>
              ) : (
                <form onSubmit={submit} className="form-grid">
                  <div>
                    <h2 className="h3" style={{ marginBottom: 5 }}>Write to the studio</h2>
                    <p style={{ fontSize: '0.83rem', color: 'var(--muted)' }}>
                      Nothing here is routed to a bot. It lands in the admin inbox.
                    </p>
                  </div>

                  <div className="field-row">
                    <Field label="Your name" required htmlFor="contact-name">
                      <Input id="contact-name" value={values.name} onChange={set('name')} required placeholder="Full name" />
                    </Field>
                    <Field label="Email" required htmlFor="contact-email">
                      <Input id="contact-email" type="email" value={values.email} onChange={set('email')} required placeholder="you@example.com" />
                    </Field>
                  </div>

                  <div className="field-row">
                    <Field label="Company" htmlFor="contact-company">
                      <Input id="contact-company" value={values.company} onChange={set('company')} placeholder="Organisation (optional)" />
                    </Field>
                    <Field label="Topic" htmlFor="contact-topic">
                      <Select id="contact-topic" value={values.topic} onChange={set('topic')}>
                        {TOPICS.map((topic) => (
                          <option key={topic} value={topic}>{topic}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <Field label="Subject" required htmlFor="contact-subject">
                    <Input id="contact-subject" value={values.subject} onChange={set('subject')} required minLength={3} placeholder="A short summary" />
                  </Field>

                  <Field label="Message" required hint="Volumes, modalities, timelines or the problem you are trying to solve." htmlFor="contact-message">
                    <Textarea id="contact-message" value={values.message} onChange={set('message')} required minLength={15} rows={6} placeholder="What would you like to build with us?" />
                  </Field>

                  {status.error ? <div className="auth__error">{status.error}</div> : null}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <span className="form-note">
                      <CheckCircle2 size={12} /> We never sell or share contact data.
                    </span>
                    <Button type="submit" variant="iris" loading={status.submitting} icon={Send}>
                      Send message
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
