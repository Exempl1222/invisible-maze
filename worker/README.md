# Stats Worker setup

This small server collects one score per player per day so the daily page can show everyone's spread. It runs free on Cloudflare. You do these steps once.

1. **Make a free Cloudflare account** at cloudflare.com (no card needed).
2. **Create a D1 database** named `gnome-stats`. Done: it exists and its ID is already in `worker/wrangler.toml`.
3. **Create an API token** (My Profile, API Tokens, Create Token, Custom token) with two permissions: **Workers Scripts: Edit** and **D1: Edit** (account level). Also note your **Account ID** (shown on the dashboard sidebar).
4. **Add two GitHub repository secrets** (repo Settings, Secrets and variables, Actions): `CLOUDFLARE_API_TOKEN` (the token) and `CLOUDFLARE_ACCOUNT_ID` (the account id).
5. **Push to `main`.** The `worker` job creates the tables and deploys the Worker. It runs only when `worker/`, the engine or the levels changed, and is skipped quietly while the secrets are missing.
6. **Put the Worker's address into the page.** After the first deploy the job log shows a URL like `https://gnome-sweet-gnome-stats.<your-name>.workers.dev`. Set it as `STATS_URL` in `assets/js/daily/config.js` and push. Until then the feature stays off.

Notes
- Free-tier limits (D1): 5M rows read and 100k rows written a day. A result is two writes, a repeat post writes nothing, and the stats page reads at most 101 pre-counted rows, so this is far from the limit.
- No IP addresses are stored. Rows hold a random device id, the mode, the date, the score, the tries and whether the hint was used.
- Local check of the handler (no Cloudflare needed): `node --test tools/worker-*.test.js`.
