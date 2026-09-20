import { Migration, table, tenantTable, fk, ID, TENANT, TS, SOFT, vs } from './ddl';

export const m0001: Migration = {
  name: '0001_platform',
  statements: [
    table('provinsi', ['id int unsigned NOT NULL', 'kode varchar(4) NOT NULL', 'nama varchar(100) NOT NULL', 'PRIMARY KEY (id)', 'UNIQUE KEY uq_provinsi_kode (kode)']),
    table('kota', ['id int unsigned NOT NULL', 'provinsi_id int unsigned NOT NULL', 'kode varchar(6) NOT NULL', 'nama varchar(100) NOT NULL', 'PRIMARY KEY (id)', 'UNIQUE KEY uq_kota_kode (kode)', 'KEY idx_kota_prov (provinsi_id)', fk('kota_prov', 'provinsi_id', 'provinsi')]),

    table('tenants', [
      ID, 'slug varchar(60) NOT NULL', 'name varchar(200) NOT NULL', vs('type', 20, 'SMK'), 'category varchar(20) DEFAULT NULL',
      'npsn varchar(20) DEFAULT NULL', 'provinsi_id int unsigned DEFAULT NULL', 'kota_id int unsigned DEFAULT NULL', 'address text', 'phone varchar(30) DEFAULT NULL',
      'email varchar(190) DEFAULT NULL', 'website varchar(190) DEFAULT NULL', 'principal_name varchar(150) DEFAULT NULL', 'is_active tinyint(1) NOT NULL DEFAULT 1', TS, SOFT,
      'PRIMARY KEY (id)', 'UNIQUE KEY uq_tenants_slug (slug)', 'KEY idx_tenants_prov (provinsi_id)', 'KEY idx_tenants_kota (kota_id)',
    ]),
    table('tenant_settings', [
      'tenant_id char(36) NOT NULL', 'self_registration tinyint(1) NOT NULL DEFAULT 0', vs('portal_share', 10, 'MANUAL'),
      vs('approval_flow', 20, 'UNIT_HEAD'), vs('timezone', 40, 'Asia/Jakarta'), 'maintenance tinyint(1) NOT NULL DEFAULT 0',
      'maintenance_message varchar(255) DEFAULT NULL', 'data_saver_default tinyint(1) NOT NULL DEFAULT 0', 'grade_scale json DEFAULT NULL', 'extra json DEFAULT NULL', TS,
      'PRIMARY KEY (tenant_id)', fk('tsettings_tenant', 'tenant_id', 'tenants'),
    ]),
    table('tenant_branding', [
      'tenant_id char(36) NOT NULL', 'display_name varchar(120) DEFAULT NULL', 'tagline varchar(200) DEFAULT NULL', 'logo_url varchar(255) DEFAULT NULL',
      'favicon_url varchar(255) DEFAULT NULL', vs('primary_color', 9, '#0f766e'), vs('accent_color', 9, '#f59e0b'),
      vs('theme', 10, 'system'), TS, 'PRIMARY KEY (tenant_id)', fk('tbranding_tenant', 'tenant_id', 'tenants'),
    ]),
    tenantTable('feature_flags', ['flag_key varchar(80) NOT NULL', 'enabled tinyint(1) NOT NULL DEFAULT 1', 'config json DEFAULT NULL'], ['UNIQUE KEY uq_flag (tenant_id, flag_key)']),

    table('permissions', ['code varchar(80) NOT NULL', 'module varchar(40) NOT NULL', 'description varchar(200) DEFAULT NULL', 'PRIMARY KEY (code)']),
    tenantTable('role_permissions', ['role varchar(40) NOT NULL', 'permission_code varchar(80) NOT NULL'], ['UNIQUE KEY uq_roleperm (tenant_id, role, permission_code)']),
    tenantTable('user_permission_overrides', ['user_id char(36) NOT NULL', 'permission_code varchar(80) NOT NULL', vs('effect', 5, 'ALLOW')], ['UNIQUE KEY uq_userperm (user_id, permission_code)']),

    table('users', [
      ID, TENANT, 'username varchar(60) NOT NULL', 'email varchar(190) DEFAULT NULL', 'password_hash varchar(100) NOT NULL', 'full_name varchar(150) NOT NULL',
      'phone varchar(30) DEFAULT NULL', 'avatar_url varchar(255) DEFAULT NULL', 'gender char(1) DEFAULT NULL', 'is_active tinyint(1) NOT NULL DEFAULT 1',
      'must_change_password tinyint(1) NOT NULL DEFAULT 1', 'token_version int NOT NULL DEFAULT 0', 'last_login_at timestamp NULL DEFAULT NULL',
      'data_saver tinyint(1) NOT NULL DEFAULT 0', vs('theme', 10, 'system'), TS, SOFT,
      'PRIMARY KEY (id)', 'UNIQUE KEY uq_users_username (username)', 'KEY idx_users_email (email)', 'KEY idx_users_tenant_name (tenant_id, full_name)',
      fk('users_tenant', 'tenant_id', 'tenants'),
    ]),
    tenantTable('user_roles', ['user_id char(36) NOT NULL', 'role varchar(40) NOT NULL'], ['UNIQUE KEY uq_user_role (user_id, role)', 'KEY idx_user_roles_role (tenant_id, role)', fk('user_roles_user', 'user_id', 'users')]),
    table('student_profiles', [
      'user_id char(36) NOT NULL', TENANT, 'nis varchar(30) DEFAULT NULL', 'nisn varchar(20) DEFAULT NULL', 'nik varchar(20) DEFAULT NULL', 'birth_place varchar(100) DEFAULT NULL',
      'birth_date date DEFAULT NULL', 'religion varchar(30) DEFAULT NULL', 'address text', 'provinsi_id int unsigned DEFAULT NULL', 'kota_id int unsigned DEFAULT NULL',
      'entry_year smallint DEFAULT NULL', 'major_id char(36) DEFAULT NULL', vs('status', 20, 'AKTIF'), 'parent_name varchar(150) DEFAULT NULL',
      'parent_phone varchar(30) DEFAULT NULL', 'blood_type varchar(3) DEFAULT NULL', 'notes text', TS,
      'PRIMARY KEY (user_id)', 'KEY idx_sp_tenant_nis (tenant_id, nis)', 'KEY idx_sp_nisn (nisn)', fk('sp_user', 'user_id', 'users'),
    ]),
    table('staff_profiles', [
      'user_id char(36) NOT NULL', TENANT, 'nip varchar(30) DEFAULT NULL', 'nuptk varchar(30) DEFAULT NULL', 'nik varchar(20) DEFAULT NULL', 'position_id char(36) DEFAULT NULL',
      'employment_status varchar(20) DEFAULT NULL', 'join_date date DEFAULT NULL', 'birth_date date DEFAULT NULL', 'birth_place varchar(100) DEFAULT NULL', 'address text',
      'education varchar(80) DEFAULT NULL', 'npwp varchar(30) DEFAULT NULL', 'bank_name varchar(60) DEFAULT NULL', 'bank_account varchar(40) DEFAULT NULL',
      'ptkp_status varchar(10) DEFAULT NULL', 'notes text', TS, 'PRIMARY KEY (user_id)', 'KEY idx_stp_tenant (tenant_id)', fk('stp_user', 'user_id', 'users'),
    ]),
    table('refresh_tokens', [
      ID, 'user_id char(36) NOT NULL', 'token_hash char(64) NOT NULL', 'expires_at datetime NOT NULL', 'revoked_at datetime DEFAULT NULL', 'replaced_by char(36) DEFAULT NULL',
      'user_agent varchar(255) DEFAULT NULL', 'ip varchar(64) DEFAULT NULL', 'created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP',
      'PRIMARY KEY (id)', 'UNIQUE KEY uq_rt_hash (token_hash)', 'KEY idx_rt_user (user_id)', fk('rt_user', 'user_id', 'users'),
    ]),
    table('password_resets', [
      ID, 'user_id char(36) NOT NULL', 'token_hash char(64) NOT NULL', 'expires_at datetime NOT NULL', 'used_at datetime DEFAULT NULL',
      'created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', 'PRIMARY KEY (id)', 'UNIQUE KEY uq_pr_hash (token_hash)', fk('pr_user', 'user_id', 'users'),
    ]),
    tenantTable('invitations', ['email varchar(190) NOT NULL', 'full_name varchar(150) DEFAULT NULL', 'role varchar(40) NOT NULL', 'token_hash char(64) NOT NULL', 'expires_at datetime NOT NULL', 'accepted_at datetime DEFAULT NULL', 'created_by char(36) DEFAULT NULL'], ['UNIQUE KEY uq_inv_hash (token_hash)']),
    table('user_onboarding', ['user_id char(36) NOT NULL', 'steps json DEFAULT NULL', 'completed_at datetime DEFAULT NULL', TS, 'PRIMARY KEY (user_id)', fk('onb_user', 'user_id', 'users')]),
    tenantTable('notifications', ['user_id char(36) NOT NULL', 'type varchar(40) NOT NULL', 'title varchar(200) NOT NULL', 'body text', 'link varchar(255) DEFAULT NULL', 'read_at datetime DEFAULT NULL'], ['KEY idx_notif_user (user_id, read_at, created_at)', fk('notif_user', 'user_id', 'users')]),
    tenantTable('import_batches', ['type varchar(40) NOT NULL', 'file_name varchar(255) DEFAULT NULL', 'total int NOT NULL DEFAULT 0', 'success int NOT NULL DEFAULT 0', 'failed int NOT NULL DEFAULT 0', vs('status', 20, 'DONE'), 'created_by char(36) DEFAULT NULL']),
    table('import_errors', [ID, 'batch_id char(36) NOT NULL', 'row_no int NOT NULL', 'message varchar(500) NOT NULL', 'raw json DEFAULT NULL', 'PRIMARY KEY (id)', 'KEY idx_ie_batch (batch_id)', fk('ie_batch', 'batch_id', 'import_batches')]),

    tenantTable('audit_logs', ['user_id char(36) DEFAULT NULL', 'action varchar(80) NOT NULL', 'entity varchar(60) DEFAULT NULL', 'entity_id varchar(36) DEFAULT NULL', 'before_data json DEFAULT NULL', 'after_data json DEFAULT NULL', 'ip varchar(64) DEFAULT NULL', 'user_agent varchar(255) DEFAULT NULL'], ['KEY idx_audit_tenant_time (tenant_id, created_at)', 'KEY idx_audit_entity (entity, entity_id)', 'KEY idx_audit_user (user_id)']),
    table('jobs', [
      ID, 'tenant_id char(36) DEFAULT NULL', 'type varchar(60) NOT NULL', 'payload json DEFAULT NULL', vs('status', 20, 'PENDING'), 'attempts int NOT NULL DEFAULT 0',
      'max_attempts int NOT NULL DEFAULT 3', 'run_at datetime NOT NULL', 'locked_at datetime DEFAULT NULL', 'finished_at datetime DEFAULT NULL', 'result json DEFAULT NULL', 'error text',
      'created_by char(36) DEFAULT NULL', TS, 'PRIMARY KEY (id)', 'KEY idx_jobs_status (status, run_at)', 'KEY idx_jobs_tenant (tenant_id, type, created_at)',
    ]),
    tenantTable('files', ['uploaded_by char(36) DEFAULT NULL', 'module varchar(40) NOT NULL', 'original_name varchar(255) NOT NULL', 'stored_path varchar(400) NOT NULL', 'mime varchar(120) NOT NULL', 'size int NOT NULL DEFAULT 0', 'is_public tinyint(1) NOT NULL DEFAULT 0'], ['KEY idx_files_module (tenant_id, module)']),
  ],
};
