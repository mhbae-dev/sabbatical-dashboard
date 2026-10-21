"""Keep the Tracker sheet of Sabbatical_Plan_and_Budget.xlsx in step with spend-log.json.

Rows that came from the log carry the log entry id in column J ("Log ID", hidden).
For each run:
  - log entries with no matching row are added at the end of the Tracker
  - rows whose entry changed are rewritten in place
  - rows whose id is no longer in the log are removed
  - a row you typed in yourself (no Log ID) that matches a log entry is a duplicate of it:
    the log entry takes over that row, so the spend is only counted once. A match is the
    same Budget line and the same amount (within 1%, min 5p), on the same date for
    day-to-day lines, or within 7 days for Accommodation, Flights, Trains and Insurance & admin.
Other rows without a Log ID (bookings you type in yourself) are never touched.
Records in the log that aren't spends (cash withdrawals, "nothing spent" days, ticked tasks)
are ignored.

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
# Log category -> Budget line (Tracker column C). Must match DCATS in app.js.
CATEGORY = {"food": "Food", "transport": "Local transport", "other": "Activities", "shop": "Shopping & misc",
            "accom": "Accommodation", "flights": "Flights", "rail": "Trains & intercity", "admin": "Insurance & admin"}
LABEL = {"food": "Food", "transport": "Transport", "other": "Activities", "shop": "Shopping & misc",
         "accom": "Accommodation", "flights": "Flights", "rail": "Trains & intercity", "admin": "Insurance & admin"}
DAILY_LINES = {"Food", "Local transport", "Activities", "Shopping & misc"}
META = {"noSpend", "cashin", "cashcount", "taskDone"}   # records in the log that aren't spends
# The kind decides the category (same as KINDS in app.js), so older entries logged under "other"
# as shopping / essentials / other move to Shopping & misc.
KIND_CAT = {"meals": "food", "coffee": "food", "drinks": "food", "groceries": "food", "transport": "transport",
            "activities": "other", "shopping": "shop", "essentials": "shop", "misc": "shop",
            "hotel": "accom", "flight": "flights", "train": "rail", "admin": "admin"}
KIND_LABEL = {"meals": "Meals", "coffee": "Coffee & cafés", "drinks": "Drinks & nights out", "groceries": "Groceries & snacks",
              "transport": "Transport", "activities": "Activities", "shopping": "Shopping", "essentials": "Essentials", "misc": "Other",
              "hotel": "Accommodation", "flight": "Flight", "train": "Trains & intercity", "admin": "Insurance, visas & admin"}


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


def as_date(v):
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    try:
        return dt.datetime.strptime(str(v).strip(), "%d/%m/%Y").date()
    except ValueError:
        return None


def is_duplicate(vals, row):
    """Does a hand-typed Tracker row (vals) look like the same spend as a log entry's row?"""
    a, b = as_date(vals[0]), as_date(row[0])
    if not a or not b or vals[2] != row[2]:
        return False
    try:
        x, y = float(vals[4]), float(row[4])
    except (TypeError, ValueError):
        return False
    if abs(x - y) > max(0.05, 0.01 * abs(y)):
        return False
    return a == b if row[2] in DAILY_LINES else abs((a - b).days) <= 7   # see also booking_twin in main()


def row_for(entry, legs):
    day = dt.date.fromisoformat(entry["date"])
    return [
        day.strftime("%d/%m/%Y"),
        country_for(day, legs),
        CATEGORY.get(KIND_CAT.get(entry.get("kind"), entry.get("cat")), "Other"),
        (entry.get("note") or "").strip() or KIND_LABEL.get(entry.get("kind")) or LABEL.get(KIND_CAT.get(entry.get("kind"), entry.get("cat")), "Daily spend"),
        round(float(entry.get("gbp") or 0), 2),
        "Paid",
    ]


def main():
    with open(LOG, encoding="utf-8") as f:
        entries = [e for e in json.load(f).get("entries", []) if e.get("id") and e.get("date") and e.get("cat") not in META]
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

    # bookings typed with a different date (e.g. the day you booked): same line + amount is enough
    # when there's exactly one such typed row and one such logged spend
    manual = [vals for vals, lid in old if lid is None]
    def booking_twin(vals):
        if vals[2] in DAILY_LINES:
            return None
        close = lambda x, y: x is not None and y is not None and abs(float(x) - float(y)) <= max(0.05, 0.01 * abs(float(y)))
        try:
            es = [i for i, r in wanted.items() if r[2] == vals[2] and close(vals[4], r[4])]
            ss = [v for v in manual if v[2] == vals[2] and close(v[4], vals[4])]
        except (TypeError, ValueError):
            return None
        return es[0] if len(es) == 1 and len(ss) == 1 else None

    new, seen, merged = [], set(), []
    for vals, lid in old:
        if lid is None:
            # a row you typed that duplicates a logged spend: the log entry takes its place
            twin = next((i for i in wanted if i not in seen and is_duplicate(vals, wanted[i])), None) \
                or next((i for i in wanted if is_duplicate(vals, wanted[i])), None) or booking_twin(vals)
            if twin:
                merged.append(vals)
                if twin not in seen:
                    new.append((wanted[twin], twin))
                    seen.add(twin)
                continue
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
    dup = f", {len(merged)} duplicate{'s' if len(merged) != 1 else ''} merged" if merged else ""
    for vals in merged:
        print(f"  merged duplicate: {vals[0]} {vals[2]} {vals[3]} £{vals[4]}")
    print(f"Tracker: {len(added)} added, {edited} updated, {removed} removed{dup}" + ("" if changed else " (no changes)"))
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"changed={'true' if changed else 'false'}\n")
            f.write(f"summary={len(added)} added, {edited} updated, {removed} removed{dup}\n")


if __name__ == "__main__":
    main()
