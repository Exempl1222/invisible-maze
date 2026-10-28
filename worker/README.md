# Stats Worker setup

This small server collects one score per player per day so the daily page can show everyone's spread. It runs free on Cloudflare. You do these steps once.

Status: the Cloudflare account, the D1 database, the two GitHub secrets and the workers.dev subdomain are all done. What is left is the first deploy and one config line.

1. **Account and database.** Done. The D1 database `gnome-stats` exists and its ID is in `worker/wrangler.toml`.
2. **API token.** Done. It was made from the "Edit Cloudflare Workers" template, plus Account > D1 > Edit. The account ID is the second secret.
3. **GitHub secrets.** Done: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (repo Settings, Secrets and variables, Actions).
4. **First deploy.** It happens when the PR that adds `worker/` is merged to `main`: the `worker` job creates the tables and deploys the Worker (wrangler is pinned to 4.0.0). Later it runs only when `worker/`, the engine, the levels, the judge or the workflow file changed. If it ever needs a manual redeploy: Actions > "Test and deploy" > Run workflow, on `main` (a manual run always deploys).
5. **Find the Worker URL.** It is `https://gnome-sweet-gnome-stats.<your-subdomain>.workers.dev`. Read it from the "Deploy the Worker" step log, or in Cloudflare under Workers & Pages > gnome-sweet-gnome-stats > Settings > Domains & Routes.
6. **Switch the page on.** Set that URL as `STATS_URL` in `assets/js/daily/config.js` and push. Until then the feature stays off.

Notes
- Free-tier limits (D1): 5M rows read and 100k rows written a day. An accepted result writes about 2 to 4 rows (the result, its key entry, and the count row, with its key entry the first time that score appears). A repeat post writes nothing. The stats page reads at most 101 pre-counted rows. So even 25,000 results a day fit.
- The count row is kept by a database trigger (`results_bump` in `schema.sql`), in the same statement as the insert, so results and counts cannot drift.
- Posts are limited to 10 a minute per caller address by a Workers Rate Limiting binding (`POST_LIMIT` in `wrangler.toml`), counted in memory by Cloudflare. The address is never stored.
- No IP addresses are stored. Rows hold a random device id, the mode, the date, the score, the tries and whether the hint was used.
- Local check of the handler (no Cloudflare needed): `node --test tools/worker-*.test.js`.
