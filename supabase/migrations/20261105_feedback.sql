-- Palauteportaali.
--
-- Käyttäjä kirjoittaa sovelluksessa mitä haluaa muuttaa. Iltainen automaatio
-- lukee uudet rivit, priorisoi ne, suunnittelee ratkaisun ja joko julkaisee
-- sen tai jättää PR:n odottamaan ihmistä. Sama rivi kantaa koko elinkaaren,
-- jotta sovelluksesta näkee mitä palautteelle tapahtui.
--
-- Kirjoitusoikeudet on jaettu tarkoituksella:
--   · Käyttäjä saa lisätä ja lukea omia rivejään. Hän ei saa muuttaa tilaa —
--     muuten "shipped" voisi tarkoittaa mitä tahansa.
--   · Automaatio kirjoittaa service-rolella, joka ohittaa RLS:n. Kaikki
--     triage-kentät (status, priority, risk, plan, pr_url, resolution) ovat
--     sen omia.
--
-- Tila:
--   new          kirjoitettu, automaatio ei ole vielä nähnyt
--   triaged      luettu ja priorisoitu, ei vielä työn alla
--   in_progress  automaatio tekee muutosta
--   needs_review muutos on PR:nä ja odottaa ihmistä (riski liian suuri
--                automaattiseen julkaisuun tai testit eivät menneet läpi)
--   shipped      julkaistu tuotantoon
--   rejected     ei tehdä; resolution kertoo miksi
--   duplicate    sama kuin toinen palaute; resolution viittaa siihen

create table if not exists feedback (
  id          bigserial primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  body        text not null check (length(trim(body)) between 3 and 4000),
  -- Missä näkymässä käyttäjä oli, sovelluksen versio, laite. Automaatiolle
  -- tärkein vihje siitä mihin koodiin palaute liittyy.
  context     jsonb not null default '{}'::jsonb,

  status      text not null default 'new'
              check (status in ('new','triaged','in_progress','needs_review','shipped','rejected','duplicate')),
  priority    smallint check (priority between 1 and 4),
  -- low = saa julkaista automaattisesti testien jälkeen,
  -- high = aina PR ihmiselle. Raja on määritelty automaation ohjeessa.
  risk        text check (risk in ('low','high')),
  plan        text,
  pr_url      text,
  resolution  text,
  shipped_at  timestamptz
);

alter table feedback enable row level security;

drop policy if exists "feedback: read own" on feedback;
create policy "feedback: read own"
  on feedback for select
  using (auth.uid() = user_id);

-- Lisäys vain omissa nimissä ja vain tuoreena: asiakas ei voi kirjoittaa
-- riviä joka näyttää jo käsitellyltä.
drop policy if exists "feedback: insert own new" on feedback;
create policy "feedback: insert own new"
  on feedback for insert
  with check (
    auth.uid() = user_id
    and status = 'new'
    and priority is null and risk is null and plan is null
    and pr_url is null and resolution is null and shipped_at is null
  );

-- Ei update- eikä delete-politiikkaa asiakkaalle.

create index if not exists feedback_status_created on feedback (status, created_at);
create index if not exists feedback_user_created on feedback (user_id, created_at desc);

create or replace function feedback_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists feedback_touch on feedback;
create trigger feedback_touch before update on feedback
  for each row execute function feedback_touch();

comment on table feedback is
  'Käyttäjän palaute ja sen käsittely. Asiakas lisää ja lukee omansa; iltainen automaatio päivittää triage-kentät service-rolella.';
