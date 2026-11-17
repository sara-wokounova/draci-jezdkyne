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
- The game must remember choices (Sára, 2026-11-15: "paměť voleb je určitě potřeba"): built (D37): names set or raised
  by scenes and choices, read by `if` on lines, choices and `next` lists. Act 1 remembers `bobri_pratele`
  (persuaded) and `bobri_porazeni` (fought and won).
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
  breaks the dam. Needs counters in the choice memory (time spent, helpers won): built (D37); with the calendar of
  days and locations (below) the time limit is the calendar itself.
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
  - (Superseded by the days and locations below, D40.) The trail by days was planned (Claude's proposal, Sára's changes): day 1 the lost fox, Soňa (and the night
    herb search, the will-o'-the-wisps), the badgers; day 2 the vědma, the hejkal, the fawn; day 3 the dazed wisent, the víly,
    Tesák's lair (optional: the egg), the fox family (since D41 right before the grove), the Triglav grove (Bezzubka taken). Every day needs a light stop
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
    its scales go ash-grey); Bezzubka is taken while the riders are in the grove (dragons wait outside) — superseded 2026-11-16 (D40): in the
    evening of day 3 at the gord, whatever the riders did. What Rubínka
    asked the vědma for: where to find dead water (mrtvá voda), an ingredient for opening the gate; dead water springs
    only where the world touches Nav, so the vědma guesses her plan.
  - The lost fox (day 1) is just for fun, always there (no choice); on day 3 the fox comes back with its whole family
    (Sára, 2026-11-15); since D41 it comes right before the grove, whatever the day (Sára: "dat ji pred haj").

### Act 2a rewritten into days and locations (Sára, 2026-11-16; built, D40)

