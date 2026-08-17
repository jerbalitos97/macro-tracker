-- Warm-up packages, and the v2 templates restructured around them.
--
-- Three things happen here, all of them content written into the database:
--
--   1. workout_warmups: a warm-up is a fixed routine, not training volume. It
--      used to sit in the exercise list as numbered slots, which made it look
--      like work to log set by set. One package, attached to the templates that
--      share it, edited in one place.
--   2. The weekly leg load moves off S1 and S4 and onto S2 and S3, so S1 is
--      plyo + planche on clean hands and S4 is a short session that leaves the
--      legs for volleyball.
--   3. The S2 hinge slot stops resolving to one movement. Where there is load
--      it shows both loaded options side by side with the gym each needs, so
--      the plan picks the room instead of the room picking the plan.
--
-- Idempotent: every row is replaced wholesale, matched on a stable id, and the
-- writes are skipped when nothing changed.

-- ── 1. The warm-up table ───────────────────────────────────────────────────

create table if not exists public.workout_warmups (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workout_warmups enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workout_warmups' and policyname = 'own rows'
  ) then
    create policy "own rows" on public.workout_warmups
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists workout_warmups_user_idx on public.workout_warmups (user_id);

alter table public.workout_templates add column if not exists warmup_id text;
alter table public.workout_templates add column if not exists warmup_progressive boolean not null default false;

-- ── 2. The package ─────────────────────────────────────────────────────────
-- The wrist items carry an `escalated` dose: a treating wrist is not a reason
-- to skip wrist prep, it is the reason to do more of it, slower and loaded.
-- That is the opposite of what the gate does to a loading slot, which is why
-- the raised dose is written down per item rather than derived from the state.

insert into public.workout_warmups (id, user_id, name, items, note)
select
  'wu-ylavartalo-prep',
  t.user_id,
  'Ylävartalo prep',
  $j$[
    {
      "id": "wu-wrist-ext",
      "name": "Ranteen ekstensio kevyellä kuormalla / nauhalla",
      "dose": "2 × 15",
      "note": "hidas eksentrinen",
      "gateRegion": "wrist",
      "escalated": { "dose": "3 × 15 kevyellä", "note": "hidas eksentrinen + kuormitettu venytys — hoitava annos" }
    },
    {
      "id": "wu-wrist-flex",
      "name": "Ranteen fleksio",
      "dose": "2 × 15",
      "gateRegion": "wrist",
      "escalated": { "dose": "3 × 15 kevyellä", "note": "hidas eksentrinen + kuormitettu venytys — hoitava annos" }
    },
    {
      "id": "wu-pronation",
      "name": "Pronaatio / supinaatio painolla vaakatasossa",
      "dose": "2 × 15",
      "gateRegion": "wrist",
      "escalated": { "dose": "3 × 15 kevyellä", "note": "hidas eksentrinen — hoitava annos" }
    },
    {
      "id": "wu-wrist-stretch",
      "name": "Kuormitettu ranneventytys polviltaan",
      "dose": "kämmenet alas 30 s + kämmenet ylös 30 s",
      "gateRegion": "wrist",
      "escalated": { "dose": "kämmenet alas 45 s + ylös 45 s", "note": "kuormitettu venytys — hoitava annos" }
    },
    {
      "id": "wu-cuban",
      "name": "Ulkokiertäjät (Cuban rotation / band ER)",
      "dose": "2 × 12–15",
      "note": "kuormitettuna ja hitaana",
      "progressive": true
    },
    {
      "id": "wu-scap",
      "name": "Lapatyö",
      "dose": "",
      "note": "lapaveto ja protraktio"
    }
  ]$j$::jsonb,
  'Ajetaan ennen ensimmäistä liikettä. Ulkokiertäjät progressiivisena kerran viikossa (S1); muissa sessioissa kevyempi ja vapaavalintainen.'
from (select distinct user_id from public.workout_templates) t
on conflict (id) do update
  set name = excluded.name,
      items = excluded.items,
      note = excluded.note,
      updated_at = now()
  where public.workout_warmups.items is distinct from excluded.items
     or public.workout_warmups.name is distinct from excluded.name
     or public.workout_warmups.note is distinct from excluded.note;

-- ── 3. The templates ───────────────────────────────────────────────────────

