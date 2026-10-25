-- Petalune (fictional studio) — schema for Cloudflare D1 (SQLite).
-- All instants are UTC unix seconds (INTEGER). Wall-clock rules (working hours) are minutes from
-- local midnight in settings.time_zone. Money is integer cents.

CREATE TABLE settings (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  studio_name    TEXT    NOT NULL,
  time_zone      TEXT    NOT NULL,                 -- IANA zone, e.g. Europe/Berlin
  currency       TEXT    NOT NULL DEFAULT 'USD',
  step_min       INTEGER NOT NULL CHECK (step_min BETWEEN 5 AND 120),
  buffer_min     INTEGER NOT NULL CHECK (buffer_min BETWEEN 0 AND 120),
  min_notice_min INTEGER NOT NULL CHECK (min_notice_min BETWEEN 0 AND 10080),
  horizon_days   INTEGER NOT NULL CHECK (horizon_days BETWEEN 1 AND 90),
  max_active_per_customer INTEGER NOT NULL DEFAULT 6,
  comment_max    INTEGER NOT NULL DEFAULT 300
);

CREATE TABLE services (
  id           TEXT PRIMARY KEY,
  name         TEXT    NOT NULL,
  category     TEXT    NOT NULL,
  description  TEXT    NOT NULL DEFAULT '',
  duration_min INTEGER NOT NULL CHECK (duration_min BETWEEN 5 AND 480),
  price_cents  INTEGER NOT NULL CHECK (price_cents >= 0),
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE staff (
  id         TEXT PRIMARY KEY,
  name       TEXT    NOT NULL,
  role       TEXT    NOT NULL DEFAULT '',
  color_a    TEXT    NOT NULL DEFAULT '#999999',
  color_b    TEXT    NOT NULL DEFAULT '#666666',
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE staff_services (
  staff_id   TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, service_id)
);

-- One row per specialist per working weekday (0 = Sunday). No row = day off.
CREATE TABLE working_hours (
  staff_id  TEXT    NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  weekday   INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_min INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1440),
  end_min   INTEGER NOT NULL CHECK (end_min BETWEEN 0 AND 1440),
  CHECK (end_min > start_min),
  PRIMARY KEY (staff_id, weekday)
);

-- Blocked time. staff_id NULL = the whole studio.
CREATE TABLE time_off (
  id         TEXT PRIMARY KEY,
  staff_id   TEXT REFERENCES staff(id) ON DELETE CASCADE,
  start_at   INTEGER NOT NULL,
  end_at     INTEGER NOT NULL,
  reason     TEXT    NOT NULL DEFAULT '',
  created_by TEXT,
  created_at INTEGER NOT NULL,
  CHECK (end_at > start_at)
);
CREATE INDEX time_off_range ON time_off(start_at, end_at);

-- Customers are keyed by their Telegram user id (validated from initData, never from the client body).
CREATE TABLE customers (
  id                 TEXT PRIMARY KEY,   -- Telegram user id (string to be safe with 64-bit ids)
  first_name         TEXT NOT NULL DEFAULT '',
  last_name          TEXT NOT NULL DEFAULT '',
  username           TEXT NOT NULL DEFAULT '',
  language_code      TEXT NOT NULL DEFAULT '',
  allows_write_to_pm INTEGER NOT NULL DEFAULT 0,
  bot_started        INTEGER NOT NULL DEFAULT 0, -- set by the webhook on /start
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE TABLE bookings (
  id              TEXT PRIMARY KEY,
  customer_id     TEXT    NOT NULL REFERENCES customers(id),
  service_id      TEXT    NOT NULL REFERENCES services(id),
  staff_id        TEXT    NOT NULL REFERENCES staff(id),
  start_at        INTEGER NOT NULL,
  end_at          INTEGER NOT NULL,
  duration_min    INTEGER NOT NULL,
  price_cents     INTEGER NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'no_show')),
  client_name     TEXT    NOT NULL DEFAULT '',
  comment         TEXT    NOT NULL DEFAULT '',
  source          TEXT    NOT NULL DEFAULT 'miniapp',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  cancelled_at    INTEGER,
  reminder_24h_at INTEGER,   -- set atomically by the reminders Worker (idempotent "sent" flag)
  reminder_2h_at  INTEGER,
  CHECK (end_at > start_at)
);
-- Guard 1: two confirmed bookings can never share a staff member + start instant.
CREATE UNIQUE INDEX bookings_staff_start_active ON bookings(staff_id, start_at) WHERE status = 'confirmed';
CREATE INDEX bookings_staff_range ON bookings(staff_id, start_at, end_at);
CREATE INDEX bookings_customer ON bookings(customer_id, start_at);
CREATE INDEX bookings_status_start ON bookings(status, start_at);

-- Guard 2: overlapping intervals (incl. the clean-up buffer) and time off are rejected inside the DB,
-- in the same implicit transaction as the write. The API maps 'slot_taken' to HTTP 409.
CREATE TRIGGER bookings_no_overlap_insert BEFORE INSERT ON bookings
WHEN NEW.status = 'confirmed'
BEGIN
  SELECT RAISE(ABORT, 'slot_taken') WHERE EXISTS (
    SELECT 1 FROM bookings b, settings s
    WHERE s.id = 1 AND b.staff_id = NEW.staff_id AND b.status = 'confirmed'
      AND b.start_at < NEW.end_at + s.buffer_min * 60 AND b.end_at + s.buffer_min * 60 > NEW.start_at
  ) OR EXISTS (
    SELECT 1 FROM time_off t
    WHERE (t.staff_id = NEW.staff_id OR t.staff_id IS NULL) AND t.start_at < NEW.end_at AND t.end_at > NEW.start_at
  );
END;

CREATE TRIGGER bookings_no_overlap_update BEFORE UPDATE OF start_at, end_at, staff_id, status ON bookings
WHEN NEW.status = 'confirmed'
BEGIN
  SELECT RAISE(ABORT, 'slot_taken') WHERE EXISTS (
    SELECT 1 FROM bookings b, settings s
    WHERE s.id = 1 AND b.id <> NEW.id AND b.staff_id = NEW.staff_id AND b.status = 'confirmed'
      AND b.start_at < NEW.end_at + s.buffer_min * 60 AND b.end_at + s.buffer_min * 60 > NEW.start_at
  ) OR EXISTS (
    SELECT 1 FROM time_off t
    WHERE (t.staff_id = NEW.staff_id OR t.staff_id IS NULL) AND t.start_at < NEW.end_at AND t.end_at > NEW.start_at
  );
END;

-- Idempotency keys for create / cancel / reschedule (per user). Pruned by the reminders Worker after 48h.
CREATE TABLE idempotency_keys (
  key          TEXT PRIMARY KEY,   -- '<telegram user id>:<Idempotency-Key header>'
  request_hash TEXT    NOT NULL,
  status       INTEGER NOT NULL DEFAULT 0,  -- 0 = in progress
  body         TEXT,
  created_at   INTEGER NOT NULL
);

-- Fixed-window rate limiting per user and bucket.
CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);
