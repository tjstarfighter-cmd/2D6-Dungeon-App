import type { ExitType, MapDoc } from "@/types/map";

const CELL = 24;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function exitColour(type: ExitType): string {
  switch (type) {
    case "door": return "#fcd34d";
    case "open": return "#a1a1aa";
    case "stone": return "#d4d4d8";
    case "portcullis": return "#e4e4e7";
    case "magical": return "#c084fc";
    case "secret": return "#f87171";
    default: return "#fcd34d";
  }
}

/**
 * Render a MapDoc into a self-contained SVG string with all styling inline,
 * so it survives serialization → image conversion. Mirrors the look of the
 * presenter view (dark background, bright fills) which reads better as an
 * exported image than the editor's hover-friendly Tailwind colours.
 */
export function mapToSvgString(map: MapDoc): string {
  const w = map.width * CELL;
  const h = map.height * CELL;
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
  );
  // Background
  parts.push(`<rect width="${w}" height="${h}" fill="#0a0a0a"/>`);
  // Grid
  for (let gx = 0; gx <= map.width; gx++) {
    parts.push(
      `<line x1="${gx * CELL}" y1="0" x2="${gx * CELL}" y2="${h}" stroke="#3f3f46" stroke-width="0.5"/>`,
    );
  }
  for (let gy = 0; gy <= map.height; gy++) {
    parts.push(
      `<line x1="0" y1="${gy * CELL}" x2="${w}" y2="${gy * CELL}" stroke="#3f3f46" stroke-width="0.5"/>`,
    );
  }
  // Rooms
  for (const r of map.rooms) {
    const fill = r.cleared ? "#3f3f46" : "#fbbf24";
    const fillOp = r.cleared ? 0.5 : 0.85;
    const stroke = r.cleared ? "#71717a" : "#b45309";
    parts.push(
      `<rect x="${r.x * CELL}" y="${r.y * CELL}" width="${r.w * CELL}" height="${r.h * CELL}" fill="${fill}" fill-opacity="${fillOp}" stroke="${stroke}" stroke-width="2"/>`,
    );
    const label = r.label ?? r.type;
    if (label) {
      const cx = (r.x + r.w / 2) * CELL;
      const cy = (r.y + r.h / 2) * CELL;
      const fontSize = Math.min(CELL * 0.7, 14);
      parts.push(
        `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="#18181b" font-weight="700" font-size="${fontSize}" font-family="system-ui, sans-serif">${escapeXml(label)}</text>`,
      );
    }
  }
  // Exits
  for (const ex of map.exits) {
    const x = ex.x * CELL;
    const y = ex.y * CELL;
    const pad = CELL * 0.25;
    let x1 = x;
    let y1 = y;
    let x2 = x;
    let y2 = y;
    switch (ex.side) {
      case "n": x1 = x + pad; y1 = y; x2 = x + CELL - pad; y2 = y; break;
      case "s": x1 = x + pad; y1 = y + CELL; x2 = x + CELL - pad; y2 = y + CELL; break;
      case "w": x1 = x; y1 = y + pad; x2 = x; y2 = y + CELL - pad; break;
      case "e": x1 = x + CELL; y1 = y + pad; x2 = x + CELL; y2 = y + CELL - pad; break;
    }
    const dash = ex.type === "secret" ? ' stroke-dasharray="2 2"' : ex.type === "portcullis" ? ' stroke-dasharray="4 2"' : "";
    parts.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${exitColour(ex.type)}" stroke-width="6" stroke-linecap="square"${dash}/>`,
    );
  }
  // Notes (small yellow markers; exported for completeness)
  for (const n of map.notes) {
    const cx = (n.x + 0.5) * CELL;
    const cy = (n.y + 0.5) * CELL;
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="${CELL * 0.25}" fill="#facc15" stroke="#a16207" stroke-width="1.5"/>`,
    );
  }
  parts.push("</svg>");
  return parts.join("");
}

function slugifyFilename(name: string): string {
  return (name || "map")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "map";
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Download the map as a vector .svg file. */
export function downloadMapSvg(map: MapDoc): void {
  const svg = mapToSvgString(map);
  triggerDownload(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
    `${slugifyFilename(map.name)}.svg`,
  );
}

/**
 * Download the map as a raster .png file. The image is rasterised at
 * `scale` × the natural pixel dimensions for crispness in video.
 */
export async function downloadMapPng(map: MapDoc, scale = 2): Promise<void> {
  const svg = mapToSvgString(map);
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load SVG for rasterisation"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
    if (!blob) throw new Error("PNG encoding failed");
    triggerDownload(blob, `${slugifyFilename(map.name)}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
