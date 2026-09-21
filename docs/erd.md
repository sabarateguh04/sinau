# ERD SINAU

Dihasilkan otomatis dari database (`npm run db:snapshot`). 122 tabel, prefix `tbl_sinau_`, PK `char(36)` UUID. Tabel milik lembaga memiliki kolom `tenant_id` → `tenants.id`.

Setiap bagian adalah diagram Mermaid `erDiagram` per domain; relasi antar domain digambarkan melalui kolom FK di daftar kolom.

## Platform & akun

```mermaid
erDiagram
  audit_logs {
    char_36 id PK
    char_36 tenant_id
    char_36 user_id
    varchar_80 action
    varchar_60 entity
    varchar_36 entity_id
    longtext before_data
    longtext after_data
    varchar_64 ip
    varchar_255 user_agent
    timestamp created_at
    timestamp updated_at
  }
  feature_flags {
    char_36 id PK
    char_36 tenant_id
    varchar_80 flag_key
    tinyint_1 enabled
    longtext config
    timestamp created_at
    timestamp updated_at
  }
  files {
    char_36 id PK
    char_36 tenant_id
    char_36 uploaded_by
    varchar_40 module
    varchar_255 original_name
    varchar_400 stored_path
    varchar_120 mime
    int_11 size
    tinyint_1 is_public
    timestamp created_at
    timestamp updated_at
  }
  guardians {
    char_36 id PK
    char_36 tenant_id
    char_36 user_id
    varchar_20 relation
    varchar_100 occupation
    text address
    timestamp created_at
    timestamp updated_at
  }
  guardian_students {
    char_36 id PK
    char_36 tenant_id
    char_36 guardian_user_id
    char_36 student_id
    varchar_20 relation
    tinyint_1 is_primary
    timestamp created_at
    timestamp updated_at
  }
  import_batches {
    char_36 id PK
    char_36 tenant_id
    varchar_40 type
    varchar_255 file_name
    int_11 total
    int_11 success
    int_11 failed
    varchar_20 status
    char_36 created_by
    timestamp created_at
    timestamp updated_at
  }
  import_errors {
    char_36 id PK
    char_36 batch_id FK
    int_11 row_no
    varchar_500 message
    longtext raw
  }
  invitations {
    char_36 id PK
    char_36 tenant_id
    varchar_190 email
    varchar_150 full_name
    varchar_40 role
    char_64 token_hash
    datetime expires_at
    datetime accepted_at
    char_36 created_by
    timestamp created_at
    timestamp updated_at
  }
  jobs {
    char_36 id PK
    char_36 tenant_id
    varchar_60 type
    longtext payload
    varchar_20 status
    int_11 attempts
    int_11 max_attempts
    datetime run_at
    datetime locked_at
    datetime finished_at
    longtext result
    text error
    char_36 created_by
    timestamp created_at
    timestamp updated_at
  }
  kota {
    int_10_unsigned id PK
    int_10_unsigned provinsi_id FK
    varchar_6 kode
    varchar_100 nama
  }
  migrations {
    varchar_120 name PK
    timestamp applied_at
  }
  notifications {
    char_36 id PK
    char_36 tenant_id
    char_36 user_id FK
    varchar_40 type
    varchar_200 title
    text body
    varchar_255 link
    datetime read_at
    timestamp created_at
    timestamp updated_at
  }
  password_resets {
    char_36 id PK
    char_36 user_id FK
    char_64 token_hash
    datetime expires_at
    datetime used_at
    timestamp created_at
  }
  permissions {
    varchar_80 code PK
    varchar_40 module
    varchar_200 description
  }
  provinsi {
    int_10_unsigned id PK
    varchar_4 kode
    varchar_100 nama
  }
  refresh_tokens {
    char_36 id PK
    char_36 user_id FK
    char_64 token_hash
    datetime expires_at
    datetime revoked_at
    char_36 replaced_by
    varchar_255 user_agent
    varchar_64 ip
    timestamp created_at
  }
  role_permissions {
    char_36 id PK
    char_36 tenant_id
    varchar_40 role
    varchar_80 permission_code
    timestamp created_at
    timestamp updated_at
  }
  staff_profiles {
    char_36 user_id PK
    char_36 tenant_id
    varchar_30 nip
    varchar_30 nuptk
    varchar_20 nik
    char_36 position_id
    varchar_20 employment_status
    date join_date
    date birth_date
    varchar_100 birth_place
    text address
    varchar_80 education
    varchar_30 npwp
    varchar_60 bank_name
    varchar_40 bank_account
    varchar_10 ptkp_status
    text notes
    timestamp created_at
    timestamp updated_at
  }
  student_profiles {
    char_36 user_id PK
    char_36 tenant_id
    varchar_30 nis
    varchar_20 nisn
    varchar_20 nik
    varchar_100 birth_place
    date birth_date
    varchar_30 religion
    text address
    int_10_unsigned provinsi_id
    int_10_unsigned kota_id
    smallint_6 entry_year
    char_36 major_id
    varchar_20 status
    varchar_150 parent_name
    varchar_30 parent_phone
    varchar_3 blood_type
    text notes
    timestamp created_at
    timestamp updated_at
  }
  tenants {
    char_36 id PK
    varchar_60 slug
    varchar_200 name
    varchar_20 type
    varchar_20 category
    varchar_20 npsn
    int_10_unsigned provinsi_id
    int_10_unsigned kota_id
    text address
    varchar_30 phone
    varchar_190 email
    varchar_190 website
    varchar_150 principal_name
    tinyint_1 is_active
    timestamp created_at
    timestamp updated_at
    timestamp deleted_at
  }
  tenant_branding {
    char_36 tenant_id PK
    varchar_120 display_name
    varchar_200 tagline
    varchar_255 logo_url
    varchar_255 favicon_url
    varchar_9 primary_color
    varchar_9 accent_color
    varchar_10 theme
    timestamp created_at
    timestamp updated_at
  }
  tenant_settings {
    char_36 tenant_id PK
    tinyint_1 self_registration
    varchar_10 portal_share
    varchar_20 approval_flow
    varchar_40 timezone
    tinyint_1 maintenance
    varchar_255 maintenance_message
    tinyint_1 data_saver_default
    longtext grade_scale
    longtext extra
    timestamp created_at
    timestamp updated_at
  }
  users {
    char_36 id PK
    char_36 tenant_id FK
    varchar_60 username
    varchar_190 email
    varchar_100 password_hash
    varchar_150 full_name
    varchar_30 phone
    varchar_255 avatar_url
    char_1 gender
    tinyint_1 is_active
    tinyint_1 must_change_password
    int_11 token_version
    timestamp last_login_at
    tinyint_1 data_saver
    varchar_10 theme
    timestamp created_at
    timestamp updated_at
    timestamp deleted_at
  }
  user_onboarding {
    char_36 user_id PK
    longtext steps
    datetime completed_at
    timestamp created_at
    timestamp updated_at
  }
  user_permission_overrides {
    char_36 id PK
    char_36 tenant_id
    char_36 user_id
    varchar_80 permission_code
    varchar_5 effect
    timestamp created_at
    timestamp updated_at
  }
  user_roles {
    char_36 id PK
    char_36 tenant_id
    char_36 user_id FK
    varchar_40 role
    timestamp created_at
    timestamp updated_at
  }
  users ||--o{ guardians : "user_id"
  import_batches ||--o{ import_errors : "batch_id"
  provinsi ||--o{ kota : "provinsi_id"
  users ||--o{ notifications : "user_id"
  users ||--o{ password_resets : "user_id"
  users ||--o{ refresh_tokens : "user_id"
  users ||--o{ staff_profiles : "user_id"
  users ||--o{ student_profiles : "user_id"
  tenants ||--o{ tenant_branding : "tenant_id"
  tenants ||--o{ tenant_settings : "tenant_id"
  tenants ||--o{ users : "tenant_id"
  users ||--o{ user_onboarding : "user_id"
  users ||--o{ user_roles : "user_id"
```

