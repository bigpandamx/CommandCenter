#!/usr/bin/env bash
#
# Sync changes from this repo's embedded Aegis/ working copy back to a
# real Aegis repo checkout, per the dev workflow: engineers develop
# against Aegis/ here (see ../deployment/docker/dev/docker-compose.dev.yml),
# then push finished work back with this script.
#
# SAFETY: dry-run by default. Requires --apply to actually write files,
# and refuses to --apply if the target repo has uncommitted changes --
# this script will not silently clobber someone's in-progress work in the
# canonical repo. It also never commits or pushes on your behalf; that's
# a deliberate line this script doesn't cross.
#
# Usage:
#   scripts/sync-to-aegis.sh /path/to/aegis-checkout            # dry run
#   scripts/sync-to-aegis.sh /path/to/aegis-checkout --apply    # for real
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/../Aegis"

TARGET_DIR="${1:-}"
APPLY="${2:-}"

if [ -z "$TARGET_DIR" ]; then
  echo "Usage: $0 /path/to/aegis-checkout [--apply]" >&2
  exit 1
fi
if [ ! -d "$SOURCE_DIR" ]; then
  echo "ERROR: embedded Aegis copy not found at $SOURCE_DIR" >&2
  exit 1
fi
if [ ! -d "$TARGET_DIR/.git" ]; then
  echo "ERROR: $TARGET_DIR does not look like a git repo (no .git directory)." >&2
  echo "Refusing to sync into a directory that isn't a real checkout -- too easy to point this at the wrong place by accident." >&2
  exit 1
fi

# Exclusions: never sync VCS metadata, build artifacts, dependency
# directories, or local env files -- these should be regenerated in the
# target, not overwritten from here.
EXCLUDES=(
  --exclude=.git/
  --exclude=node_modules/
  --exclude=.next/
  --exclude=dist/
  --exclude=build/
  --exclude=__pycache__/
  --exclude=.venv/
  --exclude=venv/
  --exclude='*.pyc'
  --exclude=.env
  --exclude=.env.local
  --exclude=.pytest_cache/
  --exclude=coverage/
  --exclude='*.egg-info/'
)

RSYNC_FLAGS=(-a --delete --itemize-changes "${EXCLUDES[@]}")

if [ "$APPLY" != "--apply" ]; then
  echo "== DRY RUN == (pass --apply as the second argument to actually write files)"
  echo "Source: $SOURCE_DIR/"
  echo "Target: $TARGET_DIR/"
  echo
  rsync "${RSYNC_FLAGS[@]}" --dry-run "$SOURCE_DIR/" "$TARGET_DIR/"
  echo
  echo "Dry run complete. Nothing was written."
  exit 0
fi

# --apply path: refuse if the target has uncommitted changes.
if [ -n "$(cd "$TARGET_DIR" && git status --porcelain)" ]; then
  echo "ERROR: $TARGET_DIR has uncommitted changes." >&2
  echo "Commit, stash, or discard them first -- this script won't overwrite work in progress." >&2
  exit 1
fi

echo "Applying sync: $SOURCE_DIR/ -> $TARGET_DIR/"
rsync "${RSYNC_FLAGS[@]}" "$SOURCE_DIR/" "$TARGET_DIR/"

echo
echo "Done. Files are written but NOT committed or pushed -- that's on you:"
echo "  cd $TARGET_DIR"
echo "  git diff --stat"
echo "  git checkout -b <branch-name>"
echo "  git add -A && git commit -m '...'"
