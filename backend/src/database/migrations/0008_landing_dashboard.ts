import { Migration, tenantTable, vs } from './ddl';

export const m0008: Migration = {
  name: '0008_landing_dashboard',
  statements: [
    tenantTable('landing_pages', ['slug varchar(40) NOT NULL', 'title varchar(150) NOT NULL', 'hero_title varchar(200) DEFAULT NULL', 'hero_subtitle varchar(300) DEFAULT NULL', 'hero_image_file_id char(36) DEFAULT NULL', 'sections json DEFAULT NULL', 'seo_description varchar(300) DEFAULT NULL', 'is_published tinyint(1) NOT NULL DEFAULT 0', 'order_no int NOT NULL DEFAULT 0'], ['UNIQUE KEY uq_lp (tenant_id, slug)']),
    tenantTable('news_articles', ['slug varchar(120) NOT NULL', 'title varchar(200) NOT NULL', 'excerpt varchar(400) DEFAULT NULL', 'body mediumtext', 'cover_file_id char(36) DEFAULT NULL', 'category varchar(40) DEFAULT NULL', 'is_published tinyint(1) NOT NULL DEFAULT 0', 'published_at datetime DEFAULT NULL', 'author_id char(36) DEFAULT NULL', 'view_count int NOT NULL DEFAULT 0'], ['UNIQUE KEY uq_news (tenant_id, slug)', 'KEY idx_news_pub (tenant_id, is_published, published_at)']),
    tenantTable('module_portal_shares', ['material_id char(36) NOT NULL', 'shared_by char(36) DEFAULT NULL', 'is_featured tinyint(1) NOT NULL DEFAULT 0'], ['UNIQUE KEY uq_mps (material_id)']),
    tenantTable('dashboard_configs', ['role varchar(40) NOT NULL', 'widgets json DEFAULT NULL'], ['UNIQUE KEY uq_dc (tenant_id, role)']),
    tenantTable('testimonials', ['name varchar(150) NOT NULL', 'role_label varchar(100) DEFAULT NULL', 'quote text NOT NULL', 'photo_file_id char(36) DEFAULT NULL', 'is_published tinyint(1) NOT NULL DEFAULT 1', 'order_no int NOT NULL DEFAULT 0']),
    tenantTable('faqs', ['question varchar(300) NOT NULL', 'answer text NOT NULL', 'category varchar(60) DEFAULT NULL', 'is_published tinyint(1) NOT NULL DEFAULT 1', 'order_no int NOT NULL DEFAULT 0']),
    tenantTable('gallery_items', ['title varchar(150) DEFAULT NULL', 'file_id char(36) NOT NULL', 'album varchar(100) DEFAULT NULL', 'is_published tinyint(1) NOT NULL DEFAULT 1', 'order_no int NOT NULL DEFAULT 0']),
    tenantTable('facilities', ['name varchar(150) NOT NULL', 'description text', 'photo_file_id char(36) DEFAULT NULL', 'is_published tinyint(1) NOT NULL DEFAULT 1', 'order_no int NOT NULL DEFAULT 0']),
    tenantTable('contact_messages', ['name varchar(150) NOT NULL', 'email varchar(190) DEFAULT NULL', 'phone varchar(30) DEFAULT NULL', 'subject varchar(200) DEFAULT NULL', 'message text NOT NULL', vs('status', 20, 'NEW'), 'ip varchar(64) DEFAULT NULL']),
  ],
};
