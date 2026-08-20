-- The S2 pull slot showed "Vetoslotti" on the card instead of the movement.
--
-- A slot's own name IS its primary prescription: resolveEnv builds the loaded
-- branch from the template exercise's own fields, and only the *fallbacks* carry
-- names of their own. So an abstract slot name with a plain `env` and no gate
-- puts the abstraction on the card exactly when the room can host the real
-- thing — the one case where the answer is least ambiguous.
--
-- Every other slot already follows the rule this restores: name the slot after
-- the movement it resolves to when nothing is missing (Nordic curl, Bulgarian
-- split squat, Weighted dips), or give it a gate whose develop variant names
-- the movement (Saranaslotti → Trap bar -maastaveto). The slot framing moves
-- into the note, where it explains rather than replaces.

update public.workout_templates t
set exercises = (
      select jsonb_agg(
               case when e.val ->> 'id' = 's2-s2v2-5' then $j${
                 "id": "s2-s2v2-5",
                 "name": "Weighted pull-ups",
                 "defaultSets": 4,
                 "repRange": { "min": 5, "max": 8 },
                 "note": "Vetoslotti: kuormalla aina ensisijainen. Weighted muscle-upia ei ohjelmoida vetoslottiin — transitio kuormalla ajaa kyynärpäätä ja hauiksen jännettä jota lean ja PPPU kuormittavat jo; MU:t ovat S4:ssä ja freestylessä",
                 "env": {
                   "requires": ["externalLoad"],
                   "fallback": {
                     "name": "Räjähtävät muscle-upit",
                     "sets": 4,
                     "reps": { "min": 3, "max": 4 },
                     "note": "RIR ~2 (max 5–7 toistoa) · maksimaalinen vetointentio",
                     "env": {
                       "requires": ["muscleUpBar"],
                       "fallback": {
                         "name": "Archer pull-up",
                         "sets": 4,
                         "reps": { "min": 4, "max": 6 },
                         "note": "/puoli · vaihtoehto: tempoleuka 3-1-3 × 5–6, RIR 1–2"
                       }
                     }
                   }
                 }
               }$j$::jsonb
               else e.val end
               order by e.ord)
      from jsonb_array_elements(t.exercises) with ordinality as e(val, ord)
    ),
    updated_at = now()
where t.name like 'S2 v2 ·%'
  and t.archived_at is null
  and t.exercises @> '[{"id": "s2-s2v2-5", "name": "Vetoslotti"}]'::jsonb;
