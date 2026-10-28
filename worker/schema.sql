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

-- Posts per device per UTC day, for the abuse limit. Old rows are cleared as new posts arrive.
CREATE TABLE IF NOT EXISTS rate (
  device TEXT    NOT NULL,
  day    TEXT    NOT NULL,
  n      INTEGER NOT NULL,
  PRIMARY KEY (device, day)
);
