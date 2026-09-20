import { Migration, table, tenantTable, fk, ID, vs } from './ddl';

export const m0003: Migration = {
  name: '0003_lms',
  statements: [
    tenantTable('materials', [
      'class_subject_id char(36) DEFAULT NULL', 'subject_id char(36) DEFAULT NULL', 'major_id char(36) DEFAULT NULL', 'grade_level tinyint DEFAULT NULL',
      'title varchar(200) NOT NULL', 'description text', vs('type', 10, 'FILE'), 'content_url varchar(500) DEFAULT NULL', 'content_text mediumtext', 'file_id char(36) DEFAULT NULL',
      'is_published tinyint(1) NOT NULL DEFAULT 0', 'published_at datetime DEFAULT NULL', 'is_public tinyint(1) NOT NULL DEFAULT 0', 'view_count int NOT NULL DEFAULT 0', 'created_by char(36) NOT NULL',
    ], ['KEY idx_mat_cs (class_subject_id)', 'KEY idx_mat_subject (subject_id)', 'KEY idx_mat_creator (created_by)']),
    tenantTable('material_views', ['material_id char(36) NOT NULL', 'user_id char(36) NOT NULL', 'first_viewed_at datetime NOT NULL', 'last_viewed_at datetime NOT NULL', 'view_count int NOT NULL DEFAULT 1', 'progress tinyint NOT NULL DEFAULT 0'],
      ['UNIQUE KEY uq_mv (material_id, user_id)', fk('mv_material', 'material_id', 'materials')]),

    tenantTable('assignments', [
      'class_subject_id char(36) NOT NULL', 'title varchar(200) NOT NULL', 'instructions text', 'attachment_file_id char(36) DEFAULT NULL', 'due_at datetime DEFAULT NULL',
      'allow_late tinyint(1) NOT NULL DEFAULT 1', 'max_score decimal(6,2) NOT NULL DEFAULT 100', vs('status', 20, 'DRAFT'), vs('submission_type', 10, 'BOTH'), 'created_by char(36) NOT NULL',
    ], ['KEY idx_asg_cs (class_subject_id, due_at)', fk('asg_cs', 'class_subject_id', 'class_subjects')]),
    tenantTable('submissions', [
      'assignment_id char(36) NOT NULL', 'student_id char(36) NOT NULL', 'content text', 'attachment_file_id char(36) DEFAULT NULL', 'submitted_at datetime DEFAULT NULL',
      'is_late tinyint(1) NOT NULL DEFAULT 0', vs('status', 20, 'DRAFT'), 'score decimal(6,2) DEFAULT NULL', 'feedback text', 'graded_by char(36) DEFAULT NULL', 'graded_at datetime DEFAULT NULL',
    ], ['UNIQUE KEY uq_sub (assignment_id, student_id)', 'KEY idx_sub_student (student_id)', fk('sub_asg', 'assignment_id', 'assignments')]),

    tenantTable('concepts', ['subject_id char(36) DEFAULT NULL', 'code varchar(40) NOT NULL', 'name varchar(150) NOT NULL', 'description text', 'parent_id char(36) DEFAULT NULL', 'grade_level tinyint DEFAULT NULL'], ['UNIQUE KEY uq_concept (tenant_id, code)', 'KEY idx_concept_subject (subject_id)']),
    tenantTable('questions', [
      'subject_id char(36) DEFAULT NULL', 'concept_id char(36) DEFAULT NULL', vs('type', 10, 'MC'), 'text mediumtext NOT NULL', 'options json DEFAULT NULL', 'answer_key json DEFAULT NULL',
      'explanation text', vs('difficulty', 10, 'SEDANG'), 'points decimal(5,2) NOT NULL DEFAULT 1', 'tags json DEFAULT NULL', 'grade_level tinyint DEFAULT NULL', 'image_file_id char(36) DEFAULT NULL',
      'is_active tinyint(1) NOT NULL DEFAULT 1', 'usage_count int NOT NULL DEFAULT 0', 'created_by char(36) NOT NULL',
    ], ['KEY idx_q_subject (tenant_id, subject_id)', 'KEY idx_q_concept (concept_id)', 'KEY idx_q_creator (created_by)']),

    tenantTable('quizzes', [
      'class_subject_id char(36) NOT NULL', 'title varchar(200) NOT NULL', 'description text', 'duration_min smallint NOT NULL DEFAULT 30', 'open_at datetime DEFAULT NULL', 'close_at datetime DEFAULT NULL',
      'shuffle_questions tinyint(1) NOT NULL DEFAULT 1', 'shuffle_options tinyint(1) NOT NULL DEFAULT 1', 'max_attempts tinyint NOT NULL DEFAULT 1', vs('show_result', 15, 'IMMEDIATE'),
      vs('status', 20, 'DRAFT'), 'grade_component varchar(20) DEFAULT NULL', 'created_by char(36) NOT NULL',
    ], ['KEY idx_quiz_cs (class_subject_id)', fk('quiz_cs', 'class_subject_id', 'class_subjects')]),
    table('quiz_questions', [ID, 'quiz_id char(36) NOT NULL', 'question_id char(36) NOT NULL', 'order_no int NOT NULL DEFAULT 0', 'points decimal(5,2) NOT NULL DEFAULT 1', 'PRIMARY KEY (id)', 'UNIQUE KEY uq_qq (quiz_id, question_id)', fk('qq_quiz', 'quiz_id', 'quizzes'), fk('qq_question', 'question_id', 'questions')]),
    tenantTable('quiz_attempts', [
      'quiz_id char(36) NOT NULL', 'student_id char(36) NOT NULL', 'attempt_no tinyint NOT NULL DEFAULT 1', 'started_at datetime NOT NULL', 'deadline_at datetime NOT NULL', 'submitted_at datetime DEFAULT NULL',
      vs('status', 20, 'IN_PROGRESS'), 'score decimal(6,2) DEFAULT NULL', 'max_score decimal(6,2) DEFAULT NULL', 'question_order json DEFAULT NULL',
    ], ['KEY idx_qa_quiz_student (quiz_id, student_id)', fk('qa_quiz', 'quiz_id', 'quizzes')]),
    table('quiz_answers', [ID, 'attempt_id char(36) NOT NULL', 'question_id char(36) NOT NULL', 'answer json DEFAULT NULL', 'is_correct tinyint(1) DEFAULT NULL', 'score decimal(6,2) DEFAULT NULL', 'graded_by char(36) DEFAULT NULL', 'answered_at datetime NOT NULL', 'PRIMARY KEY (id)', 'UNIQUE KEY uq_qans (attempt_id, question_id)', fk('qans_attempt', 'attempt_id', 'quiz_attempts')]),

    tenantTable('grade_components', ['subject_id char(36) DEFAULT NULL', 'code varchar(20) NOT NULL', 'name varchar(60) NOT NULL', 'weight decimal(5,2) NOT NULL DEFAULT 0', 'order_no int NOT NULL DEFAULT 0'], ['KEY idx_gc (tenant_id, subject_id, code)']),
    tenantTable('grades', [
      'class_subject_id char(36) NOT NULL', 'student_id char(36) NOT NULL', 'component_code varchar(20) NOT NULL', vs('source_type', 20, 'MANUAL'), 'source_id char(36) DEFAULT NULL',
      'title varchar(200) DEFAULT NULL', 'score decimal(6,2) NOT NULL DEFAULT 0', 'max_score decimal(6,2) NOT NULL DEFAULT 100', 'note varchar(255) DEFAULT NULL', 'graded_by char(36) DEFAULT NULL', 'graded_at datetime DEFAULT NULL',
    ], ['KEY idx_grade_cs_student (class_subject_id, student_id)', 'KEY idx_grade_source (source_type, source_id)', fk('grade_cs', 'class_subject_id', 'class_subjects')]),

    tenantTable('announcements', ['title varchar(200) NOT NULL', 'body text NOT NULL', vs('audience', 10, 'ALL'), 'audience_role varchar(40) DEFAULT NULL', 'class_id char(36) DEFAULT NULL', 'is_pinned tinyint(1) NOT NULL DEFAULT 0', 'publish_at datetime DEFAULT NULL', 'expires_at datetime DEFAULT NULL', 'attachment_file_id char(36) DEFAULT NULL', 'created_by char(36) NOT NULL'], ['KEY idx_ann_pub (tenant_id, publish_at)']),
  ],
};
