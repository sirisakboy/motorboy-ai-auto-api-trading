-- Migration: 0001_init.sql
-- Cloudflare D1 Schema for MotorBoy AI-TH (RSS Cache, 2-Stage AI Verification, Songs)

CREATE TABLE IF NOT EXISTS rss_feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'MACRO',
  last_fetched_at TEXT
);

CREATE TABLE IF NOT EXISTS rss_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  link TEXT NOT NULL UNIQUE,
  pub_date TEXT,
  content TEXT,
  FOREIGN KEY (feed_id) REFERENCES rss_feeds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rss_item_id INTEGER,
  rss_source TEXT NOT NULL DEFAULT 'RSS Feed',
  headline TEXT NOT NULL DEFAULT '',
  cf_ai_model TEXT NOT NULL DEFAULT '@cf/meta/llama-3-8b-instruct',
  cf_ai_status TEXT NOT NULL DEFAULT 'OK',
  cf_ai_summary TEXT NOT NULL,
  main_ai_model TEXT NOT NULL DEFAULT 'MotorBoy Primary AI',
  main_ai_verdict TEXT NOT NULL,
  main_ai_summary TEXT NOT NULL DEFAULT '',
  sentiment TEXT NOT NULL DEFAULT 'NEUTRAL',
  confidence REAL NOT NULL DEFAULT 80,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (rss_item_id) REFERENCES rss_items(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rss_items_feed_id ON rss_items(feed_id);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_created_at ON ai_analysis(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_rss_item_id ON ai_analysis(rss_item_id);

-- Seed default self-hosted background music (/assets/song.mp3)
INSERT OR IGNORE INTO songs (filename, title)
VALUES ('/assets/song.mp3', 'MotorBoy Calm Ambient Loop');

-- Seed default verified financial RSS feeds
INSERT OR IGNORE INTO rss_feeds (url, title, category) VALUES
  ('https://www.coindesk.com/arc/outboundfeeds/rss/', 'CoinDesk', 'CRYPTO'),
  ('https://cointelegraph.com/rss', 'Cointelegraph', 'CRYPTO'),
  ('https://decrypt.co/feed', 'Decrypt', 'CRYPTO'),
  ('https://www.theblock.co/rss.xml', 'The Block', 'CRYPTO'),
  ('https://finance.yahoo.com/rss/topstories', 'Yahoo Top Stories', 'YAHOO_WORLD'),
  ('https://finance.yahoo.com/news/rssindex', 'Yahoo Finance World', 'YAHOO_WORLD'),
  ('https://feeds.bbci.co.uk/news/business/rss.xml', 'BBC Business', 'MACRO'),
  ('https://www.cnbc.com/id/100003114/device/rss/rss.html', 'CNBC Top News', 'MACRO'),
  ('https://www.bangkokpost.com/rss/data/business.xml', 'Bangkok Post Business', 'MSN_MONEY'),
  ('https://www.kaohoon.com/feed', 'Kaohoon', 'MSN_MONEY');
