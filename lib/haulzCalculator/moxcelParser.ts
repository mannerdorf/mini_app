export function parseMoxcelCells(text: string): string[] {
  const re = /\{"#","([^"]+)"\}/g;
  const cells: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) cells.push(m[1].trim());
  return cells;
}

function parseCoord(s: unknown): number | null {
  const n = String(s ?? "")
    .replace(/\s/g, "")
    .replace(",", ".");
  const v = parseFloat(n);
  return Number.isFinite(v) ? v : null;
}

export function parseMkadExitsFromMoxcel(cells: string[]) {
  const exits: { code: string; name: string; lat: number; lon: number }[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (!/^MKAD_\d+/i.test(cells[i])) continue;
    const code = cells[i];
    const name = cells[i + 2] || cells[i + 1] || code;
    let lat: number | null = null;
    let lon: number | null = null;
    for (let j = i + 1; j < Math.min(i + 8, cells.length); j++) {
      const v = parseCoord(cells[j]);
      if (v == null) continue;
      if (lat == null) lat = v;
      else if (lon == null) {
        lon = v;
        break;
      }
    }
    if (lat != null && lon != null && lat > 50 && lat < 60 && lon > 35 && lon < 40) {
      exits.push({ code, name, lat, lon });
    }
  }
  return exits;
}
