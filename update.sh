#!/usr/bin/env bash
# Pulls the latest spreadsheet and spend log from GitHub and copies them into
# your Sabbatical folder as a backup. It never pushes anything: the copy on
# GitHub is the master, and changes are made there.
# Usage:  ./update.sh            (from this folder)
set -euo pipefail
cd "$(dirname "$0")"
DEST=".."
XLSX="Sabbatical_Plan_and_Budget.xlsx"
[ -d .git ] || { echo "This folder isn't a git repository – see README.md."; exit 1; }

# If the copy in your Sabbatical folder was edited since the last pull, keep it
# in Backups/ before it's replaced (those edits aren't on GitHub).
if [ -f "$DEST/$XLSX" ] && ! cmp -s "$DEST/$XLSX" "$XLSX"; then
  mkdir -p "$DEST/Backups"
  KEEP="$DEST/Backups/Sabbatical_Plan_and_Budget_local_$(date '+%Y-%m-%d_%H%M').xlsx"
  cp "$DEST/$XLSX" "$KEEP"
  echo "Your Sabbatical folder copy differed from GitHub's – saved it as ${KEEP#../}."
fi

git pull --ff-only --quiet
cp "$XLSX" "$DEST/$XLSX"
cp spend-log.json "$DEST/spend-log.json"
echo "Up to date with GitHub ($(git log -1 --format='%cd' --date=format:'%d %b %Y %H:%M')). Copied $XLSX and spend-log.json into your Sabbatical folder."