-- S1 · Push + plyo. Depth and approach jumps move here from S2; the leg slot,
-- the wrist prep and the Cuban rotation leave (the last two into the package).
update public.workout_templates set
  name = 'S1 v2 · Push + plyo',
  warmup_id = 'wu-ylavartalo-prep',
  warmup_progressive = true,
  note = 'Push + plyo. Ei jalkaslottia: viikon jalkakuorma on S2:ssa ja S3:ssa, tämä sessio on plyo ja planche puhtailla käsillä. Kantaa viikon progressiivisen ulkokiertäjäannoksen. · Viikkorytmi (ohje, ei sidottu päivään): ma Epic S1 (plyo + planche) · ti S4 + lentopallo · ke aamu liikkuvuus, ilta Epic S2 · to täyslepo · pe liikkuvuus + S3 (joustaa lauantaille) · la PK-lenkki + freestyle 15–20 min ulkona · su täyslepo.',
  exercises = $j$[
    {
      "id": "s1-plyo-depth",
      "name": "Depth jumps 30–40 cm",
      "defaultSets": 3,
      "repRange": { "min": 4, "max": 4 },
      "note": "Session alussa, 2–3 min palautus",
      "env": {
        "requires": ["plyoBox"],
        "fallback": {
          "name": "Maksimaalinen CMJ / aitahyppy",
          "sets": 3,
          "reps": 5,
          "note": "täysi palautus sarjojen välissä"
        }
      },
      "gate": {
        "bodyRegion": "back",
        "variants": {
          "develop": { "name": "Depth jumps 30–40 cm", "sets": 3, "reps": 4, "note": "2–3 min palautus" },
          "hybrid": { "name": "Depth jumps 30–40 cm", "sets": 2, "reps": 3 },
          "treat": null
        }
      }
    },
    {
      "id": "s1-plyo-approach",
      "name": "Approach jumps, täysi vauhti",
      "defaultSets": 3,
      "repRange": { "min": 3, "max": 3 },
      "gate": {
        "bodyRegion": "back",
        "variants": {
          "develop": { "name": "Approach jumps, täysi vauhti", "sets": 3, "reps": 3 },
          "hybrid": { "name": "Approach jumps", "sets": 2, "reps": 2 },
          "treat": null
        }
      }
    },
    {
      "id": "s1-s1v2-1",
      "name": "Baby straddle + jalkojen avausyritykset",
      "defaultSets": 4,
      "defaultDuration": 4,
      "note": "Paraleteilla · 4–6 s · kirjaa avauskulma ja pitoaika",
      "gate": {
        "bodyRegion": "wrist",
        "variants": {
          "develop": {
            "name": "Baby straddle + jalkojen avausyritykset",
            "sets": 4,
            "holdSeconds": 4,
            "note": "paraleteilla · 4–6 s · kirjaa avauskulma ja pitoaika",
            "env": {
              "requires": ["parallettes"],
              "fallback": {
                "name": "Planche lean -pidot lattialla, maksimikaltevuus",
                "sets": 5,
                "holdSeconds": 10,
                "note": "5 × 10–15 s · paraletit ovat pidoille pakolliset, tämä on lähin kulmaspesifi isometria tasaisella alustalla"
              }
            }
          },
          "hybrid": {
            "name": "Baby straddle + jalkojen avausyritykset",
            "sets": 3,
            "holdSeconds": 4,
            "note": "paraleteilla · 4–6 s",
            "env": {
              "requires": ["parallettes"],
              "fallback": {
                "name": "Planche lean -pidot lattialla, maksimikaltevuus",
                "sets": 4,
                "holdSeconds": 10,
                "note": "4 × 10–15 s · lopeta sarja ennen kuin ranne alkaa tuntua"
              }
            }
          },
          "treat": {
            "name": "Baby straddle + jalkojen avausyritykset",
            "sets": 3,
            "holdSeconds": 4,
            "note": "paraleteilla · 4–6 s — hoitavalla ranteella kuormaa ei viedä lattialle",
            "env": { "requires": ["parallettes"], "fallback": null }
          }
        }
      }
    },
    {
      "id": "s1-s1v2-2",
      "name": "Baby straddle hold",
      "defaultSets": 5,
      "defaultDuration": 10,
      "note": "Paraleteilla · 10–15 s",
      "gate": {
        "bodyRegion": "wrist",
        "variants": {
          "develop": {
            "name": "Baby straddle hold",
            "sets": 5,
            "holdSeconds": 10,
            "note": "paraleteilla · 10–15 s",
            "env": {
              "requires": ["parallettes"],
              "fallback": {
                "name": "Planche lean -pidot lattialla, maksimikaltevuus",
                "sets": 5,
                "holdSeconds": 10,
                "note": "5 × 10–15 s · paraletit ovat pidoille pakolliset, tämä on lähin kulmaspesifi isometria tasaisella alustalla"
              }
            }
          },
          "hybrid": {
            "name": "Baby straddle hold",
            "sets": 4,
            "holdSeconds": 10,
            "note": "paraleteilla · 10–15 s",
            "env": {
              "requires": ["parallettes"],
              "fallback": {
                "name": "Planche lean -pidot lattialla, maksimikaltevuus",
                "sets": 4,
                "holdSeconds": 10,
                "note": "4 × 10–15 s · lopeta sarja ennen kuin ranne alkaa tuntua"
              }
            }
          },
          "treat": {
            "name": "Baby straddle hold",
            "sets": 4,
            "holdSeconds": 10,
            "note": "paraleteilla · 10–12 s — hoitavalla ranteella kuormaa ei viedä lattialle",
            "env": { "requires": ["parallettes"], "fallback": null }
          }
        }
      }
    },
    {
      "id": "s1-s1v2-3",
      "name": "Planche lean -pidot",
      "defaultSets": 5,
      "defaultDuration": 10,
      "note": "Lattialla · 10–15 s",
      "gate": {
        "bodyRegion": "wrist",
        "variants": {
          "develop": { "name": "Planche lean -pidot (lattialla)", "sets": 5, "holdSeconds": 10, "note": "10–15 s" },
          "hybrid": {
            "name": "Planche lean -pidot (paraleteilla)",
            "sets": 5,
            "holdSeconds": 10,
            "note": "sama kaltevuus · 10–15 s",
            "env": {
              "requires": ["parallettes"],
              "fallback": {
                "name": "Planche lean -pidot (lattialla, sama kaltevuus)",
                "sets": 5,
                "holdSeconds": 10,
                "note": "ei paraletteja: pidä kaltevuus, lopeta sarja jos ranne alkaa tuntua"
              }
            }
          },
          "treat": {
            "name": "Planche lean -pidot (paraleteilla, loivempi kulma)",
            "sets": 3,
            "holdSeconds": 10,
            "env": { "requires": ["parallettes"], "fallback": null }
          }
        }
      }
    },
    {
      "id": "s1-s1v2-4",
      "name": "Pseudo planche push-up",
      "defaultSets": 4,
      "repRange": { "min": 4, "max": 6 },
      "tempo": "3–4 s eksentrinen",
      "gate": {
        "bodyRegion": "wrist",
        "variants": {
          "develop": { "name": "Pseudo planche push-up (lattialla)", "sets": 4, "reps": { "min": 4, "max": 6 }, "tempo": "3–4 s eksentrinen" },
          "hybrid": {
            "name": "Pseudo planche push-up (paraleteilla)",
            "sets": 4,
            "reps": { "min": 4, "max": 6 },
            "tempo": "3–4 s eksentrinen",
            "env": {
              "requires": ["parallettes"],
              "fallback": { "name": "Pseudo PPU (nyrkeillä)", "sets": 4, "reps": { "min": 4, "max": 6 }, "note": "neutraali ranne nyrkeillä" }
            }
          },
          "treat": null
        }
      }
    },
    {
      "id": "s1-s1v2-5",
      "name": "Weighted dips",
      "defaultSets": 2,
      "repRange": { "min": 8, "max": 10 },
      "env": {
        "requires": ["externalLoad"],
        "fallback": { "name": "Tempodippi", "sets": 2, "reps": 8, "tempo": "3-0-3" }
      }
    }
  ]$j$::jsonb,
  updated_at = now()
