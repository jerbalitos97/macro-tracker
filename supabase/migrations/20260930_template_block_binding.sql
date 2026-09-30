-- Pohja voi kuulua treeniblokille.
--
-- Tähän asti pohja oli joko käytössä tai arkistossa, eikä väliä ollut. Se
-- riitti niin kauan kuin ohjelma vaihtui samalla hetkellä kuin se kirjoitettiin.
-- Seuraavan blokin ohjelma kirjoitetaan kuitenkin viikkoja etukäteen, ja
-- silloin kaksi vaihtoehtoa olivat molemmat vääriä: käytössä oleva pohja
-- ilmestyisi tämän päivän valikkoon, ja arkistoitu näyttäisi jo eläköityneeltä.
--
-- `block_id` on kolmas tila ilman kolmatta saraketta: pohja on olemassa,
-- näkyvissä ja muokattavissa, mutta tarjolla vasta kun sen oma blokki on
-- menossa. Null tarkoittaa "aina käytettävissä", eli jokainen ennestään
-- olemassa oleva pohja käyttäytyy täsmälleen kuten ennenkin.
--
-- Viiteavainta `workout_blocks`iin EI aseteta tarkoituksella: blokin poisto ei
-- saa viedä pohjaa mukanaan, koska pohja on ohjelma ja blokki on kalenteri.
-- Orvoksi jäänyt viite lukeutuu "ei tämän blokin pohja" -tilaan, mikä on
-- turvallinen oletus.

alter table workout_templates add column if not exists block_id text;

comment on column workout_templates.block_id is
  'Treeniblokki jolle tämä pohja kuuluu. Null = aina käytettävissä. Asetettuna pohja tarjotaan vain kun kyseinen blokki on menossa, jolloin seuraavan blokin ohjelma voidaan kirjoittaa valmiiksi ilman että se ilmestyy tämän päivän valikkoon.';
