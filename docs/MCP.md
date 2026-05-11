# Macrotracker MCP server

A single-user MCP endpoint at `/api/mcp` that exposes high-level
read-only tools so Claude.ai (or Claude Code) can answer questions
about your tracker data without knowing the underlying schema.

## Tools

| Tool                              | Returns                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| `get_today_status`                | Today's day type, budget, burns, consumed, protein, remaining, adjustment, event         |
| `get_day_status(date)`            | Same picture for any past or future date                                                 |
| `get_recent_meals(days)`          | Meals from the last N days (default 7, max 60)                                           |
| `get_week_summary(weeks)`         | Per-day breakdown + roll-up for the last N weeks (default 1, max 8)                      |
| `get_cumulative_deficit_status`   | Actual vs expected cumulative deficit, gap, pace classification                          |
| `get_weight_trend(days)`          | Weight entries with 7-day moving average + weekly change rate                            |
| `get_goal_analysis`               | Same numbers as the Tavoite tab: required pace, current pace, gap, projected goal date   |
| `list_over_budget_days(days)`     | Recent days where consumed > effective budget                                            |
| `get_habits_today`                | Each non-archived habit with today's (or this week's) value vs goal                      |

## Architecture

- One Vercel serverless function (`api/mcp.ts`)
- Stateless Streamable HTTP transport — each POST is a self-contained JSON-RPC request
- Auth: single static Bearer token (`MCP_API_KEY`) — fits a personal POC
- DB access: Supabase service-role key, internally scoped to `MCP_USER_ID`

## One-time setup

1. **Get your service-role key** from
   `https://supabase.com/dashboard/project/<ref>/settings/api` →
   "service_role" → "Reveal" → copy.

2. **Set Vercel environment variables** (Project → Settings → Environment Variables).
   All four go to *Production*:

   | Name                          | Value                                                  |
   | ----------------------------- | ------------------------------------------------------ |
   | `SUPABASE_URL`                | Same as `VITE_SUPABASE_URL`                             |
   | `SUPABASE_SERVICE_ROLE_KEY`   | From step 1                                            |
   | `MCP_API_KEY`                 | A 64-char random string — `openssl rand -hex 32`        |
   | `MCP_USER_ID`                 | Your `auth.users.id` UUID (find with `select id from auth.users where email = '…'`) |

3. **Redeploy** so the new env vars are picked up.

4. **Verify** the endpoint is alive:

   ```sh
   curl https://<your-domain>/api/mcp
   # → { name: "macro-tracker", version: "1.0.0", … }

   curl -X POST https://<your-domain>/api/mcp \
     -H "Authorization: Bearer $MCP_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   # → { jsonrpc: "2.0", id: 1, result: { tools: [ … ] } }
   ```

5. **Add to Claude.ai as a Custom Connector:**
   - Settings → Connectors → Add Custom Connector
   - URL: `https://<your-domain>/api/mcp`
   - Auth: Custom header `Authorization` = `Bearer <MCP_API_KEY>`
   - Save and authorize the tools

After that you can ask things like:

> *Mikä on tämän viikon kalorivaje verrattuna tavoitteeseen?*
>
> *Listaa päivät viimeisen 30 päivän aikana, jolloin ylitin budjetin.*
>
> *Onko tapani onnistuneet tänään?*

Claude will pick the relevant tool, call it, and answer in natural language.
