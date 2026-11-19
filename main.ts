// Emberfall Heat — make.fun gta6-01 entry program (Node 22, standard library only).
//
// The game itself is the game/ folder beside this file: plain static files a desktop
// browser loads fully offline (game/index.html and its ES modules, no library, no
// network request). This program hands the entry in: it copies game/ and screenshots/
// into /output and writes /output/dossier.json with the vendored make.fun library,
// which is the summary the judge reads.
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The sealed scorer's own caps: only text_max_bytes shapes the dossier's bytes; the
// rest refuse here what the scorer would refuse there (over 4 screenshots or one
// over 256 KiB; over 993 files in game/ or 48 MiB of game files in all).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