where name like 'S1 v2 ·%' and archived_at is null;

-- S2 · Pull + jalkavoima. The plyo pair leaves for S1; the hinge slot becomes a
-- side-by-side choice between the two gyms.
update public.workout_templates set
  name = 'S2 v2 · Pull + jalkavoima',
  warmup_id = 'wu-ylavartalo-prep',
  warmup_progressive = false,
  note = 'Pull + jalkavoima. Viikon ainoa raskas jalkapäivä. · Maksimivoimablokki 5.10. alkaen: saranaslotin kuorma nostetaan 3–5 × 3–5, vaihtoehtona clean pull / hang power clean 4 × 2–3 @ 70–85 %. Ei automaattista blokkivaihtoa — tämä on muistutus. · Viikkorytmi (ohje, ei sidottu päivään): ma Epic S1 (plyo + planche) · ti S4 + lentopallo · ke aamu liikkuvuus, ilta Epic S2 · to täyslepo · pe liikkuvuus + S3 (joustaa lauantaille) · la PK-lenkki + freestyle 15–20 min ulkona · su täyslepo.',
  exercises = $j$[
    {
      "id": "s2-s2v2-3",
      "name": "Straddle FL attempts",
      "defaultSets": 4,
      "defaultDuration": 4,
      "note": "4–6 s",
      "gate": {
        "bodyRegion": "back",
        "variants": {
          "develop": { "name": "Straddle FL attempts", "sets": 4, "holdSeconds": 4, "note": "4–6 s" },
          "hybrid": { "name": "Straddle FL attempts", "sets": 3, "holdSeconds": 4, "note": "4–6 s" },
          "treat": { "name": "Straddle FL attempts", "sets": 2, "holdSeconds": 4, "note": "4–6 s" }
        }
      }
    },
    {
      "id": "s2-s2v2-4",
      "name": "FL negatives (5 s lasku)",
      "defaultSets": 4,
      "repRange": { "min": 2, "max": 3 },
      "gate": {
        "bodyRegion": "back",
        "variants": {
          "develop": { "name": "FL negatives (5 s lasku)", "sets": 4, "reps": { "min": 2, "max": 3 } },
          "hybrid": { "name": "FL negatives (5 s lasku)", "sets": 3, "reps": 2 },
          "treat": null
        }
      }
    },
    {
      "id": "s2-s2v2-5",
      "name": "Vetoslotti",
      "defaultSets": 4,
      "repRange": { "min": 5, "max": 8 },
      "note": "Weighted muscle-upia ei ohjelmoida vetoslottiin — transitio kuormalla ajaa kyynärpäätä ja hauiksen jännettä jota lean ja PPPU kuormittavat jo; MU:t ovat S4:ssä ja freestylessä",
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
    },
    {
      "id": "s2-s2v2-7",
      "name": "Saranaslotti",
      "defaultSets": 3,
      "repRange": { "min": 6, "max": 8 },
      "note": "Kuormapaikassa molemmat variantit näkyvät rinnakkain — valitse sali sen mukaan",
      "gate": {
        "bodyRegion": "back",
        "variants": {
          "develop": {
            "name": "Saranaslotti",
            "sets": 3,
            "reps": { "min": 6, "max": 8 },
            "envOptions": {
              "requires": ["externalLoad"],
              "options": [
                {
                  "name": "Trap bar -maastaveto",
                  "placeLabel": "Fitness 24/7",
                  "sets": 3,
                  "reps": { "min": 6, "max": 8 },
                  "note": "aloitus ~60–65 %, RIR 2–3, ei grindaavia toistoja"
                },
                {
                  "name": "RDL suoralla tangolla / raskas KB-sarana",
                  "placeLabel": "Epic",
                  "sets": 3,
                  "reps": { "min": 6, "max": 8 },
                  "note": "sama sarana-annos, pidä tanko lähellä ja lantio korkealla"
                }
              ],
              "fallback": {
                "name": "1-jalan RDL kehonpainolla / slider leg curl",
                "sets": 3,
                "reps": { "min": 8, "max": 10 },
                "note": "sarana ilman kuormaa ei aja tavoitetta — tee kuormallinen seuraavana kuormapäivänä"
              }
            }
          },
          "hybrid": {
            "name": "Saranaslotti, −20 % kuormasta",
            "sets": 3,
            "reps": { "min": 6, "max": 8 },
            "envOptions": {
              "requires": ["externalLoad"],
              "options": [
                {
                  "name": "Trap bar -maastaveto, −20 % kuormasta",
                  "placeLabel": "Fitness 24/7",
                  "sets": 3,
                  "reps": { "min": 6, "max": 8 },
                  "note": "sama liike kevyemmällä, RIR 3–4"
                },
                {
                  "name": "RDL suoralla tangolla / raskas KB-sarana, −20 % kuormasta",
                  "placeLabel": "Epic",
                  "sets": 3,
                  "reps": { "min": 6, "max": 8 },
                  "note": "sama liike kevyemmällä — pidä tanko lähellä, lantio korkealla"
                }
              ],
              "fallback": {
                "name": "1-jalan RDL kehonpainolla / slider leg curl",
                "sets": 3,
                "reps": 8,
                "note": "hybridi: pidä liikerata kipurajan sisällä"
              }
            }
          },
          "treat": {
            "name": "Kevyt sarana + kävely 20 min",
            "sets": 2,
            "reps": 10,
            "note": "kuorma alas, liikettä lisää — lepo ei ole selän hoito"
          }
        }
      }
    },
    {
      "id": "s2-s2v2-6",
      "name": "Nordic curl",
      "defaultSets": 2,
      "repRange": { "min": 4, "max": 6 },
      "note": "Progressio 1 × 3–5 → 2–3 × 6–8",
      "env": {
        "requires": ["anchorAndBand"],
        "fallback": { "name": "Slider leg curl", "sets": 3, "reps": { "min": 6, "max": 8 } }
      },
      "gate": {
        "bodyRegion": "knee",
        "variants": {
          "develop": { "name": "Nordic curl", "sets": 2, "reps": { "min": 4, "max": 6 } },
          "hybrid": { "name": "Nordic curl", "sets": 2, "reps": 4 },
          "treat": { "name": "Nordic curl, avustettu", "sets": 2, "reps": 4, "note": "suuri avustus, hidas eksentrinen" },
          "rest": null
        }
      }
    },
    {
      "id": "s2-s2v2-8",
      "name": "Step downs",
      "defaultSets": 3,
      "repRange": { "min": 8, "max": 10 },
      "note": "/jalka",
      "gate": {
        "bodyRegion": "knee",
        "variants": {
          "develop": { "name": "Step downs", "sets": 3, "reps": { "min": 8, "max": 10 }, "note": "/jalka" },
          "hybrid": { "name": "Step downs (kevyemmällä)", "sets": 2, "reps": 8, "note": "/jalka" },
          "treat": null,
          "rest": null
        }
      }
    },
    {
      "id": "s2-s2v2-9",
      "name": "Bulgarian split squat",
      "defaultSets": 3,
      "repRange": { "min": 6, "max": 8 },
      "note": "/jalka · hallittu alas, räjähtävä ylös",
      "env": {
        "requires": ["externalLoad"],
        "fallback": {
          "name": "Bulgarian split squat kehonpainolla",
          "sets": 3,
          "reps": { "min": 6, "max": 8 },
          "note": "/jalka · 1.5-toistot — kuormaa korvataan liikeradalla, ei toistoilla"
        }
      },
      "gate": {
        "bodyRegion": "knee",
        "variants": {
          "develop": { "name": "Bulgarian split squat", "sets": 3, "reps": { "min": 6, "max": 8 }, "note": "/jalka · hallittu alas, räjähtävä ylös" },
          "hybrid": { "name": "Bulgarian split squat (kevyemmällä)", "sets": 2, "reps": 8, "note": "/jalka" },
          "treat": null,
          "rest": null
        }
      }
    }
  ]$j$::jsonb,
  updated_at = now()
