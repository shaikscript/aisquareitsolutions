<?php
/**
 * Demo workspace generator used by install.php and the CLI seeder.
 * Creates a complete, believable workspace: people, rubrics with real PDFs,
 * a question bank, assessments, a reviewed attempt, readiness gates, hiring
 * pipeline, announcements and an audit trail.
 */

declare(strict_types=1);

function seed_demo(): array
{
    if ((int) val('SELECT COUNT(*) FROM users') > 0) {
        return ['seeded' => false];
    }

    $accounts = [
        'admin' => ['username' => 'admin', 'password' => 'aisquare-admin'],
        'employee' => ['username' => 'priya', 'password' => 'aisquare-employee'],
        'candidate' => ['username' => 'candidate', 'password' => 'aisquare-candidate'],
    ];

    $createUser = static function (
        string $fullName,
        string $mail,
        string $username,
        string $password,
        string $role,
        string $type,
        ?string $department = null,
        int $restrict = 0,
        int $mustChange = 0
    ): int {
        return insert_id(
            "INSERT INTO users (employee_code, full_name, email, username, password_hash, role, account_type, status,
                                department_note, must_change_password, restrict_to_assigned, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)",
            [
                next_account_code($type),
                $fullName,
                $mail,
                $username,
                hash_password($password),
                $role,
                $type,
                $department,
                $mustChange,
                $restrict,
                now(),
                now(),
            ]
        );
    };

    $adminId = $createUser('Aarav Mehta', 'admin@aisquare.work', 'admin', 'aisquare-admin', 'admin', 'admin', 'Platform Operations');
    $priyaId = $createUser('Priya Rao', 'priya@aisquare.work', 'priya', 'aisquare-employee', 'employee', 'employee', 'Search Quality');
    $danielId = $createUser('Daniel Okafor', 'daniel@aisquare.work', 'daniel', 'aisquare-employee', 'employee', 'employee', 'Generative Media');
    $zoyaId = $createUser('Zoya Khan', 'zoya@example.com', 'candidate', 'aisquare-candidate', 'employee', 'candidate', 'Candidate · Generative media intake', 1);

    /* ── guidelines ───────────────────────────────────────────── */

    $guidelines = [
        [
            'title' => 'Evaluation Rubric Standards',
            'category' => 'Core evaluation',
            'summary' => 'The house style for relevance, accuracy and reasoning scores across every evaluation domain.',
            'sections' => [
                ['heading' => '1 · The rating scale', 'paragraphs' => [
                    'Every item is rated on a five-point scale. The scale measures how completely the result satisfies the intent behind the query, not how pleasant the page looks.',
                ], 'bullets' => [
                    'Highly relevant — the result answers the intent directly and completely.',
                    'Relevant — the result answers the intent with minor omissions.',
                    'Slightly relevant — the result touches the topic without satisfying the intent.',
                    'Not relevant — the result is off-topic or the wrong result type.',
                    'Cannot judge — the page failed to load or requires unavailable context.',
                ]],
                ['heading' => '2 · Writing the justification', 'paragraphs' => [
                    'Justify every rating in two to four sentences. Name the intent, the evidence on the page and the axis that decided your rating. Reviewers read justifications, not scores, when calibration drifts.',
                ]],
            ],
        ],
        [
            'title' => 'Search Intent & Query Rewriting',
            'category' => 'Search quality',
            'summary' => 'Reading intent, handling ambiguity and rewriting queries without changing what the user asked.',
            'sections' => [
                ['heading' => 'Intent first', 'paragraphs' => [
                    'Before rating a single result, write the intent in one sentence. If two intents are equally plausible, mark the query ambiguous and rate both interpretations separately.',
                ]],
                ['heading' => 'Rewrites', 'bullets' => [
                    'Never change named entities, dates or locations.',
                    'Fix spelling only when the correction is unambiguous.',
                    'Record the rewrite in the evidence note so the reviewer can reproduce your reading.',
                ]],
            ],
        ],
        [
            'title' => 'Generative Media Safety Protocol',
            'category' => 'Media safety',
            'summary' => 'Mandatory checks before approving any synthetic image, video or voice output.',
            'sections' => [
                ['heading' => 'Mandatory checks', 'bullets' => [
                    'Scan for identifiable real people and public figures.',
                    'Check hands, text rendering, reflections and temporal coherence.',
                    'Flag any output that could impersonate a real person or brand.',
                    'Escalate sexual, violent or hateful content immediately — do not score it.',
                ]],
                ['heading' => 'Scoring dimensions', 'paragraphs' => [
                    'Prompt alignment, material realism, motion fidelity and safety are scored separately. A single severe safety failure fails the output regardless of the other scores.',
                ]],
            ],
        ],
    ];

    $guidelineIds = [];
    foreach ($guidelines as $index => $guideline) {
        $pdf = build_pdf($guideline['title'], 'AI Square · ' . $guideline['category'] . ' · v1', $guideline['sections']);
        $stored = sprintf('guideline-%d-%s.pdf', $index + 1, bin2hex(random_bytes(4)));
        file_put_contents(storage_dir('guidelines') . '/' . $stored, $pdf);

        $id = insert_id(
            'INSERT INTO guidelines (title, category, summary, version, status, requires_ack, file_original_name,
                file_stored_name, file_mime_type, file_size_bytes, created_by, created_at, updated_at)
             VALUES (?, ?, ?, 1, \'published\', 1, ?, ?, ?, ?, ?, ?, ?)',
            [
                $guideline['title'],
                $guideline['category'],
                $guideline['summary'],
                strtolower(slugify($guideline['title'])) . '.pdf',
                $stored,
                'application/pdf',
                strlen($pdf),
                $adminId,
                now(),
                now(),
            ]
        );
        $guidelineIds[] = $id;
        run_sql(
            'INSERT INTO guideline_versions (guideline_id, version, title, summary, change_note, file_original_name,
                file_stored_name, file_mime_type, file_size_bytes, published_by_identity, created_at)
             VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $id,
                $guideline['title'],
                $guideline['summary'],
                'Initial publication',
                strtolower(slugify($guideline['title'])) . '.pdf',
                $stored,
                'application/pdf',
                strlen($pdf),
                'Aarav Mehta (ADM-0001)',
                now(),
            ]
        );
    }

    foreach ([$guidelineIds[0], $guidelineIds[1]] as $guidelineId) {
        run_sql(
            'INSERT INTO guideline_reads (guideline_id, user_id, version, seconds_spent, acknowledged, first_opened_at, last_seen_at)
             VALUES (?, ?, 1, ?, 1, ?, ?)',
            [$guidelineId, $priyaId, random_int(240, 620), now(), now()]
        );
    }
    run_sql(
        'INSERT INTO guideline_reads (guideline_id, user_id, version, seconds_spent, acknowledged, first_opened_at, last_seen_at)
         VALUES (?, ?, 1, 0, 0, ?, ?)',
        [$guidelineIds[2], $danielId, now(), now()]
    );

    /* ── question bank ───────────────────────────────────────── */

    $questions = [
        ['mcq', 'A query for “cheap flights to Dubai” returns only sponsored hotel listings. What is the most accurate relevance rating?',
            ['Highly relevant — it is travel related', 'Slightly relevant — the intent is only partially met', 'Not relevant — the result type does not match the travel intent', 'Cannot judge without more data'],
            'Slightly relevant — the intent is only partially met', null, 'The traveller wants airfare. Hotel ads share a travel context but do not satisfy the flight-booking intent.', 'Search Engine Evaluator', 2,
            'The traveller wants airfare. Hotel ads share a travel context but do not satisfy the flight-booking intent, so the result is only slightly relevant.'],
        ['true_false', 'Freshness is irrelevant when the query asks for “opening hours today”.', null, 'False', null, null, 'Search Engine Evaluator', 1,
            'Opening hours are only useful if they are current, so freshness is decisive.'],
        ['short_answer', 'In one sentence, what distinguishes intent drift from a simple ranking error?',
            null, 'Intent drift shifts the goal of the query; a ranking error keeps the goal and orders results badly.', ['intent drift shifts', 'changes the goal'],
            'Look for a sentence that separates the goal of the query from the ordering of results.', 'Search Engine Evaluator', 3,
            'Intent drift changes what the user is trying to accomplish; a ranking error keeps the goal and orders results badly.'],
        ['mcq', 'A local query returns a permanently closed restaurant as the top result. What is the correct action?',
            ['Rate it highly relevant — the category matches', 'Rate it not relevant and record the closure', 'Ignore the result', 'Report the query as ambiguous'],
            'Rate it not relevant and record the closure', null, 'Serving a closed business fails the user task, even when the category matches.', 'POI Validation', 2,
            'Serving a closed business fails the user task, even when the category matches.'],
        ['practical_scenario', 'Rank the three results for the query “GHMC property tax appeal”. Explain the decision in rubric language and name the single most important fix for the losing result.',
            null, null, null, 'A full-mark answer ranks the official GHMC page first, rejects a lead-generation page and explains locality and recency as the deciding axes.', 'Local Search & Maps', 4,
            'Official, local and current wins. Lead-generation pages fail the intent even when they mention the right keywords.'],
        ['true_false', 'Motion smoothness and prompt adherence are scored as separate dimensions for generated video.', null, 'True', null, null, 'Generative Media Grader', 1,
            'They are independent axes: a clip can follow the prompt and still fail motion fidelity.'],
        ['mcq', 'A generated portrait has perfect lighting but six fingers. How should it be graded?',
            ['Pass — the lighting is excellent', 'Fail safety only', 'Note the artefact and score material realism low', 'Reject the prompt'],
            'Note the artefact and score material realism low', null, 'Anatomical artefacts belong to material realism; safety is a separate gate.', 'Generative Media Grader', 2,
            'Anatomical artefacts belong to material realism; safety is a separate gate.'],
        ['short_answer', 'Name the first thing you check before approving any synthetic media output.',
            null, 'Safety', ['safety', 'identifiable people'],
            'Safety gates come before any aesthetic judgement.', 'Generative Media Grader', 2,
            'Safety gates come before any aesthetic judgement.'],
        ['practical_scenario', 'A generated short clip follows the prompt but the subject morphs at 00:04. Describe how you would score it and what you would write in the justification.',
            null, null, null, 'Scores prompt alignment high, motion fidelity low; justification names the timestamp and the rubric axis.', 'Generative Media Grader', 5,
            'Separate alignment from fidelity, timestamp the artefact and quote the rubric axis.'],
        ['mcq', 'Where do you record an acknowledgement of a rubric version?',
            ['In an email to your lead', 'Inside the guideline library', 'On the assessment result', 'Nowhere — it is automatic'],
            'Inside the guideline library', null, 'Acknowledgement is tracked against the guideline version inside the workspace.', 'Workspace', 2,
            'Acknowledgement is tracked against the guideline version inside the workspace.'],
        ['short_answer', 'What does a readiness gate measure?',
            null, 'Whether linked assessment thresholds have been met', ['thresholds', 'linked assessment'],
            'Readiness is derived from the assessments linked to a project and their thresholds.', 'Workspace', 2,
            'Readiness is derived from the assessments linked to a project and their thresholds.'],
        ['true_false', 'An expired attempt still counts toward readiness when its result has been released.', null, 'True', null, null, 'Workspace', 1,
            'Released results count regardless of whether the attempt was submitted or auto-expired.'],
    ];

    $questionIds = [];
    foreach ($questions as $question) {
        [$type, $prompt, $options, $correct, $acceptable, $rubric, $projectRef, $marks, $explanation] = $question;
        $questionIds[] = insert_id(
            'INSERT INTO question_bank (question_type, prompt, options_json, correct_answer, acceptable_answers_json,
                scoring_rubric, marks, explanation, project_ref, status, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, \'active\', ?, ?, ?)',
            [
                $type,
                $prompt,
                $options ? json_encode($options, JSON_UNESCAPED_UNICODE) : ($type === 'true_false' ? json_encode(['True', 'False']) : null),
                $correct,
                $acceptable ? json_encode($acceptable, JSON_UNESCAPED_UNICODE) : null,
                $rubric,
                $marks,
                $explanation,
                $projectRef,
                $adminId,
                now(),
                now(),
            ]
        );
    }

    /* ── assessments ─────────────────────────────────────────── */

    $createAssessment = static function (array $meta, array $ids) use ($adminId): int {
        $id = insert_id(
            'INSERT INTO assessments (title, instructions, domain, status, available_from, is_timed, time_limit_minutes,
                passing_percentage, selection_mode, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, \'fixed\', ?, ?, ?)',
            [
                $meta['title'],
                $meta['instructions'],
                $meta['domain'],
                $meta['status'],
                $meta['available_from'] ?? null,
                $meta['is_timed'] ? 1 : 0,
                $meta['time_limit_minutes'] ?? null,
                $meta['passing_percentage'],
                $adminId,
                now(),
                now(),
            ]
        );
        foreach ($ids as $index => $questionId) {
            run_sql('INSERT INTO assessment_questions (assessment_id, question_id, sort_order) VALUES (?, ?, ?)', [$id, $questionId, $index]);
        }
        return $id;
    };

    $assessmentOne = $createAssessment([
        'title' => 'Search Quality Calibration',
        'instructions' => 'This calibration measures intent reading and rubric reasoning. Read every result page carefully before rating. Short answers are graded on substance, not phrasing.',
        'domain' => 'Search Engine Evaluator',
        'status' => 'published',
        'is_timed' => true,
        'time_limit_minutes' => 45,
        'passing_percentage' => 75,
        'available_from' => gmdate('Y-m-d H:i:s', time() - 86400 * 3),
    ], [$questionIds[0], $questionIds[1], $questionIds[2], $questionIds[3], $questionIds[4]]);

    $assessmentTwo = $createAssessment([
        'title' => 'Generative Media Grader · Practical',
        'instructions' => 'Two practical scenarios carry most of the marks. Use rubric language in your justification and name the single most important fix.',
        'domain' => 'Generative Media Grader',
        'status' => 'published',
        'is_timed' => true,
        'time_limit_minutes' => 30,
        'passing_percentage' => 70,
        'available_from' => gmdate('Y-m-d H:i:s', time() - 86400 * 3),
    ], [$questionIds[5], $questionIds[6], $questionIds[7], $questionIds[8]]);

    $assessmentThree = $createAssessment([
        'title' => 'Workspace Foundations',
        'instructions' => 'A short check that the workspace, rubric library and acknowledgement flow are understood.',
        'domain' => 'Workspace',
        'status' => 'published',
        'is_timed' => false,
        'passing_percentage' => 80,
        'available_from' => gmdate('Y-m-d H:i:s', time() - 86400 * 2),
    ], [$questionIds[9], $questionIds[10], $questionIds[11]]);

    $createAssessment([
        'title' => 'Rubric Reasoning · Draft',
        'instructions' => 'Internal draft. Questions are still being authored and will not appear to anyone until published.',
        'domain' => 'Workspace',
        'status' => 'draft',
        'is_timed' => true,
        'time_limit_minutes' => 20,
        'passing_percentage' => 75,
    ], []);

    foreach ([[$assessmentOne, $priyaId], [$assessmentOne, $danielId], [$assessmentThree, $priyaId], [$assessmentThree, $danielId], [$assessmentTwo, $zoyaId]] as $assignment) {
        run_sql('INSERT INTO exam_assignments (assessment_id, user_id, assigned_by_identity, created_at) VALUES (?, ?, ?, ?)', [
            $assignment[0],
            $assignment[1],
            'Aarav Mehta (ADM-0001)',
            now(),
        ]);
    }

    /* ── a completed, reviewed attempt for Priya ───────────────── */

    $attemptMarks = [2, 1, 3, 2, 4];
    $attemptId = insert_id(
        "INSERT INTO assessment_attempts (assessment_id, user_id, attempt_number, status, status_detail, started_at, submitted_at,
            is_timed, time_limit_seconds, duration_seconds, total_possible_marks, auto_score, final_score, percentage, passed,
            requires_manual_review, review_status, is_released, released_by_identity, released_at, reviewer_comment)
         VALUES (?, ?, 1, 'submitted', 'Reviewed', ?, ?, 1, 2700, 2280, 12, 11.6, 11.6, 96.7, 1, 0, 'reviewed', 1, ?, ?, ?)",
        [
            $assessmentOne,
            $priyaId,
            gmdate('Y-m-d H:i:s', time() - 86400 * 2),
            gmdate('Y-m-d H:i:s', time() - 86400 * 2 + 2280),
            'Aarav Mehta (ADM-0001)',
            gmdate('Y-m-d H:i:s', time() - 86400),
            'Strong intent reading. Keep the practical justifications anchored to the rubric axis.',
        ]
    );

    $answers = [
        'Slightly relevant — the intent is only partially met',
        'False',
        'Intent drift shifts the goal of the query, while a ranking error keeps the goal and orders results badly.',
        'Rate it not relevant and record the closure',
        'Ranked A first: the official GHMC page lets the user complete the appeal without another search. B fails locality and recency; C only collects leads.',
    ];
    foreach (array_slice($questionIds, 0, 5) as $index => $questionId) {
        $attemptQuestionId = insert_id(
            'INSERT INTO attempt_questions (attempt_id, source_question_id, question_type, sort_order, prompt, options_json,
                correct_answer, acceptable_answers_json, scoring_rubric, marks, explanation)
             SELECT ?, id, question_type, ?, prompt, options_json, correct_answer, acceptable_answers_json, scoring_rubric, marks, explanation
               FROM question_bank WHERE id = ?',
            [$attemptId, $index, $questionId]
        );
        insert_id(
            'INSERT INTO attempt_answers (attempt_id, attempt_question_id, answer_value, auto_marks, awarded_marks, is_correct, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                $attemptId,
                $attemptQuestionId,
                $answers[$index],
                $index === 4 ? null : $attemptMarks[$index],
                $attemptMarks[$index],
                $index === 4 ? null : 1,
                now(),
            ]
        );
    }
    run_sql("INSERT INTO attempt_events (attempt_id, event_type, detail, created_at) VALUES (?, 'started', 'Attempt 1 started', ?)", [$attemptId, gmdate('Y-m-d H:i:s', time() - 86400 * 2)]);
    run_sql("INSERT INTO attempt_events (attempt_id, event_type, detail, created_at) VALUES (?, 'submitted', 'Submitted by candidate · 96.7%', ?)", [$attemptId, gmdate('Y-m-d H:i:s', time() - 86400 * 2 + 2280)]);
    run_sql("INSERT INTO attempt_events (attempt_id, event_type, detail, created_at) VALUES (?, 'reviewed', '96.7% after manual review', ?)", [$attemptId, gmdate('Y-m-d H:i:s', time() - 86400)]);

    /* ── projects & readiness ─────────────────────────────────── */

    $atlas = insert_id(
        'INSERT INTO projects (name, client_note, description, approval_mode, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, \'automatic\', \'active\', ?, ?, ?)',
        ['Atlas · Search Relevance', 'Tier-1 search partner', 'Weekly relevance batches across English and Telugu queries.', $adminId, now(), now()]
    );
    run_sql('INSERT INTO project_assessments (project_id, assessment_id, minimum_percentage) VALUES (?, ?, 80)', [$atlas, $assessmentOne]);

    $prism = insert_id(
        'INSERT INTO projects (name, client_note, description, approval_mode, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, \'manual\', \'active\', ?, ?, ?)',
        ['Prism · Generative Media', 'Foundation model lab', 'Image and short-video grading with safety gates.', $adminId, now(), now()]
    );
    run_sql('INSERT INTO project_assessments (project_id, assessment_id, minimum_percentage) VALUES (?, ?, 75)', [$prism, $assessmentTwo]);

    $meridian = insert_id(
        'INSERT INTO projects (name, client_note, description, approval_mode, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, \'automatic\', \'active\', ?, ?, ?)',
        ['Meridian · Local Maps', 'Mapping platform', 'POI verification and coordinate correction for 12 Indian cities.', $adminId, now(), now()]
    );
    run_sql('INSERT INTO project_assessments (project_id, assessment_id, minimum_percentage) VALUES (?, ?, 80)', [$meridian, $assessmentThree]);

    $readinessRows = [
        [$atlas, $priyaId, 'approved', 'automatic', null],
        [$atlas, $danielId, 'pending_approval', 'system', 'Awaiting calibration review.'],
        [$prism, $danielId, 'not_ready', 'system', null],
        [$meridian, $danielId, 'in_preparation', 'system', null],
        [$meridian, $priyaId, 'not_ready', 'system', null],
    ];
    foreach ($readinessRows as $row) {
        run_sql(
            'INSERT INTO employee_project_readiness (project_id, user_id, readiness_status, decision_source, notes, updated_by_identity, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$row[0], $row[1], $row[2], $row[3], $row[4], 'System', now()]
        );
        run_sql(
            'INSERT INTO project_readiness_history (project_id, user_id, previous_status, new_status, decision_source, actor_identity, reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$row[0], $row[1], null, $row[2], $row[3], 'System', $row[4], now()]
        );
    }

    /* ── hiring pipeline ─────────────────────────────────────── */

    $jobs = [
        ['Generative Image & Video Grader', 'Generative media', 'Part-time · Contract', 'Remote · India',
            'Score AI-generated imagery and short video against alignment, material realism, motion fidelity and safety rubrics. You will work inside a versioned rubric workspace and justify every score in writing.',
            "Grade 200–400 outputs per week\nWrite structured two-to-four sentence justifications\nFlag safety and impersonation risks immediately\nParticipate in weekly calibration rounds",
            "Strong visual literacy and attention to detail\nComfortable with written English reasoning\nReliable 10 Mbps connection and a calibrated display\nPrior annotation or QA experience is a plus",
            'Visual QA, prompt alignment, safety review, structured writing'],
        ['Search Quality Evaluator · Telugu', 'Search quality', 'Part-time · Contract', 'Remote · India',
            'Evaluate English and Telugu search result pages for intent satisfaction, freshness and locality. You will use our rubric library and keep a measurable quality record.',
            "Rate 300–500 queries per week\nWrite intent statements before rating\nEscalate ambiguous or sensitive queries\nAttend a weekly calibration call",
            "Native or near-native Telugu\nStrong written English\nDetail-oriented and consistent\nPrevious search evaluation experience preferred",
            'Search evaluation, Telugu, intent analysis, rubric writing'],
        ['POI Validation Associate', 'Maps', 'Part-time · Contract', 'Remote · India',
            'Verify place listings, categories, opening hours, addresses and coordinates against official sources for our mapping partner.',
            "Validate 400 listings per week\nCross-check with official sources\nRecord corrections with evidence\nFlag permanently closed venues",
            "Comfortable working with maps and local listings\nMethodical and patient\nGood research instincts",
            'POI, maps, data verification, research'],
        ['Audio & Speech Annotator', 'Audio', 'Part-time · Contract', 'Remote · India',
            'Transcribe spoken utterances and score voice naturalness, pronunciation, pacing and fidelity for a speech synthesis programme.',
            "Transcribe 20–30 minutes of audio per day\nScore naturalness and fidelity\nMark pronunciation defects precisely",
            "Excellent listening skills\nQuiet working environment\nHeadphones and reliable internet",
            'Transcription, speech, audio QA'],
    ];

    foreach ($jobs as $job) {
        insert_id(
            'INSERT INTO jobs (title, domain, employment_type, work_mode, location_note, description, responsibilities,
                qualifications, skills, status, created_by, created_at, updated_at)
             VALUES (?, ?, ?, \'Remote\', ?, ?, ?, ?, ?, \'published\', ?, ?, ?)',
            [$job[0], $job[1], $job[2], $job[3], $job[4], $job[5], $job[6], $job[7], $adminId, now(), now()]
        );
    }

    $resume = build_pdf('Meera Iyer · Curriculum Vitae', 'Visual QA analyst · Bengaluru', [
        ['heading' => 'Experience', 'paragraphs' => ['4 years grading catalogue imagery for an e-commerce platform. Built the lifestyle photography rubric the team still uses.']],
        ['heading' => 'Education', 'paragraphs' => ['BA in Design, Srishti Institute of Art, Design and Technology.']],
    ]);
    $resumeName = 'resume-seed-' . bin2hex(random_bytes(4)) . '.pdf';
    file_put_contents(storage_dir('resumes') . '/' . $resumeName, $resume);

    insert_id(
        'INSERT INTO job_applications (job_id, position_title, is_general, full_name, email, phone, location, portfolio_url,
            education_experience, cover_letter, resume_original_name, resume_stored_name, resume_mime_type, resume_size_bytes,
            status, admin_notes, created_at, updated_at)
         VALUES (1, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            'Generative Image & Video Grader',
            'Meera Iyer',
            'meera.iyer@example.com',
            '+91 98765 43210',
            'Bengaluru',
            'https://meera.example.com',
            '4 years as a visual QA analyst for an e-commerce catalogue; BA in Design from Srishti.',
            'I have graded over 60,000 product images and built the rubric my team still uses for lifestyle photography.',
            'Meera-Iyer-CV.pdf',
            $resumeName,
            'application/pdf',
            strlen($resume),
            'Under Review',
            null,
            now(),
            now(),
        ]
    );

    /* ── comms ───────────────────────────────────────────────── */

    $announcements = [
        ['Calibration week moves to Thursday', 'Schedule', 'This week’s group calibration shifts to Thursday 16:00 IST so the Prism batch can close first. Bring one borderline item and the rubric axis you applied. Recording is available in Guidelines within 24 hours.'],
        ['New rubric version for generative video', 'Guidelines', 'Rubric standards v1.4 introduces separate scores for motion fidelity and temporal coherence. Re-open the guideline before your next grading block; the workspace will track acknowledgement automatically.'],
        ['Studio closed on Friday', 'Operations', 'The Hyderabad studio is closed this Friday for electrical maintenance. Remote work continues as usual and support hours are unchanged.'],
    ];
    foreach ($announcements as $announcement) {
        $announcementId = insert_id(
            'INSERT INTO announcements (title, category, body, status, author_identity, created_by, published_at, created_at, updated_at)
             VALUES (?, ?, ?, \'published\', ?, ?, ?, ?, ?)',
            [$announcement[0], $announcement[1], $announcement[2], 'Aarav Mehta · Platform Operations', $adminId, now(), now(), now()]
        );
        foreach ([$priyaId, $danielId] as $userId) {
            notify($userId, 'announcement', $announcement[0], mb_substr($announcement[2], 0, 180), '/portal/announcements');
        }
    }

    insert_id(
        'INSERT INTO contact_messages (name, email, company, topic, subject, message, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, \'unread\', ?, ?)',
        [
            'Ritika Sharma',
            'ritika@northwind.example',
            'Northwind Labs',
            'Evaluation capacity',
            'Scaling Telugu relevance evaluation',
            'We are launching a Telugu search experience and need 8,000 rated queries per month. Can your team support a pilot in three weeks?',
            now(),
            now(),
        ]
    );

    insert_id(
        'INSERT INTO employee_feedback (user_id, employee_identity, category, subject, message, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, \'Under Review\', ?, ?)',
        [
            $priyaId,
            'Priya Rao (EMP-0001)',
            'Portal usability',
            'Timer visibility on smaller screens',
            'On a 13-inch laptop the countdown is easy to miss during long practical answers. Could it stay pinned?',
            now(),
            now(),
        ]
    );

    notify($priyaId, 'result', 'Your result is ready', 'A reviewer has released your assessment result.', '/portal/results');
    notify($priyaId, 'readiness', 'Project readiness approved', 'You are now cleared for Atlas · Search Relevance.', '/portal/readiness');
    notify($priyaId, 'guideline', 'New guideline published', 'Evaluation Rubric Standards is now available in your workspace.', '/portal/guidelines');

    record_activity($priyaId, 'Priya Rao (EMP-0001)', 'guideline_acknowledged', 'guidelines', 'Evaluation Rubric Standards');
    record_activity($priyaId, 'Priya Rao (EMP-0001)', 'assessment_submitted', 'assessments', '96.7%');
    record_activity($priyaId, 'Priya Rao (EMP-0001)', 'feedback_submitted', 'feedback', 'Timer visibility on smaller screens');

    record_audit($adminId, 'Aarav Mehta (ADM-0001)', 'WORKSPACE_SEEDED', 'workspace', 'demo', 'Demo workspace provisioned with guidelines, question bank and assessments.');

    settings(true);

    return ['seeded' => true, 'adminId' => $adminId, 'accounts' => $accounts];
}
