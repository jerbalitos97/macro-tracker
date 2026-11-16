# Friday MCP

A single-user MCP endpoint at `/api/mcp`. It lets Claude (chat, mobile or Code)
read how things are going and change the plan — without opening the app and
without a code change.

The line it draws:

| | Read | Write |
| --- | --- | --- |
| **Record** — meals, weight, habits, mobility, completed workouts | yes | **never** |
| **Plan** — templates, warm-ups, blocks, locations, goal periods | yes | two-step, logged, undoable |

## Tools

### Review (read-only)

| Tool | Returns |
| --- | --- |
| `get_today_status` / `get_day_status(date)` | Day type, budget, burns, consumed, protein, remaining, and which goal period decided it |
| `get_recent_meals(days)` | Meals from the last N days |
| `get_week_summary(weeks)` | Per-day rows and roll-up |
| `get_cumulative_deficit_status` | Actual vs expected deficit inside the period in force |
| `get_weight_trend(days)` | Entries, 7-day trend, weekly rate |
| `get_goal_analysis` | Position against the period's line, required pace, projection |
| `get_goal_periods` | Every goal period, the one in force, TDEE table and weekly pattern |
| `list_over_budget_days(days)` | Days where consumed > budget |
| `get_habits_today` | Each habit against today's / this week's goal |
| `get_habit_history(days)` | Per-day / per-week values and hit rate |
| `get_mobility_log(days)` | Mobility sessions, upper / lower |
| `list_recent_workouts(days)` | Completed sessions, only the sets actually done |
| `get_exercise_history(name)` | One movement across sessions |
| `list_workout_templates`, `get_workout_template` | The programme |
| `list_warmup_packages`, `list_training_blocks`, `list_training_locations` | Its parts |
| `list_writes` | What has been written through here |

### Plan (write)

| Tool | Changes |
| --- | --- |
| `put_workout_template` | One whole template |
| `set_template_archived` | Retire / restore a template |
| `put_warmup_package` | One warm-up package |
| `put_training_block` | One training block |
| `put_training_location` | One place and what it offers |
| `put_goal_period` | One weight-goal period — this moves the daily budget |
| `undo_write` | Puts back what a write replaced |

## What makes a write safe

1. **Two calls.** The first writes nothing: it validates and returns the exact
   changes and a `confirmToken`. Only a second call carrying that token writes.
2. **The token is the content.** It hashes the row as it is now *and* the new
   payload. It cannot confirm something other than what was shown, and it stops
   working if the row changed in between.
3. **Shape is checked here**, because Postgres takes any jsonb and a malformed
   template would otherwise surface weeks later on the phone.
4. **Everything is logged** to `mcp_writes` with the whole previous version.
   `undo_write` restores it.
5. **Same content is no write.**
6. **Tools are labelled** read-only or writing (`annotations`), so in Claude you
   can leave reads on "always allow" and keep writes on "ask every time".

`put_goal_period` has three more guards, because a goal period lives inside the
settings row that the phone also saves:

- it changes only `goalPeriods`, and only if the row is still the one it read;
- a period starting in the future must be `planned` — `active` would take
  today's budget immediately;
- it warns (without blocking) about a cut steeper than 1 % of bodyweight per
  week or 1000 kcal/day, and about overlapping periods. It never ends another
  period on your behalf.

The app picks the change up when it next comes to the foreground.

## What it cannot do

- Change anything already logged. That is deliberate and tested.
- Delete a template, block or location — archive instead.
- Change the TDEE table, weekly day-type pattern or protein target. They are
  readable (`get_goal_periods`), not writable yet.
- See the daily check (gate states) before a session is completed, or anything
  else that lives only on the phone.

## Setup

Environment variables on Vercel (Production):

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | Same as `VITE_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role |
| `MCP_API_KEY` | `openssl rand -hex 32` — under 32 characters is refused |
| `MCP_USER_ID` | Your `auth.users.id` |
| `MCP_TZ` | Optional, default `Europe/Helsinki` |

Check it:

```sh
curl https://<your-domain>/api/mcp
```

Add to Claude: Customize → Connectors → add custom connector →
URL `https://<your-domain>/api/mcp`, "No sign in", and under **Request headers**
`Authorization` = `Bearer <MCP_API_KEY>`. Then set the write tools to ask every
time.

The key reaches the service role, which bypasses row-level security — the
function scopes every query to `MCP_USER_ID` itself. Treat the key like a
password: if it leaks, rotate `MCP_API_KEY` on Vercel and redeploy.

## Extending it

Content changes need no code: they are rows. A new *kind* of thing does — add
the tool, route it through `stage()`, list it in `WRITE_TOOLS`, teach
`undo_write` its table. `api/_mcp.test.ts` covers the protocol and checks that
the numbers match the app's own `computeDays`.
