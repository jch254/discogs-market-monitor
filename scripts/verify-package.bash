#!/bin/bash -e

# Verifies the Serverless deployment package is safe to ship:
#
# 1. node-tls-client/koffi native packaging — these are excluded from the
#    esbuild bundle (see build.esbuild.external in serverless.yml) and must be
#    present as real node_modules, including koffi's Linux x64 native binary,
#    or the sell-page scraper dies on first invocation in Lambda.
# 2. State machine semantics — the ProcessReleases Map must tolerate partial
#    failure (so one blocked release can't kill a whole run) and retry per
#    release with bounded attempts.
#
# Usage: ./scripts/verify-package.bash [--skip-package]
# (--skip-package inspects an existing .serverless/ output instead of
# repackaging.)

cd "$(dirname "$0")/.."

if [[ "${1:-}" != "--skip-package" ]]; then
  pnpm run package
fi

ZIP=.serverless/discogs-market-monitor-checkReleaseMarketplace.zip
TEMPLATE=.serverless/cloudformation-template-update-stack.json

fail() {
  echo "VERIFY FAILED: $1" >&2
  exit 1
}

[[ -f "$ZIP" ]] || fail "$ZIP not found - did serverless package run?"
[[ -f "$TEMPLATE" ]] || fail "$TEMPLATE not found - did serverless package run?"

listing=$(unzip -l "$ZIP")

echo "$listing" | grep -q "koffi/build/koffi/linux_x64/koffi.node" \
  || fail "koffi Linux x64 native binary missing from $ZIP"
echo "$listing" | grep -q "node-tls-client" \
  || fail "node-tls-client missing from $ZIP"
echo "$listing" | grep -q "cookie-parser" \
  || fail "node-tls-client dependency cookie-parser missing from $ZIP"

# The ASL is embedded in the template as an escaped JSON string, so quotes
# appear as \" - match both forms. The expected threshold comes from
# serverless.yml so tuning it there can't silently drift from this check.
tolerated=$(grep -oE 'ToleratedFailurePercentage: [0-9]+' serverless.yml | grep -oE '[0-9]+')
[[ -n "$tolerated" ]] || fail "ToleratedFailurePercentage not found in serverless.yml"
grep -Eq "ToleratedFailurePercentage\\\\?\": $tolerated" "$TEMPLATE" \
  || fail "ProcessReleases Map ToleratedFailurePercentage: $tolerated missing from generated ASL"
grep -Eq 'MaxConcurrency\\?": 2' "$TEMPLATE" \
  || fail "ProcessReleases Map MaxConcurrency: 2 missing from generated ASL"
grep -Eq 'MaxAttempts\\?": 3' "$TEMPLATE" \
  || fail "CheckRelease Retry MaxAttempts: 3 missing from generated ASL"

echo "Package verification passed:"
echo "  - koffi linux_x64 native binary packaged"
echo "  - node-tls-client + cookie deps packaged"
echo "  - ASL has ToleratedFailurePercentage $tolerated, MaxConcurrency 2, bounded Retry"
