# Story

Title: **Dračí jezdkyně** (story id `draci-jezdkyne-z-vlpu`). Language: Czech.
Audience: children. Tone: fairy tale ("Bylo, nebylo…").
Setting (D34): the Slavs in the 10th century, historically accurate except the magic and the dragons
(villages and gords, a prince and his nobles; no castles, towns or fishponds).

## Characters

| id | Name | Role | Sprites |
|---|---|---|---|
| `roza` | Róza | dragon rider, impulsive, leads | 6 poses |
| `emma` | Emma | dragon rider, cautious planner | 6 poses |
| `anna` | Anna | dragon rider, curious, quick to fight | 6 poses |
| — | Velký bobr | giant beaver, speaks as a literal speaker name | none (a rider sprite is shown instead) |
| — | Rubínka | the sorceress (čarodějka) who enlarged the beavers; the main opponent. A former dragon rider; her dragon was the red dragon Tesák, and she is named after his colour. Red hair, pale, freckled, tall and athletic, a scarlet noblewoman's dress (`beaver_after_battle_win_07`). Mentioned only so far | none |
| — | Tesák | Rubínka's red dragon. He fell ill; Rubínka tried to heal him with magic, failed, and he died. She loved him very much, and since then she is angry at the whole world (Sára, 2026-11-15) | none |

Poses: `neutral`, `happy`, `excited`, `sad`, `nervous`, `talking`.

Premise: the three riders patrol their part of the forest. They spot something
shiny — a giant dam built by beavers a witch made huge. The dam threatens a flood.

Main plot (decided by Sára, 2026-11-15):
- The main opponent is Rubínka. Her main motive: to bring Tesák back from the dead. Her side motive: the people of
  the riders' gord (hradiště), the healer (vědma) among them, didn't help her when she begged them to save Tesák.
  The prince (kníže) is not mentioned.
- Tesák left an egg before he died, and Rubínka doesn't know about it. The riders find it, and through it Rubínka
  gets Tesák's offspring (the way to the best ending).
- Finding the egg is not certain: more endings. Without the egg, the good ending is that Rubínka starts healing
  dragons (Sára, 2026-11-15).
- The game must remember choices (Sára, 2026-11-15: "paměť voleb je určitě potřeba"): an engine feature, not built
  yet (story flags: set by a scene or a choice, read by a later `next` or choice); goes through workflow.md.
- No more growing and shrinking (Sára: "zvětšování a zmenšování dokola je nuda"): in the second half of Act 2
  Rubínka dazes (omámí) Bezzubka with a spell and imprisons her. The vědma helps with an incantation that gets the
  riders past the spells at that place to Bezzubka, but freeing her must come from the riders themselves (2026-11-15).
- Why Bezzubka: Rubínka needs a living dragon's fire to open the gate to the dead at the solstice (Sára, 2026-11-15).
- Freeing Bezzubka (Sára, 2026-11-15): Emma and Běska lure Rubínka away, Emma acting boldly for the first time
  without a ready plan; Róza must not rush in (a trap), waits for the signal and wakes Bezzubka with her voice, calmly
  and lovingly, not by force: Rubínka's mirror, love for a dragon that ends well this time. Anna remembers the grove
  keeper's advice (only the voice of the one the dazed one loves breaks the spell) — proposed, Sára's message was cut.
