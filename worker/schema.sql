-- Gnome Sweet Gnome stats. Run on every deploy, so every statement is safe to repeat.
-- No IP addresses and nothing personal: `device` is a random id the page makes for itself.

CREATE TABLE IF NOT EXISTS results (
  device   TEXT    NOT NULL,           -- random id, made once per browser
  mode     TEXT    NOT NULL,           -- easy or hard
  date     TEXT    NOT NULL,           -- the day of the puzzle, YYYY-MM-DD
  score    INTEGER NOT NULL,           -- 0 to 100, worked out by the server
  tries    INTEGER NOT NULL,           -- 1 to 3
  hint     INTEGER NOT NULL,           -- 0 or 1
  received TEXT    NOT NULL,           -- the UTC day the result arrived
  PRIMARY KEY (device, mode, date)     -- one result per device, mode and day
);

-- Pre-counted scores, so GET /stats reads at most 101 rows however many players there are
-- (the D1 free tier caps rows read per day). Kept in step by the trigger below.
CREATE TABLE IF NOT EXISTS counts (
  mode  TEXT    NOT NULL,
  date  TEXT    NOT NULL,
  score INTEGER NOT NULL,
  n     INTEGER NOT NULL,
  PRIMARY KEY (mode, date, score)
);

-- Every accepted result bumps its score count in the same statement. A repeat post is ignored by the
-- primary key of results, so no row is inserted and the trigger does not fire.
CREATE TRIGGER IF NOT EXISTS results_bump AFTER INSERT ON results
BEGIN
  INSERT INTO counts (mode, date, score, n) VALUES (NEW.mode, NEW.date, NEW.score, 1)
  ON CONFLICT (mode, date, score) DO UPDATE SET n = n + 1;
END;