where name like 'S2 v2 ·%' and archived_at is null;

-- S3 · Push + freestyle + jalat. Takes S4's leg work. The freestyle slot no
-- longer substitutes: muscle-up practice without a bar is not muscle-up
-- practice, so the slot is simply absent where the bar is.
update public.workout_templates set
  name = 'S3 v2 · Push + freestyle + jalat',
  warmup_id = 'wu-ylavartalo-prep',
  warmup_progressive = false,
  note = 'Push + freestyle + jalat. S4:n jalkatyö siirtyi tähän. · Viikkorytmi (ohje, ei sidottu päivään): ma Epic S1 (plyo + planche) · ti S4 + lentopallo · ke aamu liikkuvuus, ilta Epic S2 · to täyslepo · pe liikkuvuus + S3 (joustaa lauantaille) · la PK-lenkki + freestyle 15–20 min ulkona · su täyslepo.',
  exercises = $j$[
    {
      "id": "s3-freestyle-20",
      "name": "Freestyle-slotti 15–20 min",
      "defaultSets": 1,
      "defaultDuration": 1200,
      "env": { "requires": ["muscleUpBar"], "fallback": null }
    },
    {
      "id": "s3-s3v2-2",
      "name": "Adv tuck / baby straddle holds",
      "defaultSets": 5,
      "defaultDuration": 10,
      "note": "Paraleteilla · 10–15 s",
      "gate": {
        "bodyRegion": "wrist",
        "variants": {
          "develop": {
            "name": "Adv tuck / baby straddle holds",
            "sets": 5,
            "holdSeconds": 10,
            "note": "paraleteilla · 10–15 s",
            "env": {
              "requires": ["parallettes"],
              "fallback": {
                "name": "Planche lean -pidot lattialla, maksimikaltevuus",
                "sets": 5,
                "holdSeconds": 10,
                "note": "5 × 10–15 s · paraletit ovat pidoille pakolliset, tämä on lähin kulmaspesifi isometria tasaisella alustalla"
              }
            }
          },
          "hybrid": {
            "name": "Adv tuck / baby straddle holds",
            "sets": 4,
            "holdSeconds": 10,
            "note": "paraleteilla · 10–15 s",
            "env": {
              "requires": ["parallettes"],
              "fallback": {
                "name": "Planche lean -pidot lattialla, maksimikaltevuus",
                "sets": 4,
                "holdSeconds": 10,
                "note": "4 × 10–15 s · lopeta sarja ennen kuin ranne alkaa tuntua"
              }
            }
          },
          "treat": {
            "name": "Adv tuck / baby straddle holds",
            "sets": 4,
            "holdSeconds": 10,
            "note": "paraleteilla · 10–12 s — hoitavalla ranteella kuormaa ei viedä lattialle",
            "env": { "requires": ["parallettes"], "fallback": null }
          }
        }
      }
    },
    {
      "id": "s3-s3v2-3",
      "name": "Tuck planche PU / planche lean",
      "defaultSets": 3,
      "repRange": { "min": 4, "max": 6 },
      "gate": {
        "bodyRegion": "wrist",
        "variants": {
          "develop": { "name": "Tuck planche PU (lattialla)", "sets": 3, "reps": { "min": 4, "max": 6 } },
          "hybrid": {
            "name": "Tuck planche PU (paraleteilla)",
            "sets": 3,
            "reps": { "min": 4, "max": 6 },
            "env": {
              "requires": ["parallettes"],
              "fallback": { "name": "Tuck planche PU (nyrkeillä)", "sets": 3, "reps": { "min": 4, "max": 6 }, "note": "neutraali ranne nyrkeillä" }
            }
          },
          "treat": null
        }
      }
    },
    { "id": "s3-s3v2-4", "name": "HSPU seinää vasten", "defaultSets": 2, "repRange": { "min": 6, "max": 8 } },
    {
      "id": "s3-leg-slot",
      "name": "Jalkaslotti",
      "defaultSets": 3,
      "repRange": { "min": 6, "max": 8 },
      "gate": {
        "bodyRegion": "knee",
        "variants": {
          "develop": {
            "name": "ATG split squat",
            "sets": 3,
            "reps": { "min": 6, "max": 8 },
            "tempo": "3-0-X",
            "note": "3 s alas / räjähtävä ylös, RIR 2–3 — sama liike ja progressiorata kuin S5:ssä",
            "env": {
              "requires": ["externalLoad"],
              "fallback": {
                "name": "Split squat, kehonpaino",
                "sets": 3,
                "reps": { "min": 6, "max": 8 },
                "tempo": "5-0-1",
                "note": "1.5-toistot tai hidas eksentrinen, RIR 1–2 — kuormaa korvataan tempolla, ei toistoilla"
              }
            }
          },
          "hybrid": {
            "name": "Isometria + kevyt ATG split squat",
            "sets": 3,
            "holdSeconds": 30,
            "note": "3 × 30 s isometria, sitten ATG split squat 2 × 10 kevyellä"
          },
          "treat": {
            "name": "Spanish squat / knee extension isometria",
            "sets": 5,
            "holdSeconds": 45,
            "note": "70–80 % MVC",
            "env": {
              "requires": ["anchorAndBand"],
              "fallback": { "name": "Seinäistunta ~45° polvikulmalla", "sets": 5, "holdSeconds": 45 }
            }
          },
          "rest": null
        }
      }
    },
    {
      "id": "s3-stepdowns",
      "name": "Step downs",
      "defaultSets": 2,
      "repRange": { "min": 8, "max": 10 },
      "note": "/jalka",
      "gate": {
        "bodyRegion": "knee",
        "variants": {
          "develop": { "name": "Step downs", "sets": 2, "reps": { "min": 8, "max": 10 }, "note": "/jalka" },
          "hybrid": { "name": "Step downs (kevyemmällä)", "sets": 2, "reps": 8, "note": "/jalka" },
          "treat": null,
          "rest": null
        }
      }
    },
    {
      "id": "s3-s3v2-5",
      "name": "KB-nosto hollow holdissa",
      "defaultSets": 3,
      "repRange": { "min": 8, "max": 12 },
      "note": "Suoran käden pullover säilyy tässä",
      "env": {
        "requires": ["externalLoad"],
        "fallback": {
          "name": "FL raises / toes-to-bar suorin käsin",
          "sets": 3,
          "reps": { "min": 5, "max": 8 },
          "note": "sama suoran käden pullover-kuvio riipunnassa"
        }
      }
    }
  ]$j$::jsonb,
  updated_at = now()