## Akademik

```mermaid
erDiagram
  academic_calendar {
    char_36 id PK
    char_36 tenant_id
    char_36 academic_year_id
    varchar_200 title
    date start_date
    date end_date
    varchar_20 type
    text description
    tinyint_1 is_holiday
    timestamp created_at
    timestamp updated_at
  }
  academic_years {
    char_36 id PK
    char_36 tenant_id
    varchar_20 name
    date start_date
    date end_date
    tinyint_1 is_active
    tinyint_4 active_semester
    timestamp created_at
    timestamp updated_at
  }
  alumni {
    char_36 id PK
    char_36 tenant_id
    char_36 user_id
    smallint_6 graduation_year
    varchar_60 last_class
    varchar_120 major_name
    varchar_20 continuing
    varchar_200 institution
    varchar_30 phone
    varchar_190 email
    text notes
    timestamp created_at
    timestamp updated_at
  }
  classes {
    char_36 id PK
    char_36 tenant_id
    char_36 academic_year_id FK
    varchar_60 name
    tinyint_4 grade_level
    char_36 major_id
    char_36 homeroom_teacher_id
    char_36 room_id
    smallint_6 capacity
    tinyint_1 is_active
    timestamp created_at
    timestamp updated_at
  }
  class_students {
    char_36 id PK
    char_36 tenant_id
    char_36 class_id FK
    char_36 student_id FK
    varchar_20 status
    date joined_at
    date left_at
    timestamp created_at
    timestamp updated_at
  }
  class_subjects {
    char_36 id PK
    char_36 tenant_id
    char_36 class_id FK
    char_36 subject_id FK
    char_36 teacher_id
    tinyint_4 semester
    timestamp created_at
    timestamp updated_at
  }
  concepts {
    char_36 id PK
    char_36 tenant_id
    char_36 subject_id
    varchar_40 code
    varchar_150 name
    text description
    char_36 parent_id
    tinyint_4 grade_level
    timestamp created_at
    timestamp updated_at
  }
  curriculum_refs {
    char_36 id PK
    char_36 tenant_id
    char_36 subject_id FK
    tinyint_4 grade_level
    varchar_10 type
    varchar_40 code
    text description
    char_36 parent_id
    int_11 order_no
    timestamp created_at
    timestamp updated_at
  }
  majors {
    char_36 id PK
    char_36 tenant_id
    varchar_20 code
    varchar_120 name
    text description
    char_36 head_user_id
    tinyint_1 is_active
    timestamp created_at
    timestamp updated_at
  }
  rollover_items {
    char_36 id PK
    char_36 run_id FK
    varchar_30 kind
    char_36 source_id
    char_36 target_id
    varchar_30 action
    varchar_20 status
    longtext detail
  }
  rollover_runs {
    char_36 id PK
    char_36 tenant_id
    char_36 from_year_id
    char_36 to_year_id
    varchar_20 status
    longtext plan
    longtext checks
    longtext result
    char_36 created_by
    datetime executed_at
    datetime rolled_back_at
    timestamp created_at
    timestamp updated_at
  }
  rooms {
    char_36 id PK
    char_36 tenant_id
    varchar_20 code
    varchar_120 name
    smallint_6 capacity
    varchar_20 type
    tinyint_1 is_active
    timestamp created_at
    timestamp updated_at
  }
  schedule_entries {
    char_36 id PK
    char_36 tenant_id
    char_36 class_subject_id FK
    tinyint_4 day_of_week
    time start_time
    time end_time
    char_36 room_id
    timestamp created_at
    timestamp updated_at
  }
  subjects {
    char_36 id PK
    char_36 tenant_id
    varchar_20 code
    varchar_120 name
    varchar_30 category
    tinyint_1 is_competency
    smallint_6 hours_per_week
    tinyint_1 is_active
    timestamp created_at
    timestamp updated_at
  }
  academic_years ||--o{ classes : "academic_year_id"
  classes ||--o{ class_students : "class_id"
  classes ||--o{ class_subjects : "class_id"
  subjects ||--o{ class_subjects : "subject_id"
  subjects ||--o{ curriculum_refs : "subject_id"
  rollover_runs ||--o{ rollover_items : "run_id"
  class_subjects ||--o{ schedule_entries : "class_subject_id"
```

