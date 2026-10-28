// Cloudflare Worker entry: the request handling lives in handle.js (pure, tested in node).
import { handle } from './handle.js';
import LEVELS from './levels.js';

export default {
  fetch(request, env) {
    return handle(request, { ...env, LEVELS }, Date.now());
  },
};
