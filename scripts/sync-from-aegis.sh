#!/usr/bin/env bash
#
# Refresh this repo's embedded Aegis/ working copy from a real Aegis repo
# checkout -- the reverse of sync-to-aegis.sh. Run this before starting a
# dev session to make sure Aegis/ isn't stale.
#
# SAFETY: dry-run by default, same as sync-to-aegis.sh. Refuses to
# --apply if Aegis/ has uncommitted changes IN THIS REPO (i.e. you have
# local edits under Aegis/ that haven't been synced out yet via
# sync-to-aegis.sh) -- pulling fresh content over local edits you haven't
# pushed back would silently lose them.
#
# Usage:
#   scripts/sync-from-aegis.sh /path/to/aegis-checkout            # dry run
#   scripts/sync-from-aegis.sh /path/to/aegis-checkout --apply    # for real
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST_DIR="$REPO_ROOT/Aegis"

SOURCE_DIR="${1:-}"
APPLY="${2:-}"

if [ -z "$SOURCE_DIR" ]; then
  echo "Usage: $0 /path/to/aegis-checkout [--apply]" >&2
  exit 1
fi
if [ ! -d "$SOURCE_DIR/.git" ]; then
  echo "ERROR: $SOURCE_DIR does not look like a git repo (no .git directory)." >&2
  exit 1
fi

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
  echo "Target: $DEST_DIR/"
  echo
  mkdir -p "$DEST_DIR"
  rsync "${RSYNC_FLAGS[@]}" --dry-run "$SOURCE_DIR/" "$DEST_DIR/"
  echo
  echo "Dry run complete. Nothing was written."
  exit 0
fi

# --apply path: refuse if this repo has uncommitted changes under Aegis/
# that haven't been synced out yet. Only meaningful if this repo (Command
# Center) is itself a git repo -- if it isn't, this check is skipped with
# a warning rather than failing outright.
if [ -d "$REPO_ROOT/.git" ]; then
  if [ -n "$(cd "$REPO_ROOT" && git status --porcelain -- Aegis/)" ]; then
    echo "ERROR: Aegis/ has uncommitted local changes in this repo." >&2
    echo "Run sync-to-aegis.sh to push them out first, or commit/stash them, before refreshing." >&2
    exit 1
  fi
else
  echo "WARNING: this repo isn't a git repo -- skipping the uncommitted-changes check." >&2
  echo "Make sure you haven't got unsaved local edits under Aegis/ before continuing." >&2
fi

echo "Applying sync: $SOURCE_DIR/ -> $DEST_DIR/"
mkdir -p "$DEST_DIR"
rsync "${RSYNC_FLAGS[@]}" "$SOURCE_DIR/" "$DEST_DIR/"

echo
echo "Done. Aegis/ now matches $SOURCE_DIR."
