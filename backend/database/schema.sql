-- SINAU schema snapshot (122 tables) — generated 2026-09-21T00:44:06.956Z
-- Source of truth: backend/src/database/migrations/*.ts (run: npm run db:migrate). This file is documentation only.

CREATE TABLE `tbl_sinau_academic_calendar` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `academic_year_id` char(36) DEFAULT NULL,
  `title` varchar(200) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `type` varchar(20) NOT NULL DEFAULT 'KEGIATAN',
  `description` text DEFAULT NULL,
  `is_holiday` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_academic_calendar_tenant` (`tenant_id`),
  KEY `idx_cal_dates` (`tenant_id`,`start_date`,`end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_academic_years` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `name` varchar(20) NOT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 0,
  `active_semester` tinyint(4) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ay` (`tenant_id`,`name`),
  KEY `idx_academic_years_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_achievements` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `title` varchar(200) NOT NULL,
  `level` varchar(20) NOT NULL DEFAULT 'SEKOLAH',
  `rank_label` varchar(40) DEFAULT NULL,
  `organizer` varchar(200) DEFAULT NULL,
  `achieved_at` date DEFAULT NULL,
  `certificate_file_id` char(36) DEFAULT NULL,
  `is_public` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_achievements_tenant` (`tenant_id`),
  KEY `idx_ach_student` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_alumni` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `graduation_year` smallint(6) NOT NULL,
  `last_class` varchar(60) DEFAULT NULL,
  `major_name` varchar(120) DEFAULT NULL,
  `continuing` varchar(20) NOT NULL DEFAULT 'LAINNYA',
  `institution` varchar(200) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `email` varchar(190) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_alumni_user` (`user_id`),
  KEY `idx_alumni_tenant` (`tenant_id`),
  KEY `idx_alumni_year` (`tenant_id`,`graduation_year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_announcements` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `title` varchar(200) NOT NULL,
  `body` text NOT NULL,
  `audience` varchar(10) NOT NULL DEFAULT 'ALL',
  `audience_role` varchar(40) DEFAULT NULL,
  `class_id` char(36) DEFAULT NULL,
  `is_pinned` tinyint(1) NOT NULL DEFAULT 0,
  `publish_at` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `attachment_file_id` char(36) DEFAULT NULL,
  `created_by` char(36) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_announcements_tenant` (`tenant_id`),
  KEY `idx_ann_pub` (`tenant_id`,`publish_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_assets` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `code` varchar(30) NOT NULL,
  `name` varchar(150) NOT NULL,
  `category` varchar(40) NOT NULL DEFAULT 'ELEKTRONIK',
  `location` varchar(120) DEFAULT NULL,
  `room_id` char(36) DEFAULT NULL,
  `purchase_date` date DEFAULT NULL,
  `purchase_price` decimal(15,2) NOT NULL DEFAULT 0.00,
  `useful_life_years` smallint(6) NOT NULL DEFAULT 5,
  `salvage_value` decimal(15,2) NOT NULL DEFAULT 0.00,
  `condition_status` varchar(20) NOT NULL DEFAULT 'BAIK',
  `status` varchar(20) NOT NULL DEFAULT 'AKTIF',
  `quantity` int(11) NOT NULL DEFAULT 1,
  `custodian_id` char(36) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `photo_file_id` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_asset_code` (`tenant_id`,`code`),
  KEY `idx_assets_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_asset_audits` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `title` varchar(150) NOT NULL,
  `audit_date` date NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'OPEN',
  `items` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`items`)),
  `summary` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`summary`)),
  `created_by` char(36) DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_asset_audits_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_asset_bookings` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `asset_id` char(36) NOT NULL,
  `booked_by` char(36) NOT NULL,
  `start_at` datetime NOT NULL,
  `end_at` datetime NOT NULL,
  `purpose` varchar(255) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'PENDING',
  `approved_by` char(36) DEFAULT NULL,
  `returned_at` datetime DEFAULT NULL,
  `return_condition` varchar(20) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_asset_bookings_tenant` (`tenant_id`),
  KEY `idx_ab_asset_time` (`asset_id`,`start_at`,`end_at`),
  CONSTRAINT `fk_ab_asset` FOREIGN KEY (`asset_id`) REFERENCES `tbl_sinau_assets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_asset_maintenance` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `asset_id` char(36) NOT NULL,
  `scheduled_date` date NOT NULL,
  `done_date` date DEFAULT NULL,
  `type` varchar(20) NOT NULL DEFAULT 'RUTIN',
  `description` text DEFAULT NULL,
  `cost` decimal(15,2) NOT NULL DEFAULT 0.00,
  `vendor` varchar(150) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'SCHEDULED',
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_asset_maintenance_tenant` (`tenant_id`),
  KEY `idx_am_asset` (`asset_id`,`scheduled_date`),
  CONSTRAINT `fk_am_asset` FOREIGN KEY (`asset_id`) REFERENCES `tbl_sinau_assets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_assignments` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `class_subject_id` char(36) NOT NULL,
  `title` varchar(200) NOT NULL,
  `instructions` text DEFAULT NULL,
  `attachment_file_id` char(36) DEFAULT NULL,
  `due_at` datetime DEFAULT NULL,
  `allow_late` tinyint(1) NOT NULL DEFAULT 1,
  `max_score` decimal(6,2) NOT NULL DEFAULT 100.00,
  `status` varchar(20) NOT NULL DEFAULT 'DRAFT',
  `submission_type` varchar(10) NOT NULL DEFAULT 'BOTH',
  `created_by` char(36) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_assignments_tenant` (`tenant_id`),
  KEY `idx_asg_cs` (`class_subject_id`,`due_at`),
  CONSTRAINT `fk_asg_cs` FOREIGN KEY (`class_subject_id`) REFERENCES `tbl_sinau_class_subjects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_attendance_daily` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `class_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `date` date NOT NULL,
  `status` varchar(2) NOT NULL DEFAULT 'H',
  `note` varchar(255) DEFAULT NULL,
  `recorded_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ad` (`class_id`,`student_id`,`date`),
  KEY `idx_attendance_daily_tenant` (`tenant_id`),
  KEY `idx_ad_student` (`student_id`,`date`),
  CONSTRAINT `fk_ad_class` FOREIGN KEY (`class_id`) REFERENCES `tbl_sinau_classes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_attendance_qr_tokens` (
  `id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_by` char(36) DEFAULT NULL,
  `used_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_aqt` (`token_hash`),
  KEY `idx_aqt_session` (`session_id`),
  CONSTRAINT `fk_aqt_session` FOREIGN KEY (`session_id`) REFERENCES `tbl_sinau_attendance_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_attendance_records` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `status` varchar(2) NOT NULL DEFAULT 'H',
  `checked_at` datetime DEFAULT NULL,
  `method` varchar(10) NOT NULL DEFAULT 'MANUAL',
  `lat` decimal(10,7) DEFAULT NULL,
  `lng` decimal(10,7) DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,
  `recorded_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ar` (`session_id`,`student_id`),
  KEY `idx_attendance_records_tenant` (`tenant_id`),
  KEY `idx_ar_student` (`student_id`),
  CONSTRAINT `fk_ar_session` FOREIGN KEY (`session_id`) REFERENCES `tbl_sinau_attendance_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_attendance_sessions` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `class_subject_id` char(36) NOT NULL,
  `date` date NOT NULL,
  `meeting_no` smallint(6) NOT NULL DEFAULT 1,
  `topic` varchar(200) DEFAULT NULL,
  `method` varchar(10) NOT NULL DEFAULT 'MANUAL',
  `qr_secret` char(64) DEFAULT NULL,
  `geo_lat` decimal(10,7) DEFAULT NULL,
  `geo_lng` decimal(10,7) DEFAULT NULL,
  `geo_radius_m` int(11) DEFAULT NULL,
  `opened_at` datetime DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `created_by` char(36) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_attendance_sessions_tenant` (`tenant_id`),
  KEY `idx_as_cs_date` (`class_subject_id`,`date`),
  CONSTRAINT `fk_as_cs` FOREIGN KEY (`class_subject_id`) REFERENCES `tbl_sinau_class_subjects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_audit_logs` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `user_id` char(36) DEFAULT NULL,
  `action` varchar(80) NOT NULL,
  `entity` varchar(60) DEFAULT NULL,
  `entity_id` varchar(36) DEFAULT NULL,
  `before_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`before_data`)),
  `after_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`after_data`)),
  `ip` varchar(64) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_audit_logs_tenant` (`tenant_id`),
  KEY `idx_audit_tenant_time` (`tenant_id`,`created_at`),
  KEY `idx_audit_entity` (`entity`,`entity_id`),
  KEY `idx_audit_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_cash_flows` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `tx_date` date NOT NULL,
  `direction` varchar(3) NOT NULL DEFAULT 'IN',
  `category` varchar(60) NOT NULL,
  `amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `description` varchar(255) DEFAULT NULL,
  `reference_type` varchar(30) DEFAULT NULL,
  `reference_id` char(36) DEFAULT NULL,
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_cash_flows_tenant` (`tenant_id`),
  KEY `idx_cf_date` (`tenant_id`,`tx_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_classes` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `academic_year_id` char(36) NOT NULL,
  `name` varchar(60) NOT NULL,
  `grade_level` tinyint(4) NOT NULL DEFAULT 10,
  `major_id` char(36) DEFAULT NULL,
  `homeroom_teacher_id` char(36) DEFAULT NULL,
  `room_id` char(36) DEFAULT NULL,
  `capacity` smallint(6) NOT NULL DEFAULT 36,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_class` (`tenant_id`,`academic_year_id`,`name`),
  KEY `idx_classes_tenant` (`tenant_id`),
  KEY `idx_class_major` (`major_id`),
  KEY `idx_class_homeroom` (`homeroom_teacher_id`),
  KEY `fk_class_ay` (`academic_year_id`),
  CONSTRAINT `fk_class_ay` FOREIGN KEY (`academic_year_id`) REFERENCES `tbl_sinau_academic_years` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_class_students` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `class_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'AKTIF',
  `joined_at` date DEFAULT NULL,
  `left_at` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cs` (`class_id`,`student_id`),
  KEY `idx_class_students_tenant` (`tenant_id`),
  KEY `idx_cs_student` (`student_id`),
  CONSTRAINT `fk_cs_class` FOREIGN KEY (`class_id`) REFERENCES `tbl_sinau_classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cs_student` FOREIGN KEY (`student_id`) REFERENCES `tbl_sinau_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_class_subjects` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `class_id` char(36) NOT NULL,
  `subject_id` char(36) NOT NULL,
  `teacher_id` char(36) DEFAULT NULL,
  `semester` tinyint(4) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_csub` (`class_id`,`subject_id`,`semester`),
  KEY `idx_class_subjects_tenant` (`tenant_id`),
  KEY `idx_csub_teacher` (`teacher_id`),
  KEY `idx_csub_subject` (`subject_id`),
  CONSTRAINT `fk_csub_class` FOREIGN KEY (`class_id`) REFERENCES `tbl_sinau_classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_csub_subject` FOREIGN KEY (`subject_id`) REFERENCES `tbl_sinau_subjects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_competency_results` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `test_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `scores` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`scores`)),
  `total_score` decimal(6,2) DEFAULT NULL,
  `verdict` varchar(20) NOT NULL DEFAULT 'PENDING',
  `examiner_note` text DEFAULT NULL,
  `assessed_by` char(36) DEFAULT NULL,
  `assessed_at` datetime DEFAULT NULL,
  `certificate_file_id` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cres` (`test_id`,`student_id`),
  KEY `idx_competency_results_tenant` (`tenant_id`),
  CONSTRAINT `fk_cres_test` FOREIGN KEY (`test_id`) REFERENCES `tbl_sinau_competency_tests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_competency_rubrics` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `scheme_id` char(36) NOT NULL,
  `code` varchar(30) NOT NULL,
  `criteria` varchar(255) NOT NULL,
  `max_score` decimal(5,2) NOT NULL DEFAULT 100.00,
  `weight` decimal(5,2) NOT NULL DEFAULT 1.00,
  `order_no` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_competency_rubrics_tenant` (`tenant_id`),
  KEY `idx_cr_scheme` (`scheme_id`),
  CONSTRAINT `fk_cr_scheme` FOREIGN KEY (`scheme_id`) REFERENCES `tbl_sinau_competency_schemes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_competency_schemes` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `code` varchar(30) NOT NULL,
  `name` varchar(200) NOT NULL,
  `major_id` char(36) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `units` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`units`)),
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cscheme` (`tenant_id`,`code`),
  KEY `idx_competency_schemes_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_competency_tests` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `scheme_id` char(36) NOT NULL,
  `title` varchar(200) NOT NULL,
  `test_date` date NOT NULL,
  `location` varchar(150) DEFAULT NULL,
  `external_examiner_id` char(36) DEFAULT NULL,
  `internal_examiner_id` char(36) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'SCHEDULED',
  `note` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_competency_tests_tenant` (`tenant_id`),
  KEY `idx_ct_scheme` (`scheme_id`),
  KEY `idx_ct_examiner` (`external_examiner_id`),
  CONSTRAINT `fk_ct_scheme` FOREIGN KEY (`scheme_id`) REFERENCES `tbl_sinau_competency_schemes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_concepts` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `subject_id` char(36) DEFAULT NULL,
  `code` varchar(40) NOT NULL,
  `name` varchar(150) NOT NULL,
  `description` text DEFAULT NULL,
  `parent_id` char(36) DEFAULT NULL,
  `grade_level` tinyint(4) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_concept` (`tenant_id`,`code`),
  KEY `idx_concepts_tenant` (`tenant_id`),
  KEY `idx_concept_subject` (`subject_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_consents` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `purpose` varchar(80) NOT NULL,
  `granted` tinyint(1) NOT NULL DEFAULT 1,
  `granted_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `ip` varchar(64) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_consent` (`user_id`,`purpose`),
  KEY `idx_consents_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_contact_messages` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `name` varchar(150) NOT NULL,
  `email` varchar(190) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `subject` varchar(200) DEFAULT NULL,
  `message` text NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'NEW',
  `ip` varchar(64) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_contact_messages_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_counseling_notes` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `counselor_id` char(36) NOT NULL,
  `session_date` date NOT NULL,
  `category` varchar(30) NOT NULL DEFAULT 'PRIBADI',
  `summary` text NOT NULL,
  `follow_up` text DEFAULT NULL,
  `is_confidential` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_counseling_notes_tenant` (`tenant_id`),
  KEY `idx_cn_student` (`student_id`,`session_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_curriculum_refs` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `subject_id` char(36) NOT NULL,
  `grade_level` tinyint(4) DEFAULT NULL,
  `type` varchar(10) NOT NULL DEFAULT 'CP',
  `code` varchar(40) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `parent_id` char(36) DEFAULT NULL,
  `order_no` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_curriculum_refs_tenant` (`tenant_id`),
  KEY `idx_cur_subject` (`subject_id`),
  CONSTRAINT `fk_cur_subject` FOREIGN KEY (`subject_id`) REFERENCES `tbl_sinau_subjects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_dashboard_configs` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `role` varchar(40) NOT NULL,
  `widgets` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`widgets`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dc` (`tenant_id`,`role`),
  KEY `idx_dashboard_configs_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_discipline_records` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `rule_id` char(36) DEFAULT NULL,
  `incident_date` date NOT NULL,
  `points` smallint(6) NOT NULL DEFAULT 0,
  `description` text DEFAULT NULL,
  `action_taken` text DEFAULT NULL,
  `recorded_by` char(36) NOT NULL,
  `parent_notified` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_discipline_records_tenant` (`tenant_id`),
  KEY `idx_drec_student` (`student_id`,`incident_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_discipline_rules` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(150) NOT NULL,
  `kind` varchar(12) NOT NULL DEFAULT 'PELANGGARAN',
  `points` smallint(6) NOT NULL DEFAULT 0,
  `description` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dr` (`tenant_id`,`code`),
  KEY `idx_discipline_rules_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_exams` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `package_id` char(36) NOT NULL,
  `subject_id` char(36) DEFAULT NULL,
  `title` varchar(200) NOT NULL,
  `type` varchar(10) NOT NULL DEFAULT 'UH',
  `academic_year_id` char(36) DEFAULT NULL,
  `semester` tinyint(4) NOT NULL DEFAULT 1,
  `duration_min` smallint(6) NOT NULL DEFAULT 60,
  `shuffle_questions` tinyint(1) NOT NULL DEFAULT 1,
  `shuffle_options` tinyint(1) NOT NULL DEFAULT 1,
  `passing_score` decimal(5,2) DEFAULT NULL,
  `show_result` varchar(15) NOT NULL DEFAULT 'AFTER_CLOSE',
  `lock_screen` tinyint(1) NOT NULL DEFAULT 1,
  `max_violations` tinyint(4) NOT NULL DEFAULT 3,
  `grade_component` varchar(20) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'DRAFT',
  `created_by` char(36) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_exams_tenant` (`tenant_id`),
  KEY `idx_exam_pkg` (`package_id`),
  CONSTRAINT `fk_exam_pkg` FOREIGN KEY (`package_id`) REFERENCES `tbl_sinau_exam_packages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_exam_answers` (
  `id` char(36) NOT NULL,
  `attempt_id` char(36) NOT NULL,
  `question_id` char(36) NOT NULL,
  `answer` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`answer`)),
  `is_correct` tinyint(1) DEFAULT NULL,
  `score` decimal(6,2) DEFAULT NULL,
  `graded_by` char(36) DEFAULT NULL,
  `seq` int(11) NOT NULL DEFAULT 0,
  `answered_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_eans` (`attempt_id`,`question_id`),
  CONSTRAINT `fk_eans_attempt` FOREIGN KEY (`attempt_id`) REFERENCES `tbl_sinau_exam_attempts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_exam_answer_logs` (
  `id` char(36) NOT NULL,
  `attempt_id` char(36) NOT NULL,
  `question_id` char(36) NOT NULL,
  `answer` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`answer`)),
  `event` varchar(20) NOT NULL DEFAULT 'ANSWER',
  `seq` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_eal_attempt` (`attempt_id`,`seq`),
  CONSTRAINT `fk_eal_attempt` FOREIGN KEY (`attempt_id`) REFERENCES `tbl_sinau_exam_attempts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_exam_attempts` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `started_at` datetime NOT NULL,
  `deadline_at` datetime NOT NULL,
  `submitted_at` datetime DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'IN_PROGRESS',
  `submit_reason` varchar(20) NOT NULL DEFAULT 'MANUAL',
  `score` decimal(6,2) DEFAULT NULL,
  `max_score` decimal(6,2) DEFAULT NULL,
  `question_order` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`question_order`)),
  `violations` smallint(6) NOT NULL DEFAULT 0,
  `last_saved_at` datetime DEFAULT NULL,
  `ip` varchar(64) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ea` (`session_id`,`student_id`),
  KEY `idx_exam_attempts_tenant` (`tenant_id`),
  KEY `idx_ea_student` (`student_id`),
  CONSTRAINT `fk_ea_session` FOREIGN KEY (`session_id`) REFERENCES `tbl_sinau_exam_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_exam_packages` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `subject_id` char(36) DEFAULT NULL,
  `grade_level` tinyint(4) DEFAULT NULL,
  `title` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `total_points` decimal(7,2) NOT NULL DEFAULT 0.00,
  `status` varchar(20) NOT NULL DEFAULT 'DRAFT',
  `created_by` char(36) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_exam_packages_tenant` (`tenant_id`),
  KEY `idx_ep_subject` (`tenant_id`,`subject_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_exam_package_questions` (
  `id` char(36) NOT NULL,
  `package_id` char(36) NOT NULL,
  `question_id` char(36) NOT NULL,
  `order_no` int(11) NOT NULL DEFAULT 0,
  `points` decimal(5,2) NOT NULL DEFAULT 1.00,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_epq` (`package_id`,`question_id`),
  KEY `fk_epq_q` (`question_id`),
  CONSTRAINT `fk_epq_pkg` FOREIGN KEY (`package_id`) REFERENCES `tbl_sinau_exam_packages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_epq_q` FOREIGN KEY (`question_id`) REFERENCES `tbl_sinau_questions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_exam_sessions` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `exam_id` char(36) NOT NULL,
  `class_id` char(36) NOT NULL,
  `class_subject_id` char(36) DEFAULT NULL,
  `start_at` datetime NOT NULL,
  `end_at` datetime NOT NULL,
  `token` varchar(12) NOT NULL,
  `proctor_id` char(36) DEFAULT NULL,
  `room_id` char(36) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'SCHEDULED',
  `note` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_exam_sessions_tenant` (`tenant_id`),
  KEY `idx_es_exam` (`exam_id`),
  KEY `idx_es_class_time` (`class_id`,`start_at`),
  CONSTRAINT `fk_es_class` FOREIGN KEY (`class_id`) REFERENCES `tbl_sinau_classes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_es_exam` FOREIGN KEY (`exam_id`) REFERENCES `tbl_sinau_exams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_extracurriculars` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(120) NOT NULL,
  `description` text DEFAULT NULL,
  `coach_id` char(36) DEFAULT NULL,
  `schedule_text` varchar(200) DEFAULT NULL,
  `quota` smallint(6) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ekskul` (`tenant_id`,`code`),
  KEY `idx_extracurriculars_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_extracurricular_members` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `extracurricular_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `academic_year_id` char(36) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'AKTIF',
  `score` varchar(2) DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_em` (`extracurricular_id`,`student_id`),
  KEY `idx_extracurricular_members_tenant` (`tenant_id`),
  CONSTRAINT `fk_em_ekskul` FOREIGN KEY (`extracurricular_id`) REFERENCES `tbl_sinau_extracurriculars` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_facilities` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `name` varchar(150) NOT NULL,
  `description` text DEFAULT NULL,
  `photo_file_id` char(36) DEFAULT NULL,
  `is_published` tinyint(1) NOT NULL DEFAULT 1,
  `order_no` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_facilities_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_faqs` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `question` varchar(300) NOT NULL,
  `answer` text NOT NULL,
  `category` varchar(60) DEFAULT NULL,
  `is_published` tinyint(1) NOT NULL DEFAULT 1,
  `order_no` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_faqs_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_feature_flags` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `flag_key` varchar(80) NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `config` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`config`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_flag` (`tenant_id`,`flag_key`),
  KEY `idx_feature_flags_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_fee_types` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(120) NOT NULL,
  `default_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `period` varchar(10) NOT NULL DEFAULT 'BULANAN',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fee` (`tenant_id`,`code`),
  KEY `idx_fee_types_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_files` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `uploaded_by` char(36) DEFAULT NULL,
  `module` varchar(40) NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `stored_path` varchar(400) NOT NULL,
  `mime` varchar(120) NOT NULL,
  `size` int(11) NOT NULL DEFAULT 0,
  `is_public` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_files_tenant` (`tenant_id`),
  KEY `idx_files_module` (`tenant_id`,`module`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_gallery_items` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `title` varchar(150) DEFAULT NULL,
  `file_id` char(36) NOT NULL,
  `album` varchar(100) DEFAULT NULL,
  `is_published` tinyint(1) NOT NULL DEFAULT 1,
  `order_no` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_gallery_items_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_grades` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `class_subject_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `component_code` varchar(20) NOT NULL,
  `source_type` varchar(20) NOT NULL DEFAULT 'MANUAL',
  `source_id` char(36) DEFAULT NULL,
  `title` varchar(200) DEFAULT NULL,
  `score` decimal(6,2) NOT NULL DEFAULT 0.00,
  `max_score` decimal(6,2) NOT NULL DEFAULT 100.00,
  `note` varchar(255) DEFAULT NULL,
  `graded_by` char(36) DEFAULT NULL,
  `graded_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_grades_tenant` (`tenant_id`),
  KEY `idx_grade_cs_student` (`class_subject_id`,`student_id`),
  KEY `idx_grade_source` (`source_type`,`source_id`),
  CONSTRAINT `fk_grade_cs` FOREIGN KEY (`class_subject_id`) REFERENCES `tbl_sinau_class_subjects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_grade_components` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `subject_id` char(36) DEFAULT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(60) NOT NULL,
  `weight` decimal(5,2) NOT NULL DEFAULT 0.00,
  `order_no` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_grade_components_tenant` (`tenant_id`),
  KEY `idx_gc` (`tenant_id`,`subject_id`,`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_guardians` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `relation` varchar(20) NOT NULL DEFAULT 'ORANG_TUA',
  `occupation` varchar(100) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_guardian_user` (`user_id`),
  KEY `idx_guardians_tenant` (`tenant_id`),
  CONSTRAINT `fk_guardian_user` FOREIGN KEY (`user_id`) REFERENCES `tbl_sinau_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_guardian_students` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `guardian_user_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `relation` varchar(20) NOT NULL DEFAULT 'ORANG_TUA',
  `is_primary` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gs` (`guardian_user_id`,`student_id`),
  KEY `idx_guardian_students_tenant` (`tenant_id`),
  KEY `idx_gs_student` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_import_batches` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `type` varchar(40) NOT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `total` int(11) NOT NULL DEFAULT 0,
  `success` int(11) NOT NULL DEFAULT 0,
  `failed` int(11) NOT NULL DEFAULT 0,
  `status` varchar(20) NOT NULL DEFAULT 'DONE',
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_import_batches_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_import_errors` (
  `id` char(36) NOT NULL,
  `batch_id` char(36) NOT NULL,
  `row_no` int(11) NOT NULL,
  `message` varchar(500) NOT NULL,
  `raw` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`raw`)),
  PRIMARY KEY (`id`),
  KEY `idx_ie_batch` (`batch_id`),
  CONSTRAINT `fk_ie_batch` FOREIGN KEY (`batch_id`) REFERENCES `tbl_sinau_import_batches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_industry_mentors` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `partner_id` char(36) NOT NULL,
  `user_id` char(36) DEFAULT NULL,
  `name` varchar(150) NOT NULL,
  `position` varchar(100) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `email` varchar(190) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_industry_mentors_tenant` (`tenant_id`),
  KEY `idx_im_partner` (`partner_id`),
  CONSTRAINT `fk_im_partner` FOREIGN KEY (`partner_id`) REFERENCES `tbl_sinau_industry_partners` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_industry_partners` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `name` varchar(200) NOT NULL,
  `sector` varchar(100) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `contact_name` varchar(150) DEFAULT NULL,
  `contact_phone` varchar(30) DEFAULT NULL,
  `contact_email` varchar(190) DEFAULT NULL,
  `mou_number` varchar(80) DEFAULT NULL,
  `mou_until` date DEFAULT NULL,
  `quota` smallint(6) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_industry_partners_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_internships` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `partner_id` char(36) NOT NULL,
  `mentor_id` char(36) DEFAULT NULL,
  `school_supervisor_id` char(36) DEFAULT NULL,
  `academic_year_id` char(36) DEFAULT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'PLANNED',
  `final_score` decimal(5,2) DEFAULT NULL,
  `mentor_feedback` text DEFAULT NULL,
  `certificate_file_id` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_internships_tenant` (`tenant_id`),
  KEY `idx_int_student` (`student_id`),
  KEY `idx_int_partner` (`partner_id`),
  KEY `idx_int_mentor` (`mentor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_internship_journals` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `internship_id` char(36) NOT NULL,
  `journal_date` date NOT NULL,
  `activity` text NOT NULL,
  `hours` decimal(4,1) NOT NULL DEFAULT 8.0,
  `photo_file_id` char(36) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'SUBMITTED',
  `verified_by` char(36) DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  `mentor_note` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ij` (`internship_id`,`journal_date`),
  KEY `idx_internship_journals_tenant` (`tenant_id`),
  CONSTRAINT `fk_ij_int` FOREIGN KEY (`internship_id`) REFERENCES `tbl_sinau_internships` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_invitations` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `email` varchar(190) NOT NULL,
  `full_name` varchar(150) DEFAULT NULL,
  `role` varchar(40) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `accepted_at` datetime DEFAULT NULL,
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inv_hash` (`token_hash`),
  KEY `idx_invitations_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_invoices` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `number` varchar(40) NOT NULL,
  `student_id` char(36) NOT NULL,
  `academic_year_id` char(36) DEFAULT NULL,
  `fee_type_id` char(36) DEFAULT NULL,
  `title` varchar(200) NOT NULL,
  `period` varchar(7) DEFAULT NULL,
  `amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `discount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `late_fee` decimal(15,2) NOT NULL DEFAULT 0.00,
  `paid` decimal(15,2) NOT NULL DEFAULT 0.00,
  `due_date` date DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'UNPAID',
  `note` varchar(255) DEFAULT NULL,
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inv_number` (`tenant_id`,`number`),
  KEY `idx_invoices_tenant` (`tenant_id`),
  KEY `idx_inv_student` (`student_id`,`status`),
  KEY `idx_inv_due` (`tenant_id`,`due_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_jobs` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) DEFAULT NULL,
  `type` varchar(60) NOT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`payload`)),
  `status` varchar(20) NOT NULL DEFAULT 'PENDING',
  `attempts` int(11) NOT NULL DEFAULT 0,
  `max_attempts` int(11) NOT NULL DEFAULT 3,
  `run_at` datetime NOT NULL,
  `locked_at` datetime DEFAULT NULL,
  `finished_at` datetime DEFAULT NULL,
  `result` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`result`)),
  `error` text DEFAULT NULL,
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_jobs_status` (`status`,`run_at`),
  KEY `idx_jobs_tenant` (`tenant_id`,`type`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_job_positions` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(120) NOT NULL,
  `base_salary` decimal(15,2) NOT NULL DEFAULT 0.00,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_jp` (`tenant_id`,`code`),
  KEY `idx_job_positions_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_kota` (
  `id` int(10) unsigned NOT NULL,
  `provinsi_id` int(10) unsigned NOT NULL,
  `kode` varchar(6) NOT NULL,
  `nama` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_kota_kode` (`kode`),
  KEY `idx_kota_prov` (`provinsi_id`),
  CONSTRAINT `fk_kota_prov` FOREIGN KEY (`provinsi_id`) REFERENCES `tbl_sinau_provinsi` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_landing_pages` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `slug` varchar(40) NOT NULL,
  `title` varchar(150) NOT NULL,
  `hero_title` varchar(200) DEFAULT NULL,
  `hero_subtitle` varchar(300) DEFAULT NULL,
  `hero_image_file_id` char(36) DEFAULT NULL,
  `sections` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`sections`)),
  `seo_description` varchar(300) DEFAULT NULL,
  `is_published` tinyint(1) NOT NULL DEFAULT 0,
  `order_no` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lp` (`tenant_id`,`slug`),
  KEY `idx_landing_pages_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_late_fee_rules` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `fee_type_id` char(36) DEFAULT NULL,
  `grace_days` smallint(6) NOT NULL DEFAULT 0,
  `mode` varchar(10) NOT NULL DEFAULT 'FLAT',
  `amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `max_amount` decimal(15,2) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_late_fee_rules_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_letter_templates` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `code` varchar(30) NOT NULL,
  `name` varchar(120) NOT NULL,
  `body_template` mediumtext DEFAULT NULL,
  `number_format` varchar(80) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lt` (`tenant_id`,`code`),
  KEY `idx_letter_templates_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_library_books` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `isbn` varchar(20) DEFAULT NULL,
  `code` varchar(30) NOT NULL,
  `title` varchar(200) NOT NULL,
  `author` varchar(150) DEFAULT NULL,
  `publisher` varchar(150) DEFAULT NULL,
  `year` smallint(6) DEFAULT NULL,
  `category` varchar(60) DEFAULT NULL,
  `stock` int(11) NOT NULL DEFAULT 1,
  `available` int(11) NOT NULL DEFAULT 1,
  `shelf` varchar(30) DEFAULT NULL,
  `cover_file_id` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_book_code` (`tenant_id`,`code`),
  KEY `idx_library_books_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_library_loans` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `book_id` char(36) NOT NULL,
  `borrower_id` char(36) NOT NULL,
  `borrowed_at` date NOT NULL,
  `due_at` date NOT NULL,
  `returned_at` date DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'BORROWED',
  `fine` decimal(15,2) NOT NULL DEFAULT 0.00,
  `handled_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_library_loans_tenant` (`tenant_id`),
  KEY `idx_loan_book` (`book_id`),
  KEY `idx_loan_borrower` (`borrower_id`,`status`),
  CONSTRAINT `fk_loan_book` FOREIGN KEY (`book_id`) REFERENCES `tbl_sinau_library_books` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_majors` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(120) NOT NULL,
  `description` text DEFAULT NULL,
  `head_user_id` char(36) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_major` (`tenant_id`,`code`),
  KEY `idx_majors_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_materials` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `class_subject_id` char(36) DEFAULT NULL,
  `subject_id` char(36) DEFAULT NULL,
  `major_id` char(36) DEFAULT NULL,
  `grade_level` tinyint(4) DEFAULT NULL,
  `title` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `type` varchar(10) NOT NULL DEFAULT 'FILE',
  `content_url` varchar(500) DEFAULT NULL,
  `content_text` mediumtext DEFAULT NULL,
  `file_id` char(36) DEFAULT NULL,
  `is_published` tinyint(1) NOT NULL DEFAULT 0,
  `published_at` datetime DEFAULT NULL,
  `is_public` tinyint(1) NOT NULL DEFAULT 0,
  `view_count` int(11) NOT NULL DEFAULT 0,
  `created_by` char(36) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_materials_tenant` (`tenant_id`),
  KEY `idx_mat_cs` (`class_subject_id`),
  KEY `idx_mat_subject` (`subject_id`),
  KEY `idx_mat_creator` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_material_views` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `material_id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `first_viewed_at` datetime NOT NULL,
  `last_viewed_at` datetime NOT NULL,
  `view_count` int(11) NOT NULL DEFAULT 1,
  `progress` tinyint(4) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mv` (`material_id`,`user_id`),
  KEY `idx_material_views_tenant` (`tenant_id`),
  CONSTRAINT `fk_mv_material` FOREIGN KEY (`material_id`) REFERENCES `tbl_sinau_materials` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_migrations` (
  `name` varchar(120) NOT NULL,
  `applied_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_module_portal_shares` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `material_id` char(36) NOT NULL,
  `shared_by` char(36) DEFAULT NULL,
  `is_featured` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mps` (`material_id`),
  KEY `idx_module_portal_shares_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_news_articles` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `slug` varchar(120) NOT NULL,
  `title` varchar(200) NOT NULL,
  `excerpt` varchar(400) DEFAULT NULL,
  `body` mediumtext DEFAULT NULL,
  `cover_file_id` char(36) DEFAULT NULL,
  `category` varchar(40) DEFAULT NULL,
  `is_published` tinyint(1) NOT NULL DEFAULT 0,
  `published_at` datetime DEFAULT NULL,
  `author_id` char(36) DEFAULT NULL,
  `view_count` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_news` (`tenant_id`,`slug`),
  KEY `idx_news_articles_tenant` (`tenant_id`),
  KEY `idx_news_pub` (`tenant_id`,`is_published`,`published_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_notifications` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `type` varchar(40) NOT NULL,
  `title` varchar(200) NOT NULL,
  `body` text DEFAULT NULL,
  `link` varchar(255) DEFAULT NULL,
  `read_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_notifications_tenant` (`tenant_id`),
  KEY `idx_notif_user` (`user_id`,`read_at`,`created_at`),
  CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `tbl_sinau_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_official_letters` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `template_id` char(36) DEFAULT NULL,
  `number` varchar(80) NOT NULL,
  `subject` varchar(200) NOT NULL,
  `recipient` varchar(200) DEFAULT NULL,
  `body` mediumtext DEFAULT NULL,
  `letter_date` date NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'DRAFT',
  `signed_by` char(36) DEFAULT NULL,
  `pdf_file_id` char(36) DEFAULT NULL,
  `created_by` char(36) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_official_letters_tenant` (`tenant_id`),
  KEY `idx_ol_date` (`tenant_id`,`letter_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_password_resets` (
  `id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pr_hash` (`token_hash`),
  KEY `fk_pr_user` (`user_id`),
  CONSTRAINT `fk_pr_user` FOREIGN KEY (`user_id`) REFERENCES `tbl_sinau_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_payments` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `number` varchar(40) NOT NULL,
  `student_id` char(36) NOT NULL,
  `amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `method` varchar(20) NOT NULL DEFAULT 'TUNAI',
  `reference` varchar(100) DEFAULT NULL,
  `paid_at` datetime NOT NULL,
  `received_by` char(36) DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'CONFIRMED',
  `proof_file_id` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pay_number` (`tenant_id`,`number`),
  KEY `idx_payments_tenant` (`tenant_id`),
  KEY `idx_pay_student` (`student_id`,`paid_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_payment_allocations` (
  `id` char(36) NOT NULL,
  `payment_id` char(36) NOT NULL,
  `invoice_id` char(36) NOT NULL,
  `amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`),
  KEY `idx_pa_inv` (`invoice_id`),
  KEY `fk_pa_payment` (`payment_id`),
  CONSTRAINT `fk_pa_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `tbl_sinau_invoices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pa_payment` FOREIGN KEY (`payment_id`) REFERENCES `tbl_sinau_payments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_payroll_components` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(120) NOT NULL,
  `kind` varchar(10) NOT NULL DEFAULT 'ALLOWANCE',
  `calc` varchar(10) NOT NULL DEFAULT 'FIXED',
  `default_amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `taxable` tinyint(1) NOT NULL DEFAULT 1,
  `order_no` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pc` (`tenant_id`,`code`),
  KEY `idx_payroll_components_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_payroll_period_configs` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `pay_day` tinyint(4) NOT NULL DEFAULT 25,
  `bpjs_kes_employee` decimal(5,2) NOT NULL DEFAULT 1.00,
  `bpjs_kes_employer` decimal(5,2) NOT NULL DEFAULT 4.00,
  `bpjs_tk_jht_employee` decimal(5,2) NOT NULL DEFAULT 2.00,
  `bpjs_tk_jht_employer` decimal(5,2) NOT NULL DEFAULT 3.70,
  `bpjs_tk_jp_employee` decimal(5,2) NOT NULL DEFAULT 1.00,
  `bpjs_tk_jp_employer` decimal(5,2) NOT NULL DEFAULT 2.00,
  `bpjs_tk_jkk` decimal(5,2) NOT NULL DEFAULT 0.24,
  `bpjs_tk_jkm` decimal(5,2) NOT NULL DEFAULT 0.30,
  `bpjs_kes_cap` decimal(15,2) NOT NULL DEFAULT 12000000.00,
  `apply_pph21` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ppc_tenant` (`tenant_id`),
  KEY `idx_payroll_period_configs_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_payroll_runs` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `period` varchar(7) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'DRAFT',
  `total_gross` decimal(15,2) NOT NULL DEFAULT 0.00,
  `total_net` decimal(15,2) NOT NULL DEFAULT 0.00,
  `employee_count` int(11) NOT NULL DEFAULT 0,
  `validated_by` char(36) DEFAULT NULL,
  `finance_approved_by` char(36) DEFAULT NULL,
  `principal_approved_by` char(36) DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pr_period` (`tenant_id`,`period`),
  KEY `idx_payroll_runs_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_payroll_run_items` (
  `id` char(36) NOT NULL,
  `run_id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `gross` decimal(15,2) NOT NULL DEFAULT 0.00,
  `deductions` decimal(15,2) NOT NULL DEFAULT 0.00,
  `bpjs_employee` decimal(15,2) NOT NULL DEFAULT 0.00,
  `bpjs_employer` decimal(15,2) NOT NULL DEFAULT 0.00,
  `pph21` decimal(15,2) NOT NULL DEFAULT 0.00,
  `net` decimal(15,2) NOT NULL DEFAULT 0.00,
  `detail_lines` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`detail_lines`)),
  `attendance_days` smallint(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pri` (`run_id`,`user_id`),
  CONSTRAINT `fk_pri_run` FOREIGN KEY (`run_id`) REFERENCES `tbl_sinau_payroll_runs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_payslips` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `run_item_id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `period` varchar(7) NOT NULL,
  `pdf_file_id` char(36) DEFAULT NULL,
  `issued_at` datetime DEFAULT NULL,
  `viewed_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_slip` (`run_item_id`),
  KEY `idx_payslips_tenant` (`tenant_id`),
  KEY `idx_slip_user` (`user_id`,`period`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_pdp_requests` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `type` varchar(20) NOT NULL DEFAULT 'DELETE',
  `reason` text DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'PENDING',
  `reviewed_by` char(36) DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `review_note` varchar(255) DEFAULT NULL,
  `executed_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_pdp_requests_tenant` (`tenant_id`),
  KEY `idx_pdp_user` (`user_id`),
  KEY `idx_pdp_status` (`tenant_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_permissions` (
  `code` varchar(80) NOT NULL,
  `module` varchar(40) NOT NULL,
  `description` varchar(200) DEFAULT NULL,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_permits` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `type` varchar(10) NOT NULL DEFAULT 'IZIN',
  `date_from` date NOT NULL,
  `date_to` date NOT NULL,
  `reason` text DEFAULT NULL,
  `attachment_file_id` char(36) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'PENDING',
  `reviewed_by` char(36) DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `review_note` varchar(255) DEFAULT NULL,
  `submitted_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_permits_tenant` (`tenant_id`),
  KEY `idx_permit_student` (`student_id`,`date_from`),
  KEY `idx_permit_status` (`tenant_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_ppdb_applicants` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `period_id` char(36) NOT NULL,
  `registration_no` varchar(30) NOT NULL,
  `user_id` char(36) DEFAULT NULL,
  `full_name` varchar(150) NOT NULL,
  `nisn` varchar(20) DEFAULT NULL,
  `nik` varchar(20) DEFAULT NULL,
  `gender` char(1) DEFAULT NULL,
  `birth_place` varchar(100) DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `origin_school` varchar(200) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `email` varchar(190) DEFAULT NULL,
  `parent_name` varchar(150) DEFAULT NULL,
  `parent_phone` varchar(30) DEFAULT NULL,
  `major_choice_1` char(36) DEFAULT NULL,
  `major_choice_2` char(36) DEFAULT NULL,
  `path` varchar(30) DEFAULT NULL,
  `access_token` char(64) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'SUBMITTED',
  `score` decimal(6,2) DEFAULT NULL,
  `verified_by` char(36) DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  `verification_note` varchar(255) DEFAULT NULL,
  `accepted_major_id` char(36) DEFAULT NULL,
  `enrolled_user_id` char(36) DEFAULT NULL,
  `enrolled_class_id` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ppdb_regno` (`tenant_id`,`registration_no`),
  KEY `idx_ppdb_applicants_tenant` (`tenant_id`),
  KEY `idx_ppdb_period_status` (`period_id`,`status`),
  KEY `idx_ppdb_token` (`access_token`),
  CONSTRAINT `fk_ppdb_period` FOREIGN KEY (`period_id`) REFERENCES `tbl_sinau_ppdb_periods` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_ppdb_documents` (
  `id` char(36) NOT NULL,
  `applicant_id` char(36) NOT NULL,
  `doc_type` varchar(40) NOT NULL,
  `file_id` char(36) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'UPLOADED',
  `note` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_pd_app` (`applicant_id`),
  CONSTRAINT `fk_pd_app` FOREIGN KEY (`applicant_id`) REFERENCES `tbl_sinau_ppdb_applicants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_ppdb_periods` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `name` varchar(120) NOT NULL,
  `academic_year_id` char(36) DEFAULT NULL,
  `open_at` datetime NOT NULL,
  `close_at` datetime NOT NULL,
  `quota` int(11) NOT NULL DEFAULT 0,
  `requirements` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`requirements`)),
  `paths` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`paths`)),
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `announcement` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_ppdb_periods_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_provinsi` (
  `id` int(10) unsigned NOT NULL,
  `kode` varchar(4) NOT NULL,
  `nama` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_provinsi_kode` (`kode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_questions` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `subject_id` char(36) DEFAULT NULL,
  `concept_id` char(36) DEFAULT NULL,
  `type` varchar(10) NOT NULL DEFAULT 'MC',
  `text` mediumtext NOT NULL,
  `options` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`options`)),
  `answer_key` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`answer_key`)),
  `explanation` text DEFAULT NULL,
  `difficulty` varchar(10) NOT NULL DEFAULT 'SEDANG',
  `points` decimal(5,2) NOT NULL DEFAULT 1.00,
  `tags` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`tags`)),
  `grade_level` tinyint(4) DEFAULT NULL,
  `image_file_id` char(36) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `usage_count` int(11) NOT NULL DEFAULT 0,
  `created_by` char(36) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_questions_tenant` (`tenant_id`),
  KEY `idx_q_subject` (`tenant_id`,`subject_id`),
  KEY `idx_q_concept` (`concept_id`),
  KEY `idx_q_creator` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_quizzes` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `class_subject_id` char(36) NOT NULL,
  `title` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `duration_min` smallint(6) NOT NULL DEFAULT 30,
  `open_at` datetime DEFAULT NULL,
  `close_at` datetime DEFAULT NULL,
  `shuffle_questions` tinyint(1) NOT NULL DEFAULT 1,
  `shuffle_options` tinyint(1) NOT NULL DEFAULT 1,
  `max_attempts` tinyint(4) NOT NULL DEFAULT 1,
  `show_result` varchar(15) NOT NULL DEFAULT 'IMMEDIATE',
  `status` varchar(20) NOT NULL DEFAULT 'DRAFT',
  `grade_component` varchar(20) DEFAULT NULL,
  `created_by` char(36) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_quizzes_tenant` (`tenant_id`),
  KEY `idx_quiz_cs` (`class_subject_id`),
  CONSTRAINT `fk_quiz_cs` FOREIGN KEY (`class_subject_id`) REFERENCES `tbl_sinau_class_subjects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_quiz_answers` (
  `id` char(36) NOT NULL,
  `attempt_id` char(36) NOT NULL,
  `question_id` char(36) NOT NULL,
  `answer` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`answer`)),
  `is_correct` tinyint(1) DEFAULT NULL,
  `score` decimal(6,2) DEFAULT NULL,
  `graded_by` char(36) DEFAULT NULL,
  `answered_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_qans` (`attempt_id`,`question_id`),
  CONSTRAINT `fk_qans_attempt` FOREIGN KEY (`attempt_id`) REFERENCES `tbl_sinau_quiz_attempts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_quiz_attempts` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `quiz_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `attempt_no` tinyint(4) NOT NULL DEFAULT 1,
  `started_at` datetime NOT NULL,
  `deadline_at` datetime NOT NULL,
  `submitted_at` datetime DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'IN_PROGRESS',
  `score` decimal(6,2) DEFAULT NULL,
  `max_score` decimal(6,2) DEFAULT NULL,
  `question_order` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`question_order`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_quiz_attempts_tenant` (`tenant_id`),
  KEY `idx_qa_quiz_student` (`quiz_id`,`student_id`),
  CONSTRAINT `fk_qa_quiz` FOREIGN KEY (`quiz_id`) REFERENCES `tbl_sinau_quizzes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_quiz_questions` (
  `id` char(36) NOT NULL,
  `quiz_id` char(36) NOT NULL,
  `question_id` char(36) NOT NULL,
  `order_no` int(11) NOT NULL DEFAULT 0,
  `points` decimal(5,2) NOT NULL DEFAULT 1.00,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_qq` (`quiz_id`,`question_id`),
  KEY `fk_qq_question` (`question_id`),
  CONSTRAINT `fk_qq_question` FOREIGN KEY (`question_id`) REFERENCES `tbl_sinau_questions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_qq_quiz` FOREIGN KEY (`quiz_id`) REFERENCES `tbl_sinau_quizzes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_reconciliation_batches` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `bank_name` varchar(60) DEFAULT NULL,
  `total_rows` int(11) NOT NULL DEFAULT 0,
  `matched` int(11) NOT NULL DEFAULT 0,
  `unmatched` int(11) NOT NULL DEFAULT 0,
  `status` varchar(20) NOT NULL DEFAULT 'DONE',
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_reconciliation_batches_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_reconciliation_items` (
  `id` char(36) NOT NULL,
  `batch_id` char(36) NOT NULL,
  `tx_date` date DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `reference` varchar(100) DEFAULT NULL,
  `payment_id` char(36) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'UNMATCHED',
  PRIMARY KEY (`id`),
  KEY `idx_rci_batch` (`batch_id`),
  CONSTRAINT `fk_rci_batch` FOREIGN KEY (`batch_id`) REFERENCES `tbl_sinau_reconciliation_batches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_refresh_tokens` (
  `id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `replaced_by` char(36) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `ip` varchar(64) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rt_hash` (`token_hash`),
  KEY `idx_rt_user` (`user_id`),
  CONSTRAINT `fk_rt_user` FOREIGN KEY (`user_id`) REFERENCES `tbl_sinau_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_refunds` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `payment_id` char(36) DEFAULT NULL,
  `student_id` char(36) NOT NULL,
  `amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `reason` text DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'PENDING',
  `approved_by` char(36) DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_refunds_tenant` (`tenant_id`),
  KEY `idx_refund_student` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_report_cards` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `academic_year_id` char(36) NOT NULL,
  `semester` tinyint(4) NOT NULL DEFAULT 1,
  `class_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'DRAFT',
  `homeroom_note` text DEFAULT NULL,
  `attendance_sick` smallint(6) NOT NULL DEFAULT 0,
  `attendance_permit` smallint(6) NOT NULL DEFAULT 0,
  `attendance_absent` smallint(6) NOT NULL DEFAULT 0,
  `extracurricular` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`extracurricular`)),
  `achievements` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`achievements`)),
  `average` decimal(6,2) DEFAULT NULL,
  `rank_in_class` smallint(6) DEFAULT NULL,
  `promoted` tinyint(1) DEFAULT NULL,
  `generated_at` datetime DEFAULT NULL,
  `approved_by` char(36) DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `pdf_file_id` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rc` (`academic_year_id`,`semester`,`student_id`),
  KEY `idx_report_cards_tenant` (`tenant_id`),
  KEY `idx_rc_class` (`class_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_report_card_p5` (
  `id` char(36) NOT NULL,
  `report_card_id` char(36) NOT NULL,
  `project_title` varchar(200) NOT NULL,
  `theme` varchar(150) DEFAULT NULL,
  `dimensions` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`dimensions`)),
  `note` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_rcp5` (`report_card_id`),
  CONSTRAINT `fk_rcp5_rc` FOREIGN KEY (`report_card_id`) REFERENCES `tbl_sinau_report_cards` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_report_card_settings` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `academic_year_id` char(36) DEFAULT NULL,
  `kkm` decimal(5,2) NOT NULL DEFAULT 75.00,
  `predicate_scale` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`predicate_scale`)),
  `signature_principal` varchar(150) DEFAULT NULL,
  `signature_city` varchar(100) DEFAULT NULL,
  `template` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`template`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rcs` (`tenant_id`,`academic_year_id`),
  KEY `idx_report_card_settings_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_report_card_subjects` (
  `id` char(36) NOT NULL,
  `report_card_id` char(36) NOT NULL,
  `subject_id` char(36) NOT NULL,
  `subject_name` varchar(120) NOT NULL,
  `category` varchar(30) DEFAULT NULL,
  `final_score` decimal(6,2) NOT NULL DEFAULT 0.00,
  `predicate` varchar(2) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `components` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`components`)),
  `order_no` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rcsub` (`report_card_id`,`subject_id`),
  CONSTRAINT `fk_rcsub_rc` FOREIGN KEY (`report_card_id`) REFERENCES `tbl_sinau_report_cards` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_retention_policies` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `entity` varchar(60) NOT NULL,
  `retention_months` smallint(6) NOT NULL DEFAULT 60,
  `action` varchar(20) NOT NULL DEFAULT 'ANONYMIZE',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `last_run_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_retention` (`tenant_id`,`entity`),
  KEY `idx_retention_policies_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_role_permissions` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `role` varchar(40) NOT NULL,
  `permission_code` varchar(80) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roleperm` (`tenant_id`,`role`,`permission_code`),
  KEY `idx_role_permissions_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_rollover_items` (
  `id` char(36) NOT NULL,
  `run_id` char(36) NOT NULL,
  `kind` varchar(30) NOT NULL,
  `source_id` char(36) DEFAULT NULL,
  `target_id` char(36) DEFAULT NULL,
  `action` varchar(30) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'PLANNED',
  `detail` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`detail`)),
  PRIMARY KEY (`id`),
  KEY `idx_ri_run` (`run_id`),
  CONSTRAINT `fk_ri_run` FOREIGN KEY (`run_id`) REFERENCES `tbl_sinau_rollover_runs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_rollover_runs` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `from_year_id` char(36) NOT NULL,
  `to_year_id` char(36) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'DRAFT',
  `plan` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`plan`)),
  `checks` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`checks`)),
  `result` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`result`)),
  `created_by` char(36) DEFAULT NULL,
  `executed_at` datetime DEFAULT NULL,
  `rolled_back_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_rollover_runs_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_rooms` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(120) NOT NULL,
  `capacity` smallint(6) NOT NULL DEFAULT 36,
  `type` varchar(20) NOT NULL DEFAULT 'KELAS',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_room` (`tenant_id`,`code`),
  KEY `idx_rooms_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_salary_structures` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `component_id` char(36) NOT NULL,
  `amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `effective_from` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ss` (`user_id`,`component_id`),
  KEY `idx_salary_structures_tenant` (`tenant_id`),
  KEY `fk_ss_comp` (`component_id`),
  CONSTRAINT `fk_ss_comp` FOREIGN KEY (`component_id`) REFERENCES `tbl_sinau_payroll_components` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_schedule_entries` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `class_subject_id` char(36) NOT NULL,
  `day_of_week` tinyint(4) NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `room_id` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_schedule_entries_tenant` (`tenant_id`),
  KEY `idx_sched_cs` (`class_subject_id`),
  KEY `idx_sched_day` (`tenant_id`,`day_of_week`),
  CONSTRAINT `fk_sched_cs` FOREIGN KEY (`class_subject_id`) REFERENCES `tbl_sinau_class_subjects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_staff_attendance` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `date` date NOT NULL,
  `check_in` time DEFAULT NULL,
  `check_out` time DEFAULT NULL,
  `status` varchar(10) NOT NULL DEFAULT 'HADIR',
  `note` varchar(255) DEFAULT NULL,
  `recorded_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sa` (`user_id`,`date`),
  KEY `idx_staff_attendance_tenant` (`tenant_id`),
  KEY `idx_sa_tenant_date` (`tenant_id`,`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_staff_profiles` (
  `user_id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `nip` varchar(30) DEFAULT NULL,
  `nuptk` varchar(30) DEFAULT NULL,
  `nik` varchar(20) DEFAULT NULL,
  `position_id` char(36) DEFAULT NULL,
  `employment_status` varchar(20) DEFAULT NULL,
  `join_date` date DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `birth_place` varchar(100) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `education` varchar(80) DEFAULT NULL,
  `npwp` varchar(30) DEFAULT NULL,
  `bank_name` varchar(60) DEFAULT NULL,
  `bank_account` varchar(40) DEFAULT NULL,
  `ptkp_status` varchar(10) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`user_id`),
  KEY `idx_stp_tenant` (`tenant_id`),
  CONSTRAINT `fk_stp_user` FOREIGN KEY (`user_id`) REFERENCES `tbl_sinau_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_student_profiles` (
  `user_id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `nis` varchar(30) DEFAULT NULL,
  `nisn` varchar(20) DEFAULT NULL,
  `nik` varchar(20) DEFAULT NULL,
  `birth_place` varchar(100) DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `religion` varchar(30) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `provinsi_id` int(10) unsigned DEFAULT NULL,
  `kota_id` int(10) unsigned DEFAULT NULL,
  `entry_year` smallint(6) DEFAULT NULL,
  `major_id` char(36) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'AKTIF',
  `parent_name` varchar(150) DEFAULT NULL,
  `parent_phone` varchar(30) DEFAULT NULL,
  `blood_type` varchar(3) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`user_id`),
  KEY `idx_sp_tenant_nis` (`tenant_id`,`nis`),
  KEY `idx_sp_nisn` (`nisn`),
  CONSTRAINT `fk_sp_user` FOREIGN KEY (`user_id`) REFERENCES `tbl_sinau_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_subjects` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(120) NOT NULL,
  `category` varchar(30) NOT NULL DEFAULT 'UMUM',
  `is_competency` tinyint(1) NOT NULL DEFAULT 0,
  `hours_per_week` smallint(6) NOT NULL DEFAULT 2,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_subject` (`tenant_id`,`code`),
  KEY `idx_subjects_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_submissions` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `assignment_id` char(36) NOT NULL,
  `student_id` char(36) NOT NULL,
  `content` text DEFAULT NULL,
  `attachment_file_id` char(36) DEFAULT NULL,
  `submitted_at` datetime DEFAULT NULL,
  `is_late` tinyint(1) NOT NULL DEFAULT 0,
  `status` varchar(20) NOT NULL DEFAULT 'DRAFT',
  `score` decimal(6,2) DEFAULT NULL,
  `feedback` text DEFAULT NULL,
  `graded_by` char(36) DEFAULT NULL,
  `graded_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sub` (`assignment_id`,`student_id`),
  KEY `idx_submissions_tenant` (`tenant_id`),
  KEY `idx_sub_student` (`student_id`),
  CONSTRAINT `fk_sub_asg` FOREIGN KEY (`assignment_id`) REFERENCES `tbl_sinau_assignments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_tenants` (
  `id` char(36) NOT NULL,
  `slug` varchar(60) NOT NULL,
  `name` varchar(200) NOT NULL,
  `type` varchar(20) NOT NULL DEFAULT 'SMK',
  `category` varchar(20) DEFAULT NULL,
  `npsn` varchar(20) DEFAULT NULL,
  `provinsi_id` int(10) unsigned DEFAULT NULL,
  `kota_id` int(10) unsigned DEFAULT NULL,
  `address` text DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `email` varchar(190) DEFAULT NULL,
  `website` varchar(190) DEFAULT NULL,
  `principal_name` varchar(150) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tenants_slug` (`slug`),
  KEY `idx_tenants_prov` (`provinsi_id`),
  KEY `idx_tenants_kota` (`kota_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_tenant_branding` (
  `tenant_id` char(36) NOT NULL,
  `display_name` varchar(120) DEFAULT NULL,
  `tagline` varchar(200) DEFAULT NULL,
  `logo_url` varchar(255) DEFAULT NULL,
  `favicon_url` varchar(255) DEFAULT NULL,
  `primary_color` varchar(9) NOT NULL DEFAULT '#0f766e',
  `accent_color` varchar(9) NOT NULL DEFAULT '#f59e0b',
  `theme` varchar(10) NOT NULL DEFAULT 'system',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`tenant_id`),
  CONSTRAINT `fk_tbranding_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_sinau_tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_tenant_settings` (
  `tenant_id` char(36) NOT NULL,
  `self_registration` tinyint(1) NOT NULL DEFAULT 0,
  `portal_share` varchar(10) NOT NULL DEFAULT 'MANUAL',
  `approval_flow` varchar(20) NOT NULL DEFAULT 'UNIT_HEAD',
  `timezone` varchar(40) NOT NULL DEFAULT 'Asia/Jakarta',
  `maintenance` tinyint(1) NOT NULL DEFAULT 0,
  `maintenance_message` varchar(255) DEFAULT NULL,
  `data_saver_default` tinyint(1) NOT NULL DEFAULT 0,
  `grade_scale` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`grade_scale`)),
  `extra` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`extra`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`tenant_id`),
  CONSTRAINT `fk_tsettings_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_sinau_tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_testimonials` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `name` varchar(150) NOT NULL,
  `role_label` varchar(100) DEFAULT NULL,
  `quote` text NOT NULL,
  `photo_file_id` char(36) DEFAULT NULL,
  `is_published` tinyint(1) NOT NULL DEFAULT 1,
  `order_no` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_testimonials_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_users` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `username` varchar(60) NOT NULL,
  `email` varchar(190) DEFAULT NULL,
  `password_hash` varchar(100) NOT NULL,
  `full_name` varchar(150) NOT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `avatar_url` varchar(255) DEFAULT NULL,
  `gender` char(1) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `must_change_password` tinyint(1) NOT NULL DEFAULT 1,
  `token_version` int(11) NOT NULL DEFAULT 0,
  `last_login_at` timestamp NULL DEFAULT NULL,
  `data_saver` tinyint(1) NOT NULL DEFAULT 0,
  `theme` varchar(10) NOT NULL DEFAULT 'system',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_username` (`username`),
  KEY `idx_users_email` (`email`),
  KEY `idx_users_tenant_name` (`tenant_id`,`full_name`),
  CONSTRAINT `fk_users_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_sinau_tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_user_onboarding` (
  `user_id` char(36) NOT NULL,
  `steps` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`steps`)),
  `completed_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_onb_user` FOREIGN KEY (`user_id`) REFERENCES `tbl_sinau_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_user_permission_overrides` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `permission_code` varchar(80) NOT NULL,
  `effect` varchar(5) NOT NULL DEFAULT 'ALLOW',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_userperm` (`user_id`,`permission_code`),
  KEY `idx_user_permission_overrides_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tbl_sinau_user_roles` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `role` varchar(40) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_role` (`user_id`,`role`),
  KEY `idx_user_roles_tenant` (`tenant_id`),
  KEY `idx_user_roles_role` (`tenant_id`,`role`),
  CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `tbl_sinau_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

