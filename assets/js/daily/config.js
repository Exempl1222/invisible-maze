// Settings for the standalone daily page.

/** The link from the daily to the full game. Built, switched off: flip `enabled` when the app is ready to be linked. */
export const APP_LINK = { enabled: false, href: '../play/', label: 'More gnome puzzles' };

/** Tries a day. A try is spent when the player presses Go. (Was 3 before v3.1.) */
export const MAX_TRIES = 5;

/** The old cap. A day lost on 3 tries was finished then and stays finished and sendable (score 0). */
export const LEGACY_MAX_TRIES = 3;

/**
 * The first puzzle date played entirely under the 5-try rule. v3.1 went live on 3 Nov 2026 (about 18:00 Sydney),
 * so a day dated up to 3 Nov may have been lost on 3 tries. The Worker accepts a no-win post with LEGACY_MAX_TRIES
 * only for dates before this one.
 */
export const FIVE_TRIES_FROM = '2026-11-04';

/** The one localStorage key for the daily, separate from the full game's. */
export const STORAGE_KEY = 'gnome-sweet-gnome:daily:v2';

/** The v1 key (one shared puzzle). Read once to carry old records into Hard, then left alone. */
export const V1_KEY = 'gnome-sweet-gnome:daily:v1';

/** The two dailies. `Easy` is 7x7, `Hard` is 9x9; both share the day number. */
export const MODES = ['easy', 'hard'];
export const DEFAULT_MODE = 'easy';
export const MODE_LABEL = { easy: 'Easy', hard: 'Hard' };
export const LEVEL_URL = { easy: '../assets/levels/daily-easy.json', hard: '../assets/levels/daily.json' };

/**
 * The stats server (worker/), e.g. 'https://gnome-sweet-gnome-stats.<you>.workers.dev'. `null` turns everyone's scores off:
 * nothing is sent and nothing is shown. Leave it null until the Worker is deployed (see worker/README.md).
 */
export const STATS_URL = null;

/**
 * Cloudflare Turnstile site key (public). `null` turns bot protection off: nothing changes and no external script
 * loads. Set it only together with the Worker's TURNSTILE_SECRET (see worker/README.md, "Turn on bot protection").
 */
export const TURNSTILE_SITE_KEY = null;