where name like 'S3 v2 ·%' and archived_at is null;

-- S4 · Pull + FL + MU. No legs: this is the volleyball day. The muscle-up slot
-- leads, and tuck FL pull-ups drop a set because the muscle-up is the same
-- dynamic pull in an already-light session.
update public.workout_templates set
  name = 'S4 v2 · Pull + FL + MU',
  warmup_id = 'wu-ylavartalo-prep',
  warmup_progressive = false,
  note = '~30 min kevyt sessio, jalat säästyvät lentopallolle. Vaatii MU-tangon → ulkona tai Epic. · Viikkorytmi (ohje, ei sidottu päivään): ma Epic S1 (plyo + planche) · ti S4 + lentopallo · ke aamu liikkuvuus, ilta Epic S2 · to täyslepo · pe liikkuvuus + S3 (joustaa lauantaille) · la PK-lenkki + freestyle 15–20 min ulkona · su täyslepo.',
  exercises = $j$[
    {
      "id": "s4-mu",
      "name": "Räjähtävät muscle-upit",
      "defaultSets": 4,
      "repRange": { "min": 3, "max": 3 },
      "note": "Kehonpainolla, ei lisäpainoa — harjoitettava ominaisuus on nopeusintentio; kuorma tappaa nopeuden ja ajaa kyynärpäätä ja hauiksen jännettä. RIR 2–3 maksimista 5–7.",
      "env": { "requires": ["muscleUpBar"], "fallback": null }
    },
    {
      "id": "s4-s4v2-1",
      "name": "Straddle FL holds, clean form",
      "defaultSets": 4,
      "defaultDuration": 8,
      "note": "8–12 s",
      "gate": {
        "bodyRegion": "back",
        "variants": {
          "develop": { "name": "Straddle FL holds, clean form", "sets": 4, "holdSeconds": 8, "note": "8–12 s" },
          "hybrid": { "name": "Straddle FL holds, clean form", "sets": 3, "holdSeconds": 8, "note": "8–12 s" },
          "treat": { "name": "Straddle FL holds, clean form", "sets": 2, "holdSeconds": 8, "note": "8–12 s" }
        }
      }
    },
    {
      "id": "s4-s4v2-2",
      "name": "Tuck FL pull-ups",
      "defaultSets": 3,
      "repRange": { "min": 3, "max": 5 },
      "note": "Laskettu 4:stä 3:een: MU on samaa dynaamista vetoa tässä kevyessä sessiossa"
    },
    {
      "id": "s4-s4v2-3",
      "name": "1-leg FL hold",
      "defaultSets": 4,
      "defaultDuration": 8,
      "note": "8–10 s",
      "gate": {
        "bodyRegion": "back",
        "variants": {
          "develop": { "name": "1-leg FL hold", "sets": 4, "holdSeconds": 8, "note": "8–10 s" },
          "hybrid": { "name": "1-leg FL hold", "sets": 3, "holdSeconds": 8, "note": "8–10 s" },
          "treat": { "name": "1-leg FL hold", "sets": 2, "holdSeconds": 8, "note": "8–10 s" }
        }
      }
    },
    { "id": "s4-hollow-hold", "name": "Hollow body hold", "defaultSets": 3, "defaultDuration": 20, "note": "20–30 s" }
  ]$j$::jsonb,
  updated_at = now()
