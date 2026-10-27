// Settings for the standalone daily page.

/** The link from the daily to the full game. Built, switched off: flip `enabled` when the app is ready to be linked. */
export const APP_LINK = { enabled: false, href: '../play/', label: 'More gnome puzzles' };

/** Tries a day. A try is spent when the player presses Go. */
export const MAX_TRIES = 3;

/** The one localStorage key for the daily, separate from the full game's. */
export const STORAGE_KEY = 'gnome-sweet-gnome:daily:v1';

export const DAILY_URL = '../assets/levels/daily.json';
