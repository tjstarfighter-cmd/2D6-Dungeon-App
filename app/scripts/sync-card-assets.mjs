// Copy card PNGs from `docs/2D6 Dungeon Cards/...` into `app/public/cards/`
// so Vite's static dev server (and the production build) can serve them.
//
// Idempotent — files already present with matching size are skipped.
// Reads the canonical index from `data/processed/cards_index.json`; the
// app's runtime URL helper (`@/lib/cards`) translates `card.filename` to
// `/cards/<filename>` (URL-encoded).

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dirname, "..");
const ROOT = resolve(APP, "..");

const SRC_INDEX = join(ROOT, "data", "processed", "cards_index.json");
const DEST_DIR = join(APP, "public", "cards");

if (!existsSync(SRC_INDEX)) {
  console.error(`Card index not found: ${SRC_INDEX}`);
  process.exit(1);
}

mkdirSync(DEST_DIR, { recursive: true });

const data = JSON.parse(readFileSync(SRC_INDEX, "utf8"));

let copied = 0;
let skipped = 0;
const missing = [];

for (const card of data.cards) {
  const src = join(ROOT, card.image);
  const dst = join(DEST_DIR, basename(src));
  if (!existsSync(src)) {
    missing.push(card.image);
    continue;
  }
  if (existsSync(dst) && statSync(dst).size === statSync(src).size) {
    skipped++;
    continue;
  }
  copyFileSync(src, dst);
  copied++;
}

console.log(
  `sync-card-assets: copied ${copied}, skipped ${skipped} (already present), missing ${missing.length}`,
);
if (missing.length > 0) {
  for (const m of missing) console.warn(`  missing: ${m}`);
  process.exit(2);
}