where name like 'S4 v2 ·%' and archived_at is null;

-- S5 · the three-session-week combination.
update public.workout_templates set
  name = 'S5 v2 · Yhdistelmä (3 session viikot)',
  warmup_id = 'wu-ylavartalo-prep',
  warmup_progressive = false,
  note = 'Käytetään 3 session viikoilla yhdistelmänä (S1 + S2 + S5), ei S3:n vaihtoehtona täysillä viikoilla. · Viikkorytmi (ohje, ei sidottu päivään): ma Epic S1 (plyo + planche) · ti S4 + lentopallo · ke aamu liikkuvuus, ilta Epic S2 · to täyslepo · pe liikkuvuus + S3 (joustaa lauantaille) · la PK-lenkki + freestyle 15–20 min ulkona · su täyslepo.',
  exercises = $j$[
    {
      "id": "s5-freestyle-15",
      "name": "Freestyle-slotti 15 min",
      "defaultSets": 1,
      "defaultDuration": 900,
      "env": { "requires": ["muscleUpBar"], "fallback": null }
    },
    {
      "id": "s5-s5v2-2",
      "name": "Baby straddle / adv tuck holds",
      "defaultSets": 4,
      "defaultDuration": 10,
      "note": "Paraleteilla · 10–15 s",
      "gate": {
        "bodyRegion": "wrist",
        "variants": {
          "develop": {
            "name": "Baby straddle / adv tuck holds",
            "sets": 4,
            "holdSeconds": 10,
            "note": "paraleteilla · 10–15 s",
            "env": {
              "requires": ["parallettes"],
              "fallback": {
                "name": "Planche lean -pidot lattialla, maksimikaltevuus",
                "sets": 5,
                "holdSeconds": 10,
                "note": "5 × 10–15 s · paraletit ovat pidoille pakolliset, tämä on lähin kulmaspesifi isometria tasaisella alustalla"
              }
            }
          },
          "hybrid": {
            "name": "Baby straddle / adv tuck holds",
            "sets": 3,
            "holdSeconds": 10,
            "note": "paraleteilla · 10–15 s",
            "env": {
              "requires": ["parallettes"],
              "fallback": {
                "name": "Planche lean -pidot lattialla, maksimikaltevuus",
                "sets": 4,
                "holdSeconds": 10,
                "note": "4 × 10–15 s · lopeta sarja ennen kuin ranne alkaa tuntua"
              }
            }
          },
          "treat": {
            "name": "Baby straddle / adv tuck holds",
            "sets": 2,
            "holdSeconds": 10,
            "note": "paraleteilla · 10–12 s — hoitavalla ranteella kuormaa ei viedä lattialle",
            "env": { "requires": ["parallettes"], "fallback": null }
          }
        }
      }
    },
    {
      "id": "s5-s5v2-3",
      "name": "Straddle FL holds",
      "defaultSets": 4,
      "defaultDuration": 8,
      "note": "8–10 s",
      "gate": {
        "bodyRegion": "back",
        "variants": {
          "develop": { "name": "Straddle FL holds", "sets": 4, "holdSeconds": 8, "note": "8–10 s" },
          "hybrid": { "name": "Straddle FL holds", "sets": 3, "holdSeconds": 8, "note": "8–10 s" },
          "treat": { "name": "Straddle FL holds", "sets": 2, "holdSeconds": 8, "note": "8–10 s" }
        }
      }
    },
    {
      "id": "s5-s5v2-4",
      "name": "Tuck planche PU tai pseudo PPU",
      "defaultSets": 3,
      "repRange": { "min": 4, "max": 6 },
      "gate": {
        "bodyRegion": "wrist",
        "variants": {
          "develop": { "name": "Tuck planche PU (lattialla)", "sets": 3, "reps": { "min": 4, "max": 6 } },
          "hybrid": {
            "name": "Pseudo PPU (paraleteilla)",
            "sets": 3,
            "reps": { "min": 4, "max": 6 },
            "env": {
              "requires": ["parallettes"],
              "fallback": { "name": "Pseudo PPU (nyrkeillä)", "sets": 3, "reps": { "min": 4, "max": 6 }, "note": "neutraali ranne nyrkeillä" }
            }
          },
          "treat": null
        }
      }
    },
    { "id": "s5-s5v2-5", "name": "Tuck FL pull-ups", "defaultSets": 3, "repRange": { "min": 3, "max": 5 } },
    {
      "id": "s5-s5v2-6",
      "name": "Jalkaslotti",
      "defaultSets": 3,
      "repRange": { "min": 6, "max": 8 },
      "gate": {
        "bodyRegion": "knee",
        "variants": {
          "develop": {
            "name": "ATG split squat",
            "sets": 3,
            "reps": { "min": 6, "max": 8 },
            "tempo": "3-0-X",
            "note": "3 s alas / räjähtävä ylös, RIR 2–3 — sama liike ja progressiorata kuin S3:ssa",
            "env": {
              "requires": ["externalLoad"],
              "fallback": {
                "name": "Split squat, kehonpaino",
                "sets": 3,
                "reps": { "min": 6, "max": 8 },
                "tempo": "5-0-1",
                "note": "1.5-toistot tai hidas eksentrinen, RIR 1–2 — kuormaa korvataan tempolla, ei toistoilla"
              }
            }
          },
          "hybrid": {
            "name": "Isometria + kevyt ATG split squat",
            "sets": 3,
            "holdSeconds": 30,
            "note": "3 × 30 s isometria, sitten ATG split squat 2 × 10 kevyellä"
          },
          "treat": {
            "name": "Spanish squat / knee extension isometria",
            "sets": 5,
            "holdSeconds": 45,
            "note": "70–80 % MVC",
            "env": {
              "requires": ["anchorAndBand"],
              "fallback": { "name": "Seinäistunta ~45° polvikulmalla", "sets": 5, "holdSeconds": 45 }
            }
          },
          "rest": null
        }
      }
    },
    {
      "id": "s5-s5v2-7",
      "name": "Step downs",
      "defaultSets": 2,
      "repRange": { "min": 8, "max": 10 },
      "note": "/jalka",
      "gate": {
        "bodyRegion": "knee",
        "variants": {
          "develop": { "name": "Step downs", "sets": 2, "reps": { "min": 8, "max": 10 }, "note": "/jalka" },
          "hybrid": { "name": "Step downs (kevyemmällä)", "sets": 2, "reps": 8, "note": "/jalka" },
          "treat": null,
          "rest": null
        }
      }
    },
    { "id": "s5-hollow-hold", "name": "Hollow body hold", "defaultSets": 3, "defaultDuration": 20, "note": "20–30 s" }
  ]$j$::jsonb,
  updated_at = now()
where name like 'S5 v2 ·%' and archived_at is null;
