# Stats Worker setup

This small server collects one score per player per day so the daily page can show everyone's spread. It runs free on Cloudflare. You do these steps once.

Status: the Worker IS deployed (https://gnome-sweet-gnome-stats.gaoeric1234567890.workers.dev, first deployed 3 Nov 2026) and redeploys on every push to `main`. It is switched off on the page: `STATS_URL` in `assets/js/daily/config.js` is `null`, so nothing is sent or shown. Switching on is the last step below.

1. **Account and database.** Done. The D1 database `gnome-stats` exists and its ID is in `worker/wrangler.toml`.
2. **API token.** Done. It was made from the "Edit Cloudflare Workers" template, plus Account > D1 > Edit. The account ID is the second secret.
3. **GitHub secrets.** Done: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (repo Settings, Secrets and variables, Actions).
4. **First deploy.** It happens when the PR that adds `worker/` is merged to `main`: the `worker` job creates the tables and deploys the Worker (wrangler is pinned to 4.0.0). Later it runs on every push to `main` (and on a manual run: Actions > "Test and deploy" > Run workflow, on `main`), as long as the two Cloudflare secrets exist. There is no change filter: the Worker bundles shared files such as `config.js`, and a filter once missed one.
5. **Find the Worker URL.** It is `https://gnome-sweet-gnome-stats.<your-subdomain>.workers.dev`. Read it from the "Deploy the Worker" step log, or in Cloudflare under Workers & Pages > gnome-sweet-gnome-stats > Settings > Domains & Routes.
6. **Switch the page on.** Set that URL as `STATS_URL` in `assets/js/daily/config.js` and push. Until then the feature stays off.

Notes
- Free-tier limits (D1): 5M rows read and 100k rows written a day. An accepted result writes about 2 to 4 rows (the result, its key entry, and the count row, with its key entry the first time that score appears). A repeat post writes nothing. The stats page reads at most 101 pre-counted rows. So even 25,000 results a day fit.
- The count row is kept by a database trigger (`results_bump` in `schema.sql`), in the same statement as the insert, so results and counts cannot drift.
- Posts are limited to 10 a minute per caller address by a Workers Rate Limiting binding (`POST_LIMIT` in `wrangler.toml`), counted in memory by Cloudflare. The address is never stored.
- No IP addresses are stored. Rows hold a random device id, the mode, the date, the score, the tries and whether the hint was used.
- Local check of the handler (no Cloudflare needed): `node --test tools/worker-*.test.js`.

## Turn on bot protection (Cloudflare Turnstile)

Built and switched off. Without it anyone can post made-up scores. While `STATS_URL` is `null` nothing posts at all, so the order below only matters once stats are on. Do the steps in this order (the Worker refuses posts without a token as soon as `TURNSTILE_SECRET` is set, so the page must be sending tokens by the time the secret is live):

1. In Cloudflare, go to Turnstile > Add widget. Name it "Gnome Sweet Gnome daily", add the hostname `gnomesweetgnome.app`, and choose the Managed widget mode. Copy the **site key** (public) and the **secret key** (private). The Worker also requires Cloudflare to report the token's `hostname` as `gnomesweetgnome.app` (`TURNSTILE_HOSTNAME` in `src/handle.js`).
2. In one change and one deploy, do both of these:
   - set `TURNSTILE_SITE_KEY` in `assets/js/daily/config.js` to the site key, and
   - give the secret to the Worker as a GitHub secret named `TURNSTILE_SECRET` (repo Settings, Secrets and variables, Actions). The `worker` job puts it on the Worker at every deploy when it is not empty. (Or from your computer: `cd worker && npx wrangler@4.0.0 secret put TURNSTILE_SECRET`.)
   Add the GitHub secret first, then push the `config.js` change to `main`: that push deploys the page and the Worker together. Players with a cached old page may send without a token for a while and get 403; their results stay unsent and retry on a later load.
3. Only then set `STATS_URL` in `assets/js/daily/config.js` to `https://gnome-sweet-gnome-stats.gaoeric1234567890.workers.dev` (it can go in the same push as step 2 once the secret exists). The page now sends a result only with a Turnstile token, and the Worker refuses one without a good token (403).

Why this order: a page that sends a token to a Worker with no secret still works (the token is ignored), but a Worker with a secret and a page without a site key refuses every post (403). Never set the secret while the live page can post without a token.

To turn it off again: set `TURNSTILE_SITE_KEY` back to `null`, and delete the secret (`npx wrangler@4.0.0 secret delete TURNSTILE_SECRET` in `worker/`) and the GitHub secret.

The token is a field in the JSON body (`turnstile`), so the CORS settings (`Content-Type` only) already allow it. Local check: `node --test tools/worker-*.test.js` (the tests fake Cloudflare's reply).
