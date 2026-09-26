-- MCP:n kirjoituslokki.
--
-- Kun ohjelmaa voi muuttaa keskustelemalla, muutos tapahtuu ilman että kukaan
-- katsoo ruutua. Silloin kaksi asiaa on pakko olla olemassa: tieto siitä mikä
-- muuttui, ja tie takaisin. Tämä taulu on molemmat — jokaisesta MCP:n
-- tekemästä kirjoituksesta jää rivi jossa on koko edellinen ja koko uusi
-- versio, ja peruutus on sen `before`-kentän kirjoittaminen takaisin.
--
-- Kokonaiset oliot eikä kenttädiffiä: pohja on yksi jsonb-dokumentti, ja
-- osittainen paluu jättäisi sen tilaan jota ei ole koskaan ollut olemassa.
--
-- `before` on null kun rivi luotiin tyhjästä; silloin peruutus on poisto.
-- `undone_at` merkitsee peruutetun kirjoituksen, jottei samaa peruuteta kahdesti.

create table if not exists mcp_writes (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  at            timestamptz not null default now(),
  -- Työkalun nimi sellaisena kuin se MCP:ssä on, jotta lokista näkee mitä
  -- pyydettiin eikä vain mitä tauluun osui.
  tool          text not null,
  target_table  text not null,
  target_id     text not null,
  before        jsonb,
  after         jsonb,
  undone_at     timestamptz
);

alter table mcp_writes enable row level security;

-- Omat rivit näkyvät sovelluksessa. Kirjoitukset tulevat service-rolella, joka
-- ohittaa RLS:n — tämä politiikka on lukemista varten, ei kirjoittamista.
drop policy if exists "mcp_writes: own rows only" on mcp_writes;
create policy "mcp_writes: own rows only"
  on mcp_writes for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists mcp_writes_user_at on mcp_writes (user_id, at desc);

comment on table mcp_writes is
  'MCP:n kautta tehtyjen kirjoitusten lokki. before/after ovat kokonaisia olioita, joten peruutus on before-kentän palautus sellaisenaan.';
