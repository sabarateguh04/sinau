import { Migration, table, tenantTable, fk, ID, vs } from './ddl';

export const m0004: Migration = {
  name: '0004_attendance',
  statements: [
    tenantTable('attendance_daily', ['class_id char(36) NOT NULL', 'student_id char(36) NOT NULL', 'date date NOT NULL', vs('status', 2, 'H'), 'note varchar(255) DEFAULT NULL', 'recorded_by char(36) DEFAULT NULL'],
      ['UNIQUE KEY uq_ad (class_id, student_id, date)', 'KEY idx_ad_student (student_id, date)', fk('ad_class', 'class_id', 'classes')]),
    tenantTable('attendance_sessions', [
      'class_subject_id char(36) NOT NULL', 'date date NOT NULL', 'meeting_no smallint NOT NULL DEFAULT 1', 'topic varchar(200) DEFAULT NULL', vs('method', 10, 'MANUAL'),
      'qr_secret char(64) DEFAULT NULL', 'geo_lat decimal(10,7) DEFAULT NULL', 'geo_lng decimal(10,7) DEFAULT NULL', 'geo_radius_m int DEFAULT NULL',
      'opened_at datetime DEFAULT NULL', 'closed_at datetime DEFAULT NULL', 'created_by char(36) NOT NULL',
    ], ['KEY idx_as_cs_date (class_subject_id, date)', fk('as_cs', 'class_subject_id', 'class_subjects')]),
    tenantTable('attendance_records', ['session_id char(36) NOT NULL', 'student_id char(36) NOT NULL', vs('status', 2, 'H'), 'checked_at datetime DEFAULT NULL', vs('method', 10, 'MANUAL'), 'lat decimal(10,7) DEFAULT NULL', 'lng decimal(10,7) DEFAULT NULL', 'note varchar(255) DEFAULT NULL', 'recorded_by char(36) DEFAULT NULL'],
      ['UNIQUE KEY uq_ar (session_id, student_id)', 'KEY idx_ar_student (student_id)', fk('ar_session', 'session_id', 'attendance_sessions')]),
    table('attendance_qr_tokens', [ID, 'session_id char(36) NOT NULL', 'token_hash char(64) NOT NULL', 'expires_at datetime NOT NULL', 'used_by char(36) DEFAULT NULL', 'used_at datetime DEFAULT NULL', 'PRIMARY KEY (id)', 'UNIQUE KEY uq_aqt (token_hash)', 'KEY idx_aqt_session (session_id)', fk('aqt_session', 'session_id', 'attendance_sessions')]),
    tenantTable('permits', ['student_id char(36) NOT NULL', vs('type', 10, 'IZIN'), 'date_from date NOT NULL', 'date_to date NOT NULL', 'reason text', 'attachment_file_id char(36) DEFAULT NULL', vs('status', 20, 'PENDING'), 'reviewed_by char(36) DEFAULT NULL', 'reviewed_at datetime DEFAULT NULL', 'review_note varchar(255) DEFAULT NULL', 'submitted_by char(36) DEFAULT NULL'],
      ['KEY idx_permit_student (student_id, date_from)', 'KEY idx_permit_status (tenant_id, status)']),
    tenantTable('staff_attendance', ['user_id char(36) NOT NULL', 'date date NOT NULL', 'check_in time DEFAULT NULL', 'check_out time DEFAULT NULL', vs('status', 10, 'HADIR'), 'note varchar(255) DEFAULT NULL', 'recorded_by char(36) DEFAULT NULL'],
      ['UNIQUE KEY uq_sa (user_id, date)', 'KEY idx_sa_tenant_date (tenant_id, date)']),
  ],
};
