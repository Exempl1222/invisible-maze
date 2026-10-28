// Settings for the standalone daily page.

/** The link from the daily to the full game. Built, switched off: flip `enabled` when the app is ready to be linked. */
export const APP_LINK = { enabled: false, href: '../play/', label: 'More gnome puzzles' };

/** Tries a day. A try is spent when the player presses Go. */
export const MAX_TRIES = 3;

/** The one localStorage key for the daily, separate from the full game's. */
export const STORAGE_KEY = 'gnome-sweet-gnome:daily:v2';

/** The v1 key (one shared puzzle). Read once to carry old records into Hard, then left alone. */
export const V1_KEY = 'gnome-sweet-gnome:daily:v1';

/** The two dailies. `Easy` is 7x7, `Hard` is 9x9; both share the day number. */
export const MODES = ['easy', 'hard'];
export const DEFAULT_MODE = 'easy';
export const MODE_LABEL = { easy: 'Easy', hard: 'Hard' };
export const LEVEL_URL = { easy: '../assets/levels/daily-easy.json', hard: '../assets/levels/daily.json' };
