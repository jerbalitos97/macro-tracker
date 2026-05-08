-- ============================================================
-- Makrot – Supabase schema
-- Run this in the Supabase SQL editor (or use supabase db push).
-- All tables use Row Level Security so each user sees only their data.
-- ============================================================

-- ── Settings (one row per user) ─────────────────────────────
create table if not exists settings (
  user_id uuid primary key references auth.users on delete cascade,
  data    jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table settings enable row level security;

create policy "settings: own row only"
  on settings for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Meals ────────────────────────────────────────────────────
create table if not exists meals (
  id      bigint primary key,          -- client timestamp ID
  user_id uuid not null references auth.users on delete cascade,
  date    text not null,               -- YYYY-MM-DD
  kcal    numeric not null,
  protein numeric not null default 0
);

alter table meals enable row level security;

create policy "meals: own rows only"
  on meals for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists meals_user_date on meals (user_id, date);

-- ── Weight entries ───────────────────────────────────────────
create table if not exists weight_entries (
  id                  bigint primary key,
  user_id             uuid not null references auth.users on delete cascade,
  date                text not null,
  kg                  numeric not null,
  exclude_from_trend  boolean not null default false
);

alter table weight_entries enable row level security;

create policy "weight_entries: own rows only"
  on weight_entries for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists weight_entries_user_date on weight_entries (user_id, date);

-- ── Training burns ────────────────────────────────────────────
create table if not exists training_burns (
  id      bigint primary key,
  user_id uuid not null references auth.users on delete cascade,
  date    text not null,
  kcal    numeric not null,
  note    text not null default ''
);

alter table training_burns enable row level security;

create policy "training_burns: own rows only"
  on training_burns for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Special events ────────────────────────────────────────────
create table if not exists special_events (
  id                bigint primary key,
  user_id           uuid not null references auth.users on delete cascade,
  date              text not null,
  name              text not null,
  excess_kcal       numeric not null,
  buffer_days       int not null default 0,
  buffer_direction  text not null default 'before'  -- 'before' | 'after' | 'both'
);

alter table special_events enable row level security;

create policy "special_events: own rows only"
  on special_events for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Extra workouts ─────────────────────────────────────────────
create table if not exists extra_workouts (
  id      bigint primary key,
  user_id uuid not null references auth.users on delete cascade,
  date    text not null,
  kcal    numeric not null,
  note    text not null default ''
);

alter table extra_workouts enable row level security;

create policy "extra_workouts: own rows only"
  on extra_workouts for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
