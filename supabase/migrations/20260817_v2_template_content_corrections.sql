-- Content corrections to the v2 strength templates, applied to the database.
--
-- Template, exercise, variant and location content is data, not code: it lives
-- in these tables and reaches the client through the normal sync path. The
-- client carries the gate rules and the resolution order, and nothing else —
-- there is no seed constant to drift out of step with what is stored here.
--
-- Idempotent by construction: each exercise object is replaced wholesale by the
-- literal below, matched on its stable id, and the write is skipped when the
-- resulting array already equals the stored one. Running this twice changes
-- nothing the second time.
--
-- What it does NOT touch: gate thresholds (code), the assessment flow, archived
-- templates, and anything on the nutrition or weight side.

with patch(ex_id, obj) as (values

  -- ── S2 hinge slot: trap bar enters during the base block ──────────────────
  -- The back gate stays on the slot and the equipment ladder sits inside each
  -- variant, so intensity and movement are chosen independently: trap bar where
  -- there is one, straight bar or a heavy kettlebell where there is load but no
  -- trap bar, and an unloaded hinge outdoors.
  ('s2-s2v2-7', $j${
    "id": "s2-s2v2-7",
    "name": "Saranaslotti",
    "defaultSets": 3,
    "repRange": { "min": 6, "max": 8 },
    "note": "Ympäristö valitsee liikkeen, selkäportti annoksen",
    "gate": {
      "bodyRegion": "back",
      "variants": {
        "develop": {
          "name": "Trap bar -maastaveto",
          "sets": 3,
          "reps": { "min": 6, "max": 8 },
          "note": "aloitus ~60–65 %, RIR 2–3, ei grindaavia toistoja — adaptaatio Maksimivoimablokkiin alkaa nyt",
          "env": {
            "requires": ["trapBar"],
            "fallback": {
              "name": "RDL suoralla tangolla tai raskas KB-sarana",
              "sets": 3,
              "reps": { "min": 6, "max": 8 },
              "note": "sama sarana-annos — pidä tanko lähellä, lantio korkealla",
              "env": {
                "requires": ["externalLoad"],
                "fallback": {
                  "name": "1-jalan RDL kehonpainolla / slider leg curl",
                  "sets": 3,
                  "reps": { "min": 8, "max": 10 },
                  "note": "sarana ilman kuormaa ei aja tavoitetta — trap bar seuraavana F24-päivänä"
                }
              }
            }
          }
        },
        "hybrid": {
          "name": "Trap bar -maastaveto, −20 % kuormasta",
          "sets": 3,
          "reps": { "min": 6, "max": 8 },
          "note": "sama liike kevyemmällä, RIR 3–4",
          "env": {
            "requires": ["trapBar"],
            "fallback": {
              "name": "RDL suoralla tangolla tai raskas KB-sarana, −20 % kuormasta",
              "sets": 3,
              "reps": { "min": 6, "max": 8 },
              "note": "sama liike kevyemmällä — pidä tanko lähellä, lantio korkealla",
              "env": {
                "requires": ["externalLoad"],
                "fallback": {
                  "name": "1-jalan RDL kehonpainolla / slider leg curl",
                  "sets": 3,
                  "reps": 8,
                  "note": "hybridi: pidä liikerata kipurajan sisällä"
                }
              }
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
  }$j$::jsonb),

  -- ── S2 pull: load first, then muscle-ups, then leverage ───────────────────
  -- Weighted muscle-ups are deliberately absent: the transition under load
  -- loads the elbow and the biceps tendon that the straight-arm work already
  -- taxes. Muscle-ups belong in the freestyle slot.
  ('s2-s2v2-5', $j${
    "id": "s2-s2v2-5",
    "name": "Weighted pull-ups",
    "defaultSets": 4,
    "repRange": { "min": 5, "max": 8 },
    "note": "Kuormalla aina ensisijainen — weighted muscle-upia ei ohjelmoida, MU:t kuuluvat freestyle-slottiin",
    "env": {
      "requires": ["externalLoad"],
      "fallback": {
        "name": "Räjähtävät muscle-upit",
        "sets": 4,
        "reps": { "min": 3, "max": 4 },
        "note": "RIR ~2 · maksimaalinen vetointentio",
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
  }$j$::jsonb),

  -- ── S4 leg slot: the same movement as S1, one progression line ─────────────
  ('s4-s4v2-4', $j${
    "id": "s4-s4v2-4",
    "name": "Jalkaslotti",
    "defaultSets": 3,
    "repRange": { "min": 6, "max": 8 },
    "gate": {
      "bodyRegion": "knee",
      "variants": {
        "develop": {
          "name": "ATG split squat (medium)",
          "sets": 3,
          "reps": { "min": 6, "max": 8 },
          "tempo": "3-0-X",
          "note": "sama liike ja 3 s alas -tempo kuin S1:ssä, kevyemmällä kuormalla — RIR 2–3. Yksi progressiorata, kaksi jänneannosta viikossa",
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
  }$j$::jsonb),

  -- ── Parallette holds: no fist version exists ──────────────────────────────
  -- The holds cannot be done on fists or flat on the floor, so the substitute
  -- is the nearest angle-specific isometric instead: a maximal-lean planche
  -- lean on the floor. That substitute puts the wrist in extension, which is
  -- why it sits under the wrist gate — on a treating day the slot is dropped
  -- outright rather than replaced by the thing the wrist cannot take.
  ('s1-s1v2-1', $j${
    "id": "s1-s1v2-1",
    "name": "Baby straddle + jalkojen avausyritykset",
    "defaultSets": 4,
    "defaultDuration": 4,
    "note": "Kirjaa avauskulma ja pitoaika",
    "gate": {
      "bodyRegion": "wrist",
      "variants": {
        "develop": {
          "name": "Baby straddle + jalkojen avausyritykset",
          "sets": 4,
          "holdSeconds": 4,
          "note": "Kirjaa avauskulma ja pitoaika",
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
          "note": "Kirjaa avauskulma ja pitoaika",
          "env": {
            "requires": ["parallettes"],
            "fallback": {
              "name": "Planche lean -pidot lattialla, maksimikaltevuus",
              "sets": 4,
              "holdSeconds": 10,
              "note": "4 × 10–15 s · ranne hybridillä: lopeta sarja ennen kuin ranne alkaa tuntua"
            }
          }
        },
        "treat": {
          "name": "Baby straddle + jalkojen avausyritykset",
          "sets": 3,
          "holdSeconds": 4,
          "note": "pysy paraleteilla — hoitavalla ranteella kuormaa ei viedä lattialle",
          "env": { "requires": ["parallettes"], "fallback": null }
        }
      }
    }
  }$j$::jsonb),

  ('s1-s1v2-2', $j${
    "id": "s1-s1v2-2",
    "name": "Baby straddle hold",
    "defaultSets": 5,
    "defaultDuration": 10,
    "gate": {
      "bodyRegion": "wrist",
      "variants": {
        "develop": {
          "name": "Baby straddle hold",
          "sets": 5,
          "holdSeconds": 10,
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
          "env": {
            "requires": ["parallettes"],
            "fallback": {
              "name": "Planche lean -pidot lattialla, maksimikaltevuus",
              "sets": 4,
              "holdSeconds": 10,
              "note": "4 × 10–15 s · ranne hybridillä: lopeta sarja ennen kuin ranne alkaa tuntua"
            }
          }
        },
        "treat": {
          "name": "Baby straddle hold",
          "sets": 3,
          "holdSeconds": 10,
          "note": "pysy paraleteilla — hoitavalla ranteella kuormaa ei viedä lattialle",
          "env": { "requires": ["parallettes"], "fallback": null }
        }
      }
    }
  }$j$::jsonb),

  ('s3-s3v2-2', $j${
    "id": "s3-s3v2-2",
    "name": "Adv tuck / baby straddle hold",
    "defaultSets": 5,
    "defaultDuration": 10,
    "gate": {
      "bodyRegion": "wrist",
      "variants": {
        "develop": {
          "name": "Adv tuck / baby straddle hold",
          "sets": 5,
          "holdSeconds": 10,
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
          "name": "Adv tuck / baby straddle hold",
          "sets": 4,
          "holdSeconds": 10,
          "env": {
            "requires": ["parallettes"],
            "fallback": {
              "name": "Planche lean -pidot lattialla, maksimikaltevuus",
              "sets": 4,
              "holdSeconds": 10,
              "note": "4 × 10–15 s · ranne hybridillä: lopeta sarja ennen kuin ranne alkaa tuntua"
            }
          }
        },
        "treat": {
          "name": "Adv tuck / baby straddle hold",
          "sets": 3,
          "holdSeconds": 10,
          "note": "pysy paraleteilla — hoitavalla ranteella kuormaa ei viedä lattialle",
          "env": { "requires": ["parallettes"], "fallback": null }
        }
      }
    }
  }$j$::jsonb),

  ('s5-s5v2-2', $j${
    "id": "s5-s5v2-2",
    "name": "Baby straddle / adv tuck hold",
    "defaultSets": 4,
    "defaultDuration": 10,
    "gate": {
      "bodyRegion": "wrist",
      "variants": {
        "develop": {
          "name": "Baby straddle / adv tuck hold",
          "sets": 4,
          "holdSeconds": 10,
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
          "name": "Baby straddle / adv tuck hold",
          "sets": 3,
          "holdSeconds": 10,
          "env": {
            "requires": ["parallettes"],
            "fallback": {
              "name": "Planche lean -pidot lattialla, maksimikaltevuus",
              "sets": 4,
              "holdSeconds": 10,
              "note": "4 × 10–15 s · ranne hybridillä: lopeta sarja ennen kuin ranne alkaa tuntua"
            }
          }
        },
        "treat": {
          "name": "Baby straddle / adv tuck hold",
          "sets": 2,
          "holdSeconds": 10,
          "note": "pysy paraleteilla — hoitavalla ranteella kuormaa ei viedä lattialle",
          "env": { "requires": ["parallettes"], "fallback": null }
        }
      }
    }
  }$j$::jsonb),

  -- ── S1 planche lean holds: the parallette variants fall to the floor ──────
  -- Same rule as above, the other way round: this slot's develop variant is
  -- already the floor version, so a room without parallettes simply keeps it at
  -- the matching tilt rather than offering a fist hold that does not exist.
  ('s1-s1v2-3', $j${
    "id": "s1-s1v2-3",
    "name": "Planche lean -pidot",
    "defaultSets": 5,
    "defaultDuration": 10,
    "gate": {
      "bodyRegion": "wrist",
      "variants": {
        "develop": { "name": "Planche lean -pidot (lattialla)", "sets": 5, "holdSeconds": 10 },
        "hybrid": {
          "name": "Planche lean -pidot (paraleteilla)",
          "sets": 5,
          "holdSeconds": 10,
          "note": "sama kaltevuus",
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
          "name": "Planche lean -pidot (paraleteilla, loivempi)",
          "sets": 3,
          "holdSeconds": 10,
          "env": { "requires": ["parallettes"], "fallback": null }
        }
      }
    }
  }$j$::jsonb),

  -- ── S3 hollow-hold pullover: hanging straight-arm work when there is no load ──
  ('s3-s3v2-5', $j${
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
  }$j$::jsonb)
)
update workout_templates t
set exercises = rebuilt.arr,
    updated_at = now()
from (
  select tt.id,
         jsonb_agg(coalesce(p.obj, e.val) order by e.ord) as arr
  from workout_templates tt
  cross join lateral jsonb_array_elements(tt.exercises) with ordinality as e(val, ord)
  left join patch p on p.ex_id = e.val ->> 'id'
  where tt.name like '%v2 ·%'
    and tt.archived_at is null
  group by tt.id
) as rebuilt
where t.id = rebuilt.id
  and t.exercises is distinct from rebuilt.arr;
