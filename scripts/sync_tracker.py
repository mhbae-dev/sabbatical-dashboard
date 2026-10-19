"""Keep the Tracker sheet of Sabbatical_Plan_and_Budget.xlsx in step with spend-log.json.

Rows that came from the log carry the log entry id in column J ("Log ID", hidden).
For each run:
  - log entries with no matching row are added at the end of the Tracker
  - rows whose entry changed are rewritten in place
  - rows whose id is no longer in the log are removed
Rows without a Log ID (bookings you type in yourself) are never touched.

Prints changed=true/false to $GITHUB_OUTPUT so the workflow only recalculates
and commits when something actually changed. Formulas are left without cached
values here; the workflow runs LibreOffice afterwards to recalculate them.

Usage: python scripts/sync_tracker.py [xlsx] [spend-log.json]
"""
import datetime as dt
import json
import os
import sys

import openpyxl

XLSX = sys.argv[1] if len(sys.argv) > 1 else "Sabbatical_Plan_and_Budget.xlsx"
LOG = sys.argv[2] if len(sys.argv) > 2 else "spend-log.json"

FIRST = 5            # first data row on the Tracker (row 4 is the header)
COLS = "ABCDEF"      # Date, Country, Category, Description, Amount (£), Status
ID_COL = "J"         # Log ID
CATEGORY = {"food": "Food", "transport": "Local transport", "other": "Activities"}
LABEL = {"food": "Food", "transport": "Transport", "other": "Activities & other"}


def stops(wb):
    """(start, end, country) for each Itinerary stop, dated the same way the dashboard does."""
    start = wb["Hotels"]["C5"].value if "Hotels" in wb.sheetnames else None
    start = start.date() if isinstance(start, dt.datetime) else dt.date(2026, 10, 19)
    ws, out, r = wb["Itinerary"], [], FIRST
    while r < FIRST + 400:
        country = ws[f"A{r}"].value
        if isinstance(country, str) and country.strip().lower().startswith("total"):
            break
        if country:
            nights = int(round(float(ws[f"D{r}"].value or 0)))
            out.append((start, start + dt.timedelta(days=nights), country.strip()))
            start += dt.timedelta(days=nights)
        r += 1
    return out


def country_for(day, legs):
    if not legs or day < legs[0][0]:
        return "Pre-trip"
    for a, b, c in legs:
        if a <= day < b:
            return c
    return legs[-1][2]  # the day you fly home


def row_for(entry, legs):
    day = dt.date.fromisoformat(entry["date"])
    return [
        day.strftime("%d/%m/%Y"),
        country_for(day, legs),
        CATEGORY.get(entry.get("cat"), "Other"),
        (entry.get("note") or "").strip() or LABEL.get(entry.get("cat"), "Daily spend"),
        round(float(entry.get("gbp") or 0), 2),
        "Paid",
    ]


def main():
    with open(LOG, encoding="utf-8") as f:
        entries = [e for e in json.load(f).get("entries", []) if e.get("id") and e.get("date")]
    entries.sort(key=lambda e: (e["date"], e.get("ts", "")))
    wb = openpyxl.load_workbook(XLSX)
    ws = wb["Tracker"]
    legs = stops(wb)
    wanted = {e["id"]: row_for(e, legs) for e in entries}

    # Read the existing rows (values in A–F plus the Log ID)
    used = [r for r in range(FIRST, ws.max_row + 1)
            if any(ws[f"{c}{r}"].value not in (None, "") for c in COLS + ID_COL)]
    old = []
    for r in range(FIRST, (used[-1] if used else FIRST - 1) + 1):
        vals = [ws[f"{c}{r}"].value for c in COLS]
        lid = ws[f"{ID_COL}{r}"].value
        old.append((vals, str(lid).strip() if lid not in (None, "") else None))

    new, seen = [], set()
    for vals, lid in old:
        if lid is None:
            new.append((vals, None))          # your own booking rows
        elif lid in wanted and lid not in seen:
            new.append((wanted[lid], lid))    # keep its place, refresh the values
            seen.add(lid)
        # else: the entry was deleted from the log (or is a duplicate) – drop the row
    added = [e["id"] for e in entries if e["id"] not in seen]
    new += [(wanted[i], i) for i in added]

    norm = lambda rows: [([None if v == "" else v for v in vals], lid) for vals, lid in rows]
    changed = norm(new) != norm(old)

    # Header for the id column, kept out of the way
    if ws[f"{ID_COL}4"].value != "Log ID":
        ws[f"{ID_COL}4"].value = "Log ID"
        ws[f"{ID_COL}4"]._style = ws["F4"]._style
        changed = True
    if not ws.column_dimensions[ID_COL].hidden:
        ws.column_dimensions[ID_COL].hidden = True
        ws.column_dimensions[ID_COL].width = 16
        changed = True

    if changed:
        for i in range(max(len(old), len(new))):
            vals, lid = new[i] if i < len(new) else ([None] * len(COLS), None)
            for c, v in zip(COLS, vals):
                ws[f"{c}{FIRST + i}"].value = v
            ws[f"{ID_COL}{FIRST + i}"].value = lid
        wb.calculation.fullCalcOnLoad = True
        wb.save(XLSX)

    removed = sum(1 for _, lid in old if lid and lid not in wanted)
    edited = sum(1 for (vals, lid) in old if lid in wanted and vals != wanted[lid])
    print(f"Tracker: {len(added)} added, {edited} updated, {removed} removed" + ("" if changed else " (no changes)"))
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"changed={'true' if changed else 'false'}\n")
            f.write(f"summary={len(added)} added, {edited} updated, {removed} removed\n")


if __name__ == "__main__":
    main()