## LMS

```mermaid
erDiagram
  assignments {
    char_36 id PK
    char_36 tenant_id
    char_36 class_subject_id FK
    varchar_200 title
    text instructions
    char_36 attachment_file_id
    datetime due_at
    tinyint_1 allow_late
    decimal_62 max_score
    varchar_20 status
    varchar_10 submission_type
    char_36 created_by
    timestamp created_at
    timestamp updated_at
  }
  grades {
    char_36 id PK
    char_36 tenant_id
    char_36 class_subject_id FK
    char_36 student_id
    varchar_20 component_code
    varchar_20 source_type
    char_36 source_id
    varchar_200 title
    decimal_62 score
    decimal_62 max_score
    varchar_255 note
    char_36 graded_by
    datetime graded_at
    timestamp created_at
    timestamp updated_at
  }
  grade_components {
    char_36 id PK
    char_36 tenant_id
    char_36 subject_id
    varchar_20 code
    varchar_60 name
    decimal_52 weight
    int_11 order_no
    timestamp created_at
    timestamp updated_at
  }
  materials {
    char_36 id PK
    char_36 tenant_id
    char_36 class_subject_id
    char_36 subject_id
    char_36 major_id
    tinyint_4 grade_level
    varchar_200 title
    text description
    varchar_10 type
    varchar_500 content_url
    mediumtext content_text
    char_36 file_id
    tinyint_1 is_published
    datetime published_at
    tinyint_1 is_public
    int_11 view_count
    char_36 created_by
    timestamp created_at
    timestamp updated_at
  }
  material_views {
    char_36 id PK
    char_36 tenant_id
    char_36 material_id FK
    char_36 user_id
    datetime first_viewed_at
    datetime last_viewed_at
    int_11 view_count
    tinyint_4 progress
    timestamp created_at
    timestamp updated_at
  }
  questions {
    char_36 id PK
    char_36 tenant_id
    char_36 subject_id
    char_36 concept_id
    varchar_10 type
    mediumtext text
    longtext options
    longtext answer_key
    text explanation
    varchar_10 difficulty
    decimal_52 points
    longtext tags
    tinyint_4 grade_level
    char_36 image_file_id
    tinyint_1 is_active
    int_11 usage_count
    char_36 created_by
    timestamp created_at
    timestamp updated_at
  }
  quizzes {
    char_36 id PK
    char_36 tenant_id
    char_36 class_subject_id FK
    varchar_200 title
    text description
    smallint_6 duration_min
    datetime open_at
    datetime close_at
    tinyint_1 shuffle_questions
    tinyint_1 shuffle_options
    tinyint_4 max_attempts
    varchar_15 show_result
    varchar_20 status
    varchar_20 grade_component
    char_36 created_by
    timestamp created_at
    timestamp updated_at
  }
  quiz_answers {
    char_36 id PK
    char_36 attempt_id FK
    char_36 question_id
    longtext answer
    tinyint_1 is_correct
    decimal_62 score
    char_36 graded_by
    datetime answered_at
  }
  quiz_attempts {
    char_36 id PK
    char_36 tenant_id
    char_36 quiz_id FK
    char_36 student_id
    tinyint_4 attempt_no
    datetime started_at
    datetime deadline_at
    datetime submitted_at
    varchar_20 status
    decimal_62 score
    decimal_62 max_score
    longtext question_order
    timestamp created_at
    timestamp updated_at
  }
  quiz_questions {
    char_36 id PK
    char_36 quiz_id FK
    char_36 question_id FK
    int_11 order_no
    decimal_52 points
  }
  submissions {
    char_36 id PK
    char_36 tenant_id
    char_36 assignment_id FK
    char_36 student_id
    text content
    char_36 attachment_file_id
    datetime submitted_at
    tinyint_1 is_late
    varchar_20 status
    decimal_62 score
    text feedback
    char_36 graded_by
    datetime graded_at
    timestamp created_at
    timestamp updated_at
  }
  materials ||--o{ material_views : "material_id"
  quiz_attempts ||--o{ quiz_answers : "attempt_id"
  quizzes ||--o{ quiz_attempts : "quiz_id"
  questions ||--o{ quiz_questions : "question_id"
  quizzes ||--o{ quiz_questions : "quiz_id"
  assignments ||--o{ submissions : "assignment_id"
```

