// Cloudflare Turnstile on the page, switched off until TURNSTILE_SITE_KEY is set (config.js). The script is only
// loaded when a result is about to be sent. Any failure gives null, which means "don't send this time": the same as
// the stats server being down. It never blocks play.
import { TURNSTILE_SITE_KEY } from './config.js';

export const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TIMEOUT_MS = 20000;

const loading = new WeakMap(); // window -> the script's load, so two sends share one script tag

function loadScript(doc, win) {
  if (win.turnstile) return Promise.resolve(win.turnstile);
  if (!loading.has(win)) {
    const ready = new Promise((resolve, reject) => {
      const s = doc.createElement('script');
      s.src = SCRIPT_URL;
      s.async = true;
      s.onload = () => (win.turnstile ? resolve(win.turnstile) : reject(new Error('turnstile missing')));
      s.onerror = () => reject(new Error('turnstile script failed'));
      doc.head.appendChild(s);
    }).catch((e) => { loading.delete(win); throw e; }); // a later send may try again
    loading.set(win, ready);
  }
  return loading.get(win);
}

/**
 * A fresh Turnstile token, or null (off, blocked, offline, failed or too slow). `siteKey` null: off, nothing loads.
 * `doc` and `win` are the page's document and window (parameters so a test can fake them).
 */
export async function getToken(siteKey = TURNSTILE_SITE_KEY, doc = document, win = window) {
  if (!siteKey) return null;
  let host;
  let widget = null;
  let api;
  try {
    api = await loadScript(doc, win);
    host = doc.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:50'; // shown only if Cloudflare needs the player to tick a box
    doc.body.appendChild(host);
    return await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), TIMEOUT_MS);
      const done = (v) => { clearTimeout(timer); resolve(v); };
      try {
        widget = api.render(host, {
          sitekey: siteKey,
          appearance: 'interaction-only', // invisible unless a challenge is needed
          callback: (token) => done(typeof token === 'string' && token !== '' ? token : null),
          'error-callback': () => done(null),
          'timeout-callback': () => done(null),
        });
      } catch {
        done(null);
      }
    });
  } catch {
    return null;
  } finally {
    try { if (widget !== null) api.remove(widget); } catch { /* already gone */ }
    host?.remove();
  }
}
