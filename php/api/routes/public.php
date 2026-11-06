<?php
/**
 * Public website API: company profile, open roles, applications and contact.
 */

declare(strict_types=1);

const RESUME_MIME = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

Router::get('/public/info', static function (): void {
    json_out(public_info());
});

Router::get('/public/jobs', static function (): void {
    $rows = all(
        "SELECT id, title, domain, employment_type, work_mode, location_note, description,
                responsibilities, qualifications, skills, created_at
           FROM jobs WHERE status = 'published' ORDER BY created_at DESC"
    );
    $jobs = [];
    foreach ($rows as $row) {
        $responsibilities = $row['responsibilities'] ? array_values(array_filter(array_map('trim', explode("\n", $row['responsibilities'])))) : [];
        $qualifications = $row['qualifications'] ? array_values(array_filter(array_map('trim', explode("\n", $row['qualifications'])))) : [];
        $skills = $row['skills'] ? array_values(array_filter(array_map('trim', explode(',', $row['skills'])))) : [];
        $jobs[] = [
            'id' => (int) $row['id'],
            'title' => $row['title'],
            'domain' => $row['domain'],
            'employmentType' => $row['employment_type'],
            'workMode' => $row['work_mode'],
            'location' => $row['location_note'],
            'description' => $row['description'],
            'responsibilities' => $responsibilities,
            'qualifications' => $qualifications,
            'skills' => $skills,
            'createdAt' => iso($row['created_at']),
        ];
    }
    json_out(['jobs' => $jobs]);
});

Router::get('/public/stats', static function (): void {
    json_out([
        'domains' => 7,
        'openRoles' => (int) val("SELECT COUNT(*) FROM jobs WHERE status = 'published'"),
        'evaluationItems' => (int) val("SELECT COUNT(*) FROM question_bank WHERE status = 'active'"),
        'reviewers' => (int) val("SELECT COUNT(*) FROM users WHERE status = 'active' AND role = 'employee'"),
    ]);
});

Router::post('/public/applications', static function (): void {
    $body = body();
    $fullName = str_input($body['fullName'] ?? '', 120, 2, 'Full name');
    $mail = email_input($body['email'] ?? '');
    $phone = str_input($body['phone'] ?? '', 40, 6, 'Phone');
    $education = str_input($body['educationExperience'] ?? '', 4000, 20, 'Education and experience');
    $jobId = !empty($body['jobId']) ? int_input($body['jobId']) : null;
    $isGeneral = !$jobId || bool_input($body['general'] ?? false);

    $job = null;
    if ($jobId) {
        $job = one("SELECT id, title FROM jobs WHERE id = ? AND status = 'published'", [$jobId]);
        if (!$job) {
            throw new HttpError(400, 'That role is no longer accepting applications. Submit a general application instead.');
        }
    }

    $file = file_upload('resume');
    if (!$file) {
        throw new HttpError(400, 'Attach your resume (PDF, DOC or DOCX, up to 5 MB).');
    }
    $stored = store_upload($file, 'resumes', RESUME_MIME, 5 * 1024 * 1024);

    $positionTitle = $job ? $job['title'] : 'General evaluator application';
    $applicationId = insert_id(
        'INSERT INTO job_applications
           (job_id, position_title, is_general, full_name, email, phone, location, portfolio_url,
            education_experience, cover_letter, resume_original_name, resume_stored_name,
            resume_mime_type, resume_size_bytes, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'New\', ?, ?)',
        [
            $job ? (int) $job['id'] : null,
            $positionTitle,
            $isGeneral ? 1 : 0,
            $fullName,
            $mail,
            $phone,
            optional_str($body['location'] ?? '', 120) ?: null,
            optional_str($body['portfolioUrl'] ?? '', 300) ?: null,
            $education,
            optional_str($body['coverLetter'] ?? '', 5000) ?: null,
            $stored['original'],
            $stored['stored'],
            $stored['mime'],
            $stored['size'],
            now(),
            now(),
        ]
    );

    foreach (all("SELECT id FROM users WHERE role = 'admin' AND status = 'active'") as $admin) {
        notify(
            (int) $admin['id'],
            'application',
            'New application received',
            $fullName . ' applied for ' . $positionTitle . '.',
            '/admin/applications'
        );
    }

    http_response_code(201);
    json_out([
        'ok' => true,
        'reference' => sprintf('APP-%04d', $applicationId),
        'position' => $positionTitle,
    ]);
});

Router::post('/public/contact', static function (): void {
    $body = body();
    $name = str_input($body['name'] ?? '', 120, 2, 'Name');
    $mail = email_input($body['email'] ?? '');
    $subject = str_input($body['subject'] ?? '', 180, 3, 'Subject');
    $message = str_input($body['message'] ?? '', 5000, 15, 'Message');

    $messageId = insert_id(
        'INSERT INTO contact_messages (name, email, company, topic, subject, message, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, \'unread\', ?, ?)',
        [
            $name,
            $mail,
            optional_str($body['company'] ?? '', 140) ?: null,
            optional_str($body['topic'] ?? '', 80) ?: 'General',
            $subject,
            $message,
            now(),
            now(),
        ]
    );

    foreach (all("SELECT id FROM users WHERE role = 'admin' AND status = 'active'") as $admin) {
        notify((int) $admin['id'], 'contact', 'New contact message', $name . ' · ' . $subject, '/admin/messages');
    }

    http_response_code(201);
    json_out(['ok' => true, 'reference' => sprintf('MSG-%04d', $messageId)]);
});
