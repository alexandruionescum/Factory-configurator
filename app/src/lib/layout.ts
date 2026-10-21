import { Project, Zone, snap, zoneArea, zoneLabel } from './model';

// Zone order for the automatic arrangement: follow the routes of the products (highest volume first),
// then the zones that no route uses, in list order.
export function flowOrder(p: Project): string[] {
  const order: string[] = [];
  const products = [...p.products].sort((a, b) => b.volume - a.volume);
  for (const pr of products) for (const id of pr.route) if (!order.includes(id)) order.push(id);
  for (const z of p.zones) if (!order.includes(z.id)) order.push(z.id);
  return order.filter(id => p.zones.some(z => z.id === id && z.target > 0));
}

export interface ArrangeResult { zones: Zone[]; fits: boolean; rows: number }

// Row layout: blocks are placed in n rows of equal depth, separated by aisles, in snake order
// (left to right, then right to left) so consecutive process steps stay neighbours.
// Tries 1..8 rows and keeps the one with the most square-like blocks.
export function autoArrange(p: Project): ArrangeResult {
  const { width: W, length: L } = p.hall;
  const a = p.aisle;
  const order = flowOrder(p).map(id => p.zones.find(z => z.id === id)!);
  let best: { rows: Zone[][]; d: number; score: number } | null = null;

  for (let n = 1; n <= 8; n++) {
    const d = snap((L - (n - 1) * a) / n);
    if (d < 2) break;
    const rows: Zone[][] = [[]];
    let used = 0;
    for (const z of order) {
      const w = Math.max(snap(z.target / d), 1);
      if (used + w > W + 1e-6 && rows[rows.length - 1].length) { rows.push([]); used = 0; }
      rows[rows.length - 1].push({ ...z, w, l: d });
      used += w;
    }
    if (rows.length > n) continue;
    const flat = rows.flat();
    const score = flat.reduce((s, z) => s + Math.abs(Math.log(z.w / z.l)), 0) / Math.max(flat.length, 1);
    if (!best || score < best.score) best = { rows, d, score };
  }

  let fits = true;
  if (!best) {
    // Does not fit: fall back to rows of 8 m depth that run out of the hall, and report it.
    fits = false;
    const d = 8; const rows: Zone[][] = [[]]; let used = 0;
    for (const z of order) {
      const w = Math.max(snap(z.target / d), 1);
      if (used + w > W && rows[rows.length - 1].length) { rows.push([]); used = 0; }
      rows[rows.length - 1].push({ ...z, w, l: d }); used += w;
    }
    best = { rows, d, score: 0 };
  }

  const placed: Zone[] = [];
  best.rows.forEach((row, i) => {
    const y = snap(i * (best!.d + a));
    let x = i % 2 === 0 ? 0 : W;
    for (const z of row) {
      if (i % 2 === 0) { placed.push({ ...z, x: snap(x), y, placed: true }); x += z.w; }
      else { x -= z.w; placed.push({ ...z, x: snap(x), y, placed: true }); }
    }
  });
  const byId = new Map(placed.map(z => [z.id, z]));
  return { zones: p.zones.map(z => byId.get(z.id) ?? z), fits, rows: best.rows.length };
}

// Free spot for a single zone: first position on a 1 m scan that overlaps nothing.
export function findFreeSpot(p: Project, z: Zone): { x: number; y: number } {
  const others = p.zones.filter(o => o.placed && o.id !== z.id);
  for (let y = 0; y + z.l <= p.hall.length; y += 1)
    for (let x = 0; x + z.w <= p.hall.width; x += 1)
      if (!others.some(o => overlap({ ...z, x, y }, o) > 0)) return { x, y };
  return { x: 0, y: 0 };
}

export function overlap(a: Zone, b: Zone): number {
  const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const dy = Math.min(a.y + a.l, b.y + b.l) - Math.max(a.y, b.y);
  return dx > 1e-6 && dy > 1e-6 ? dx * dy : 0;
}

export interface Issue { level: 'error' | 'warn' | 'info'; text: string; zoneIds: string[] }

export function layoutIssues(p: Project): Issue[] {
  const out: Issue[] = [];
  const placed = p.zones.filter(z => z.placed);
  for (const z of p.zones.filter(q => !q.placed))
    out.push({ level: 'info', text: `${zoneLabel(z)} is not placed in the hall.`, zoneIds: [z.id] });
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++) {
      const o = overlap(placed[i], placed[j]);
      if (o > 0) out.push({ level: 'error', text: `${zoneLabel(placed[i])} overlaps ${zoneLabel(placed[j])} (${o.toFixed(1)} m²).`, zoneIds: [placed[i].id, placed[j].id] });
    }
  for (const z of placed) {
    if (z.x < -1e-6 || z.y < -1e-6 || z.x + z.w > p.hall.width + 1e-6 || z.y + z.l > p.hall.length + 1e-6)
      out.push({ level: 'error', text: `${zoneLabel(z)} extends outside the hall.`, zoneIds: [z.id] });
    const dev = z.target > 0 ? (zoneArea(z) - z.target) / z.target : 0;
    if (Math.abs(dev) > 0.05)
      out.push({ level: 'warn', text: `${zoneLabel(z)}: ${zoneArea(z).toFixed(0)} m² vs. ${z.target} m² in the brief (${dev > 0 ? '+' : ''}${Math.round(dev * 100)} %).`, zoneIds: [z.id] });
  }
  const total = p.zones.reduce((s, z) => s + z.target, 0);
  const hall = p.hall.width * p.hall.length;
  if (total > hall) out.push({ level: 'error', text: `Required area (${total.toFixed(0)} m²) exceeds the hall (${hall.toFixed(0)} m²).`, zoneIds: [] });
  return out;
}
