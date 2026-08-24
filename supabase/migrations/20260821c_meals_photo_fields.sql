-- Kuvauslisä ruokakirjaukseen: kaksi saraketta `meals`-tauluun.
--
-- Kuvaa itseään EI tallenneta. Se lähtee analysoitavaksi ja katoaa; kantaan
-- päätyvät vain luvut ja niiden selitys. Siksi tässä ei ole storage-bucketia
-- eikä viittausta tiedostoon — vain se teksti joka kertoo mistä luvut tulivat.
--
-- Molemmat sarakkeet ovat nullable eikä niillä ole oletusta: käsin kirjattu
-- ateria on yhä pelkkä kcal + proteiini, ja tyhjä kuvaus erottaa sen
-- kuva-analyysin tuloksesta ilman erillistä lippua.

alter table meals add column if not exists description text;
alter table meals add column if not exists items text[];

comment on column meals.description is
  'Kuva-analyysin tuottama lyhyt kuvaus annoksesta. Null = käsin kirjattu ateria.';
comment on column meals.items is
  'Kuva-analyysin tunnistamat yksittäiset ruoka-aineet. Null = käsin kirjattu ateria.';
