# Sabbatical 2026–27 dashboard

A static web page that reads `Sabbatical_Plan_and_Budget.xlsx` and shows it as a tabbed dashboard: Overview, Food, Stays, Flights and Budget. All the figures are calculated in your browser straight from the spreadsheet, so the spreadsheet stays the single source of truth. There's no server and no build step.

## Files

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The dashboard |
| `vendor/xlsx.full.min.js` | SheetJS 0.20.3, which reads .xlsx files in the browser (Apache 2.0) |
| `Sabbatical_Plan_and_Budget.xlsx` | A copy of your spreadsheet that the page reads |
| `update.sh` | Copies the latest spreadsheet in and pushes it to GitHub |

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

Edit the spreadsheet as usual, save it, then run `./update.sh` in this folder (or copy the spreadsheet in and commit it with GitHub Desktop). The open page checks for a new copy every 5 minutes, and whenever you switch back to the tab. The **Reload** button checks straight away.

**Open a file…** (or dragging an .xlsx onto the page) shows a spreadsheet from your computer without uploading it. That's handy for checking changes before you push them.

## Privacy

On a **public** repository, anyone with the link can see the page *and* download the spreadsheet: your budget, hotel names, booking refs and phone numbers. The page asks search engines not to index it, but that isn't protection. For a private site, you can either:

- use a private repository (GitHub Pages on private repos needs GitHub Pro, Team or Enterprise), or
- keep the spreadsheet out of the repo and use **Open a file…** each time. The page works the same, and your data never leaves your computer.

## What the page expects from the spreadsheet

It reads the tab names and columns as they are now: Overview (budget in B3), Itinerary, Hotels, Flights, Admin & checklist and Tracker. You can add or remove stops, flights or spending rows freely, as long as each table still ends with its **Total** row (Tracker has no Total row). Renaming a tab or moving columns will need a matching change in `app.js` (`parseWorkbook`).
