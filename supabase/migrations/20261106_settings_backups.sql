-- Snapshot table for settings rows taken before a hand-applied data change.
-- Restore: update settings set data = b.data, updated_at = now()
--          from settings_backups b where b.id = <id> and settings.user_id = b.user_id;
-- RLS on with no policies: service role only, never reaches the client.
create table if not exists public.settings_backups (
  id bigserial primary key,
  user_id uuid not null,
  taken_at timestamptz not null default now(),
  reason text not null,
  data jsonb not null,
  updated_at timestamptz
);
alter table public.settings_backups enable row level security;