## Presensi

```mermaid
erDiagram
  attendance_daily {
    char_36 id PK
    char_36 tenant_id
    char_36 class_id FK
    char_36 student_id
    date date
    varchar_2 status
    varchar_255 note
    char_36 recorded_by
    timestamp created_at
    timestamp updated_at
  }
  attendance_qr_tokens {
    char_36 id PK
    char_36 session_id FK
    char_64 token_hash
    datetime expires_at
    char_36 used_by
    datetime used_at
  }
  attendance_records {
    char_36 id PK
    char_36 tenant_id
    char_36 session_id FK
    char_36 student_id
    varchar_2 status
    datetime checked_at
    varchar_10 method
    decimal_107 lat
    decimal_107 lng
    varchar_255 note
    char_36 recorded_by
    timestamp created_at
    timestamp updated_at
  }
  attendance_sessions {
    char_36 id PK
    char_36 tenant_id
    char_36 class_subject_id FK
    date date
    smallint_6 meeting_no
    varchar_200 topic
    varchar_10 method
    char_64 qr_secret
    decimal_107 geo_lat
    decimal_107 geo_lng
    int_11 geo_radius_m
    datetime opened_at
    datetime closed_at
    char_36 created_by
    timestamp created_at
    timestamp updated_at
  }
  permits {
    char_36 id PK
    char_36 tenant_id
    char_36 student_id
    varchar_10 type
    date date_from
    date date_to
    text reason
    char_36 attachment_file_id
    varchar_20 status
    char_36 reviewed_by
    datetime reviewed_at
    varchar_255 review_note
    char_36 submitted_by
    timestamp created_at
    timestamp updated_at
  }
  staff_attendance {
    char_36 id PK
    char_36 tenant_id
    char_36 user_id
    date date
    time check_in
    time check_out
    varchar_10 status
    varchar_255 note
    char_36 recorded_by
    timestamp created_at
    timestamp updated_at
  }
  attendance_sessions ||--o{ attendance_qr_tokens : "session_id"
  attendance_sessions ||--o{ attendance_records : "session_id"
```

## Ujian & Rapor

```mermaid
erDiagram
  exams {
    char_36 id PK
    char_36 tenant_id
    char_36 package_id FK
    char_36 subject_id
    varchar_200 title
    varchar_10 type
    char_36 academic_year_id
    tinyint_4 semester
    smallint_6 duration_min
    tinyint_1 shuffle_questions
    tinyint_1 shuffle_options
    decimal_52 passing_score
    varchar_15 show_result
    tinyint_1 lock_screen
    tinyint_4 max_violations
    varchar_20 grade_component
    varchar_20 status
    char_36 created_by
    timestamp created_at
    timestamp updated_at
  }
  exam_answers {
    char_36 id PK
    char_36 attempt_id FK
    char_36 question_id
    longtext answer
    tinyint_1 is_correct
    decimal_62 score
    char_36 graded_by
    int_11 seq
    datetime answered_at
  }
  exam_answer_logs {
    char_36 id PK
    char_36 attempt_id FK
    char_36 question_id
    longtext answer
    varchar_20 event
    int_11 seq
    timestamp created_at
  }
  exam_attempts {
    char_36 id PK
    char_36 tenant_id
    char_36 session_id FK
    char_36 student_id
    datetime started_at
    datetime deadline_at
    datetime submitted_at
    varchar_20 status
    varchar_20 submit_reason
    decimal_62 score
    decimal_62 max_score
    longtext question_order
    smallint_6 violations
    datetime last_saved_at
    varchar_64 ip
    varchar_255 user_agent
    timestamp created_at
    timestamp updated_at
  }
  exam_packages {
    char_36 id PK
    char_36 tenant_id
    char_36 subject_id
    tinyint_4 grade_level
    varchar_200 title
    text description
    decimal_72 total_points
    varchar_20 status
    char_36 created_by
    timestamp created_at
    timestamp updated_at
  }
  exam_package_questions {
    char_36 id PK
    char_36 package_id FK
    char_36 question_id FK
    int_11 order_no
    decimal_52 points
  }
  exam_sessions {
    char_36 id PK
    char_36 tenant_id
    char_36 exam_id FK
    char_36 class_id FK
    char_36 class_subject_id
    datetime start_at
    datetime end_at
    varchar_12 token
    char_36 proctor_id
    char_36 room_id
    varchar_20 status
    varchar_255 note
    timestamp created_at
    timestamp updated_at
  }
  report_cards {
    char_36 id PK
    char_36 tenant_id
    char_36 academic_year_id
    tinyint_4 semester
    char_36 class_id
    char_36 student_id
    varchar_20 status
    text homeroom_note
    smallint_6 attendance_sick
    smallint_6 attendance_permit
    smallint_6 attendance_absent
    longtext extracurricular
    longtext achievements
    decimal_62 average
    smallint_6 rank_in_class
    tinyint_1 promoted
    datetime generated_at
    char_36 approved_by
    datetime approved_at
    char_36 pdf_file_id
    timestamp created_at
    timestamp updated_at
  }
  report_card_p5 {
    char_36 id PK
    char_36 report_card_id FK
    varchar_200 project_title
    varchar_150 theme
    longtext dimensions
    text note
  }
  report_card_settings {
    char_36 id PK
    char_36 tenant_id
    char_36 academic_year_id
    decimal_52 kkm
    longtext predicate_scale
    varchar_150 signature_principal
    varchar_100 signature_city
    longtext template
    timestamp created_at
    timestamp updated_at
  }
  report_card_subjects {
    char_36 id PK
    char_36 report_card_id FK
    char_36 subject_id
    varchar_120 subject_name
    varchar_30 category
    decimal_62 final_score
    varchar_2 predicate
    text description
    longtext components
    int_11 order_no
  }
  exam_packages ||--o{ exams : "package_id"
  exam_attempts ||--o{ exam_answers : "attempt_id"
  exam_attempts ||--o{ exam_answer_logs : "attempt_id"
  exam_sessions ||--o{ exam_attempts : "session_id"
  exam_packages ||--o{ exam_package_questions : "package_id"
  exams ||--o{ exam_sessions : "exam_id"
  report_cards ||--o{ report_card_p5 : "report_card_id"
  report_cards ||--o{ report_card_subjects : "report_card_id"
```

