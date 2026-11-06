import fs from 'node:fs';
import path from 'node:path';
import db, {
  ensureSettings,
  setSetting,
  DEFAULT_SETTINGS,
  GUIDELINE_DIR,
  nextAccountCode,
  notify,
} from './index.js';
import { hashPassword } from '../lib/crypto.js';
import { buildPdf } from '../lib/pdf.js';

const DEMO_ACCOUNTS = {
  admin: { username: 'admin', password: 'aisquare-admin', email: 'admin@aisquare.work' },
  employee: { username: 'priya', password: 'aisquare-employee', email: 'priya@aisquare.work' },
  candidate: { username: 'candidate', password: 'aisquare-candidate', email: 'zoya@example.com' },
};

function createUser({ fullName, email, username, password, role, accountType, department, restrict = 0, mustChange = 0 }) {
  const code = nextAccountCode(accountType);
  const result = db.run(
    `INSERT INTO users (employee_code, full_name, email, username, password_hash, role, account_type,
                        status, department_note, must_change_password, restrict_to_assigned)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    code,
    fullName,
    email,
    username,
    hashPassword(password),
    role,
    accountType,
    department || null,
    mustChange,
    restrict
  );
  return Number(result.lastInsertRowid);
}

function guidelinePdf({ title, subtitle, sections, storedName }) {
  const buffer = buildPdf({ title, subtitle, sections });
  const target = path.join(GUIDELINE_DIR, storedName);
  fs.writeFileSync(target, buffer);
  return { storedName, size: buffer.length };
}

const QUESTIONS = [
  {
    domain: 'Search Engine Evaluator',
    type: 'mcq',
    prompt: 'A query for “cheap flights to Dubai” returns only sponsored hotel listings. What is the most accurate relevance rating?',
    options: ['Highly relevant — it is travel related', 'Slightly relevant — the intent is only partially met', 'Not relevant — the result type does not match the travel intent', 'Cannot judge without more data'],
    correct: 'Slightly relevant — the intent is only partially met',
    marks: 2,
    explanation: 'The traveller wants airfare. Hotel ads share a travel context but do not satisfy the flight-booking intent, so the result is only slightly relevant.',
  },
  {
    domain: 'Search Engine Evaluator',
    type: 'true_false',
    prompt: 'Freshness is irrelevant when the query asks about a historical event.',
    correct: 'False',
    marks: 1,
    explanation: 'Freshness can still matter for updated scholarship, anniversaries or newly surfaced archival material.',
  },
  {
    domain: 'Search Engine Evaluator',
    type: 'mcq',
    prompt: 'Which signal is the strongest indicator of query-intent satisfaction?',
    options: ['Keyword repetition in the title', 'The user can complete their task without another search', 'The page contains many outbound links', 'The result ranks first'],
    correct: 'The user can complete their task without another search',
    marks: 2,
    explanation: 'Task completion is the clearest proxy for intent satisfaction; surface keyword matches can be misleading.',
  },
  {
    domain: 'Search Engine Evaluator',
    type: 'short_answer',
    prompt: 'In one sentence, define “query intent drift”.',
    acceptable: ['intent drift', 'changes the goal', 'shifts the goal', 'different intent', 'misrepresents the query'],
    marks: 2,
    explanation: 'Intent drift is when results pull the user toward a different goal than the one implied by the query.',
  },
  {
    domain: 'Search Engine Evaluator',
    type: 'practical_scenario',
    scenario:
      'Query: “how to appeal a parking ticket in Hyderabad”. Results: (A) official GHMC grievance portal with a step-by-step appeal page; (B) a 2016 blog post about parking fines in Mumbai; (C) a law firm landing page collecting leads.',
    prompt: 'Rank A, B and C using the relevance rubric, then justify your top pick in 2–3 sentences.',
    rubric: 'Full marks: A ranked first with a task-completion justification, B/C clearly downgraded for locality or intent mismatch. Partial: correct ranking without rubric language.',
    marks: 5,
  },
  {
    domain: 'Generative Media Grader',
    type: 'mcq',
    prompt: 'A generated clip follows the prompt precisely, but hands morph unnaturally at 00:04. How should it be graded?',
    options: ['Pass — prompt alignment outweighs artefacts', 'Fail — any visible artefact invalidates the output', 'Conditional — note the artefact and score motion fidelity separately', 'Reject the prompt, not the output'],
    correct: 'Conditional — note the artefact and score motion fidelity separately',
    marks: 2,
    explanation: 'Alignment and motion fidelity are independent rubric dimensions; artefacts are documented, not used to collapse the whole grade.',
  },
  {
    domain: 'Generative Media Grader',
    type: 'true_false',
    prompt: 'Motion smoothness and prompt adherence are scored as separate rubric dimensions.',
    correct: 'True',
    marks: 1,
    explanation: 'They measure different failure modes and must be scored independently.',
  },
  {
    domain: 'Generative Media Grader',
    type: 'practical_scenario',
    scenario:
      'Prompt: “a chrome hummingbird sipping from a neon flower, macro, 35mm”. Output: the bird is chrome and macro framing is correct, but the flower is dull paper-white and the beak intersects the petal geometry.',
    prompt: 'Score the output on alignment, material realism and composition. State the single most important fix.',
    rubric: 'Full marks: names the missing neon-flower attribute, flags geometry intersection, and prioritises the attribute miss. Partial: identifies artefacts only.',
    marks: 5,
  },
  {
    domain: 'Generative Media Grader',
    type: 'short_answer',
    prompt: 'Name two safety checks that must run before approving a photorealistic generated image of a person.',
    acceptable: ['consent', 'identity', 'minor', 'deepfake', 'public figure', 'watermark', 'provenance'],
    marks: 2,
    explanation: 'Consent/identity checks and minor-protection or provenance checks are mandatory before approval.',
  },
  {
    domain: 'Workspace Foundations',
    type: 'mcq',
    prompt: 'You are unsure which rubric version applies to a live batch. What is the correct action?',
    options: ['Use the previous version you memorised', 'Ask a peer to decide for you', 'Open the versioned guideline in the workspace and follow the published version', 'Skip the item'],
    correct: 'Open the versioned guideline in the workspace and follow the published version',
    marks: 1,
  },
  {
    domain: 'Workspace Foundations',
    type: 'true_false',
    prompt: 'If a timed assessment disconnects, the workspace automatically pauses the clock while you reconnect.',
    correct: 'True',
    marks: 1,
  },
  {
    domain: 'Workspace Foundations',
    type: 'mcq',
    prompt: 'A second attempt is available only when…',
    options: ['You refresh the page', 'An administrator authorise a retake', 'You clear browser storage', 'The timer expires'],
    correct: 'An administrator authorise a retake',
    marks: 1,
  },
  {
    domain: 'Workspace Foundations',
    type: 'short_answer',
    prompt: 'Describe the first thing you should do when a guideline contradicts a live task instruction.',
    acceptable: ['escalate', 'flag', 'report', 'raise', 'pause', 'ask'],
    marks: 2,
    explanation: 'Pause the work item, flag the conflict and escalate to the reviewer before submitting anything.',
  },
];

const GUIDELINES = [
  {
    title: 'Evaluation Rubric Standards',
    category: 'Core evaluation',
    summary: 'The house style for relevance, accuracy and reasoning scores across every evaluation domain.',
    file: 'rubric-standards.pdf',
    sections: [
      {
        heading: '1. Purpose',
        paragraphs: [
          'This standard defines how evaluators translate an observed output into a defensible score. It applies to every domain operated by AI Square IT Solutions and supersedes local team conventions.',
          'A score is only valid when another trained evaluator could reproduce it from your written justification.',
        ],
      },
      {
        heading: '2. The four judgement axes',
        bullets: [
          'Intent fit — does the output answer the task the user actually had?',
          'Factual grounding — can each claim be traced to a reliable source?',
          'Craft — is the presentation, formatting and tone appropriate to the context?',
          'Safety — does the output avoid harm, impersonation and protected-attribute bias?',
        ],
      },
      {
        heading: '3. Writing the justification',
        paragraphs: [
          'Lead with the decision, then the evidence. Two sentences is the minimum, four is usually enough. Name the rubric axis you are invoking rather than relying on adjectives such as “good” or “poor”.',
        ],
        bullets: [
          'State the rating and the axis that decided it.',
          'Cite the exact element you observed (timestamp, snippet, listing field).',
          'If two axes conflict, explain which one dominates and why.',
        ],
      },
      {
        heading: '4. Escalation',
        paragraphs: [
          'Escalate when a task touches protected attributes, minors, medical or legal advice, or when the guideline is ambiguous. Escalation is never a negative quality signal — unresolved ambiguity is.',
        ],
      },
    ],
  },
  {
    title: 'Search Relevance Handoff Guide',
    category: 'Search quality',
    summary: 'How to read a result page, rate intent fit and hand off borderline items without losing context.',
    file: 'search-relevance-handoff.pdf',
    sections: [
      { heading: 'Reading the result page', paragraphs: ['Start with the query, not the results. Write the implied user task in one line before you look at any snippet.'] },
      {
        heading: 'Rating ladder',
        bullets: [
          'Highly relevant — the task can be completed without another search.',
          'Relevant — the task can mostly be completed; one gap remains.',
          'Slightly relevant — adjacent intent only, or a locality/recency mismatch.',
          'Not relevant — wrong task, wrong entity or unsafe.',
        ],
      },
      {
        heading: 'Handoff format',
        paragraphs: ['Borderline items go to the reviewer queue with: query, your rating, the competing rating and a single sentence explaining the delta.'],
      },
    ],
  },
  {
    title: 'Generative Media Safety Protocol',
    category: 'Media safety',
    summary: 'Mandatory checks before approving any synthetic image, video or voice output.',
    file: 'generative-media-safety.pdf',
    sections: [
      {
        heading: 'Non-negotiable checks',
        bullets: [
          'No identifiable real person without documented consent.',
          'No sexualised or degrading depiction of any subject.',
          'No minor depicted in a harmful or ambiguous context.',
          'No impersonation of public figures for endorsement.',
        ],
      },
      {
        heading: 'Artefact documentation',
        paragraphs: ['Record artefacts with a timestamp or bounding region, a severity (blocking, major, minor) and whether they change the meaning of the output.'],
      },
      {
        heading: 'Voice work',
        paragraphs: ['Transcripts must preserve disfluencies that affect meaning. Voice naturalness is scored separately from transcription accuracy.'],
      },
    ],
  },
];

const JOBS = [
  {
    title: 'Generative Image & Video Grader',
    domain: 'Generative media',
    type: 'Part-time · Contract',
    mode: 'Remote',
    location: 'Remote · India',
    description:
      'Score AI-generated imagery and short video against alignment, material realism, motion fidelity and safety rubrics. You will work inside a versioned rubric workspace and justify every score in writing.',
    responsibilities:
      'Grade 200–400 outputs per week\nWrite structured two-to-four sentence justifications\nFlag safety and impersonation risks immediately\nParticipate in weekly calibration rounds',
    qualifications:
      'Strong visual literacy and attention to detail\nComfortable with written English reasoning\nReliable 10 Mbps connection and a calibrated display\nPrior annotation or QA experience is a plus',
    skills: 'Visual QA, prompt alignment, safety review, structured writing',
  },
  {
    title: 'Search Engine Evaluator',
    domain: 'Search quality',
    type: 'Part-time · Contract',
    mode: 'Remote',
    location: 'Remote · India',
    description:
      'Assess search result pages for intent satisfaction, factual grounding, freshness and locality. Translate a messy result page into a defensible rating.',
    responsibilities:
      'Rate result pages against the relevance ladder\nVerify claims against primary sources\nEscalate ambiguous or sensitive queries\nMaintain 95% calibration agreement',
    qualifications:
      'Excellent research instincts\nFluent written and spoken English plus one Indian language\nAnalytical patience with repetitive work',
    skills: 'Search evaluation, fact-checking, rubric reasoning',
  },
  {
    title: 'Audio Transcriber & Grader',
    domain: 'Audio & speech',
    type: 'Part-time · Contract',
    mode: 'Remote',
    location: 'Remote · India',
    description:
      'Transcribe short utterances and grade synthetic speech for naturalness, pronunciation, pacing and transcript fidelity.',
    responsibilities:
      'Produce verbatim transcripts with timestamped segments\nScore naturalness and pronunciation separately\nFlag synthesis artefacts and clipped audio',
    qualifications:
      'Excellent ear for accents and disfluencies\nTyping speed above 55 WPM\nQuiet workspace and quality headset',
    skills: 'Transcription, phonetic awareness, speech QA',
  },
  {
    title: 'Local Search & POI Validator',
    domain: 'Maps & local',
    type: 'Part-time · Contract',
    mode: 'Hybrid',
    location: 'Hyderabad studio · Hybrid',
    description:
      'Validate business listings, map pins, categories, hours and route accuracy for local search products across Indian cities.',
    responsibilities:
      'Cross-check listings against official sources\nCorrect categories and coordinates\nDocument duplicates and permanently closed places',
    qualifications:
      'Strong knowledge of Indian commercial geography\nComfortable with map tooling\nDetail-oriented documentation habits',
    skills: 'POI validation, maps, local research',
  },
];

export function seedDemo({ force = false } = {}) {
  ensureSettings();

  const existing = db.get('SELECT COUNT(*) AS count FROM users');
  if (existing.count > 0 && !force) return { seeded: false };

  const adminId = createUser({
    fullName: 'Aarav Mehta',
    email: DEMO_ACCOUNTS.admin.email,
    username: DEMO_ACCOUNTS.admin.username,
    password: DEMO_ACCOUNTS.admin.password,
    role: 'admin',
    accountType: 'admin',
    department: 'Platform Operations',
  });

  const priyaId = createUser({
    fullName: 'Priya Rao',
    email: DEMO_ACCOUNTS.employee.email,
    username: DEMO_ACCOUNTS.employee.username,
    password: DEMO_ACCOUNTS.employee.password,
    role: 'employee',
    accountType: 'employee',
    department: 'Search Quality',
  });

  const danielId = createUser({
    fullName: 'Daniel Okafor',
    email: 'daniel@aisquare.work',
    username: 'daniel',
    password: 'aisquare-employee',
    role: 'employee',
    accountType: 'employee',
    department: 'Generative Media',
  });

  const candidateId = createUser({
    fullName: 'Zoya Khan',
    email: DEMO_ACCOUNTS.candidate.email,
    username: DEMO_ACCOUNTS.candidate.username,
    password: DEMO_ACCOUNTS.candidate.password,
    role: 'employee',
    accountType: 'candidate',
    department: 'Candidate · Generative media intake',
    restrict: 1,
  });

  /* Projects */
  const projectIds = {};
  for (const project of [
    { name: 'Atlas · Search Relevance', client: 'Tier-1 search partner', mode: 'automatic', description: 'Weekly relevance batches across English and Telugu queries.' },
    { name: 'Prism · Generative Media', client: 'Foundation model lab', mode: 'manual', description: 'Image and short-video grading with safety gates.' },
    { name: 'Meridian · Local Maps', client: 'Mapping platform', mode: 'automatic', description: 'POI verification and coordinate correction for 12 Indian cities.' },
  ]) {
    const res = db.run(
      `INSERT INTO projects (name, client_note, description, approval_mode, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      project.name,
      project.client,
      project.description,
      project.mode,
      adminId
    );
    projectIds[project.name.split(' · ')[0]] = Number(res.lastInsertRowid);
  }

  /* Question bank */
  const questionIds = {};
  for (const q of QUESTIONS) {
    const res = db.run(
      `INSERT INTO question_bank
        (question_type, prompt, scenario_context, options_json, correct_answer, acceptable_answers_json,
         scoring_rubric, marks, explanation, project_ref, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      q.type,
      q.prompt,
      q.scenario || null,
      q.options ? JSON.stringify(q.options) : null,
      q.correct || null,
      q.acceptable ? JSON.stringify(q.acceptable) : null,
      q.rubric || null,
      q.marks,
      q.explanation || null,
      q.domain,
      adminId
    );
    questionIds[q.prompt] = Number(res.lastInsertRowid);
  }

  const pick = (domain, count) => QUESTIONS.filter((q) => q.domain === domain).slice(0, count).map((q) => questionIds[q.prompt]);

  const assessmentIds = {};
  const assessmentSpecs = [
    {
      key: 'search',
      title: 'Search Quality Calibration',
      domain: 'Search Engine Evaluator',
      instructions:
        'This calibration measures intent reading and rubric reasoning. Read every result page carefully before rating. Short answers are graded on substance, not phrasing.',
      timed: 1,
      minutes: 45,
      pass: 75,
      projectId: projectIds.Atlas,
      questionIds: pick('Search Engine Evaluator', 6),
    },
    {
      key: 'media',
      title: 'Generative Media Grader · Practical',
      domain: 'Generative Media Grader',
      instructions:
        'Two practical scenarios carry most of the marks. Use rubric language in your justification and name the single most important fix.',
      timed: 1,
      minutes: 30,
      pass: 70,
      projectId: projectIds.Prism,
      questionIds: pick('Generative Media Grader', 4),
    },
    {
      key: 'foundations',
      title: 'Workspace Foundations',
      domain: 'Workspace',
      instructions: 'Short onboarding check covering guideline versions, retakes and escalation. Untimed — you can revisit questions before submitting.',
      timed: 0,
      minutes: null,
      pass: 80,
      projectId: null,
      questionIds: pick('Workspace Foundations', 4),
    },
  ];

  for (const spec of assessmentSpecs) {
    const res = db.run(
      `INSERT INTO assessments
        (title, instructions, domain, project_id, status, is_timed, time_limit_minutes, passing_percentage, created_by, available_from)
       VALUES (?, ?, ?, ?, 'published', ?, ?, ?, ?, datetime('now', '-3 days'))`,
      spec.title,
      spec.instructions,
      spec.domain,
      spec.projectId,
      spec.timed,
      spec.minutes,
      spec.pass,
      adminId
    );
    const assessmentId = Number(res.lastInsertRowid);
    assessmentIds[spec.key] = assessmentId;
    spec.questionIds.forEach((questionId, index) => {
      db.run(
        'INSERT INTO assessment_questions (assessment_id, question_id, sort_order) VALUES (?, ?, ?)',
        assessmentId,
        questionId,
        index
      );
    });
    for (const userId of [priyaId, danielId]) {
      db.run(
        'INSERT INTO exam_assignments (assessment_id, user_id, assigned_by_identity) VALUES (?, ?, ?)',
        assessmentId,
        userId,
        'Aarav Mehta (ADM-0001)'
      );
    }
  }

  /* candidate gets a focused screener */
  db.run(
    'INSERT INTO exam_assignments (assessment_id, user_id, assigned_by_identity) VALUES (?, ?, ?)',
    assessmentIds.media,
    candidateId,
    'Aarav Mehta (ADM-0001)'
  );

  /* project readiness requirements */
  db.run(
    'INSERT INTO project_assessments (project_id, assessment_id, minimum_percentage) VALUES (?, ?, 80)',
    projectIds.Atlas,
    assessmentIds.search
  );
  db.run(
    'INSERT INTO project_assessments (project_id, assessment_id, minimum_percentage) VALUES (?, ?, 75)',
    projectIds.Prism,
    assessmentIds.media
  );
  db.run(
    'INSERT INTO project_assessments (project_id, assessment_id, minimum_percentage) VALUES (?, ?, 80)',
    projectIds.Meridian,
    assessmentIds.foundations
  );

  for (const [projectId, userId, status] of [
    [projectIds.Atlas, priyaId, 'in_preparation'],
    [projectIds.Prism, priyaId, 'not_ready'],
    [projectIds.Atlas, danielId, 'pending_approval'],
    [projectIds.Meridian, danielId, 'approved'],
  ]) {
    db.run(
      `INSERT INTO employee_project_readiness (project_id, user_id, readiness_status, decision_source, updated_by_identity)
       VALUES (?, ?, ?, 'system', 'Aarav Mehta (ADM-0001)')`,
      projectId,
      userId,
      status
    );
  }

  /* Guidelines + PDFs */
  const guidelineIds = [];
  for (const item of GUIDELINES) {
    const { storedName, size } = guidelinePdf({ title: item.title, subtitle: item.summary, sections: item.sections, storedName: item.file });
    const res = db.run(
      `INSERT INTO guidelines (title, category, summary, version, status, file_original_name, file_stored_name, file_mime_type, file_size_bytes, created_by)
       VALUES (?, ?, ?, 1, 'published', ?, ?, 'application/pdf', ?, ?)`,
      item.title,
      item.category,
      item.summary,
      item.file,
      storedName,
      size,
      adminId
    );
    const id = Number(res.lastInsertRowid);
    guidelineIds.push(id);
    db.run(
      `INSERT INTO guideline_versions (guideline_id, version, title, summary, change_note, file_original_name, file_stored_name, file_mime_type, file_size_bytes, published_by_identity)
       VALUES (?, 1, ?, ?, 'Initial publication', ?, ?, 'application/pdf', ?, 'Aarav Mehta (ADM-0001)')`,
      id,
      item.title,
      item.summary,
      item.file,
      storedName,
      size
    );
    db.run(
      `INSERT INTO guideline_reads (guideline_id, user_id, version, seconds_spent, acknowledged)
       VALUES (?, ?, 1, 420, 1)`,
      id,
      priyaId
    );
  }

  /* Jobs */
  for (const job of JOBS) {
    db.run(
      `INSERT INTO jobs (title, domain, employment_type, work_mode, location_note, description, responsibilities, qualifications, skills, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?)`,
      job.title,
      job.domain,
      job.type,
      job.mode,
      job.location,
      job.description,
      job.responsibilities,
      job.qualifications,
      job.skills,
      adminId
    );
  }

  /* Announcements */
  const announcements = [
    {
      title: 'Calibration week moves to Thursday',
      category: 'Schedule',
      body:
        'This week’s group calibration shifts to Thursday 16:00 IST so the Prism batch can close first. Bring one borderline item and the rubric axis you applied. Recording is available in Guidelines within 24 hours.',
    },
    {
      title: 'New rubric version for generative video',
      category: 'Guidelines',
      body:
        'Rubric standards v1.4 introduces separate scores for motion fidelity and temporal coherence. Re-open the guideline before your next grading block; the workspace will track acknowledgement automatically.',
    },
    {
      title: 'Atlas batch quality above target',
      category: 'Quality',
      body:
        'Atlas relevance agreement reached 94.2% last week, the best result this quarter. Thank you for the sharper justifications — the reviewer queue is now at its shortest since kickoff.',
    },
  ];
  for (const item of announcements) {
    const res = db.run(
      `INSERT INTO announcements (title, category, body, status, author_identity, created_by, published_at)
       VALUES (?, ?, ?, 'published', 'Aarav Mehta · Platform Operations', ?, datetime('now'))`,
      item.title,
      item.category,
      item.body,
      adminId
    );
    for (const userId of [priyaId, danielId]) {
      db.run(
        `INSERT INTO notifications (user_id, notification_type, title, message, link_path)
         VALUES (?, 'announcement', ?, ?, '/portal/announcements')`,
        userId,
        item.title,
        item.body.slice(0, 140)
      );
    }
    void res;
  }

  db.run(
    `INSERT INTO notifications (user_id, notification_type, title, message, link_path)
     VALUES (?, 'assessment', 'Search Quality Calibration is open', 'You have 45 minutes. The timer pauses if your connection drops.', '/portal/assessments')`,
    priyaId
  );

  db.run(
    `INSERT INTO employee_feedback (user_id, employee_identity, category, subject, message, status, admin_response)
     VALUES (?, ?, 'Portal usability', 'Timer visibility on smaller screens', 'On a 13-inch laptop the countdown is easy to miss during long practical answers. Could it stay pinned?', 'Under Review', NULL)`,
    priyaId,
    'Priya Rao (EMP-0001)'
  );

  /* Contact + application samples */
  db.run(
    `INSERT INTO contact_messages (name, email, company, topic, subject, message)
     VALUES ('Ritika Sharma', 'ritika@northwind.example', 'Northwind Labs', 'Evaluation capacity', 'Scaling Telugu relevance evaluation',
             'We are launching a Telugu search experience and need 8,000 rated queries per month. Can your team support a pilot in three weeks?')`
  );

  db.run(
    `INSERT INTO job_applications (job_id, position_title, full_name, email, phone, location, education_experience,
      cover_letter, resume_original_name, resume_stored_name, resume_mime_type, resume_size_bytes, status)
     VALUES (1, 'Generative Image & Video Grader', 'Meera Iyer', 'meera.iyer@example.com', '+91 98765 43210', 'Bengaluru',
      '4 years as a visual QA analyst for an e-commerce catalogue; BA in Design from Srishti.',
      'I have graded over 60,000 product images and built the rubric my team still uses for lifestyle photography.',
      'Meera-Iyer-CV.pdf', 'demo-meera-iyer.pdf', 'application/pdf', 184320, 'Under Review')`
  );

  /* A completed, released attempt so results screens have real data */
  createDemoAttempt({ assessmentId: assessmentIds.search, userId: priyaId, reviewer: 'Aarav Mehta (ADM-0001)' });

  db.run(
    `INSERT INTO audit_logs (admin_id, admin_identity, action, entity_type, entity_id, summary)
     VALUES (?, 'Aarav Mehta (ADM-0001)', 'WORKSPACE_SEEDED', 'workspace', 'demo', 'Demo workspace provisioned with guidelines, question bank and assessments.')`,
    adminId
  );

  return { seeded: true, adminId };
}

export function createDemoAttempt({ assessmentId, userId, reviewer }) {
  const assessment = db.get('SELECT * FROM assessments WHERE id = ?', assessmentId);
  if (!assessment) return null;
  const questions = db.all(
    `SELECT q.*, aq.sort_order, aq.marks_override
       FROM assessment_questions aq JOIN question_bank q ON q.id = aq.question_id
      WHERE aq.assessment_id = ? ORDER BY aq.sort_order`,
    assessmentId
  );
  if (!questions.length) return null;

  const total = questions.reduce((sum, q) => sum + (q.marks_override ?? q.marks), 0);
  const attempt = db.run(
    `INSERT INTO assessment_attempts
      (assessment_id, user_id, attempt_number, status, status_detail, started_at, submitted_at, is_timed,
       time_limit_seconds, duration_seconds, total_possible_marks, auto_score, final_score, percentage, passed,
       requires_manual_review, review_status, is_released, released_by_identity, released_at, reviewer_comment)
     VALUES (?, ?, 1, 'submitted', 'Reviewed', datetime('now', '-2 days'), datetime('now', '-2 days', '+38 minutes'),
             1, ?, 2280, ?, ?, ?, ?, 1, 1, 'reviewed', 1, ?, datetime('now', '-1 day'),
             'Strong intent reading. Keep the practical justifications anchored to the rubric axis.')`,
    assessmentId,
    userId,
    (assessment.time_limit_minutes || 45) * 60,
    total,
    total,
    total,
    96.7,
    reviewer
  );
  const attemptId = Number(attempt.lastInsertRowid);

  questions.forEach((q, index) => {
    const marks = q.marks_override ?? q.marks;
    const qRow = db.run(
      `INSERT INTO attempt_questions
        (attempt_id, source_question_id, question_type, sort_order, prompt, scenario_context, options_json,
         correct_answer, acceptable_answers_json, scoring_rubric, marks, explanation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      attemptId,
      q.id,
      q.question_type,
      index,
      q.prompt,
      q.scenario_context,
      q.options_json,
      q.correct_answer,
      q.acceptable_answers_json,
      q.scoring_rubric,
      marks,
      q.explanation || null
    ).lastInsertRowid;

    let answer = '';
    let awarded = marks;
    let correct = 1;
    if (q.question_type === 'mcq' || q.question_type === 'true_false') {
      answer = q.correct_answer;
    } else if (q.question_type === 'short_answer') {
      answer = 'Intent drift is when the result set pulls the user toward a different goal than the one their query implies.';
      awarded = marks;
    } else {
      answer = 'Ranked A first: the official GHMC page lets the user complete the appeal without another search. B fails locality and recency; C only collects leads.';
      awarded = Math.max(0, marks - 1);
      correct = null;
    }

    db.run(
      `INSERT INTO attempt_answers (attempt_id, attempt_question_id, answer_value, auto_marks, awarded_marks, is_correct, reviewer_comment)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      attemptId,
      Number(qRow),
      answer,
      q.question_type === 'practical_scenario' ? null : awarded,
      awarded,
      correct,
      q.question_type === 'practical_scenario' ? 'Clear rubric language; tighten the final recommendation.' : null
    );
  });

  return attemptId;
}

export { DEMO_ACCOUNTS };
