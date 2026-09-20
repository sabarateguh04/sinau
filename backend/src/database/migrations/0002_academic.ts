import { Migration, table, tenantTable, fk, ID, vs } from './ddl';

export const m0002: Migration = {
  name: '0002_academic',
  statements: [
    tenantTable('academic_years', ['name varchar(20) NOT NULL', 'start_date date DEFAULT NULL', 'end_date date DEFAULT NULL', 'is_active tinyint(1) NOT NULL DEFAULT 0', 'active_semester tinyint NOT NULL DEFAULT 1'], ['UNIQUE KEY uq_ay (tenant_id, name)']),
    tenantTable('majors', ['code varchar(20) NOT NULL', 'name varchar(120) NOT NULL', 'description text', 'head_user_id char(36) DEFAULT NULL', 'is_active tinyint(1) NOT NULL DEFAULT 1'], ['UNIQUE KEY uq_major (tenant_id, code)']),
    tenantTable('subjects', ['code varchar(20) NOT NULL', 'name varchar(120) NOT NULL', vs('category', 30, 'UMUM'), 'is_competency tinyint(1) NOT NULL DEFAULT 0', 'hours_per_week smallint NOT NULL DEFAULT 2', 'is_active tinyint(1) NOT NULL DEFAULT 1'], ['UNIQUE KEY uq_subject (tenant_id, code)']),
    tenantTable('rooms', ['code varchar(20) NOT NULL', 'name varchar(120) NOT NULL', 'capacity smallint NOT NULL DEFAULT 36', vs('type', 20, 'KELAS'), 'is_active tinyint(1) NOT NULL DEFAULT 1'], ['UNIQUE KEY uq_room (tenant_id, code)']),
    tenantTable('classes', [
      'academic_year_id char(36) NOT NULL', 'name varchar(60) NOT NULL', 'grade_level tinyint NOT NULL DEFAULT 10', 'major_id char(36) DEFAULT NULL',
      'homeroom_teacher_id char(36) DEFAULT NULL', 'room_id char(36) DEFAULT NULL', 'capacity smallint NOT NULL DEFAULT 36', 'is_active tinyint(1) NOT NULL DEFAULT 1',
    ], ['UNIQUE KEY uq_class (tenant_id, academic_year_id, name)', 'KEY idx_class_major (major_id)', 'KEY idx_class_homeroom (homeroom_teacher_id)', fk('class_ay', 'academic_year_id', 'academic_years')]),
    tenantTable('class_students', ['class_id char(36) NOT NULL', 'student_id char(36) NOT NULL', vs('status', 20, 'AKTIF'), 'joined_at date DEFAULT NULL', 'left_at date DEFAULT NULL'],
      ['UNIQUE KEY uq_cs (class_id, student_id)', 'KEY idx_cs_student (student_id)', fk('cs_class', 'class_id', 'classes'), fk('cs_student', 'student_id', 'users')]),
    tenantTable('class_subjects', ['class_id char(36) NOT NULL', 'subject_id char(36) NOT NULL', 'teacher_id char(36) DEFAULT NULL', 'semester tinyint NOT NULL DEFAULT 0'],
      ['UNIQUE KEY uq_csub (class_id, subject_id, semester)', 'KEY idx_csub_teacher (teacher_id)', 'KEY idx_csub_subject (subject_id)', fk('csub_class', 'class_id', 'classes'), fk('csub_subject', 'subject_id', 'subjects')]),
    tenantTable('schedule_entries', ['class_subject_id char(36) NOT NULL', 'day_of_week tinyint NOT NULL', 'start_time time NOT NULL', 'end_time time NOT NULL', 'room_id char(36) DEFAULT NULL'],
      ['KEY idx_sched_cs (class_subject_id)', 'KEY idx_sched_day (tenant_id, day_of_week)', fk('sched_cs', 'class_subject_id', 'class_subjects')]),
    tenantTable('academic_calendar', ['academic_year_id char(36) DEFAULT NULL', 'title varchar(200) NOT NULL', 'start_date date NOT NULL', 'end_date date NOT NULL', vs('type', 20, 'KEGIATAN'), 'description text', 'is_holiday tinyint(1) NOT NULL DEFAULT 0'], ['KEY idx_cal_dates (tenant_id, start_date, end_date)']),
    tenantTable('curriculum_refs', ['subject_id char(36) NOT NULL', 'grade_level tinyint DEFAULT NULL', vs('type', 10, 'CP'), 'code varchar(40) DEFAULT NULL', 'description text', 'parent_id char(36) DEFAULT NULL', 'order_no int NOT NULL DEFAULT 0'], ['KEY idx_cur_subject (subject_id)', fk('cur_subject', 'subject_id', 'subjects')]),
    tenantTable('alumni', ['user_id char(36) NOT NULL', 'graduation_year smallint NOT NULL', 'last_class varchar(60) DEFAULT NULL', 'major_name varchar(120) DEFAULT NULL', vs('continuing', 20, 'LAINNYA'), 'institution varchar(200) DEFAULT NULL', 'phone varchar(30) DEFAULT NULL', 'email varchar(190) DEFAULT NULL', 'notes text'], ['UNIQUE KEY uq_alumni_user (user_id)', 'KEY idx_alumni_year (tenant_id, graduation_year)']),
    tenantTable('rollover_runs', ['from_year_id char(36) NOT NULL', 'to_year_id char(36) NOT NULL', vs('status', 20, 'DRAFT'), 'plan json DEFAULT NULL', 'checks json DEFAULT NULL', 'result json DEFAULT NULL', 'created_by char(36) DEFAULT NULL', 'executed_at datetime DEFAULT NULL', 'rolled_back_at datetime DEFAULT NULL']),
    table('rollover_items', [ID, 'run_id char(36) NOT NULL', 'kind varchar(30) NOT NULL', 'source_id char(36) DEFAULT NULL', 'target_id char(36) DEFAULT NULL', 'action varchar(30) NOT NULL', vs('status', 20, 'PLANNED'), 'detail json DEFAULT NULL', 'PRIMARY KEY (id)', 'KEY idx_ri_run (run_id)', fk('ri_run', 'run_id', 'rollover_runs')]),
  ],
};