## Kesiswaan

```mermaid
erDiagram
  achievements {
    char_36 id PK
    char_36 tenant_id
    char_36 student_id
    varchar_200 title
    varchar_20 level
    varchar_40 rank_label
    varchar_200 organizer
    date achieved_at
    char_36 certificate_file_id
    tinyint_1 is_public
    timestamp created_at
    timestamp updated_at
  }
  counseling_notes {
    char_36 id PK
    char_36 tenant_id
    char_36 student_id
    char_36 counselor_id
    date session_date
    varchar_30 category
    text summary
    text follow_up
    tinyint_1 is_confidential
    timestamp created_at
    timestamp updated_at
  }
  discipline_records {
    char_36 id PK
    char_36 tenant_id
    char_36 student_id
    char_36 rule_id
    date incident_date
    smallint_6 points
    text description
    text action_taken
    char_36 recorded_by
    tinyint_1 parent_notified
    timestamp created_at
    timestamp updated_at
  }
  discipline_rules {
    char_36 id PK
    char_36 tenant_id
    varchar_20 code
    varchar_150 name
    varchar_12 kind
    smallint_6 points
    text description
    tinyint_1 is_active
    timestamp created_at
    timestamp updated_at
  }
  extracurriculars {
    char_36 id PK
    char_36 tenant_id
    varchar_20 code
    varchar_120 name
    text description
    char_36 coach_id
    varchar_200 schedule_text
    smallint_6 quota
    tinyint_1 is_active
    timestamp created_at
    timestamp updated_at
  }
  extracurricular_members {
    char_36 id PK
    char_36 tenant_id
    char_36 extracurricular_id FK
    char_36 student_id
    char_36 academic_year_id
    varchar_20 status
    varchar_2 score
    varchar_255 note
    timestamp created_at
    timestamp updated_at
  }
  letter_templates {
    char_36 id PK
    char_36 tenant_id
    varchar_30 code
    varchar_120 name
    mediumtext body_template
    varchar_80 number_format
    tinyint_1 is_active
    timestamp created_at
    timestamp updated_at
  }
  official_letters {
    char_36 id PK
    char_36 tenant_id
    char_36 template_id
    varchar_80 number
    varchar_200 subject
    varchar_200 recipient
    mediumtext body
    date letter_date
    varchar_20 status
    char_36 signed_by
    char_36 pdf_file_id
    char_36 created_by
    timestamp created_at
    timestamp updated_at
  }
  extracurriculars ||--o{ extracurricular_members : "extracurricular_id"
```

## Keuangan & Payroll

