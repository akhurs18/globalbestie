#!/usr/bin/env bash
# One-shot helper to commit and push everything Claude has changed.
# Claude can edit files in this folder but cannot touch .git/ internals or
# reach the network outside the sandbox allowlist — so the actual git push
# always has to run from your own terminal.
#
# Usage:
#   bash push.sh              # uses a default commit message
#   bash push.sh "your msg"   # uses your message
#
# This script:
#   1. Removes any stuck .git/index.lock from interrupted prior runs.
#   2. Stages every change (tracked + new files).
#   3. Bails out if there's nothing to commit.
#   4. Commits with the message you pass (or a sensible default).
#   5. Pushes to origin on the current branch.

set -euo pipefail

cd "$(dirname "$0")"

# 1. Clear any stale lock file. Harmless if there isn't one.
rm -f .git/index.lock

# 2. Stage everything.
git add -A

# 3. If there's nothing to commit, just try a push (in case earlier commits
#    are sitting unpushed) and exit.
if git diff --cached --quiet; then
  echo "Nothing new to commit. Pushing in case there are unpushed commits…"
  git push origin "$(git branch --show-current)"
  exit 0
fi

# 4. Commit. Falls back to a sensible default if no message arg was given.
COMMIT_MSG="${1:-Claude session: update product flow, cashflow, and admin polish}"
git commit -m "$COMMIT_MSG"

# 5. Push.
git push origin "$(git branch --show-current)"

echo "✓ Pushed to origin/$(git branch --show-current)"
