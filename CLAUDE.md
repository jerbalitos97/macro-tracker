# Friday

**Vastaa kolmella bulletilla.** Jere lukee vastaukset puhelimelta eikä halua
pitkää tekstiä: kolme ranskalaista viivaa, ei johdantoa, ei yhteenvetoa.
Perustelut ja mittaustulokset kuuluvat committiin ja koodin kommentteihin,
joissa ne myös säilyvät — chatissa ne vain hukkuvat.

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

## Content lives in the database, logic lives in the code

Templates, exercises, gate variants, warm-up packages and training locations are
**data**. They belong in `workout_templates` / `workout_locations` /
`workout_warmups`, written by a migration under `supabase/migrations/`, and they
reach the client through the normal sync path.

- **Never add a seed constant.** No `seedTemplates.ts`, no `seedLocations()`. A
  constant in the client is a second source of truth that silently drifts from
  the row the user actually edits, and then the app disagrees with itself
  depending on which device you open it on.
- **An empty list means "not synced yet", not "none".** `getLocations()` and
  `getTemplates()` return `[]` before the first pull. Views must cope with that
  rather than fill it in.
- **Gate rules and resolution order stay in code** — `src/lib/gates.ts` and
  `src/lib/sessionResolve.ts`. Thresholds are logic, not content.
- Content migrations are **idempotent**: replace whole objects matched by their
  stable `id` and skip the write when nothing changed, so re-running is a no-op.
- **A warm-up is not an exercise.** It is a package (`workout_warmups`) named by
  a template's `warmupId`, shown as a routine and ticked as a whole. Putting it
  back in `exercises` makes it look like training volume and inflates every
  session's slot count.

## The MCP can change the plan, never the record

`api/mcp.ts` is one Vercel function serving both halves, and the split between
them is the rule:

- **Nutrition, weight, habits are read-only.** They are a record of what
  happened. Nothing reached through a chat should be able to rewrite it.
- **Templates, blocks and warm-ups are writable**, because they are a plan, and
  a plan is the thing worth shaping in conversation.

Every write tool follows the same protocol, and a new one must too:

1. **Two calls, never one.** The first validates, returns the exact changes and
   a `confirmToken`; only a second call carrying that token writes. The token
   hashes *both* the row as it currently is and the payload, so it cannot
   confirm different content than was shown — and a row that changed in between
   invalidates it, which is optimistic locking for free.
2. **Validate the shape here.** Postgres accepts any jsonb, so a malformed
   template does not fail on write — it fails on the phone, weeks later,
   looking like an app bug.
3. **Log the whole previous object** to `mcp_writes`. Undo restores it wholesale
   (`undo_write`); a partial restore would leave a state that never existed.
4. **Unchanged means no write**, same idempotency rule as the content
   migrations.

`stage()` does 1, 3 and 4 — route new write tools through it rather than
touching the tables directly, and pass `logBefore`/`logAfter` when the compared
value is a summary rather than the real object.

**No resolution logic in the MCP.** Gates, environment fallbacks and dose
arithmetic stay in `src/lib/gates.ts` and `src/lib/sessionResolve.ts`. A second
implementation next to the writer would be a second truth, and the writer is
exactly where it would go unnoticed.

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