Built 2026-11-16 (D40; the scene graph below). Decided:
- Time: days 1–3 after Act 1 (day 0's morning), two actions a day (half-days, a counter); the night herb search costs
  the next morning. Each morning (and at noon) the riders choose where to fly from the places unlocked so far.
- Locations, one file each (`lokace-*.json`), each with events the engine picks among: `first` events when available
  (Soňa is always the first character met in the forest; Tesák's lair in the mountains, first once the vědma told of
  it), the rest at random; a played event never comes again; a location with nothing left is no longer offered.
  Three locations: the deep forest (Soňa, the fawn), the dam (the badger, the víly: both flooded by the dam's water),
  the mountains (Tesák's lair after the vědma, the wisent); two events each, any day.
- A played event never comes again, except one lost and then given up: it is offered again later and costs time
  again (Sára, 2026-11-16: "jasně, prohraná událost se nabídne znovu"; the give-up choice has `"giveUp": true`).
- Soňa is not mandatory: met in the forest on any day; without her the riders never hear of the vědma (the vědma tells
  of the lair).
- The gate to Nav is not at the dam: dead water is a spring (studánka) impossible to find without a magical being's
  advice (the víly, Triglav…).
- Bezzubka is always taken in the evening of day 3 at the gord, while the riders are at supper (Sára, 2026-11-16: "vzdy
  az na hradisti, nechceme penalzovat hrace za to, ze najde posvatny haj").
- The calendar: Act 1 is day 0; days 1–3 have two half-days each; the solstice is the night of day 4 (Sára: "4. den").
- Soňa's night search: a promise; the riders keep the rest of the day, come back after supper, search at night and
  sleep in the next morning (Sára).
- Quests have no "move on" choice (Sára: agreed): the trip is the cost.
- Triglav answers two questions of three; the questions change with what the riders know (Sára: "change texts and
  options what can players ask based on what they already know"; "it should not be too complicated").
- The víly showing the gate is fine; their meadow is flooded (Sára). The mountains got their own background
  (`mountain_meadow`).
- The worst ending (the gate never found) is worse than the flooded gord: an evil spirit from Nav comes through the gate
  and possesses Rubínka, who becomes the morová panna (the plague maiden with her red scarf) and sends plague on the
  gord (Sára: "to zní dobře").
- Open: the finale's variants by the helpers and the information found (Act 2a records them, D40: where the gate is
  `studanka`, how to wake Bezzubka `hlas` / `melodie`, the egg `vejce`, the helpers `jezevci`, `vily`, `zubr`, `srna`,
  `amulet`, `vedma_pratele`). The fox family comes right before the grove (Sára, 2026-11-17, D41).

## Scene graph

Scenes since D37 (each with its lines; the old one-line ids, such as `first_choice` or `beaver_after_battle_win_03`, are
`movedScenes` keys now, each pointing at its scene and line):

```
forest_flight_01 (6 lines: the opening, the dragons, the shiny thing; the choice on its last line)
  ├─ "Prozkoumat."            → river_dam → dam_with_beavers (4 lines; the choice)
  │     ├─ persuade → dam_with_beavers_persuade (7; sets bobri_pratele) ─────────────┐
  │     └─ fight    → dam_with_beavers_fight → beaver_battle [minigame]                │
  │                     ├─ victory → beaver_battle_win (8; sets bobri_porazeni) ───────┤
  │                     └─ failure → beaver_battle_lose                                │
  │                                    ├─ retry    → beaver_battle                     │
  │                                    └─ persuade → dam_with_beavers_persuade         ▼
  │                              dam_deal_01 (6) → act1_end → Act 2a (below)
  └─ "Vrátit se domů na oběd." → village_home → lunch_in_town → flooded_town ☠ END (bad) "Zaplavené hradiště"
```

Act 2a (D40, 2026-11-16: `act2a.json` and the three `lokace-*.json`; the old draft's ids lead to `act1_end`):

```
act1_end → a2_rano1 (day 1) → a2_liska (the fox, free) → a2_cesta (the router) → a2_kam (the hub, one line per half-day)
a2_kam: "Do hlubokého lesa" → location les:  les_sona (first: sets sona; promise → les_sona_slib (slib) | no → les_sona_ne)
                                             les_srnce → les_srnce_mama (srna)
        "K přehradě"        → location reka: reka_jezevec → reka_jezevec_zachrana [minigame, D45]
                                               ├─ victory → reka_jezevec_pomoc (jezevci)
                                               └─ failure → reka_jezevec_prohra (no line): retry → the minigame |
                                                  "Odletět a vrátit se později." (giveUp, jezevci_prohra) → a2_cesta
                                             (back after giving up: reka_jezevec shows its lines 8–10 instead of 0–7)
                                             reka_vily → reka_vily_pomoc (vily, studanka)
        "Do hor"            → location hory: hory_doupe (first, if vedma) → hory_doupe_vejce (vejce)
                                             hory_zubr → hory_zubr_pomoc (zubr, melodie)
        "Za vědmou"  (sona)     → vedma_01 (vedma, haj_znam; blame → vedma_zlost | understand → vedma_pochopeni,
                                  vedma_pratele) → vedma_voda
        "Do háje"  (haj_znam)   → haj_lisky (the fox family, free, D41) → haj_01 (haj) → haj_otazka ⇄ haj_nebe / haj_zeme (hlas) / haj_nav (studanka), two of three
                                  → haj_konec
        "Odpočinout si"         → a2_odpocinek
every action costs a half-day (pul) and returns to a2_cesta:
  pul 6 → a2_vecer3 → a2_unos (Bezzubka taken) → a2_konec (the dead end until Act 2b)
  the day Soňa was promised help ends → a2_noc (noc, +1 half-day: the morning slept away) → a2_noc_bludicky? →
                                        a2_noc_trezalka (amulet)
  day 2 starts → a2_rano2 → a2_hejkal (haj_znam, free);  day 3 starts → a2_rano3
```

## Structure (being planned with Sára, 2026-11-15)

Three acts, branch and bottleneck, the riders' deadline the summer solstice (Rubínka opens the way to the dead with
a big water on the shortest night, flooding the riders' gord on the way). Acts 2 and 3: proposed, not confirmed yet.

### Act 1 — the dam (confirmed by Sára, 2026-11-15; written)

- Opening: show the riders' dragons by name and the river that flows down to their gord (new scene(s) after
  `forest_flight_01`).
- Both branches learn from the beaver that the sorceress spoke an incantation, why ("A proč to udělala?") and what
  she looks like: the persuade branch gets `_05` (the why) and `_06` (the description); the win branch has them
  (`beaver_after_battle_win_04` … `_07`).
- Bottleneck `dam_deal_01` … `_06` (both branches end there; fixes the `_07` loop and the missing `persuade_05`):
  the beaver remembers she muttered about a big water and the shortest night; Emma: that is in four days (D40), and the
  water would run straight onto our gord; Róza offers the deal (you hold the dam, we find the sorceress and make her
  shrink you back); the beaver agrees; the act ends on a hook (they will ask around in the forest; four days to the solstice, D40).
- Memory (built, D37): the persuade branch remembers the beavers as friends (`bobri_pratele`) (they help in the finale);
  after the fight they fear the riders (`bobri_porazeni`).

## Endings

| scene | good? | title |
|---|---|---|
| `flooded_town` | bad | Zaplavené hradiště |

## Writing status

- Act 1 is written to its end (`act1_end`). The opening's dragon lines (`forest_flight_01a` … `_01c`), persuade
  `_05`, `_06`, the deal `dam_deal_01` … `_06` and `act1_end` were drafted by Claude on 2026-11-15 and rewritten in
  place by a Fable agent on 2026-11-16 (Sára: "That actually applies for all the dialog texts you have written"), for Sára
  to rewrite after play-testing.
- Since D37 the story is in `public/story/story-v2.json` and its parts (`act1.json`, Act 2a's files since D40; since D39
  the characters in `characters.json`, the old ids in `compatibility.json`),
  scenes with several lines (195 one-line scenes became 45).
- Act 2a is written as days and locations (D40, 2026-11-16): the structure by Claude, the texts by a Fable agent (Sára: more
  fairy tale and fantasy, magic and mystery, characters with goals of their own), for Sára to play-test and rewrite.
  Backgrounds made 2026-11-15 (`mountain_meadow` 2026-11-16) (originals in `art/backgrounds/`). Soňa's sprites (neutral, happy, sad, nervous) and the
  vědma's (neutral, sad, happy) made 2026-11-15, only the poses the text uses (Sára: other characters need only the
  poses they use; a missing pose falls back to neutral); originals in `art/characters/`. Creature sprites made 2026-11-15, only the poses used (jezevec, liska (the cub), srnce, srna, zubr,
  vila, hejkal; the fox family is its own character, `liskova_rodina`, since D37), staged at `left` beside the rider; since
  D37 each has its `scale` and `raise` (Sára's sizes as a start, to adjust by eye), small animals standing higher, behind
  the riders. The badger cubs rescue (D42) is in the story since D45 (the badger event; its texts by the Fable agent, the
  lose screen without a line; its six sounds wait for Sára's picks) and on the play-test page
  (`…/playtest/?game=jezevci`); the other three minigames not yet.
- Dragons: Róza rides Bezzubka, Emma Běska, Anna Buřinoha (Sára, 2026-11-15).
- Lunch branch ends with the flooded town (bad ending). Its end-card text was
  drafted by Claude on 2026-10-28; rewrite if wanted.
- (The music notes below name the old one-line ids, such as `beaver_after_battle_win_*`: since D37 these are lines
  inside merged scenes, each a `movedScenes` key pointing at its scene and line; the old Act 2a ids all point at
  `act1_end` since D40.)
- Music (D21): `village_day` on the main menu and the village scenes (`village_home`,
  `lunch_in_town`, `flooded_town`); `dragon_flight` on the flying scenes
  (`forest_flight_01`); `forest_ground` (the girls on
  the ground in the forest) on `river_dam` (Sára, 2026-10-28) and on every `dam_02` scene except
  the minigame: the dam scenes from `dam_with_beavers` on, persuade, fight, win,
  `beaver_after_battle_win_*`, lose. The minigame `beaver_battle` plays `battle`: battle_01 then
  battle_02, looped as one file (D25); a retry continues it where the last attempt stopped, a new
  game starts it over (D26).
- Act 2a music (D36; since D40 by scene): `vedma_hut` (vedma_*), `night_forest` (a2_noc*), `vily_magic` (reka_vily*,
  wordless women's voices), `playful` (a2_liska, a2_hejkal from its first line, haj_lisky), `tesak_lair`
  (hory_doupe_vejce), `sacred_grove` (haj_*, a wordless choir), `danger` (a2_unos, a2_konec: Bezzubka taken),
  `village_day` (a2_vecer3, a2_odpocinek: the gord), `zachrana` (the badger rescue and its lose screen,
  reka_jezevec_zachrana, reka_jezevec_prohra, D45); the rest (Soňa, the fawn, the badger, the wisent, the way to the
  lair) `forest_ground`, the flights and the hub `dragon_flight`.
