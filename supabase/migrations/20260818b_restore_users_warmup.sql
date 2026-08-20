-- Restore the user's own warm-up routine as the warm-up package.
--
-- "Ylävartalo prep" was written from a spec while the routine the user had
-- actually built — and edited, adding leg swings — was sitting in the old
-- `warmups` table that the package model replaced. This brings that routine
-- back verbatim: same six moves, same order, same doses, same detail text.
--
-- Two behaviours that were added on top of the package model are kept, mapped
-- onto the moves they belong to rather than dropped:
--   · the wrist gate escalates Rannerutiini to a rehab dose on a treating day
--     (a treating wrist is the reason to do more prep, not less);
--   · the band rotations carry the once-a-week progressive dose, which S1 is
--     flagged for.
--
-- The old `warmups` table is left untouched. It is the origin of this content
-- and nothing reads it any more; deleting a user's data to tidy up is not this
-- migration's business.

insert into public.workout_warmups (id, user_id, name, items, note)
select
  'wu-lamppa',
  t.user_id,
  'Lämppä',
  $j$[
    {
      "id": "w1",
      "name": "Rotaatiokombo",
      "dose": "2×/puoli ×3",
      "note": "polvillaan olkapääkierto + askelkyykky-kierrot + ATG-kyykkykierto — rintaranka, lonkat, takaketju, syvyys"
    },
    {
      "id": "w2",
      "name": "Rannerutiini",
      "dose": "60–90 s",
      "note": "quadruped rocks + sormet taakse painonsiirto + rystypito",
      "gateRegion": "wrist",
      "escalated": {
        "dose": "3 × 15 kevyellä",
        "note": "hidas eksentrinen + kuormitettu venytys — hoitava annos, ei jätetä väliin"
      }
    },
    {
      "id": "w3",
      "name": "Lapakierto",
      "dose": "8 + 8",
      "note": "scap push up + scap pull up / lapaveto"
    },
    {
      "id": "w4",
      "name": "Kuminauha ulko- + sisäkierto",
      "dose": "10 + 10",
      "note": "kuormitettuna ja hitaana",
      "progressive": true
    },
    {
      "id": "9f485a17-93bd-4266-b12d-7119b02e73cd",
      "name": "Jalkojen heilautus",
      "dose": "10 per suunta per jalka",
      "note": "Eteen/taakse + sivultasivulle"
    },
    {
      "id": "w5",
      "name": "Ramppisarja",
      "dose": "2 sarjaa",
      "note": "päivän 1. liike: 2 kevennettyä sarjaa progressio alas (tuck ennen straddlea, pogo hopit ennen depth jumppeja)"
    }
  ]$j$::jsonb,
  'Kiireessä pudotusjärjestys: kuminauhakierrot pois ensin — rannerutiini ja ramppisarja ei ikinä. Korvaa erillisen aktivoinnin: ramppisarja on spesifein mahdollinen lämmittely.'
from (select distinct user_id from public.workout_templates) t
on conflict (id) do update
  set name = excluded.name,
      items = excluded.items,
      note = excluded.note,
      updated_at = now()
  where public.workout_warmups.items is distinct from excluded.items
     or public.workout_warmups.name is distinct from excluded.name
     or public.workout_warmups.note is distinct from excluded.note;

update public.workout_templates
set warmup_id = 'wu-lamppa', updated_at = now()
where warmup_id = 'wu-ylavartalo-prep';

delete from public.workout_warmups where id = 'wu-ylavartalo-prep';
