#!/usr/bin/env bash
# Copies the latest spreadsheet into this folder and pushes it to GitHub,
# so the live site picks it up (GitHub Pages redeploys in about a minute).
# Usage:  ./update.sh            (from this folder)
set -euo pipefail
cd "$(dirname "$0")"
SRC="../Sabbatical_Plan_and_Budget.xlsx"
[ -f "$SRC" ] || { echo "Can't find $SRC – keep this folder inside your Sabbatical folder."; exit 1; }
cp "$SRC" ./Sabbatical_Plan_and_Budget.xlsx
if [ ! -d .git ]; then echo "Copied. This folder isn't a git repository yet – see README.md."; exit 0; fi
git add Sabbatical_Plan_and_Budget.xlsx
if git diff --cached --quiet; then echo "No changes since the last update."; exit 0; fi
git commit -m "Update plan & budget ($(date '+%d %b %Y %H:%M'))"
git push
echo "Pushed. The site will show the new figures within a couple of minutes."
