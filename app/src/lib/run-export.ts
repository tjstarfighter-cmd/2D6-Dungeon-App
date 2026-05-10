import { jsPDF } from "jspdf";

import {
  detectRegions,
  regionCentroidTile,
  tilesHash as makeTilesHash,
} from "@/lib/mapv2";
import { tierFor } from "@/lib/level-up";
import { wallSetFromList, type MapDocV2 } from "@/types/mapv2";
import type { Character, RunRecord } from "@/types/character";
import type { Note } from "@/types/notes";
import { downloadText } from "@/lib/io";

// Story 8.3 — client-side PDF export. jsPDF for the document; map
// thumbnails are drawn directly on jsPDF's canvas (no html2canvas
// roundtrip — keeps memory low and avoids needing a DOM).
//
// Three scopes:
//   - "run":       a single RunRecord on a character (5 sections per AC)
//   - "map":       a single map + the per-pin log threads attached to it
//   - "character": every archived run on a character
//
// On assembly failure (jsPDF throws / runs out of memory) the module
// falls back to a markdown text export with the same content, per
// NFR12 ("raw run data is never lost").

export type ExportScope = "run" | "map" | "character";

export interface ExportRunInput {
  scope: "run";
  character: Character;
  run: RunRecord;
  maps: MapDocV2[];
  notes: Note[];
}
export interface ExportMapInput {
  scope: "map";
  character: Character;
  map: MapDocV2;
  notes: Note[];
}
export interface ExportCharacterInput {
  scope: "character";
  character: Character;
  maps: MapDocV2[];
  notes: Note[];
}

export type ExportInput =
  | ExportRunInput
  | ExportMapInput
  | ExportCharacterInput;

export interface ExportResult {
  filename: string;
  /** "pdf" on success, "md" when the PDF path threw and we fell back. */
  format: "pdf" | "md";
}

export async function exportRunAsPDF(
  input: ExportInput,
  signal?: AbortSignal,
): Promise<ExportResult> {
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  try {
    const { doc, filename } = buildPdf(input, signal);
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    doc.save(filename);
    return { filename, format: "pdf" };
  } catch (err) {
    // Re-throw user-cancellation; only fall back on real assembly failures.
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    const md = buildMarkdown(input);
    const filename = exportFilename(input).replace(/\.pdf$/, ".md");
    downloadText(filename, md);
    return { filename, format: "md" };
  }
}

// ---- PDF assembly ----------------------------------------------------------

const PAGE_W = 595; // A4 portrait width in pt
const PAGE_H = 842;
const MARGIN = 40;

function buildPdf(input: ExportInput, signal?: AbortSignal) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const filename = exportFilename(input);

  if (input.scope === "character") {
    drawCharacterCover(doc, input.character);
    drawSheetSnapshot(doc, input.character);
    for (const m of input.maps) {
      checkAbort(signal);
      drawMapPage(doc, m);
      drawPinLogPages(doc, m, input.notes);
    }
    if (input.character.runs && input.character.runs.length > 0) {
      doc.addPage();
      drawHeader(doc, "Archived Runs");
      let y = MARGIN + 30;
      for (const r of input.character.runs) {
        y = drawRunStatsBlock(doc, r, y);
        if (y > PAGE_H - MARGIN - 80) {
          doc.addPage();
          y = MARGIN;
        }
      }
    }
    return { doc, filename };
  }

  if (input.scope === "map") {
    drawMapCover(doc, input.character, input.map);
    drawMapPage(doc, input.map);
    drawPinLogPages(doc, input.map, input.notes);
    return { doc, filename };
  }

  // scope === "run"
  drawRunCover(doc, input.character, input.run);
  drawSheetSnapshot(doc, input.character);
  for (const m of input.maps) {
    checkAbort(signal);
    drawMapPage(doc, m);
    drawPinLogPages(doc, m, input.notes);
  }
  doc.addPage();
  drawHeader(doc, "Run summary");
  drawRunStatsBlock(doc, input.run, MARGIN + 30);
  return { doc, filename };
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
}

function drawHeader(doc: jsPDF, title: string): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(title, MARGIN, MARGIN);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.line(MARGIN, MARGIN + 6, PAGE_W - MARGIN, MARGIN + 6);
}

