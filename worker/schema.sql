-- Gnome Sweet Gnome stats. Run on every deploy, so every statement is safe to repeat.
-- No IP addresses and nothing personal: `device` is a random id the page makes for itself.

CREATE TABLE IF NOT EXISTS results (
  device   TEXT    NOT NULL,           -- random id, made once per browser
  mode     TEXT    NOT NULL,           -- 'easy' or 'hard'
  date     TEXT    NOT NULL,           -- the puzzle's day, YYYY-MM-DD
  score    INTEGER NOT NULL,           -- 0 to 100, worked out by the server
  tries    INTEGER NOT NULL,           -- 1 to 3
  hint     INTEGER NOT NULL,           -- 0 or 1
  received TEXT    NOT NULL,           -- the UTC day the result arrived
  PRIMARY KEY (device, mode, date)     -- one result per device, mode and day
);

CREATE INDEX IF NOT EXISTS results_by_day ON results (mode, date);

-- Pre-counted scores, so GET /stats reads at most 101 rows however many players there are
-- (D1's free tier caps rows read per day). Bumped in the same batch as the insert into results.
CREATE TABLE IF NOT EXISTS counts (
  mode  TEXT    NOT NULL,
  date  TEXT    NOT NULL,
  score INTEGER NOT NULL,
  n     INTEGER NOT NULL,
  PRIMARY KEY (mode, date, score)
);
