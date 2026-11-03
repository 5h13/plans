# 5H13 Plans

A general project app that runs offline on a phone or a PC browser: weddings and events, small HVAC install jobs, software/app development, design consultancy, or any project. There is no server and no account. Your data stays on your device.

**Open it:** https://5h13.github.io/plans/. Then choose *Add to Home Screen* (iPhone: Share → Add to Home Screen; Android Chrome: menu → Install app). After the first visit it works with no connection.

## What it does

- **Templates** set the definition questions, stages and readiness gates, the drivers (guests, indoor units, features, floor area), and starter work with hours and costs. They also decide whether the plan runs forward from a start date or backward from an event date. The built-in templates are general, wedding/event, small HVAC install job, software/app development, and building services design.
- **Project control:** definition, plan and schedule with a baseline, stages and readiness, estimate → generated plan, hours worked, progress reports with frozen, checksummed snapshots and report-to-report comparison, comments, risks and issues, changes, documents with a text comparator (.docx/.txt), assets, and revisions.
- **Library:** edit each template's rates, prices, hours, lead times and factors.
- **Exchange:** export a project as one checksummed file to back it up or move it to another device. The 5H13 HVAC desktop app reads and writes the same file. The app also imports 5H13 Plans r44 backups.

## Data and backups

Everything is stored in this browser on this device. Clearing site data or uninstalling deletes it. **Export your projects regularly** (project → More → Export / share).

## Develop

```
npm install
npm run dev        # http://localhost:3002
npm run build      # static files in dist/
```

Every push to `main` builds and deploys to GitHub Pages (`.github/workflows/deploy.yml`). The build uses relative paths and hash routing, so `dist/` also works from any static host.

`src/shared/` holds pure modules shared with the 5H13 HVAC app: the estimation formulas, the text comparator, the revision diff and the r44 parser.