function drawRunCover(doc: jsPDF, c: Character, r: RunRecord): void {
  const tier = tierFor(r.summaryStats.levelsReached);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text(c.name, MARGIN, MARGIN + 30);
  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text(`Lvl ${r.summaryStats.levelsReached} ${tier.tier}`, MARGIN, MARGIN + 60);
  doc.text(
    `End reason: ${r.endReason} · ${r.summaryStats.cause.kind === "combat" ? "Killed by" : "Fell to"} ${r.summaryStats.cause.source}`,
    MARGIN,
    MARGIN + 90,
  );
  doc.text(
    `Started ${formatDate(r.startedAt)} · Ended ${formatDate(r.endedAt)}`,
    MARGIN,
    MARGIN + 110,
  );
}

function drawCharacterCover(doc: jsPDF, c: Character): void {
  const tier = tierFor(c.level);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text(c.name, MARGIN, MARGIN + 30);
  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text(`Lvl ${c.level} ${tier.tier}`, MARGIN, MARGIN + 60);
  doc.text(
    `State: ${c.state ?? "alive"} · ${c.runs?.length ?? 0} archived runs`,
    MARGIN,
    MARGIN + 90,
  );
}

function drawMapCover(doc: jsPDF, c: Character, m: MapDocV2): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text(m.name, MARGIN, MARGIN + 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(
    `Level ${m.level} · ${m.ancestry} · for ${c.name}`,
    MARGIN,
    MARGIN + 56,
  );
}

function drawSheetSnapshot(doc: jsPDF, c: Character): void {
  doc.addPage();
  drawHeader(doc, `${c.name} — sheet snapshot`);
  let y = MARGIN + 36;
  const lh = 16;
  const lines = [
    `HP ${c.hp.current}/${c.hp.baseline} · XP ${c.xp} · Lvl ${c.level} ${tierFor(c.level).tier}`,
    `Shift +${c.shift} · Discipline +${c.discipline} · Precision +${c.precision}`,
    `Weapon: ${c.weapon || "—"} · Runes: ${c.appliedRunes || "—"}`,
    `Manoeuvres: ${c.manoeuvres.map((m) => `${m.name} (${m.diceSet})`).join(", ") || "—"}`,
    `Armour: ${c.armour.map((a) => `${a.piece} (${a.modifier})`).join(", ") || "—"}`,
    `Scrolls: ${c.scrolls.map((s) => s.name).join(", ") || "—"}`,
    `Potions: ${c.potions.map((p) => p.name).join(", ") || "—"}`,
    `Coins: ${c.coins.gc}gc · ${c.coins.sc}sc · ${c.coins.cc}cc`,
    `Bloodied ${c.status.bloodied}/7 · Soaked ${c.status.soaked}/7${c.status.fever ? " · Fever" : ""}${c.status.pneumonia ? " · Pneumonia" : ""}`,
  ];
  doc.setFontSize(11);
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, PAGE_W - 2 * MARGIN);
    doc.text(wrapped, MARGIN, y);
    y += lh * (Array.isArray(wrapped) ? wrapped.length : 1);
  }
  // Pack
  y += lh;
  doc.setFont("helvetica", "bold");
  doc.text("Pack", MARGIN, y);
  doc.setFont("helvetica", "normal");
  y += lh;
  const packLines = [
    `Large items: ${c.backpack.largeItems.filter(Boolean).join(", ") || "—"}`,
    `Small items: ${c.backpack.smallItems || "—"}`,
    `Rations: ${c.backpack.rations || "—"} · Loot lockup: ${c.backpack.lootLockup || "—"}`,
  ];
  for (const line of packLines) {
    const wrapped = doc.splitTextToSize(line, PAGE_W - 2 * MARGIN);
    doc.text(wrapped, MARGIN, y);
    y += lh * (Array.isArray(wrapped) ? wrapped.length : 1);
  }
}

