import React from 'react';
import { useLocation } from 'react-router-dom';
import { getCompanyInfoSync } from '../../lib/content.js';

const PRIVACY = [
  {
    id: 'overview',
    title: 'Overview',
    body: [
      'AI Square IT Solutions (“AI Square”, “we”) operates this website, an employee workspace, a candidate exam portal and an administrator console. This policy explains what we collect across those surfaces, why we collect it, and the choices available to you.',
      'We keep the data we hold deliberately narrow: enough to run an accountable evaluation studio, and nothing that is merely convenient.',
    ],
  },
  {
    id: 'data-we-collect',
    title: 'Information we collect',
    list: [
      'Application data — name, email, phone, location, education and experience, an optional portfolio link, and the resume you attach.',
      'Account data — employee code, name, email, username, a salted password hash, role, account type and account status.',
      'Assessment data — attempt timestamps, answers, reasoning notes, awarded marks, reviewer comments and progress events.',
      'Workspace activity — guideline acknowledgements, time spent on documents, notifications and portal events.',
      'Messages — the content of contact forms, application notes and employee feedback.',
      'Technical data — session identifiers, IP address, user agent and coarse timestamps required for security and fraud prevention.',
    ],
  },
  {
    id: 'why',
    title: 'Why we use it',
    list: [
      'To assess applications and operate candidate evaluations.',
      'To deliver assessment results, readiness decisions and reviewer feedback.',
      'To protect accounts with session management, throttling and audit logs.',
      'To improve the workspace based on aggregated, non-identifying usage patterns.',
      'To meet legal, tax and record-keeping obligations.',
    ],
  },
  {
    id: 'legal-basis',
    title: 'Legal basis',
    body: [
      'Where India’s Digital Personal Data Protection Act applies, we process data on the basis of consent (for applications and contact forms), legitimate uses related to employment (for workspace accounts) and legal obligation (for records we must retain).',
      'Where the GDPR applies to a candidate or partner in the EEA, we rely on consent, performance of a contract and legitimate interests in operating a secure evaluation service.',
    ],
  },
  {
    id: 'sharing',
    title: 'Sharing and processors',
    body: [
      'We do not sell personal data. We share it only with infrastructure providers that host the application, email delivery services and, where required, professional advisers — each bound by confidentiality and data-processing terms.',
      'Assessment outcomes may be shared with the partner whose project you are being evaluated for, limited to the score, readiness decision and reviewer note. Raw resumes are never shared with clients without your explicit consent.',
    ],
  },
  {
    id: 'retention',
    title: 'Retention',
    body: [
      'Application records are retained for up to 24 months unless you ask us to delete them earlier. Assessment attempts and results are retained for the duration of an active engagement plus 36 months for audit and dispute resolution. Security logs are retained for 12 months.',
    ],
  },
  {
    id: 'your-rights',
    title: 'Your rights',
    body: [
      'You may request access, correction, deletion, restriction or a portable copy of your personal data, and you may withdraw consent for future processing at any time.',
      'To exercise a right, write to the privacy contact below. We respond within 30 days and may ask for verification so that we do not disclose data to the wrong person.',
    ],
  },
  {
    id: 'security',
    title: 'Security',
    body: [
      'Passwords are stored as salted scrypt hashes. Sessions are database-backed, rotated on password change, and invalidated when an account is deactivated. Administrative actions are written to an append-only audit log. Files are stored with randomised names outside the web root and served only to authenticated users.',
      'No system is perfectly secure. If you believe an account has been compromised, contact us immediately so we can revoke sessions.',
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    contact: true,
  },
];

const TERMS = [
  {
    id: 'acceptance',
    title: 'Acceptance of these terms',
    body: [
      'By using this website, the employee workspace, the candidate exam portal or the administrator console, you agree to these terms. If you do not agree, do not use the service.',
      'These terms apply alongside any engagement contract signed with AI Square IT Solutions. Where a signed contract conflicts with these terms, the contract governs.',
    ],
  },
  {
    id: 'accounts',
    title: 'Accounts and credentials',
    list: [
      'Accounts are issued individually and must not be shared.',
      'You are responsible for keeping your password confidential and for activity under your account.',
      'Passwords temporarily issued by an administrator must be changed at first sign-in.',
      'We may deactivate an account that is inactive, compromised or in breach of these terms.',
    ],
  },
  {
    id: 'assessments',
    title: 'Assessments and results',
    body: [
      'Assessments are timed and monitored for integrity. Attempts may be auto-saved, interrupted and resumed; repeated disconnections are recorded. Results are released at the discretion of a reviewer and may include a manual score on qualitative questions.',
      'Retakes are granted only by authorisation from an administrator and may carry conditions. Attempting to access questions, answers or results outside the portal is prohibited.',
    ],
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    list: [
      'Do not attempt to access another person’s account or data.',
      'Do not scrape, reverse engineer or probe the service for vulnerabilities without written permission.',
      'Do not upload malware, unlawful content or resumes that misrepresent your identity.',
      'Do not use automated tools to complete assessments or generate evaluation output.',
    ],
  },
  {
    id: 'ip',
    title: 'Intellectual property',
    body: [
      'The rubrics, guidelines, question bank, portal design and all software on this service belong to AI Square IT Solutions or its licensors. Your account grants a limited, revocable licence to use the service for its intended purpose.',
      'Answers, reasoning notes and feedback you submit may be used to operate and improve the evaluation service, subject to the privacy policy.',
    ],
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    body: [
      'The service is provided on an “as available” basis. To the fullest extent permitted by law, AI Square is not liable for indirect, incidental or consequential loss, or for loss of opportunity arising from assessment outcomes.',
      'Nothing in these terms excludes liability that cannot be excluded by law.',
    ],
  },
  {
    id: 'changes',
    title: 'Changes and governing law',
    body: [
      'We may update these terms; material changes will be announced inside the workspace. Continued use after a change constitutes acceptance.',
      'These terms are governed by the laws of India, with courts in Hyderabad, Telangana having exclusive jurisdiction.',
    ],
  },
];

export default function LegalPage({ kind = 'privacy' }) {
  const info = getCompanyInfoSync();
  const location = useLocation();
  const isPrivacy = kind === 'privacy' || location.pathname.includes('privacy');
  const sections = isPrivacy ? PRIVACY : TERMS;
  const title = isPrivacy ? 'Privacy, plainly stated.' : 'Terms of use.';

  return (
    <>
      <section className="page-hero" style={{ paddingBottom: 26 }}>
        <div className="shell">
          <div className="eyebrow">{isPrivacy ? 'Privacy' : 'Terms'}</div>
          <h1 style={{ maxWidth: '16ch' }}>{title}</h1>
          <p className="page-hero__lede">
            Last updated · {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}. Written to be
            read, not to be survived.
          </p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 10 }}>
        <div className="shell">
          <div className="legal">
            <nav className="legal__toc" aria-label="On this page">
              {sections.map((section) => (
                <a key={section.id} href={`#${section.id}`}>{section.title}</a>
              ))}
            </nav>

            <div className="legal__body">
              {sections.map((section) => (
                <section key={section.id} id={section.id}>
                  <h2>{section.title}</h2>
                  {section.body?.map((paragraph) => (
                    <p key={paragraph.slice(0, 40)}>{paragraph}</p>
                  ))}
                  {section.list ? (
                    <ul>
                      {section.list.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                  {section.contact ? (
                    <p>
                      Privacy contact: <a href={`mailto:${info.email}`} style={{ color: 'var(--text)' }}>{info.email}</a>.
                      Postal address: {info.address}. {info.privacyNote}
                    </p>
                  ) : null}
                </section>
              ))}

              <div className="divider" />
              <p className="tiny" style={{ color: 'var(--faint)' }}>
                This document is a plain-language summary of our operating practice and does not constitute legal
                advice. For contractual questions, contact the studio.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
