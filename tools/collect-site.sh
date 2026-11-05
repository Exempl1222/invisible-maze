#!/usr/bin/env bash
# Collects the public site into a folder, the same way for the deploy and for the CI smoke test.
#   tools/collect-site.sh <out-dir> [commit-sha]
# With a commit sha the own .js/.json/.css references are stamped ?v=<sha> (tools/stamp-version.mjs, deploy-only cache busting).
# Run from the repo root. The out dir must not exist yet.
set -euo pipefail
out="${1:?usage: tools/collect-site.sh <out-dir> [commit-sha]}"
sha="${2:-}"
mkdir "$out"
cp -r index.html play daily assets "$out"/
if [ -d src/game ] && ls src/game/*.js >/dev/null 2>&1; then
  mkdir -p "$out/src" && cp -r src/game "$out/src/"
  find "$out/src" -name '*.test.js' -delete
fi
touch "$out/.nojekyll"
if [ -n "$sha" ]; then
  node tools/stamp-version.mjs "$out" "$sha"
fi
