import { Migration, table, tenantTable, fk, ID, vs } from './ddl';

export const m0005: Migration = {
  name: '0005_exams_rapor',
  statements: [
    // ---- Ujian online (terjadwal, token sesi, autosave, auto-submit) ----
    tenantTable('exam_packages', ['subject_id char(36) DEFAULT NULL', 'grade_level tinyint DEFAULT NULL', 'title varchar(200) NOT NULL', 'description text', 'total_points decimal(7,2) NOT NULL DEFAULT 0', vs('status', 20, 'DRAFT'), 'created_by char(36) NOT NULL'], ['KEY idx_ep_subject (tenant_id, subject_id)']),
    table('exam_package_questions', [ID, 'package_id char(36) NOT NULL', 'question_id char(36) NOT NULL', 'order_no int NOT NULL DEFAULT 0', 'points decimal(5,2) NOT NULL DEFAULT 1', 'PRIMARY KEY (id)', 'UNIQUE KEY uq_epq (package_id, question_id)', fk('epq_pkg', 'package_id', 'exam_packages'), fk('epq_q', 'question_id', 'questions')]),
    tenantTable('exams', [
      'package_id char(36) NOT NULL', 'subject_id char(36) DEFAULT NULL', 'title varchar(200) NOT NULL', vs('type', 10, 'UH'), 'academic_year_id char(36) DEFAULT NULL', 'semester tinyint NOT NULL DEFAULT 1',
      'duration_min smallint NOT NULL DEFAULT 60', 'shuffle_questions tinyint(1) NOT NULL DEFAULT 1', 'shuffle_options tinyint(1) NOT NULL DEFAULT 1', 'passing_score decimal(5,2) DEFAULT NULL',
      vs('show_result', 15, 'AFTER_CLOSE'), 'lock_screen tinyint(1) NOT NULL DEFAULT 1', 'max_violations tinyint NOT NULL DEFAULT 3', 'grade_component varchar(20) DEFAULT NULL', vs('status', 20, 'DRAFT'), 'created_by char(36) NOT NULL',
    ], ['KEY idx_exam_pkg (package_id)', fk('exam_pkg', 'package_id', 'exam_packages')]),
    tenantTable('exam_sessions', [
      'exam_id char(36) NOT NULL', 'class_id char(36) NOT NULL', 'class_subject_id char(36) DEFAULT NULL', 'start_at datetime NOT NULL', 'end_at datetime NOT NULL', 'token varchar(12) NOT NULL',
      'proctor_id char(36) DEFAULT NULL', 'room_id char(36) DEFAULT NULL', vs('status', 20, 'SCHEDULED'), 'note varchar(255) DEFAULT NULL',
    ], ['KEY idx_es_exam (exam_id)', 'KEY idx_es_class_time (class_id, start_at)', fk('es_exam', 'exam_id', 'exams'), fk('es_class', 'class_id', 'classes')]),
    tenantTable('exam_attempts', [
      'session_id char(36) NOT NULL', 'student_id char(36) NOT NULL', 'started_at datetime NOT NULL', 'deadline_at datetime NOT NULL', 'submitted_at datetime DEFAULT NULL', vs('status', 20, 'IN_PROGRESS'),
      vs('submit_reason', 20, 'MANUAL'), 'score decimal(6,2) DEFAULT NULL', 'max_score decimal(6,2) DEFAULT NULL', 'question_order json DEFAULT NULL', 'violations smallint NOT NULL DEFAULT 0', 'last_saved_at datetime DEFAULT NULL', 'ip varchar(64) DEFAULT NULL', 'user_agent varchar(255) DEFAULT NULL',
    ], ['UNIQUE KEY uq_ea (session_id, student_id)', 'KEY idx_ea_student (student_id)', fk('ea_session', 'session_id', 'exam_sessions')]),
    table('exam_answers', [ID, 'attempt_id char(36) NOT NULL', 'question_id char(36) NOT NULL', 'answer json DEFAULT NULL', 'is_correct tinyint(1) DEFAULT NULL', 'score decimal(6,2) DEFAULT NULL', 'graded_by char(36) DEFAULT NULL', 'seq int NOT NULL DEFAULT 0', 'answered_at datetime NOT NULL', 'PRIMARY KEY (id)', 'UNIQUE KEY uq_eans (attempt_id, question_id)', fk('eans_attempt', 'attempt_id', 'exam_attempts')]),
    table('exam_answer_logs', [ID, 'attempt_id char(36) NOT NULL', 'question_id char(36) NOT NULL', 'answer json DEFAULT NULL', vs('event', 20, 'ANSWER'), 'seq int NOT NULL DEFAULT 0', 'created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'PRIMARY KEY (id)', 'KEY idx_eal_attempt (attempt_id, seq)', fk('eal_attempt', 'attempt_id', 'exam_attempts')]),

    // ---- e-Rapor ----
    tenantTable('report_card_settings', ['academic_year_id char(36) DEFAULT NULL', 'kkm decimal(5,2) NOT NULL DEFAULT 75', 'predicate_scale json DEFAULT NULL', 'signature_principal varchar(150) DEFAULT NULL', 'signature_city varchar(100) DEFAULT NULL', 'template json DEFAULT NULL'], ['UNIQUE KEY uq_rcs (tenant_id, academic_year_id)']),
    tenantTable('report_cards', [
      'academic_year_id char(36) NOT NULL', 'semester tinyint NOT NULL DEFAULT 1', 'class_id char(36) NOT NULL', 'student_id char(36) NOT NULL', vs('status', 20, 'DRAFT'),
      'homeroom_note text', 'attendance_sick smallint NOT NULL DEFAULT 0', 'attendance_permit smallint NOT NULL DEFAULT 0', 'attendance_absent smallint NOT NULL DEFAULT 0', 'extracurricular json DEFAULT NULL', 'achievements json DEFAULT NULL',
      'average decimal(6,2) DEFAULT NULL', 'rank_in_class smallint DEFAULT NULL', 'promoted tinyint(1) DEFAULT NULL', 'generated_at datetime DEFAULT NULL', 'approved_by char(36) DEFAULT NULL', 'approved_at datetime DEFAULT NULL', 'pdf_file_id char(36) DEFAULT NULL',
    ], ['UNIQUE KEY uq_rc (academic_year_id, semester, student_id)', 'KEY idx_rc_class (class_id)']),
    table('report_card_subjects', [ID, 'report_card_id char(36) NOT NULL', 'subject_id char(36) NOT NULL', 'subject_name varchar(120) NOT NULL', 'category varchar(30) DEFAULT NULL', 'final_score decimal(6,2) NOT NULL DEFAULT 0', 'predicate varchar(2) DEFAULT NULL', 'description text', 'components json DEFAULT NULL', 'order_no int NOT NULL DEFAULT 0', 'PRIMARY KEY (id)', 'UNIQUE KEY uq_rcsub (report_card_id, subject_id)', fk('rcsub_rc', 'report_card_id', 'report_cards')]),
    table('report_card_p5', [ID, 'report_card_id char(36) NOT NULL', 'project_title varchar(200) NOT NULL', 'theme varchar(150) DEFAULT NULL', 'dimensions json DEFAULT NULL', 'note text', 'PRIMARY KEY (id)', 'KEY idx_rcp5 (report_card_id)', fk('rcp5_rc', 'report_card_id', 'report_cards')]),

    // ---- Wali murid ----
    tenantTable('guardians', ['user_id char(36) NOT NULL', vs('relation', 20, 'ORANG_TUA'), 'occupation varchar(100) DEFAULT NULL', 'address text'], ['UNIQUE KEY uq_guardian_user (user_id)', fk('guardian_user', 'user_id', 'users')]),
    tenantTable('guardian_students', ['guardian_user_id char(36) NOT NULL', 'student_id char(36) NOT NULL', vs('relation', 20, 'ORANG_TUA'), 'is_primary tinyint(1) NOT NULL DEFAULT 1'], ['UNIQUE KEY uq_gs (guardian_user_id, student_id)', 'KEY idx_gs_student (student_id)']),

    // ---- Surat resmi ----
    tenantTable('letter_templates', ['code varchar(30) NOT NULL', 'name varchar(120) NOT NULL', 'body_template mediumtext', 'number_format varchar(80) DEFAULT NULL', 'is_active tinyint(1) NOT NULL DEFAULT 1'], ['UNIQUE KEY uq_lt (tenant_id, code)']),
    tenantTable('official_letters', ['template_id char(36) DEFAULT NULL', 'number varchar(80) NOT NULL', 'subject varchar(200) NOT NULL', 'recipient varchar(200) DEFAULT NULL', 'body mediumtext', 'letter_date date NOT NULL', vs('status', 20, 'DRAFT'), 'signed_by char(36) DEFAULT NULL', 'pdf_file_id char(36) DEFAULT NULL', 'created_by char(36) NOT NULL'], ['KEY idx_ol_date (tenant_id, letter_date)']),
  ],
};
