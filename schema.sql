-- ============================================
-- GOLDENBRIX DATABASE SCHEMA
-- ============================================

-- Users table: Stores all Telegram users
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER UNIQUE NOT NULL,
  username TEXT,
  ton_address TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Golden Brix table: Completed celebrations
CREATE TABLE IF NOT EXISTS golden_brix (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supporter_id INTEGER NOT NULL,
  creator_id INTEGER NOT NULL,
  tip_amount REAL NOT NULL,
  boost_fee REAL NOT NULL,
  message TEXT,
  tip_tx_hash TEXT,
  boost_tx_hash TEXT,
  pinned_until INTEGER,
  views INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (supporter_id) REFERENCES users(id),
  FOREIGN KEY (creator_id) REFERENCES users(id)
);

-- Payment requests table: Tracks pending Golden Brix
CREATE TABLE IF NOT EXISTS payment_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  supporter_id INTEGER NOT NULL,
  creator_id INTEGER NOT NULL,
  tip_amount REAL NOT NULL,
  boost_fee REAL NOT NULL,
  tip_paid INTEGER DEFAULT 0,
  boost_paid INTEGER DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (supporter_id) REFERENCES users(id),
  FOREIGN KEY (creator_id) REFERENCES users(id)
);

-- Leaderboards table: Cached rankings
CREATE TABLE IF NOT EXISTS leaderboards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  track TEXT NOT NULL,
  golden_brix_sent INTEGER DEFAULT 0,
  total_sent_amount REAL DEFAULT 0,
  golden_brix_received INTEGER DEFAULT 0,
  total_received_amount REAL DEFAULT 0,
  rank_architect INTEGER,
  rank_builder INTEGER,
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, track)
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_users_telegram_id 
ON users(telegram_id);

CREATE INDEX IF NOT EXISTS idx_golden_brix_created_at 
ON golden_brix(created_at);

CREATE INDEX IF NOT EXISTS idx_golden_brix_supporter 
ON golden_brix(supporter_id);

CREATE INDEX IF NOT EXISTS idx_golden_brix_creator 
ON golden_brix(creator_id);

CREATE INDEX IF NOT EXISTS idx_payment_requests_code 
ON payment_requests(code);

CREATE INDEX IF NOT EXISTS idx_payment_requests_expires 
ON payment_requests(expires_at);

CREATE INDEX IF NOT EXISTS idx_leaderboards_track 
ON leaderboards(track);

CREATE INDEX IF NOT EXISTS idx_leaderboards_user 
ON leaderboards(user_id);