```mermaid
erDiagram
  cash_flows {
    char_36 id PK
    char_36 tenant_id
    date tx_date
    varchar_3 direction
    varchar_60 category
    decimal_152 amount
    varchar_255 description
    varchar_30 reference_type
    char_36 reference_id
    char_36 created_by
    timestamp created_at
    timestamp updated_at
  }
  fee_types {
    char_36 id PK
    char_36 tenant_id
    varchar_20 code
    varchar_120 name
    decimal_152 default_amount
    varchar_10 period
    tinyint_1 is_active
    timestamp created_at
    timestamp updated_at
  }
  invoices {
    char_36 id PK
    char_36 tenant_id
    varchar_40 number
    char_36 student_id
    char_36 academic_year_id
    char_36 fee_type_id
    varchar_200 title
    varchar_7 period
    decimal_152 amount
    decimal_152 discount
    decimal_152 late_fee
    decimal_152 paid
    date due_date
    varchar_20 status
    varchar_255 note
    char_36 created_by
    timestamp created_at
    timestamp updated_at
  }
  job_positions {
    char_36 id PK
    char_36 tenant_id
    varchar_20 code
    varchar_120 name
    decimal_152 base_salary
    tinyint_1 is_active
    timestamp created_at
    timestamp updated_at
  }
  late_fee_rules {
    char_36 id PK
    char_36 tenant_id
    char_36 fee_type_id
    smallint_6 grace_days
    varchar_10 mode
    decimal_152 amount
    decimal_152 max_amount
    tinyint_1 is_active
    timestamp created_at
    timestamp updated_at
  }
  payments {
    char_36 id PK
    char_36 tenant_id
    varchar_40 number
    char_36 student_id
    decimal_152 amount
    varchar_20 method
    varchar_100 reference
    datetime paid_at
    char_36 received_by
    varchar_255 note
    varchar_20 status
    char_36 proof_file_id
    timestamp created_at
    timestamp updated_at
  }
  payment_allocations {
    char_36 id PK
    char_36 payment_id FK
    char_36 invoice_id FK
    decimal_152 amount
  }
  payroll_components {
    char_36 id PK
    char_36 tenant_id
    varchar_20 code
    varchar_120 name
    varchar_10 kind
    varchar_10 calc
    decimal_152 default_amount
    tinyint_1 taxable
    int_11 order_no
    tinyint_1 is_active
    timestamp created_at
    timestamp updated_at
  }
  payroll_period_configs {
    char_36 id PK
    char_36 tenant_id
    tinyint_4 pay_day
    decimal_52 bpjs_kes_employee
    decimal_52 bpjs_kes_employer
    decimal_52 bpjs_tk_jht_employee
    decimal_52 bpjs_tk_jht_employer
    decimal_52 bpjs_tk_jp_employee
    decimal_52 bpjs_tk_jp_employer
    decimal_52 bpjs_tk_jkk
    decimal_52 bpjs_tk_jkm
    decimal_152 bpjs_kes_cap
    tinyint_1 apply_pph21
    timestamp created_at
    timestamp updated_at
  }
  payroll_runs {
    char_36 id PK
    char_36 tenant_id
    varchar_7 period
    varchar_20 status
    decimal_152 total_gross
    decimal_152 total_net
    int_11 employee_count
    char_36 validated_by
    char_36 finance_approved_by
    char_36 principal_approved_by
    datetime paid_at
    varchar_255 note
    char_36 created_by
    timestamp created_at
    timestamp updated_at
  }
  payroll_run_items {
    char_36 id PK
    char_36 run_id FK
    char_36 user_id
    decimal_152 gross
    decimal_152 deductions
    decimal_152 bpjs_employee
    decimal_152 bpjs_employer
    decimal_152 pph21
    decimal_152 net
    longtext detail_lines
    smallint_6 attendance_days
  }
  payslips {
    char_36 id PK
    char_36 tenant_id
    char_36 run_item_id
    char_36 user_id
    varchar_7 period
    char_36 pdf_file_id
    datetime issued_at
    datetime viewed_at
    timestamp created_at
    timestamp updated_at
  }
  reconciliation_batches {
    char_36 id PK
    char_36 tenant_id
    varchar_255 file_name
    varchar_60 bank_name
    int_11 total_rows
    int_11 matched
    int_11 unmatched
    varchar_20 status
    char_36 created_by
    timestamp created_at
    timestamp updated_at
  }
  reconciliation_items {
    char_36 id PK
    char_36 batch_id FK
    date tx_date
    varchar_255 description
    decimal_152 amount
    varchar_100 reference
    char_36 payment_id
    varchar_20 status
  }
  refunds {
    char_36 id PK
    char_36 tenant_id
    char_36 payment_id
    char_36 student_id
    decimal_152 amount
    text reason
    varchar_20 status
    char_36 approved_by
    datetime approved_at
    datetime paid_at
    char_36 created_by
    timestamp created_at
    timestamp updated_at
  }
  salary_structures {
    char_36 id PK
    char_36 tenant_id
    char_36 user_id
    char_36 component_id FK
    decimal_152 amount
    date effective_from
    timestamp created_at
    timestamp updated_at
  }
  invoices ||--o{ payment_allocations : "invoice_id"
  payments ||--o{ payment_allocations : "payment_id"
  payroll_runs ||--o{ payroll_run_items : "run_id"
  reconciliation_batches ||--o{ reconciliation_items : "batch_id"
  payroll_components ||--o{ salary_structures : "component_id"
```

## Sarana & Perpustakaan

