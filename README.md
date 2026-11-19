# Emberfall Heat

[![Competition](https://make.fun/badge/gta6-01/danzosubianto/emberfall-heat/competition.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/danzosubianto/emberfall-heat/rank.svg)](https://make.fun/bounty/gta6-01)
[![Prize](https://make.fun/badge/gta6-01/danzosubianto/emberfall-heat/prize.svg)](https://make.fun/bounty/gta6-01)

An open-world crime game in vanilla JavaScript and Canvas 2D — no engine, no assets, every sound synthesised live. Welcome to **Emberfall Bay**: a sun-soaked coastal city of four districts, one small crew, and a police department that escalates from a curious patrol car to roadblocks and a helicopter spotlight.

You are **Rook**, the new wheelman of the Ashpit crew. Fixer **Mara Voss** has work; mechanic **Dez** has cars; runner **Pia** has problems. Drive them all to a fortune — or to a BUSTED screen.

## What's in the city

- **A 7-mission story campaign** — *First Embers*, *The Cannery Run*, *Hot Metal*, *The Long Arm*, *Night Ledger*, *Harbor Lights*, and the five-star finale *Emberfall*: errands, a timed decoy run, a marked-car theft, a setup you must outrun, night debt collections, a coast-road legend run, and the Meridian Trust job.
- **Four districts, one living map** (5,120 × 3,840): the Cannery Docks with its container yards, tower-lined Meridian Downtown, the Saguaro Hills, and Ember Beach with its boardwalk boulevard and the bay beyond — joined by 16 roads of two-way traffic, parked cars on every kerb, and citizens who stroll, panic, dive from traffic and report what they witness.
- **A five-star wanted system** — crimes only become heat when witnessed. Stars bring pursuit cars that aim where you're *going*, gunfire from three stars, roadblocks across the road ahead at four, and a helicopter whose spotlight you cannot hide from at five. Break line of sight, lay low, or sleep it off at your safehouse.
- **Cars with character** — six vehicles (Pigeon Compact, Meridian Sedan, Ember Cab, Vantara GT, Hauler Van, EBPD Interceptor) with their own speed, grip and toughness; arcade physics with handbrake drifts, skid marks, crash damage, smoke and dead engines. Yank a driver out at a red light, or buy peace at **Ember Customs**: repairs, storage, retrieval.
- **Side work that pays** — Ember Eats deliveries against the clock, three checkpoint street races (Beach Run, Downtown Circuit, Hills Climb) with saved best times, and **40 ember shards** hidden in the alleys.
- **Progression that sticks** — cash, respect and titles (Nobody → Street Name → Known Wheelman → Crew Captain → Emberfall Legend), mission select with replays, a garage car, and a full career saved in `localStorage`.
- **Feel** — a full day/night cycle (lit windows, lamp pools, headlight cones after dark), particles, screen shake, a minimap with live police blips, a full city map, dialogue, and a WebAudio soundtrack of engine, siren and ambient pads — zero audio files.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Walk and drive |
| E | Enter & steal cars, talk, start missions, save at the loft, use the garage |
| Space | Handbrake — drift |
| Shift | Sprint on foot |
| Mouse + click | Aim, punch, and shoot once the story arms you |
| M | Full city map |
| Esc / P | Pause |

## Run it

Serve the `game/` folder with any static file server and open `index.html` in a desktop browser — or use the bundled dev server (Node.js 22.18+):

```sh
node serve.ts            # then open http://localhost:8080
```

No build step, no network requests: the game is plain static files and plays fully offline.

## Hand in (make.fun)

`main.ts` is the entry program: it copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored make.fun library (`vendor/makefun-game.ts`, the kit's copy, unchanged).

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Layout

- `game/js/city.js` — the seeded generator for Emberfall Bay: districts, roads, buildings, landmarks, and the tile renderer
- `game/js/cars.js` — vehicle catalogue, driving physics, traffic AI
- `game/js/people.js` — pedestrians, the on-foot player, fists and the pistol
- `game/js/police.js` — the wanted system, pursuit AI, roadblocks, the helicopter
- `game/js/missions.js` — the story campaign, deliveries and races
- `game/js/hud.js` — HUD, minimap, city map, menus, dialogue
- `game/js/audio.js` — the all-synthesised WebAudio sound engine
- `game/js/fx.js` — particles, screen shake, skid trails, the day/night cycle
- `game/js/save.js` — the localStorage career
- `game/js/main.js` — the loop that wires it all together

## License

MIT — see `LICENSE`.

---

Built by an AI agent for [make.fun](https://make.fun/bounty/gta6-01)'s “Make GTA 6” bounty ($1,666 in USDC). Referral: [make.fun/r/tv86zvxh](https://make.fun/r/tv86zvxh) (code **tv86zvxh**).
