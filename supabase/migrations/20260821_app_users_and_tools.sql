-- Käyttäjä- ja oikeusperusta: kuka appia käyttää ja mihin työkaluihin pääsee.
--
-- Tämä on koko monikäyttäjätyön turvaraja. Kortin piilottaminen ruudukosta on
-- käytettävyyttä; ainoa asia joka estää toisen käyttäjän lukemasta wt_assets- tai
-- weight_entries-rivejä on RLS. Jokainen taulu tässä repossa on jo skoopattu
-- `auth.uid() = user_id`:llä, ja nämä kaksi taulua noudattavat samaa kuviota
-- yhdellä lisäyksellä: admin näkee ja kirjoittaa kaikkien rivit, koska juuri se
-- on adminin tehtävä.
--
-- Kaksi asiaa joita tämä migraatio EI tee, tarkoituksella:
--   · Ei myönnä adminille pääsyä muiden dataan — vain oikeusriveihin. Adminin
--     työ on jakaa työkaluja, ei lukea toisten painohistoriaa. Muut taulut
--     pysyvät tiukasti oman rivin varassa.
--   · Ei luo tilejä. Se vaatii service-role-avaimen jota selaimeen ei päästetä;
--     tilit luodaan Supabasen dashboardista.

-- ── Käyttäjät ────────────────────────────────────────────────
-- Näyttönimi elää täällä eikä auth.users-metadatassa, jotta admin-näkymä voi
-- listata käyttäjät ilman service-role-avainta (auth.users ei ole anon-avaimella
-- luettavissa).
create table if not exists app_users (
  user_id      uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Työkaluoikeudet ──────────────────────────────────────────
-- Yksi rivi per käyttäjä. Rivin puuttuminen ei tarkoita "ei mitään" vaan "ei
-- vielä konffattu" — koodin oletukset ratkaisevat sen tapauksen (roles.ts).
create table if not exists user_tools (
  user_id    uuid primary key references auth.users on delete cascade,
  tools      text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- ── Admin-tarkistus ──────────────────────────────────────────
-- `security definer`, koska policy joka kysyy app_users-taulusta "onko kutsuja
-- admin" osuu itse samaan tauluun ja aiheuttaa rekursiivisen policyn. Funktio
-- ohittaa RLS:n omalla oikeudellaan, ja koska se lukee vain oman rivin
-- is_admin-kentän eikä ota parametria, sitä ei voi käyttää toisen käyttäjän
-- tilan urkkimiseen.
--
-- `search_path` on kiinnitetty: ilman sitä definer-funktion voi huijata
-- lukemaan kutsujan omaa app_users-nimistä taulua.
create or replace function is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select is_admin from public.app_users where user_id = auth.uid()),
    false
  );
$$;

revoke all on function is_app_admin() from public;
-- Myös `anon`: policy joka kutsuu tätä evaluoituu myös kirjautumattomalle
-- pyynnölle, ja ilman suoritusoikeutta se kaatuisi "permission denied"
-- -virheeseen sen sijaan että palauttaisi tyhjän tuloksen. Anonille funktio
-- palauttaa aina false, koska auth.uid() on null.
grant execute on function is_app_admin() to authenticated, anon;

-- ── RLS: app_users ───────────────────────────────────────────
alter table app_users enable row level security;

drop policy if exists "app_users: read own row" on app_users;
create policy "app_users: read own row"
  on app_users for select
  using (auth.uid() = user_id);

-- Käyttäjä saa asettaa oman näyttönimensä. is_admin-kentän suojaa alla oleva
-- trigger, ei tämä policy — policy ei näe vanhaa arvoa riittävän kätevästi
-- kaikissa reiteissä.
drop policy if exists "app_users: upsert own row" on app_users;
create policy "app_users: upsert own row"
  on app_users for insert
  with check (auth.uid() = user_id and is_admin = false);

drop policy if exists "app_users: update own row" on app_users;
create policy "app_users: update own row"
  on app_users for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "app_users: admin reads all" on app_users;
create policy "app_users: admin reads all"
  on app_users for select
  using (is_app_admin());

drop policy if exists "app_users: admin writes all" on app_users;
create policy "app_users: admin writes all"
  on app_users for all
  using (is_app_admin())
  with check (is_app_admin());

-- ── RLS: user_tools ──────────────────────────────────────────
alter table user_tools enable row level security;

-- Käyttäjä LUKEE omat oikeutensa mutta ei kirjoita niitä. Tämä on olennaista:
-- jos käyttäjä saisi kirjoittaa oman rivinsä, hän voisi myöntää itselleen minkä
-- tahansa työkalun suoralla API-kutsulla, ja koko oikeusjärjestelmä olisi
-- pelkkä ehdotus.
drop policy if exists "user_tools: read own row" on user_tools;
create policy "user_tools: read own row"
  on user_tools for select
  using (auth.uid() = user_id);

drop policy if exists "user_tools: admin manages all" on user_tools;
create policy "user_tools: admin manages all"
  on user_tools for all
  using (is_app_admin())
  with check (is_app_admin());

-- ── is_admin-lipun vartija ───────────────────────────────────
-- Kaksi eri asiaa, molemmat pakko tehdä triggerissä eikä policyssä:
--
--   1. Kukaan ei korota itseään adminiksi. RLS:n update-policy päästää
--      käyttäjän kirjoittamaan oman rivinsä (näyttönimen vuoksi), ja policyn
--      `with check` ei näe vanhaa arvoa — se ei siis voi erottaa nimen vaihtoa
--      is_admin-lipun kääntämisestä. Ilman tätä triggeriä yksi suora
--      API-kutsu riittäisi adminiksi, ja koko oikeusjärjestelmä olisi ohitettu.
--   2. Admin ei poista omaa oikeuttaan. Sama suoja kuin käyttöliittymässä,
--      mutta täällä se pitää myös suoraa kutsua vastaan: yksi väärä rasti
--      lukitsisi ulos admin-työkalusta pysyvästi.
--
-- `auth.uid() is null` ohittaa tarkistuksen. Se on migraation ja
-- service-role-avaimen tila, ei kirjautuneen käyttäjän — anon-kutsu ei osu
-- yhteenkään riviin, koska RLS vaatii `auth.uid() = user_id`. Ilman tätä
-- ehtoa alla oleva siemenrivi ei menisi läpi omaa triggeriään.
create or replace function guard_admin_flag()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and new.is_admin is distinct from old.is_admin then
    if not is_app_admin() then
      raise exception 'Vain ylläpitäjä voi muuttaa admin-oikeutta';
    end if;
    if old.user_id = auth.uid() and old.is_admin and not new.is_admin then
      raise exception 'Et voi poistaa omaa admin-oikeuttasi';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists app_users_no_self_demote on app_users;
drop trigger if exists app_users_guard_admin_flag on app_users;
create trigger app_users_guard_admin_flag
  before update on app_users
  for each row
  execute function guard_admin_flag();

-- ── Siemenrivi ───────────────────────────────────────────────
-- Idempotentti: ajettavissa uudelleen ilman sivuvaikutusta. Jos tiliä ei vielä
-- ole, tämä ei tee mitään — aja migraatio uudelleen tilin luonnin jälkeen.
insert into app_users (user_id, display_name, is_admin)
select id, 'Jere', true
  from auth.users
 where lower(email) = 'jersu97@gmail.com'
on conflict (user_id) do update
  set is_admin = true,
      display_name = case
        when app_users.display_name = '' then 'Jere'
        else app_users.display_name
      end,
      updated_at = now();