function drawMapPage(doc: jsPDF, m: MapDocV2): void {
  doc.addPage();
  drawHeader(doc, `Map: ${m.name}`);
  doc.setFontSize(11);
  doc.text(
    `Level ${m.level} · ${m.ancestry} · ${m.gridW}×${m.gridH} grid · ${m.regions.filter((r) => r.kind).length} pinned regions`,
    MARGIN,
    MARGIN + 26,
  );

  // Render the map directly with jsPDF primitives. Cleared regions
  // greyed; pinned regions tinted amber. Walls drawn as line segments.
  const wallSet = wallSetFromList(m.walls);
  const detected = detectRegions(wallSet, m.gridW, m.gridH);
  const metaByHash = new Map(m.regions.map((r) => [r.tilesHash, r]));

  const availW = PAGE_W - 2 * MARGIN;
  const availH = PAGE_H - MARGIN * 2 - 80; // leave room for header + bottom margin
  const cell = Math.min(availW / m.gridW, availH / m.gridH);
  const offsetX = MARGIN + (availW - cell * m.gridW) / 2;
  const offsetY = MARGIN + 50;

  // Region fills
  for (const tiles of detected.regions) {
    const hash = makeTilesHash(tiles);
    const meta = metaByHash.get(hash);
    const cleared = !!meta?.cleared;
    doc.setFillColor(cleared ? 200 : 254, cleared ? 200 : 240, cleared ? 200 : 200);
    for (const [cx, cy] of tiles) {
      doc.rect(offsetX + cx * cell, offsetY + cy * cell, cell, cell, "F");
    }
  }
  // Walls
  doc.setDrawColor(50, 50, 50);
  doc.setLineWidth(1.4);
  for (const w of m.walls) {
    doc.line(
      offsetX + w.ax * cell,
      offsetY + w.ay * cell,
      offsetX + w.bx * cell,
      offsetY + w.by * cell,
    );
  }
  // Pin labels
  doc.setFontSize(Math.max(8, cell * 0.5));
  doc.setTextColor(20, 20, 20);
  for (const tiles of detected.regions) {
    const hash = makeTilesHash(tiles);
    const meta = metaByHash.get(hash);
    if (!meta?.kind || typeof meta.number !== "number") continue;
    const [cx, cy] = regionCentroidTile(tiles);
    const label = `${meta.kind === "room" ? "R" : "H"}${meta.number}`;
    doc.text(label, offsetX + (cx + 0.5) * cell, offsetY + (cy + 0.6) * cell, {
      align: "center",
    });
  }
  doc.setTextColor(0, 0, 0);
}

function drawPinLogPages(doc: jsPDF, m: MapDocV2, allNotes: Note[]): void {
  const pinned = m.regions.filter(
    (r) => r.kind && typeof r.number === "number",
  );
  if (pinned.length === 0) return;
  // Sort by kind+number for stable readability.
  pinned.sort((a, b) => {
    const k = (a.kind ?? "").localeCompare(b.kind ?? "");
    if (k !== 0) return k;
    return (a.number ?? 0) - (b.number ?? 0);
  });

  for (const p of pinned) {
    const entries = allNotes
      .filter((n) => n.target?.kind === "room" && n.target.id === p.tilesHash)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (entries.length === 0) continue;
    doc.addPage();
    const kindWord = p.kind === "room" ? "Room" : "Hall";
    drawHeader(doc, `${kindWord} ${p.number}${p.label ? ` — ${p.label}` : ""} (${m.name})`);
    let y = MARGIN + 36;
    doc.setFontSize(10);
    for (const n of entries) {
      const head = `[${n.entryType}${n.state === "pending" ? " · pending" : ""}${n.tableRef ? ` · ${n.tableRef}` : ""}] ${formatDate(n.createdAt)}`;
      doc.setFont("helvetica", "bold");
      doc.text(head, MARGIN, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      const wrapped = doc.splitTextToSize(n.body, PAGE_W - 2 * MARGIN);
      doc.text(wrapped, MARGIN, y);
      y += 14 * (Array.isArray(wrapped) ? wrapped.length : 1);
      if (n.state === "resolved" && n.resolvedValue) {
        doc.setTextColor(80, 80, 80);
        doc.text(`→ ${n.resolvedValue}`, MARGIN + 12, y);
        doc.setTextColor(0, 0, 0);
        y += 14;
      }
      y += 6;
      if (y > PAGE_H - MARGIN - 20) {
        doc.addPage();
        drawHeader(doc, `${kindWord} ${p.number} (cont.)`);
        y = MARGIN + 36;
      }
    }
  }
}

function drawRunStatsBlock(doc: jsPDF, r: RunRecord, startY: number): number {
  let y = startY;
  const stats = r.summaryStats;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(
    `Run · ${formatDate(r.endedAt)} · ${r.endReason}`,
    MARGIN,
    y,
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  y += 18;
  const cause =
    stats.cause.kind === "combat" ? "Killed by" : "Fell to";
  const lines = [
    `Cause: ${cause} ${stats.cause.source}${stats.cause.roomLabel ? ` in ${stats.cause.roomLabel}` : ""}`,
    `Levels reached: ${stats.levelsReached} · Rooms entered: ${stats.roomsEntered} · XP earned: ${stats.xp}`,
    `Treasure: ${stats.treasureCoins.gc}gc · ${stats.treasureCoins.sc}sc · ${stats.treasureCoins.cc}cc`,
    `Kills (${stats.killsTotal}): ${stats.killBreakdown.map((k) => `${k.count}× ${k.name}`).join(" · ") || "—"}`,
    `Maps: ${stats.mapIds.length}`,
  ];
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, PAGE_W - 2 * MARGIN);
    doc.text(wrapped, MARGIN, y);
    y += 14 * (Array.isArray(wrapped) ? wrapped.length : 1);
  }
  return y + 12;
}

