[![make.fun · best-cooking-game-20261125-0137](https://make.fun/badge/best-cooking-game-20261125-0137.svg)](https://make.fun/bounty/best-cooking-game-20261125-0137?utm_source=github&utm_medium=readme&utm_campaign=best-cooking-game-20261125-0137)
[![rank](https://make.fun/badge/best-cooking-game-20261125-0137/yorstann/saffron-and-smoke/rank.svg)](https://make.fun/bounty/best-cooking-game-20261125-0137/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-cooking-game-20261125-0137)
[![reward](https://make.fun/badge/best-cooking-game-20261125-0137/yorstann/saffron-and-smoke/reward.svg)](https://make.fun/bounty/best-cooking-game-20261125-0137/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-cooking-game-20261125-0137)

# Saffron & Smoke

An entry for the make.fun bounty **best-cooking-game-20261125-0137** ("Make the best
cooking game"). A tiny 3D bistro kitchen that runs in a desktop browser — the whole
game is hand-rolled WebGL: my own shaders, matrix maths, flat-shaded low-poly models
and a synthesised WebAudio soundscape. No engine, no libraries, no network, no assets
to load.

## The game

You are the only chef in a small bistro, and the lunch rush lasts 150 seconds.

- **Run the kitchen** with WASD / arrow keys (or click a spot to walk there) and
  interact with **E** — hold it at a chopping board to chop.
- **Eight ingredients** live in crates and pantry shelves: tomato, dough, cheese,
  beef, lettuce, eggs, onion, potato.
- **Cook with care**: chop on the boards, grill and fry on the burners, bake in the
  oven. Every dish has a perfect window — leave it too long and it burns (bin it).
- **Assemble seven dishes** at the island counter, from a Garden Salad and the
  Bistro Burger to a Wood-Fired Pizza, Cheese Omelette and Tomato Soup; new recipes
  unlock as the day heats up.
- **Serve the tickets** at the pass before each customer's patience runs out. Tips
  scale with the patience left, fast serves build a **combo multiplier** up to ×5,
  and the day ends with a 1–3 star rating on the till.

Steam rises off the pans, customers queue and fidget at the counter, and the whole
room — tiled floor, pantry rack, range hood, jar shelves — is built from the same
little geometry toolkit as the food.

## Run it

```sh
node main.ts            # hands game/ + screenshots/ + dossier.json to /output
```

To play locally, serve the `game/` folder with any static file server and open
`index.html` in a desktop browser. The screenshot scenes on this page are staged
deterministically by the game itself: `game/index.html?shot=start|play|rush|end&seed=1`.

## Layout

- `main.ts` — the handover program (copies the game out, writes the dossier)
- `vendor/makefun-game.ts` — make.fun's dossier library, vendored byte-identical
- `game/index.html` — the page and its HUD (tickets, day clock, till, prompts)
- `game/src/gl.js` — matrix maths, shaders, the triangle batch
- `game/src/geo.js` — flat-shaded primitive geometry (boxes, cylinders, spheres…)
- `game/src/world.js` — the recipe book, the station map, the kitchen and its people
- `game/src/food.js` — every ingredient, component and finished dish as a model
- `game/src/game.js` — the simulation: orders, cooking, combo, rendering
- `game/src/audio.js` — synthesised sound effects (chops, sizzles, dings, coins)
- `game/src/main.js` — boot, input, the frame loop, screenshot staging
- `screenshots/` — four 1280×720 renders; the first is the cover

MIT licensed — see `LICENSE`.
