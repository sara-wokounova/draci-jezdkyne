# Story

Title: **Dračí jezdkyně** (story id `draci-jezdkyne-z-vlpu`). Language: Czech.
Audience: children. Tone: fairy tale ("Bylo, nebylo…").

## Characters

| id | Name | Role | Sprites |
|---|---|---|---|
| `roza` | Róza | dragon rider, impulsive, leads | 6 poses |
| `emma` | Emma | dragon rider, cautious planner | 6 poses |
| `anna` | Anna | dragon rider, curious, quick to fight | 6 poses |
| — | Velký bobr | giant beaver, speaks as a literal speaker name | none (a rider sprite is shown instead) |
| — | čarodějnice | witch who enlarged the beavers (mentioned only) | none |

Poses: `neutral`, `happy`, `excited`, `sad`, `nervous`, `talking`.

Premise: the three riders patrol their part of the forest. They spot something
shiny — a giant dam built by beavers a witch made huge. The dam threatens a flood.

## Scene graph

```
forest_flight_01 → forest_flight_02 → first_choice
  ├─ "Prozkoumat."            → river_dam → dam_with_beavers → dam_with_beavers_roza
  │                             → dam_with_beavers_beaver → dam_with_beavers_choice
  │     ├─ persuade → dam_with_beavers_persuade → _01 → _02 → _03 → _04 → _05 ✗ MISSING
  │     └─ fight    → dam_with_beavers_fight → beaver_battle [minigame dragonAttack]
  │                     ├─ victory → beaver_battle_win → beaver_after_battle_win_01 … _07
  │                     │              (_07 → _06: loop, being written)
  │                     └─ failure → beaver_battle_lose
  │                                    ├─ retry    → beaver_battle
  │                                    └─ persuade → dam_with_beavers_persuade
  └─ "Vrátit se domů na oběd." → village_home → lunch_in_town → flooded_town ☠ END (bad) "Zaplavené město"
```

## Endings

| scene | good? | title |
|---|---|---|
| `flooded_town` | bad | Zaplavené město |

## Writing status

- Persuade branch stops after the beaver explains the witch (`_05` not written).
- Fight branch victory has no real continuation yet.
- Lunch branch ends with the flooded town (bad ending). Its end-card text was
  drafted by Claude on 2026-10-28; rewrite if wanted.
- Music (D21): `village_day` on the main menu and the village scenes (`village_home`,
  `lunch_in_town`, `flooded_town`); `dragon_flight` on the flying scenes
  (`forest_flight_01`, `forest_flight_02`, `first_choice`); `forest_ground` (the girls on
  the ground in the forest) on `river_dam` (Sára, 2026-10-28) and on every `dam_02` scene except
  the minigame: the dam scenes from `dam_with_beavers` on, persuade, fight, win,
  `beaver_after_battle_win_*`, lose. The minigame `beaver_battle` plays `battle`: battle_01 then
  battle_02, looped as one file (D25); a retry continues it where the last attempt stopped, a new
  game starts it over (D26).