- Act 2's trail (Sára, 2026-11-15): longer, with more stops on the way, also at forest animals, so not everything
  points straight at the goal; more choices and side quests where the riders can help someone (a minigame), which
  helps them in the final confrontation; but if they help everyone, they don't reach Rubínka by the solstice and she
  breaks the dam. Needs counters in the choice memory (time spent, helpers won): planned with the engine change.
  - Stop: Soňa (Sára, 2026-11-15), a friend from the gord and the vědma's apprentice, is in the forest looking for a
    rare herb that has its power only when gathered just before the solstice (days, not weeks). It grows in another
    place every year; the riders on their dragons search a big area fast, so she finds it in time (without them she
    might not). Reward: a protective amulet: Rubínka's spells work less on the riders in the confrontation. Asked about
    the sorceress, Soňa says she saw her visiting the vědma (the way to the vědma). After Soňa they meet more forest
    animals on the way.
  - Soňa's herb: the silver St John's wort (stříbrná třezalka), blooming at night (Sára, 2026-11-15).
  - Animals on the way (Sára, 2026-11-15): a badger and its burrow with young; a lost fox; a lost fawn whose mother
    must be found; the dazed wisent. Mythological creatures (Sára, 2026-11-15): will-o'-the-wisps (bludičky), víly,
    the hejkal; not the vodník.
  - The trail by days is being planned (Claude's proposal, Sára's changes): day 1 the lost fox, Soňa (and the night
    herb search, the will-o'-the-wisps), the badgers; day 2 the vědma, the hejkal, the fawn; day 3 the dazed wisent, the víly,
    Tesák's lair (optional: the egg), the fox family, the Triglav grove (Bezzubka taken). Every day needs a light stop
    (Sára, 2026-11-15).
  - Creatures as sprites (Sára, 2026-11-15): small animals stand a little higher in the picture, behind the riders
    ("A – trochu výš"), so they show above the dialogue panel.
  - Minigames for side quests (Sára, 2026-11-15): she likes the badger cubs rescue and the drain for the víly (details
    to design so they are fun); asked how the search from the dragon's back would play; the wisent one sounded boring.
    Order confirmed (Sára, 2026-11-15): 1. the badger cubs rescue (dragon dives, rising water, driftwood), 2. the drain
    for the víly (a tile puzzle, each dragon clears one kind of obstacle), 3. the search from the dragon's back (hot/cold,
    tracks, Bezzubka's sniff; the night version with will-o'-the-wisps), 4. the wisent as a melody memory game (the same
    melody later wakes Bezzubka). Each is a feature of its own (workflow.md), after the engine change.
  - The vědma (Sára, 2026-11-15): Soňa's teacher. Back then the gord's people feared the sick dragon would infect their
    own dragons (a known deadly, contagious dragon disease) and wouldn't let Rubínka and Tesák come near; the vědma
    didn't dare go against them. Her stop: a warm welcome if the riders helped Soňa, else a cool one; the story of
    Rubínka, Tesák and the closed gate. Rubínka came again lately asking where to find an ingredient; the vědma puts it
    together and tells the riders her fear: Rubínka may try to open the gate to the world of the dead to get Tesák back.
    The riders' reaction is a choice (blame her or understand her), remembered for her help later.
  - The sacred grove: not an old woman again (Sára: not only old women as sources); a carved, talking statue of a
    many-headed god: Triglav (three heads: sky, earth, the underworld; each its own voice), Sára, 2026-11-15.
  - Settled (Sára, 2026-11-15): the world of the dead is Nav; the dragon disease is "popelavka" (a dragon loses its fire,
    its scales go ash-grey); Bezzubka is taken while the riders are in the grove (dragons wait outside). What Rubínka
    asked the vědma for: where to find dead water (mrtvá voda), an ingredient for opening the gate; dead water springs
    only where the world touches Nav, so the vědma guesses her plan.
  - The lost fox (day 1) is just for fun, always there (no choice); on day 3, before the grove, the fox comes back with
    its whole family (Sára, 2026-11-15).

## Scene graph

```
forest_flight_01 → _01a → _01b → _01c → forest_flight_02 → first_choice
  ├─ "Prozkoumat."            → river_dam → dam_with_beavers → dam_with_beavers_roza
  │                             → dam_with_beavers_beaver → dam_with_beavers_choice
  │     ├─ persuade → dam_with_beavers_persuade → _01 … _06 ─────────────┐
  │     └─ fight    → dam_with_beavers_fight → beaver_battle [minigame]   │
  │                     ├─ victory → beaver_battle_win → beaver_after_battle_win_01 … _07 ─┤
  │                     └─ failure → beaver_battle_lose                    │
  │                                    ├─ retry    → beaver_battle         │
  │                                    └─ persuade → dam_with_beavers_persuade
  │                                                                        ▼
  │                              dam_deal_01 … _06 → act1_end → Act 2a (below)
  └─ "Vrátit se domů na oběd." → village_home → lunch_in_town → flooded_town ☠ END (bad) "Zaplavené hradiště"
```

