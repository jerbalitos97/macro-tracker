-- Kaksi uutta työkalua Kodista: Tehtävät ja LiikkuvuusPuu.
--
-- Kodissa nämä rivit on skoopattu `user_name`-tekstikentällä ('Äiti', 'Anne',
-- 'Jere') ilman RLS:ää, eli julkinen anon-avain riittää kaikkien rivien
-- lukemiseen. Täällä ne saavat Fridayn kuvion: oikea `user_id`-UUID ja RLS.
--
-- Avain on `uuid`, ei `bigint`-asiakasleima. Fridayn vanhemmat taulut käyttävät
-- `id bigint primary key` -kuviota jossa arvo on `Date.now()`, ja se on globaali
-- avain — kaksi eri käyttäjää voi törmätä samaan id:hen. `wt_settings` on jo
-- kertaalleen korjattu tästä (ks. schema.sql: "Ownership is the key now"), ja
-- uusia tauluja ei kannata perustaa samaan ansaan.
--
-- Admin ei näe näitä rivejä. Työkalun myöntäminen ei ole lupa lukea sillä
-- kirjattua dataa.

-- ── Tehtävät ─────────────────────────────────────────────────
-- Ei sama asia kuin `habits`. Habit toistuu (`task_days`, `goal_period`);
-- tehtävä on kertaluontoinen päivätty rivi joka kuitataan kerran ja voidaan
-- siirtää toiselle päivälle. Yhteen pakottaminen vääristäisi molempia malleja.
create table if not exists tasks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  title          text not null,
  scheduled_date date not null,
  done           boolean not null default false,
  done_at        timestamptz,
  created_at     timestamptz not null default now()
);

alter table tasks enable row level security;

drop policy if exists "tasks: own rows only" on tasks;
create policy "tasks: own rows only"
  on tasks for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists tasks_user_date on tasks (user_id, scheduled_date);

-- ── LiikkuvuusPuu ────────────────────────────────────────────
-- Erillinen Fridayn treenilokista tarkoituksella. Sama sana, eri asia: tämä on
-- motivaatiovisualisointi jossa yksi kirjaus = yksi oksa, ei treenivolyymia.
-- Sen laskeminen `workouts`-tauluun näyttäisi harjoittelulta jota ei tehty.
create table if not exists mobility_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  log_date   date not null,
  upper_body boolean not null default false,
  lower_body boolean not null default false,
  created_at timestamptz not null default now(),
  -- Kodin lib heittää tästä JS-puolella; sama sääntö kuuluu myös kantaan, muuten
  -- tyhjä kirjaus kasvattaa puuta ilman että mitään tehtiin.
  constraint mobility_logs_something_logged check (upper_body or lower_body)
);

alter table mobility_logs enable row level security;

drop policy if exists "mobility_logs: own rows only" on mobility_logs;
create policy "mobility_logs: own rows only"
  on mobility_logs for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists mobility_logs_user_date on mobility_logs (user_id, log_date);
