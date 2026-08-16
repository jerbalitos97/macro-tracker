# Friday

Finnish-language, mobile-first PWA. React + TypeScript + Vite + Tailwind v4,
Supabase for sync, localStorage as the offline cache and source of truth for
several tools.

## The export must stay complete

`src/lib/exportData.ts` produces the file the user hands to an assistant for
analysis. **Anything the app stores and that file omits is invisible in that
conversation, and the omission is silent.** So:

- **Every new store must reach the export.** Local stores are swept
  automatically — every `localStorage` key not claimed by a named section lands
  in `raw.unmapped`, so a store added and never registered still ships. That is
  a safety net, not the goal: register it in `MAPPED_KEYS` and give it a named
  section and a `_readme` entry so it arrives labelled.
- **Cloud-only tables are not swept.** A new Supabase table has to be added to
  `fetchCloud()` by hand, or it will be missing entirely.
- **New fields on existing records** ride along automatically (the whole record
  is serialised), but add a line to `_readme` when the field needs explaining.
- **Never export `SENSITIVE_KEYS`.** The auth session holds a bearer token and
  this file is meant to be shareable.

Bump `SCHEMA_VERSION` when the shape changes in a way an existing analysis
would misread.

## Deploys

Pushing to `main` deploys — `.github/workflows/deploy.yml`, or Vercel's own Git
integration. Never treat a push to a feature branch as delivery. Bump the
`CACHE` version in `public/sw.js` on every release or the service worker keeps
serving the old build.

## Conventions worth knowing

- **Goals**: read the goal in force via `getActiveGoal()` /
  `getActivePeriod()` in `src/lib/goalPeriods.ts`. The top-level
  `settings.startDate/endDate/startWeight/targetWeight` are frozen legacy
  fields — never read them directly in a view.
- **Analysis lives in one place**: `src/lib/analysis.ts` produces a single
  verdict, rendered only by `AnalysisView`. Do not add a second screen that
  judges progress; several disagreeing cards is the failure mode this replaced.
- **Planning vs recording**: goals, training blocks and physiology are
  configured in `PlanningView`. Every other screen records or reports.
- **Burn estimates are deliberately pessimistic** and net of what the day
  type's TDEE already assumes — see the header of `src/lib/energy.ts` before
  changing any constant there.