```mermaid
erDiagram
  assets {
    char_36 id PK
    char_36 tenant_id
    varchar_30 code
    varchar_150 name
    varchar_40 category
    varchar_120 location
    char_36 room_id
    date purchase_date
    decimal_152 purchase_price
    smallint_6 useful_life_years
    decimal_152 salvage_value
    varchar_20 condition_status
    varchar_20 status
    int_11 quantity
    char_36 custodian_id
    text notes
    char_36 photo_file_id
    timestamp created_at
    timestamp updated_at
  }
  asset_audits {
    char_36 id PK
    char_36 tenant_id
    varchar_150 title
    date audit_date
    varchar_20 status
    longtext items
    longtext summary
    char_36 created_by
    datetime closed_at
    timestamp created_at
    timestamp updated_at
  }
  asset_bookings {
    char_36 id PK
    char_36 tenant_id
    char_36 asset_id FK
    char_36 booked_by
    datetime start_at
    datetime end_at
    varchar_255 purpose
    varchar_20 status
    char_36 approved_by
    datetime returned_at
    varchar_20 return_condition
    timestamp created_at
    timestamp updated_at
  }
  asset_maintenance {
    char_36 id PK
    char_36 tenant_id
    char_36 asset_id FK
    date scheduled_date
    date done_date
    varchar_20 type
    text description
    decimal_152 cost
    varchar_150 vendor
    varchar_20 status
    char_36 created_by
    timestamp created_at
    timestamp updated_at
  }
  library_books {
    char_36 id PK
    char_36 tenant_id
    varchar_20 isbn
    varchar_30 code
    varchar_200 title
    varchar_150 author
    varchar_150 publisher
    smallint_6 year
    varchar_60 category
    int_11 stock
    int_11 available
    varchar_30 shelf
    char_36 cover_file_id
    timestamp created_at
    timestamp updated_at
  }
  library_loans {
    char_36 id PK
    char_36 tenant_id
    char_36 book_id FK
    char_36 borrower_id
    date borrowed_at
    date due_at
    date returned_at
    varchar_20 status
    decimal_152 fine
    char_36 handled_by
    timestamp created_at
    timestamp updated_at
  }
  assets ||--o{ asset_bookings : "asset_id"
  assets ||--o{ asset_maintenance : "asset_id"
  library_books ||--o{ library_loans : "book_id"
```

## PPDB

```mermaid
erDiagram
  ppdb_applicants {
    char_36 id PK
    char_36 tenant_id
    char_36 period_id FK
    varchar_30 registration_no
    char_36 user_id
    varchar_150 full_name
    varchar_20 nisn
    varchar_20 nik
    char_1 gender
    varchar_100 birth_place
    date birth_date
    varchar_200 origin_school
    text address
    varchar_30 phone
    varchar_190 email
    varchar_150 parent_name
    varchar_30 parent_phone
    char_36 major_choice_1
    char_36 major_choice_2
    varchar_30 path
    char_64 access_token
    varchar_20 status
    decimal_62 score
    char_36 verified_by
    datetime verified_at
    varchar_255 verification_note
    char_36 accepted_major_id
    char_36 enrolled_user_id
    char_36 enrolled_class_id
    timestamp created_at
    timestamp updated_at
  }
  ppdb_documents {
    char_36 id PK
    char_36 applicant_id FK
    varchar_40 doc_type
    char_36 file_id
    varchar_20 status
    varchar_255 note
    timestamp created_at
  }
  ppdb_periods {
    char_36 id PK
    char_36 tenant_id
    varchar_120 name
    char_36 academic_year_id
    datetime open_at
    datetime close_at
    int_11 quota
    longtext requirements
    longtext paths
    tinyint_1 is_active
    text announcement
    timestamp created_at
    timestamp updated_at
  }
  ppdb_periods ||--o{ ppdb_applicants : "period_id"
  ppdb_applicants ||--o{ ppdb_documents : "applicant_id"
```

## SMK

```mermaid
erDiagram
  competency_results {
    char_36 id PK
    char_36 tenant_id
    char_36 test_id FK
    char_36 student_id
    longtext scores
    decimal_62 total_score
    varchar_20 verdict
    text examiner_note
    char_36 assessed_by
    datetime assessed_at
    char_36 certificate_file_id
    timestamp created_at
    timestamp updated_at
  }
  competency_rubrics {
    char_36 id PK
    char_36 tenant_id
    char_36 scheme_id FK
    varchar_30 code
    varchar_255 criteria
    decimal_52 max_score
    decimal_52 weight
    int_11 order_no
    timestamp created_at
    timestamp updated_at
  }
  competency_schemes {
    char_36 id PK
    char_36 tenant_id
    varchar_30 code
    varchar_200 name
    char_36 major_id
    text description
    longtext units
    tinyint_1 is_active
    timestamp created_at
    timestamp updated_at
  }
  competency_tests {
    char_36 id PK
    char_36 tenant_id
    char_36 scheme_id FK
    varchar_200 title
    date test_date
    varchar_150 location
    char_36 external_examiner_id
    char_36 internal_examiner_id
    varchar_20 status
    varchar_255 note
    timestamp created_at
    timestamp updated_at
  }
  industry_mentors {
    char_36 id PK
    char_36 tenant_id
    char_36 partner_id FK
    char_36 user_id
    varchar_150 name
    varchar_100 position
    varchar_30 phone
    varchar_190 email
    timestamp created_at
    timestamp updated_at
  }
  industry_partners {
    char_36 id PK
    char_36 tenant_id
    varchar_200 name
    varchar_100 sector
    text address
    varchar_100 city
    varchar_150 contact_name
    varchar_30 contact_phone
    varchar_190 contact_email
    varchar_80 mou_number
    date mou_until
    smallint_6 quota
    tinyint_1 is_active
    timestamp created_at
    timestamp updated_at
  }
  internships {
    char_36 id PK
    char_36 tenant_id
    char_36 student_id
    char_36 partner_id
    char_36 mentor_id
    char_36 school_supervisor_id
    char_36 academic_year_id
    date start_date
    date end_date
    varchar_20 status
    decimal_52 final_score
    text mentor_feedback
    char_36 certificate_file_id
    timestamp created_at
    timestamp updated_at
  }
  internship_journals {
    char_36 id PK
    char_36 tenant_id
    char_36 internship_id FK
    date journal_date
    text activity
    decimal_41 hours
    char_36 photo_file_id
    varchar_20 status
    char_36 verified_by
    datetime verified_at
    varchar_255 mentor_note
    timestamp created_at
    timestamp updated_at
  }
  competency_tests ||--o{ competency_results : "test_id"
  competency_schemes ||--o{ competency_rubrics : "scheme_id"
  competency_schemes ||--o{ competency_tests : "scheme_id"
  industry_partners ||--o{ industry_mentors : "partner_id"
  internships ||--o{ internship_journals : "internship_id"
```

