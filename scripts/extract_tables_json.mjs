// Extract the `tables` object from the BoardGameGeek HTML companion
// (docs/2D6_Dungeon_Tables.html) and serialise it to JSON.
//
// The HTML embeds the data as JavaScript:
//     // --- DATA STORE ---
//     const tables = { ... };
//     ... UI/render code ...
//
// Strategy: read the inline script, isolate `const tables = { ... };`
// by counting braces (tolerates nested objects, regex would not), then
// eval in a local scope and JSON.stringify.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const HTML_PATH = join(ROOT, "docs", "2D6_Dungeon_Tables.html");
const OUT_DIR = join(ROOT, "data", "processed");
const OUT_PATH = join(OUT_DIR, "tables_codex.json");

const html = readFileSync(HTML_PATH, "utf8");

// Pull out inline scripts and pick the largest (the data store).
const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let biggest = "";
for (const m of html.matchAll(scriptRe)) {
  if (m[1].length > biggest.length) biggest = m[1];
}
if (!biggest) throw new Error("No inline <script> found");

// Find `const tables = {` and walk braces to its matching close.
const startMarker = "const tables = {";
const startIdx = biggest.indexOf(startMarker);
if (startIdx === -1) throw new Error("`const tables = {` not found");
const objStart = biggest.indexOf("{", startIdx);

let depth = 0;
let inStr = null; // either '"' or "'" or null
let escape = false;
let inLineComment = false;
let inBlockComment = false;
let endIdx = -1;
for (let i = objStart; i < biggest.length; i++) {
  const ch = biggest[i];
  const next = biggest[i + 1];

  if (inLineComment) {
    if (ch === "\n") inLineComment = false;
    continue;
  }
  if (inBlockComment) {
    if (ch === "*" && next === "/") {
      inBlockComment = false;
      i++;
    }
    continue;
  }
  if (inStr) {
    if (escape) {
      escape = false;
    } else if (ch === "\\") {
      escape = true;
    } else if (ch === inStr) {
      inStr = null;
    }
    continue;
  }

  if (ch === "/" && next === "/") {
    inLineComment = true;
    i++;
    continue;
  }
  if (ch === "/" && next === "*") {
    inBlockComment = true;
    i++;
    continue;
  }
  if (ch === '"' || ch === "'" || ch === "`") {
    inStr = ch;
    continue;
  }
  if (ch === "{") {
    depth++;
  } else if (ch === "}") {
    depth--;
    if (depth === 0) {
      endIdx = i;
      break;
    }
  }
}
if (endIdx === -1) throw new Error("Unbalanced braces in tables object");

const objSource = biggest.slice(objStart, endIdx + 1);

// Eval inside a Function so we don't pollute global scope.
let tables;
try {
  tables = new Function(`return (${objSource});`)();
} catch (e) {
  console.error("Failed to eval tables object:", e.message);
  process.exit(1);
}

const keys = Object.keys(tables);
let totalRows = 0;
for (const k of keys) {
  const t = tables[k];
  if (Array.isArray(t?.data)) totalRows += t.data.length;
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(tables, null, 2), "utf8");

console.log(`Tables: ${keys.length}`);
console.log(`Total rows: ${totalRows}`);
console.log(`Wrote: ${OUT_PATH}`);
console.log(`First 20 keys: ${keys.slice(0, 20).join(", ")}`);
console.log(`Last 10 keys:  ${keys.slice(-10).join(", ")}`);
