-- ==========================================
-- 1. 基础用户与配置 (与线上 D1 hfut-db 同步)
-- ==========================================

-- 用户表
CREATE TABLE IF NOT EXISTS Users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    password_hash TEXT NOT NULL,
    token_version INTEGER NOT NULL DEFAULT 0, -- bump after password reset to revoke JWT
    email_verified INTEGER DEFAULT 0, -- 0:未验证, 1:已验证
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    salt TEXT,
    is_legacy INTEGER DEFAULT 0,
    leancloud_id TEXT,
    updated_at TEXT,
    verification_code TEXT,
    code_expires_at INTEGER
);

-- 系统配置表 (用于版本检查等配置)
CREATE TABLE IF NOT EXISTS SystemConfig (
    key TEXT PRIMARY KEY,   -- 例如 "app_version"
    value TEXT,             -- 例如 "5.2.6"
    changelog TEXT,         -- 更新日志
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 在线状态表
CREATE TABLE IF NOT EXISTS UserPresence (
    user_id INTEGER PRIMARY KEY,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 2. 刷题核心数据
-- ==========================================

-- 错题统计表 (记录全站题目数据)
CREATE TABLE IF NOT EXISTS QuestionStats (
    question_id TEXT PRIMARY KEY, -- 例如 "L1-5"
    question_title TEXT,
    category TEXT,
    error_count INTEGER DEFAULT 0,
    total_attempts INTEGER DEFAULT 0,
    option_stats TEXT, -- 存 JSON 字符串 {"A":10, "B":5}
    leancloud_id TEXT
);

-- 用户个人进度表
CREATE TABLE IF NOT EXISTS UserProgress (
    user_id INTEGER PRIMARY KEY,
    brushed_ids TEXT,    -- JSON Array "[...]"
    wrong_ids TEXT,      -- JSON Array
    mastered_ids TEXT,   -- JSON Array
    memorized_ids TEXT,  -- JSON Array
    history TEXT,        -- JSON Array (最近历史)
    patched_v2 INTEGER DEFAULT 0, -- 故障补录标记 (0或1)
    updated_at TIMESTAMP,
    leancloud_user_id TEXT,
    favorite_ids TEXT    -- JSON Array
);

-- ==========================================
-- 3. 社交互动 (评论与解析)
-- ==========================================

-- 题目评论表
CREATE TABLE IF NOT EXISTS Comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    likes INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    leancloud_author_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_comments_qid ON Comments(question_id);

-- 评论点赞记录表
CREATE TABLE IF NOT EXISTS CommentLikes (
    user_id INTEGER NOT NULL,
    comment_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    leancloud_user_id TEXT,
    leancloud_comment_id TEXT,
    PRIMARY KEY (user_id, comment_id) -- 联合主键，防止重复点赞
);

-- 用户解析表
CREATE TABLE IF NOT EXISTS Explanations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    votes INTEGER DEFAULT 0, -- 点赞数
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    leancloud_author_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_explanations_qid ON Explanations(question_id);

-- 解析点赞记录表
CREATE TABLE IF NOT EXISTS ExplanationLikes (
    user_id INTEGER NOT NULL,
    explanation_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    leancloud_user_id TEXT,
    leancloud_explanation_id TEXT,
    PRIMARY KEY (user_id, explanation_id)
);

-- HFUT-CS-Online extension progress: separate from Question-Bank UserProgress.
-- Use an optimistic version counter to protect concurrent device merges.
CREATE TABLE IF NOT EXISTS SiteSyncState (
    user_id INTEGER PRIMARY KEY REFERENCES Users(id) ON DELETE CASCADE,
    payload TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Independent email password reset flow. Codes are stored as keyed HMAC hashes.
-- Does not reuse Users.verification_code (registration-only).
CREATE TABLE IF NOT EXISTS PasswordResetRequests (
    user_id INTEGER PRIMARY KEY REFERENCES Users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_sent_at INTEGER NOT NULL,
    window_start INTEGER NOT NULL,
    window_count INTEGER NOT NULL DEFAULT 1
);

-- HMAC of Cloudflare-provided IP + JWT_SECRET, not plaintext IP addresses.
CREATE TABLE IF NOT EXISTS PasswordResetIpRate (
    ip_hash TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0
);
