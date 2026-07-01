-- ============================================================
--  AniToki — схема базы данных (Cloudflare D1 / SQLite).
--  Применить:  wrangler d1 execute aniverse --file=schema.sql --remote
--  (локально для теста — без --remote)
-- ============================================================

-- Пользователи -------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT    NOT NULL UNIQUE,          -- всегда в нижнем регистре
  username       TEXT    NOT NULL UNIQUE,          -- отображаемое имя
  username_lc    TEXT    NOT NULL UNIQUE,          -- для регистронезависимой уникальности
  password_hash  TEXT    NOT NULL,                 -- PBKDF2-SHA256, hex
  password_salt  TEXT    NOT NULL,                 -- соль, hex
  email_verified INTEGER NOT NULL DEFAULT 0,       -- 0/1
  role           TEXT    NOT NULL DEFAULT 'user',  -- 'user' | 'admin'
  created_at     INTEGER NOT NULL,                 -- unix ms
  banned_until   INTEGER NOT NULL DEFAULT 0,       -- unix ms; >now() = забанен
  muted_until    INTEGER NOT NULL DEFAULT 0,       -- unix ms; >now() = не может писать
  mod_reason     TEXT    NOT NULL DEFAULT '',      -- причина бана/мута (для пользователя)
  reputation     INTEGER NOT NULL DEFAULT 0        -- репутация (лайки−дизлайки на своих комментах) → уровень
);

-- Токены подтверждения почты ----------------------------------
CREATE TABLE IF NOT EXISTS email_tokens (
  token      TEXT    PRIMARY KEY,                  -- случайный, hex
  user_id    INTEGER NOT NULL,
  purpose    TEXT    NOT NULL DEFAULT 'verify',    -- 'verify' | 'reset'
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Сессии (в куке — сырой токен, в БД — его SHA-256) ------------
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT    PRIMARY KEY,                  -- SHA-256(токен), hex
  user_id    INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Комментарии --------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  anime_id   TEXT    NOT NULL,                     -- id тайтла из каталога (data.js)
  user_id    INTEGER NOT NULL,
  body       TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,           -- 0/1 (мягкое удаление)
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_comments_anime ON comments(anime_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_user  ON comments(user_id);

-- Голоса за комментарии (лайк/дизлайк) -------------------------
CREATE TABLE IF NOT EXISTS comment_votes (
  comment_id INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  value      INTEGER NOT NULL,                     -- +1 | -1
  PRIMARY KEY (comment_id, user_id),
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
);

-- Жалобы (на комментарий или на пользователя) ------------------
CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT    NOT NULL,                    -- 'comment' | 'user'
  target_id   INTEGER NOT NULL,                    -- id комментария или пользователя
  anime_id    TEXT    NOT NULL DEFAULT '',         -- контекст (для жалоб на комментарий)
  reporter_id INTEGER NOT NULL,
  reason      TEXT    NOT NULL DEFAULT '',
  status      TEXT    NOT NULL DEFAULT 'open',     -- 'open' | 'resolved'
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);

-- Анти-спам / лимит действий по IP (регистрация и т.п.) --------
CREATE TABLE IF NOT EXISTS rate_events (
  bucket     TEXT    NOT NULL,                     -- напр. 'register:1.2.3.4'
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_bucket ON rate_events(bucket, created_at);