Act 2a (`a2_*`, drafted 2026-11-15 in the old one-line format; each side quest is a choice that rejoins):

```
day 1: a2_fox (fun) → a2_badger (quest) → a2_sona (Soňa; quest: a2_herb, the night search, bludičky choice)
day 2: a2_day2 → a2_vedma (choice: blame / understand) → a2_hejkal (fun) → a2_fawn (quest)
day 3: a2_day3 → a2_wisent (quest) → a2_vily (quest) → a2_lair_smell (choice: a2_lair, the egg)
       → a2_foxfam (fun) → a2_grove (Triglav; Bezzubka taken) → act2a_end (temporary end of the written story)
```

## Structure (being planned with Sára, 2026-11-15)

Three acts, branch and bottleneck, the riders' deadline the summer solstice (Rubínka opens the way to the dead with
a big water on the shortest night, flooding the riders' gord on the way). Acts 2 and 3: proposed, not confirmed yet.

### Act 1 — the dam (confirmed by Sára, 2026-11-15; new scenes not written yet)

- Opening: show the riders' dragons by name and the river that flows down to their gord (new scene(s) after
  `forest_flight_01`).
- Both branches learn from the beaver that the sorceress spoke an incantation, why ("A proč to udělala?") and what
  she looks like: the persuade branch gets `_05` (the why) and `_06` (the description); the win branch has them
  (`beaver_after_battle_win_04` … `_07`).
- Bottleneck `dam_deal_01` … `_05` (both branches end there; fixes the `_07` loop and the missing `persuade_05`):
  the beaver remembers she muttered about a big water and the shortest night; Emma: that is in three days, and the
  water would run straight onto our gord; Róza offers the deal (you hold the dam, we find the sorceress and make her
  shrink you back); the beaver agrees; the act ends on a hook (they will ask around in the forest; three days to the solstice).
- Memory (once the engine has it): the persuade branch remembers the beavers as friends (they help in the finale);
  after the fight they fear the riders.

## Endings

| scene | good? | title |
|---|---|---|
| `flooded_town` | bad | Zaplavené hradiště |

## Writing status

- Act 1 is written to its end (`act1_end`). The opening's dragon lines (`forest_flight_01a` … `_01c`), persuade
  `_05`, `_06`, the deal `dam_deal_01` … `_06` and `act1_end` were drafted by Claude on 2026-11-15 for Sára to rewrite.
- Act 2a is drafted (`a2_*`, by Claude on 2026-11-15, for Sára to rewrite). What it can't do yet, waiting for the
  choice memory (engine change planned): the time budget ("too late"), helpers and the egg remembered for the finale,
  the vědma's help depending on the riders' reaction, asking Triglav's heads by choice (the riders ask all three now).
  Backgrounds made 2026-11-15 (originals in `art/backgrounds/`). Soňa's sprites (neutral, happy, sad, nervous) and the
  vědma's (neutral, sad, happy) made 2026-11-15, only the poses the text uses (Sára: other characters need only the
  poses they use; a missing pose falls back to neutral); originals in `art/characters/`. Creature sprites made 2026-11-15, only the poses used (jezevec, liska (the cub; happy = the fox family), srnce, srna,
  zubr, vila, hejkal; Sára: add them now, the engine change fixes their size), staged at `left` beside the rider: until
  the engine's sprite size and position (planned) they are drawn at rider size, and the badger and the fox family stand
  behind the dialogue panel. No new minigames yet.
- Dragons: Róza rides Bezzubka, Emma Běska, Anna Buřinoha (Sára, 2026-11-15).
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
- Act 2a music (D36, 2026-11-16): `vedma_hut` (a2_vedma_*), `night_forest` (a2_herb_*), `vily_magic` (a2_vily_*,
  wordless women's voices), `playful` (a2_fox_*, a2_hejkal_04 … _09, a2_foxfam_*), `tesak_lair` (a2_lair_01 … _11),
  `sacred_grove` (a2_grove_01 … _21, a wordless choir), `danger` (a2_grove_22 … _25, `act2a_end`: Bezzubka taken);
  the rest of Act 2a (the paths, the badger, the fawn, the wisent, Soňa) keeps `forest_ground`, the flights
  `dragon_flight`.
