import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import db, { RESUME_DIR, getSettings, notify } from '../db/index.js';
import { randomToken } from '../lib/crypto.js';
import { str, optionalStr, email, int, bool, HttpError, asyncRoute } from '../lib/validate.js';

const router = express.Router();

const ALLOWED_EXT = new Set(['.pdf', '.doc', '.docx']);
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, RESUME_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `${Date.now()}-${randomToken(8)}${ALLOWED_EXT.has(ext) ? ext : '.bin'}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext) || !ALLOWED_MIME.has(file.mimetype)) {
      return cb(new HttpError(400, 'Attach a PDF, DOC or DOCX file up to 5 MB.'));
    }
    return cb(null, true);
  },
});

router.get('/info', (_req, res) => {
  const map = getSettings();
  let values = [];
  try {
    const parsed = JSON.parse(map.company_values_json || '[]');
    if (Array.isArray(parsed)) values = parsed;
  } catch {
    values = [];
  }
  res.json({
    companyName: 'AI Square IT Solutions',
    mission: map.company_mission,
    vision: map.company_vision,
    values,
    careersNote: map.public_careers_note,
    email: map.public_contact_email,
    phone: map.public_contact_phone,
    address: map.public_office_address,
    hours: map.public_office_hours,
    mapLink: map.public_map_link,
    lat: map.public_map_lat ? Number(map.public_map_lat) : null,
    lng: map.public_map_lng ? Number(map.public_map_lng) : null,
    linkedin: map.public_linkedin,
    privacyNote: map.privacy_contact_note,
    demoMode: map.demo_mode === 'true',
  });
});

router.get('/jobs', (_req, res) => {
  const jobs = db.all(
    `SELECT id, title, domain, employment_type AS employmentType, work_mode AS workMode,
            location_note AS location, description, responsibilities, qualifications, skills, created_at AS createdAt
       FROM jobs WHERE status = 'published' ORDER BY created_at DESC`
  );
  res.json({
    jobs: jobs.map((job) => ({
      ...job,
      responsibilities: job.responsibilities ? job.responsibilities.split('\n').filter(Boolean) : [],
      qualifications: job.qualifications ? job.qualifications.split('\n').filter(Boolean) : [],
      skills: job.skills ? job.skills.split(',').map((s) => s.trim()).filter(Boolean) : [],
    })),
  });
});

router.get('/stats', (_req, res) => {
  const jobs = db.get("SELECT COUNT(*) AS count FROM jobs WHERE status = 'published'");
  const questions = db.get('SELECT COUNT(*) AS count FROM question_bank WHERE status = \'active\'');
  res.json({
    domains: 7,
    openRoles: jobs.count,
    evaluationItems: questions.count,
    reviewers: db.get("SELECT COUNT(*) AS count FROM users WHERE status = 'active' AND role = 'employee'").count,
  });
});

router.post('/applications', (req, res, next) => {
  upload.single('resume')(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Your resume is larger than 5 MB.' : err.message;
      return res.status(400).json({ error: message });
    }
    try {
      const fullName = str(req.body.fullName, { field: 'Full name', max: 120, min: 2 });
      const mail = email(req.body.email);
      const phone = str(req.body.phone, { field: 'Phone', max: 40, min: 6 });
      const educationExperience = str(req.body.educationExperience, { field: 'Education and experience', max: 4000, min: 20 });
      const jobId = req.body.jobId ? int(req.body.jobId) : null;
      const isGeneral = !jobId || bool(req.body.general);

      let job = null;
      if (jobId) {
        job = db.get("SELECT id, title FROM jobs WHERE id = ? AND status = 'published'", jobId);
        if (!job) {
          if (req.file) fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: 'That role is no longer accepting applications. Submit a general application instead.' });
        }
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Attach your resume (PDF, DOC or DOCX, up to 5 MB).' });
      }

      const positionTitle = job ? job.title : 'General evaluator application';
      const result = db.run(
        `INSERT INTO job_applications
           (job_id, position_title, is_general, full_name, email, phone, location, portfolio_url,
            education_experience, cover_letter, resume_original_name, resume_stored_name,
            resume_mime_type, resume_size_bytes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        job ? job.id : null,
        positionTitle,
        isGeneral ? 1 : 0,
        fullName,
        mail,
        phone,
        optionalStr(req.body.location, 120) || null,
        optionalStr(req.body.portfolioUrl, 300) || null,
        educationExperience,
        optionalStr(req.body.coverLetter, 5000) || null,
        req.file.originalname,
        req.file.filename,
        req.file.mimetype,
        req.file.size
      );

      const admins = db.all("SELECT id FROM users WHERE role = 'admin' AND status = 'active'");
      for (const admin of admins) {
        notify({
          userId: admin.id,
          type: 'application',
          title: 'New application received',
          message: `${fullName} applied for ${positionTitle}.`,
          linkPath: '/admin/applications',
        });
      }

      res.status(201).json({
        ok: true,
        reference: `APP-${String(result.lastInsertRowid).padStart(4, '0')}`,
        position: positionTitle,
      });
    } catch (error) {
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          /* ignore */
        }
      }
      next(error);
    }
  });
});

router.post('/contact', asyncRoute((req, res) => {
  const name = str(req.body.name, { field: 'Name', max: 120, min: 2 });
  const mail = email(req.body.email);
  const subject = str(req.body.subject, { field: 'Subject', max: 180, min: 3 });
  const message = str(req.body.message, { field: 'Message', max: 5000, min: 15 });

  const result = db.run(
    `INSERT INTO contact_messages (name, email, company, topic, subject, message)
     VALUES (?, ?, ?, ?, ?, ?)`,
    name,
    mail,
    optionalStr(req.body.company, 140) || null,
    optionalStr(req.body.topic, 80) || 'General',
    subject,
    message
  );

  const admins = db.all("SELECT id FROM users WHERE role = 'admin' AND status = 'active'");
  for (const admin of admins) {
    notify({
      userId: admin.id,
      type: 'contact',
      title: 'New contact message',
      message: `${name} · ${subject}`,
      linkPath: '/admin/messages',
    });
  }

  res.status(201).json({ ok: true, reference: `MSG-${String(result.lastInsertRowid).padStart(4, '0')}` });
}));

export default router;