## Kepatuhan (PDP/Dapodik)

```mermaid
erDiagram
  consents {
    char_36 id PK
    char_36 tenant_id
    char_36 user_id
    varchar_80 purpose
    tinyint_1 granted
    datetime granted_at
    datetime revoked_at
    varchar_64 ip
    timestamp created_at
    timestamp updated_at
  }
  pdp_requests {
    char_36 id PK
    char_36 tenant_id
    char_36 user_id
    varchar_20 type
    text reason
    varchar_20 status
    char_36 reviewed_by
    datetime reviewed_at
    varchar_255 review_note
    datetime executed_at
    timestamp created_at
    timestamp updated_at
  }
  retention_policies {
    char_36 id PK
    char_36 tenant_id
    varchar_60 entity
    smallint_6 retention_months
    varchar_20 action
    tinyint_1 is_active
    datetime last_run_at
    timestamp created_at
    timestamp updated_at
  }
```

## Komunikasi & Landing

```mermaid
erDiagram
  announcements {
    char_36 id PK
    char_36 tenant_id
    varchar_200 title
    text body
    varchar_10 audience
    varchar_40 audience_role
    char_36 class_id
    tinyint_1 is_pinned
    datetime publish_at
    datetime expires_at
    char_36 attachment_file_id
    char_36 created_by
    timestamp created_at
    timestamp updated_at
  }
  contact_messages {
    char_36 id PK
    char_36 tenant_id
    varchar_150 name
    varchar_190 email
    varchar_30 phone
    varchar_200 subject
    text message
    varchar_20 status
    varchar_64 ip
    timestamp created_at
    timestamp updated_at
  }
  dashboard_configs {
    char_36 id PK
    char_36 tenant_id
    varchar_40 role
    longtext widgets
    timestamp created_at
    timestamp updated_at
  }
  facilities {
    char_36 id PK
    char_36 tenant_id
    varchar_150 name
    text description
    char_36 photo_file_id
    tinyint_1 is_published
    int_11 order_no
    timestamp created_at
    timestamp updated_at
  }
  faqs {
    char_36 id PK
    char_36 tenant_id
    varchar_300 question
    text answer
    varchar_60 category
    tinyint_1 is_published
    int_11 order_no
    timestamp created_at
    timestamp updated_at
  }
  gallery_items {
    char_36 id PK
    char_36 tenant_id
    varchar_150 title
    char_36 file_id
    varchar_100 album
    tinyint_1 is_published
    int_11 order_no
    timestamp created_at
    timestamp updated_at
  }
  landing_pages {
    char_36 id PK
    char_36 tenant_id
    varchar_40 slug
    varchar_150 title
    varchar_200 hero_title
    varchar_300 hero_subtitle
    char_36 hero_image_file_id
    longtext sections
    varchar_300 seo_description
    tinyint_1 is_published
    int_11 order_no
    timestamp created_at
    timestamp updated_at
  }
  module_portal_shares {
    char_36 id PK
    char_36 tenant_id
    char_36 material_id
    char_36 shared_by
    tinyint_1 is_featured
    timestamp created_at
    timestamp updated_at
  }
  news_articles {
    char_36 id PK
    char_36 tenant_id
    varchar_120 slug
    varchar_200 title
    varchar_400 excerpt
    mediumtext body
    char_36 cover_file_id
    varchar_40 category
    tinyint_1 is_published
    datetime published_at
    char_36 author_id
    int_11 view_count
    timestamp created_at
    timestamp updated_at
  }
  testimonials {
    char_36 id PK
    char_36 tenant_id
    varchar_150 name
    varchar_100 role_label
    text quote
    char_36 photo_file_id
    tinyint_1 is_published
    int_11 order_no
    timestamp created_at
    timestamp updated_at
  }
```

## Relasi lintas domain

| Tabel | Kolom | Merujuk |
|---|---|---|
| assignments | class_subject_id | class_subjects.id |
| attendance_daily | class_id | classes.id |
| attendance_sessions | class_subject_id | class_subjects.id |
| class_students | student_id | users.id |
| exam_package_questions | question_id | questions.id |
| exam_sessions | class_id | classes.id |
| grades | class_subject_id | class_subjects.id |
| quizzes | class_subject_id | class_subjects.id |
