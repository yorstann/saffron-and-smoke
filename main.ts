// Saffron & Smoke — handover program for the make.fun "best cooking game" bounty.
//
// The game itself lives in game/ as plain static files (an HTML page plus ES modules, no
// build step, no network). This program's whole job is the handover: copy game/ and
// screenshots/ into the output directory and write dossier.json there with the vendored
// make.fun library, so the judge receives exactly the folder a desktop browser can open.
//
// Run locally with an output directory of your choice:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });

// The game folder travels as-is: index.html at its root, modules under src/.
cpSync(join(root, 'game'), join(outputDir, 'game'), { recursive: true });

// Screenshots are the cover and the gallery; the first file by name is the cover.
const shotsDir = join(outputDir, 'screenshots');
mkdirSync(shotsDir, { recursive: true });
if (existsSync(join(root, 'screenshots'))) {
  cpSync(join(root, 'screenshots'), shotsDir, { recursive: true });
}

// The dossier is the judge's table of contents for the output folder. The limits below
// mirror the scorer's own gate, so an entry that would be refused there is refused here.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);

// A one-line receipt for whoever ran this: where the game went, how big the dossier is.
console.log(`Saffron & Smoke handed over to ${outputDir} (dossier ${dossier.length} bytes)`);
