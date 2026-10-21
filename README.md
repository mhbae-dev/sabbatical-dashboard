# Sabbatical 2026–27 dashboard

A static web page that reads `Sabbatical_Plan_and_Budget.xlsx` and shows it as a tabbed dashboard: Daily, Spending, Overview, Stays, Flights and Budget. All the figures are calculated in your browser straight from the spreadsheet, so the spreadsheet stays the single source of truth. There's no server and no build step.

## Files

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The dashboard |
| `vendor/xlsx.full.min.js` | SheetJS 0.20.3, which reads .xlsx files in the browser (Apache 2.0) |
| `Sabbatical_Plan_and_Budget.xlsx` | The spreadsheet itself. The copy in this repo is the master |
| `spend-log.json` | Spends logged from the Daily tab |
| `wishlist.json` | Items on the Wishlist tab (saved with the same GitHub access code) |
| `.github/workflows/sync-tracker.yml`, `scripts/sync_tracker.py` | Copies logged spends into the spreadsheet's Tracker sheet (see below) |
| `update.sh` | Pulls the latest spreadsheet and spend log to your Mac as a backup |

## Put it on GitHub Pages

1. Create a new repository on GitHub, e.g. `sabbatical-dashboard`, **Private** if your plan allows Pages on private repos (see *Privacy* below).
2. Upload the contents of this folder. With GitHub Desktop, choose *Add Existing Repository* and pick this folder. Or from Terminal, in this folder:
   ```
   git init -b main
   git add .
   git commit -m "Sabbatical dashboard"
   git remote add origin https://github.com/<your-username>/sabbatical-dashboard.git
   git push -u origin main
   ```
3. On GitHub, open **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, then branch `main` and folder `/ (root)`, and click Save.
4. After a minute the site is live at `https://<your-username>.github.io/sabbatical-dashboard/`.

## Keeping it up to date

The spreadsheet in this repository is the single source of truth. Change it here: ask Claude in a cloud session on this repo, or download it from GitHub, edit it and upload it again. Once a change is committed, GitHub Pages redeploys in a minute or two. The open page checks for a new copy every 5 minutes, and whenever you switch back to the tab. The **Reload** button checks straight away.

`./update.sh` only goes one way, from GitHub to your Mac. It pulls the latest commits and copies `Sabbatical_Plan_and_Budget.xlsx` and `spend-log.json` into your Sabbatical folder as a backup. It never pushes. If the spreadsheet in your Sabbatical folder had been edited since the last pull, it's saved to `Backups/` first, because those edits aren't on GitHub.

**Open a file…** (or dragging an .xlsx onto the page) shows a spreadsheet from your computer without uploading it. That's handy for checking changes before you commit them.

## Logging daily spends (Daily tab)

The Daily tab shows today's budget: food + local transport + activities + shopping & misc, taken from the Itinerary for the stop you're at (Shopping & misc is column O).

Every spend type you pick when logging belongs to exactly one line on the Budget tab, so the two always agree:

| Spend type | Budget line | Daily budget? |
|---|---|---|
| Meals, Coffee, Drinks, Groceries | Food | yes |
| Transport | Local transport | yes |
| Activities | Activities | yes |
| Shopping, Essentials, Other | Shopping & misc | yes |
| Hotel | Accommodation | no |
| Flight | Flights | no |
| Visa & admin | Insurance & admin | no |

Hotel, Flight and Visa & admin spends count towards their Budget line and Committed, but don't come out of the day's "left to spend". It also shows how much of it is left. Add what you spend with **Log a spend**. Amounts in local currency are converted to £ with the rates under *Exchange rates*.

### Days with nothing logged
A past day with nothing logged is counted at plan (not £0) until you either add its spends or tap **Nothing spent** in the yellow box at the top of the Daily tab. That way a forgotten day never inflates the treat fund. These days show a **?** on the chart.

