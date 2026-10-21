#!/usr/bin/env bash
# Commit what you changed here (usually the spreadsheet) and push it to GitHub – without merge errors.
#
# While you edit, the phone keeps logging spends and GitHub keeps updating the spreadsheet's
# Tracker sheet, so both sides change the same .xlsx, and git can't merge spreadsheets. So:
#   - Sabbatical_Plan_and_Budget.xlsx: your version wins. Straight after the push, GitHub rebuilds
#     the Tracker rows that come from the phone (from spend-log.json), so none are lost.
#   - spend-log.json and wishlist.json: GitHub's version wins (the phone writes them).
#   - anything else both sides changed: it stops and tells you.
# Usage:  ./push.sh ["what you changed"]
set -euo pipefail
cd "$(dirname "$0")"
[ -d .git ] || { echo "This folder isn't a git repository – see README.md."; exit 1; }

in_rebase() { [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; }
unmerged() { git diff --name-only --diff-filter=U; }
resolve() {
  local f
  for f in $(unmerged); do
    case "$f" in
      Sabbatical_Plan_and_Budget.xlsx) git checkout --theirs -- "$f" ;;   # during a rebase, "theirs" = your commit
      spend-log.json|wishlist.json)   git checkout --ours -- "$f" ;;     # and "ours" = GitHub's copy
      *) echo "Both you and GitHub changed $f. Fix it by hand, then: git add $f && git rebase --continue && ./push.sh"; exit 1 ;;
    esac
    git add -- "$f"
  done
}
finish_rebase() {
  local n=0
  while in_rebase; do
    n=$((n+1)); [ $n -le 30 ] || { echo "Stuck in a rebase. Run: git rebase --abort, then try again."; exit 1; }
    resolve
    if ! GIT_EDITOR=true git rebase --continue >/dev/null 2>&1; then
      # nothing left to commit for this step (GitHub already had it): skip it
      if [ -z "$(unmerged)" ] && git diff --cached --quiet; then git rebase --skip >/dev/null 2>&1 || true; fi
    fi
  done
}

finish_rebase                               # tidy up after an earlier attempt that stopped half-way
git add -A
git diff --cached --quiet || git commit -q -m "${1:-Update plan & budget ($(date '+%d %b %Y %H:%M'))}"

for attempt in 1 2 3; do
  git fetch -q origin
  git rebase -q origin/main >/dev/null 2>&1 || finish_rebase
  if git push -q origin HEAD:main 2>/dev/null; then
    echo "Pushed ($(git log -1 --format=%h)). GitHub re-syncs the Tracker with the phone log in 1–2 minutes; run ./update.sh after that to get its copy."
    exit 0
  fi
  echo "GitHub changed while pushing – trying again…"; sleep 3
done
echo "Couldn't push after 3 tries. Check your connection and run ./push.sh again."; exit 1