// ---- Markdown fallback -----------------------------------------------------

function buildMarkdown(input: ExportInput): string {
  const lines: string[] = [];
  if (input.scope === "run") {
    const stats = input.run.summaryStats;
    const tier = tierFor(stats.levelsReached);
    lines.push(`# ${input.character.name} — Lvl ${stats.levelsReached} ${tier.tier}`);
    lines.push(`_End reason: ${input.run.endReason}_`);
    lines.push(`Started ${formatDate(input.run.startedAt)} · Ended ${formatDate(input.run.endedAt)}\n`);
    lines.push(`## Run summary`);
    lines.push(`- Cause: ${stats.cause.kind === "combat" ? "Killed by" : "Fell to"} **${stats.cause.source}**${stats.cause.roomLabel ? ` in ${stats.cause.roomLabel}` : ""}`);
    lines.push(`- Levels reached: ${stats.levelsReached}`);
    lines.push(`- Rooms entered: ${stats.roomsEntered}`);
    lines.push(`- XP earned: ${stats.xp}`);
    lines.push(`- Treasure: ${stats.treasureCoins.gc}gc · ${stats.treasureCoins.sc}sc · ${stats.treasureCoins.cc}cc`);
    lines.push(`- Kills (${stats.killsTotal}): ${stats.killBreakdown.map((k) => `${k.count}× ${k.name}`).join(", ") || "—"}\n`);
    appendMapsAndLogs(lines, input.maps, input.notes);
  } else if (input.scope === "map") {
    lines.push(`# ${input.map.name} — Level ${input.map.level}`);
    appendMapsAndLogs(lines, [input.map], input.notes);
  } else {
    lines.push(`# ${input.character.name} — character archive`);
    lines.push(`Lvl ${input.character.level} ${tierFor(input.character.level).tier} · State: ${input.character.state ?? "alive"} · ${input.character.runs?.length ?? 0} runs\n`);
    if (input.character.runs?.length) {
      lines.push(`## Archived runs`);
      for (const r of input.character.runs) {
        const s = r.summaryStats;
        lines.push(`- **${formatDate(r.endedAt)}** (${r.endReason}) — ${s.cause.kind === "combat" ? "Killed by" : "Fell to"} ${s.cause.source}; Lvl ${s.levelsReached}, ${s.killsTotal} kills, ${s.xp} XP`);
      }
    }
    appendMapsAndLogs(lines, input.maps, input.notes);
  }
  lines.push(
    `\n---\n_PDF export hit a memory or rendering limit; the run was saved as Markdown instead. Raw run data is preserved._`,
  );
  return lines.join("\n");
}

function appendMapsAndLogs(
  lines: string[],
  maps: MapDocV2[],
  allNotes: Note[],
): void {
  for (const m of maps) {
    lines.push(`\n## Map: ${m.name} (Lvl ${m.level})`);
    const pinned = m.regions
      .filter((r) => r.kind && typeof r.number === "number")
      .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
    for (const p of pinned) {
      const entries = allNotes
        .filter((n) => n.target?.kind === "room" && n.target.id === p.tilesHash)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      if (entries.length === 0) continue;
      const kindWord = p.kind === "room" ? "Room" : "Hall";
      lines.push(`\n### ${kindWord} ${p.number}${p.label ? ` — ${p.label}` : ""}`);
      for (const n of entries) {
        const head = `**${n.entryType}**${n.state === "pending" ? " · pending" : ""}${n.tableRef ? ` · ${n.tableRef}` : ""} · ${formatDate(n.createdAt)}`;
        lines.push(`- ${head}\n  ${n.body.replace(/\n/g, "\n  ")}`);
        if (n.state === "resolved" && n.resolvedValue) {
          lines.push(`  → ${n.resolvedValue}`);
        }
      }
    }
  }
}

// ---- Helpers ---------------------------------------------------------------

function exportFilename(input: ExportInput): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, "_") || "untitled";
  if (input.scope === "run") {
    return `${safe(input.character.name)}-lvl${input.run.summaryStats.levelsReached}-${stamp}.pdf`;
  }
  if (input.scope === "map") {
    return `map-${safe(input.map.name)}-${stamp}.pdf`;
  }
  return `character-${safe(input.character.name)}-${stamp}.pdf`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}
