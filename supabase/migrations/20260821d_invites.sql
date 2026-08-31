-- Kutsulinkit: kertakäyttöinen tunnus jolla uusi ihminen luo itselleen tunnukset.
--
-- Miksi tämä on kanta eikä pelkkä salasana koodissa: kutsu kantaa mukanaan sen
-- työkalulistan jonka kutsuttu saa, ja se on dataa. Samalla se antaa kolme asiaa
-- joita jaettu salasana ei anna — kertakäyttöisyyden, vanhenemisen ja jäljen
-- siitä kuka kutsuttiin ja kuka kutsun käytti.
--
-- Tunnusta ei voi lukea kannasta ilman admin-oikeutta, eikä sitä tarvitsekaan:
-- lunastus kulkee palvelinfunktion kautta service-role-avaimella. Kutsulinkin
-- tietäminen on siis ainoa tapa käyttää sitä, ja se on tarkoituskin.

create table if not exists invites (
  token      uuid primary key default gen_random_uuid(),
  -- Työkalut jotka kutsuttu saa. Kirjoitetaan sellaisenaan user_tools-riviksi
  -- lunastuksessa, ja normalizeTools siivoaa sen client-puolella.
  tools      text[] not null default '{}',
  -- Vapaa muistiinpano adminille: kenelle tämä linkki lähetettiin.
  label      text not null default '',
  created_by uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  -- Vanheneminen on oletus eikä valinta: unohtunut linkki lakkaa toimimasta
  -- itsestään.
  expires_at timestamptz not null default now() + interval '7 days',
  used_at    timestamptz,
  used_by    uuid references auth.users on delete set null
);

alter table invites enable row level security;

-- Vain admin. Kutsuttu ei kysy tätä taulua lainkaan — hänen puolestaan sen
-- tekee palvelinfunktio, joka ohittaa RLS:n service-role-avaimella.
drop policy if exists "invites: admin only" on invites;
create policy "invites: admin only"
  on invites for all
  using (is_app_admin())
  with check (is_app_admin());

create index if not exists invites_open on invites (expires_at) where used_at is null;
