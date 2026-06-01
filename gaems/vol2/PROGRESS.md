# Vol. 2 Microgames — Build Progress

## Status: 100 / 100 games built ✅ COMPLETE

---

## Completed games (29)

| Slug | Status |
|------|--------|
| shave | ✅ built manually (template reference) |
| plug | ✅ Batch A |
| sting | ✅ Batch A |
| catch | ✅ Batch A |
| sneeze | ✅ Batch A |
| unroll | ✅ Batch A |
| dunk | ✅ Batch A |
| slice | ✅ Batch A |
| defuse | ✅ Batch A |
| balance | ✅ Batch A |
| zit | ✅ Batch A |
| thread | ✅ Batch A |
| stomp | ✅ Batch A |
| swat | ✅ Batch A |
| parallel | ✅ Batch A |
| toast | ✅ Batch B |
| lick | ✅ Batch B |
| unlock | ✅ Batch B |
| pluck | ✅ Batch B |
| inflate | ✅ Batch B |
| sort | ✅ Batch B |
| ref | ✅ Batch B |
| vacuum | ✅ Batch B |
| scare | ✅ Batch B |
| whack | ✅ Batch B |
| pour | ✅ Batch B |
| stamp | ✅ Batch B |
| wipe | ✅ Batch B |
| crush | ✅ Batch B |

---

## Remaining games (71)

### ~~Batch C~~ — ✅ done
fish, twist, duck, peel, squeeze, match, zip, flip, hammer, pet, brake, sharpen, mow, blow

### Batch D — 14 games
shred, aim, scrub, stir, pop, type, fold, knock, clog, paint, haul, feed, drill, toss

### Batch E — 14 games
squirt, chop, dial, bake, sweep, tickle, jump, dodge, saw, crack, iron, stack, lasso, charge

### Batch F — 14 games
knead, wink, amp, spray, dig, cover, tune, swig, seal, wrap, burst, melt, unbox, light

### Batch G — 15 games
clip, paddle, grip, launch, shake, flick, plant, score, sew, brush, erase, spin, lock, squash, win

---

## After all games are built — final step

Update the `BUILT` set in `gaems/vol2/index.html` to include all 100 slugs so the hub grid activates all links. Currently only `'shave'` is in the set.

---

## How to resume

Open this project in Claude Code and paste this prompt:

```
Resume building the 100 microgames for gaems/vol2/. 
Read PROGRESS.md at gaems/vol2/PROGRESS.md for current status.
29 games are done. Build the remaining 71 games in 5 parallel batches:

Batch C: fish, twist, duck, peel, squeeze, match, zip, flip, hammer, pet, brake, sharpen, mow, blow
Batch D: shred, aim, scrub, stir, pop, type, fold, knock, clog, paint, haul, feed, drill, toss
Batch E: squirt, chop, dial, bake, sweep, tickle, jump, dodge, saw, crack, iron, stack, lasso, charge
Batch F: knead, wink, amp, spray, dig, cover, tune, swig, seal, wrap, burst, melt, unbox, light
Batch G: clip, paddle, grip, launch, shake, flick, plant, score, sew, brush, erase, spin, lock, squash, win

Read shave/index.html and any completed game as the template.
Read shared.css and shared.js for the design system and available utilities.
Each game goes at gaems/vol2/[slug]/index.html.
Launch all 5 batches in parallel as agents.
When all done, update the BUILT set in gaems/vol2/index.html to include all 100 slugs.
```

---

## Architecture reference

```
gaems/vol2/
  index.html       — hub page, hash router, BUILT set (update when done)
  shared.css       — WarioWare design system
  shared.js        — GAMES[], GAME_META{}, shuffle(), shareGame(), wireFooter()
  shave/           — template reference game
  [slug]/          — each game is a self-contained index.html
```

Key files to read when resuming:
- `gaems/vol2/shared.js` — full GAMES list and GAME_META (emoji + taglines)
- `gaems/vol2/shave/index.html` — canonical template example
- `gaems/vol2/plug/index.html` — drag mechanic example
- `gaems/vol2/wipe/index.html` — canvas/rub mechanic example