### Duplicates
The budget counts every spend once:
- A row you type into the Tracker that matches a spend logged on the phone (same Budget line and amount within 1%; same date for Food, Local transport, Activities and Shopping & misc, or within 7 days for Accommodation, Flights, Trains & intercity and Insurance & admin; for those four, any date if it's the only typed row and the only logged spend with that amount) is treated as the same spend. The dashboard counts it once straight away, and the next Tracker sync merges the two rows (the log entry takes over the row).
- Logging something on the phone that matches a spend already logged for that day (same amount in £, or same amount in the same currency), or a hotel, flight, train or admin cost already typed into the Tracker, asks you to tap **Add** a second time. Repeats already in the log are flagged in the day's list so you can delete one.

### Trains & intercity
Trains, coaches and airport trains between places have their own Budget line (Itinerary column P), outside the daily budget like Flights. Log them with 🚄 **Train / coach**.

### To book & do, cash wallet, stay wrap-up
- **To book & do** lists checklist items and flights still to book, by due date (from texts like "Before 11 Nov", "Early Nov", "Within 3 days of 26 Nov"). Ticking one on the phone is saved in the log; to tick it for good, put anything in the checklist's *Done?* column.
- **Cash wallet**: add cash withdrawals (🏧 Withdrew) and correct the balance after counting (Counted). Spends paid in cash come off automatically. It warns you two days before you leave a currency with cash left.
- On the first two days of a stay, a **wrapped up** card sums up the stay before.

These records (nothing-spent days, cash, ticked tasks) are saved in `spend-log.json` too, with `cat` set to `noSpend`, `cashin`, `cashcount` or `taskDone`. They're never counted as spending.

### Rolling budget and treat fund

- **Each stay is one pot.** A day's budget is what's left in the stay's pot divided by the nights left there, so spending less today raises the next days and overspending lowers them. It never drops below 60% of the planned day (`FLOOR` in app.js).
- **Take it from** (when logging a day-to-day spend): *This day* (default); *Spread over stay*, which shares a one-off like a train ticket equally over the rest of that stay from its date; or *Treat fund*, which doesn't touch the day at all.
- **Treat fund.** When a stay ends, whatever it finished under (or over) goes into the treat fund. Treat-fund spends come out of it. If it goes negative, the overspend comes out of contingency.
- Days with nothing logged count as £0 spent, so log everything or the stay looks further under than it is.
- These choices are saved as `fund: "spread" | "treat"` on the entry. The Tracker sheet and Budget tab still count every spend in full under its Budget line.

Spends are saved to `spend-log.json` in this repository. They count towards *Committed* on the Overview and Budget tabs.

### Logged spends in the Tracker sheet

Whenever `spend-log.json` changes, the **Sync spend log to Tracker** GitHub Action (`.github/workflows/sync-tracker.yml`) updates the spreadsheet's Tracker sheet to match the log and commits it. It runs `scripts/sync_tracker.py`, then recalculates the formulas in LibreOffice, because the page reads the calculated values. A run takes 1–2 minutes.

- **New entry**: a row is added at the bottom with the date, the country from the Itinerary for that date ("Pre-trip" before the trip), the Budget line from the table above, the note, the £ amount and status Paid.
- **Edited entry**: its row is rewritten in place. The log is the master copy for these rows, so editing them in the spreadsheet won't stick.
- **Deleted entry**: its row is removed.

Each synced row has the log entry's id in the hidden column J (**Log ID**), which is how rows are matched. Rows without a Log ID, such as bookings you type in yourself, are never touched. Keep column J if you edit the Tracker.

The page counts each logged spend once. It counts it from the log, which is the newer copy, and skips the matching Tracker row.

You can also run the sync by hand from **Actions → Sync spend log to Tracker → Run workflow**. It needs **Settings → Actions → General → Workflow permissions** set to *Read and write permissions*.

To log from a device, set it up once:

1. On GitHub, go to **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Set **Repository access** to *Only select repositories*, and pick this repo.
3. Under **Repository permissions**, set **Contents** to *Read and write*.
4. Pick an expiry after you're home, generate the token and copy it.
5. On the site, open **Daily → Logging setup**, paste the token and tap **Save & connect**.

The token is stored only in that phone's browser. If you're offline, spends are kept on the phone and sync when you're back online. To delete an entry, tap **×** next to it and then confirm.

Because the phone and the Action both write to the repo, run `./update.sh` (or `git pull`) before working in this folder on your Mac.

## Privacy

On a **public** repository, anyone with the link can see the page *and* download the spreadsheet and `spend-log.json`: your budget, hotel names, booking refs and phone numbers. The page asks search engines not to index it, but that isn't protection. For a private site, you can either:

- use a private repository (GitHub Pages on private repos needs GitHub Pro, Team or Enterprise), or
- keep the spreadsheet out of the repo and use **Open a file…** each time. The page works the same, and your data never leaves your computer.

## What the page expects from the spreadsheet

It reads the tab names and columns as they are now: Overview (budget in B3), Itinerary, Hotels, Flights, Admin & checklist and Tracker. You can add or remove stops, flights or spending rows freely, as long as each table still ends with its **Total** row (Tracker has no Total row; its column J holds the Log ID). Renaming a tab or moving columns will need a matching change in `app.js` (`parseWorkbook`).

## Pushing changes from the Mac
Run `./push.sh "what you changed"`. It commits, pulls and pushes. If the phone logged spends meanwhile, your spreadsheet wins and GitHub rebuilds the phone's Tracker rows a minute later, so you never get a merge error.
