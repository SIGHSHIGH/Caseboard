// SQLite 结构（版本 1）：案件主表 + 实体/关系/组/视图/素材 + 版本快照 + 回收站 + FTS5 全文检索。
//
// 为什么不用 tauri-plugin-sql 的 add_migrations：插件的迁移按「数据库连接串」做键
// （commands.rs 里 `migrations.0.remove(&db)`），而我们为了让数据库跟着设备数据目录走，
// 连接串是绝对路径 `sqlite:<data_dir>/caseboard.db`，永远对不上固定的注册键。
// 所以结构建库改由 Rust 侧 ensure_db_file 直接执行（见 src/lib.rs），V1_SQL 是唯一真相，
// 语句全部 IF NOT EXISTS，可重复执行。

pub const V1_SQL: &str = r#"-- 案情板 CaseBoard · SQLite 基础结构（版本 1）
-- 设计取舍：实体表保存可查询的列（类型/状态/置信度/端点），同时用 payload 保存完整 JSON 对象，
-- 保证「数据库 → Document Model」逐字段无损；全文检索走 FTS5 独立索引表。

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  case_no TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  doc_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
  case_id TEXT NOT NULL,
  id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  group_id TEXT,
  x REAL NOT NULL,
  y REAL NOT NULL,
  w REAL NOT NULL,
  h REAL NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (case_id, id)
);

CREATE TABLE IF NOT EXISTS edges (
  case_id TEXT NOT NULL,
  id TEXT NOT NULL,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  rel_type TEXT NOT NULL,
  style TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (case_id, id)
);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges (case_id, source);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges (case_id, target);

CREATE TABLE IF NOT EXISTS groups (
  case_id TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (case_id, id)
);

CREATE TABLE IF NOT EXISTS assets (
  case_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  sha256 TEXT,
  zone TEXT NOT NULL DEFAULT 'evidence',
  ai_generated INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  PRIMARY KEY (case_id, id)
);
CREATE INDEX IF NOT EXISTS idx_assets_sha ON assets (case_id, sha256);

CREATE TABLE IF NOT EXISTS views (
  case_id TEXT NOT NULL,
  id TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (case_id, id)
);

-- 版本快照（时间机器）：每次保存若与上一快照差异超过阈值就留一份。
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  label TEXT NOT NULL,
  nodes INTEGER NOT NULL,
  edges INTEGER NOT NULL,
  doc_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_case ON snapshots (case_id, created_at DESC);

-- 回收站：删除的实体先入库，可在界面里恢复。
CREATE TABLE IF NOT EXISTS trash (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  label TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trash_case ON trash (case_id, deleted_at DESC);

-- 全文检索（FTS5）：实体标题/别名/字段/备注/素材 OCR 文本统一进索引。
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  case_id UNINDEXED,
  kind UNINDEXED,
  entity_id UNINDEXED,
  title,
  body,
  tokenize = 'unicode61'
);
"#;


