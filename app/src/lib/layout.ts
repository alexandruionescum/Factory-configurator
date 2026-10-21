import { Project, Zone, snap, zoneArea, zoneLabel } from './model';

// Zone order for the automatic arrangement: follow the routes of the products (highest volume first),
// then the zones that no route uses, in list order. Zones of one stream (department) stay together,
// streams in the order they first appear.
export function flowOrder(p: Project): string[] {
  const order: string[] = [];
  const products = [...p.products].sort((a, b) => b.volume - a.volume);
  for (const pr of products) for (const id of pr.route) if (!order.includes(id)) order.push(id);
  for (const z of p.zones) if (!order.includes(z.id)) order.push(z.id);
  const live = order.filter(id => p.zones.some(z => z.id === id && z.target > 0));
  const stream = (id: string) => p.zones.find(z => z.id === id)?.stream ?? '';
  if (!live.some(id => stream(id))) return live;
  const streams = [...new Set(live.map(stream))];
  return streams.flatMap(s => live.filter(id => stream(id) === s));
}

export interface ArrangeResult { zones: Zone[]; fits: boolean; rows: number }

// A unit is one column of a row: one large zone over the full row depth, or several small zones
// of the same stream stacked on top of each other (so small rooms do not become thin strips).
interface Unit { w: number; items: { z: Zone; dy: number }[] }

function makeUnits(order: Zone[], d: number): Unit[] {
  const small = (z: Zone) => z.target < 0.35 * d * d;
  const out: Unit[] = [];
  for (let i = 0; i < order.length;) {
    const z = order[i];
    if (!small(z)) {
      const w = Math.max(snap(z.target / d), 1);
      out.push({ w, items: [{ z: { ...z, w, l: d }, dy: 0 }] });
      i++; continue;
    }
    const col = [z]; let sum = z.target; i++;
    while (i < order.length && small(order[i]) && (order[i].stream ?? '') === (z.stream ?? '') && sum + order[i].target <= 0.9 * d * d) {
      sum += order[i].target; col.push(order[i]); i++;
    }
    const w = Math.max(snap(Math.max(sum / d, Math.sqrt(Math.max(...col.map(q => q.target))))), 1);
    let dy = 0;
    out.push({ w, items: col.map(q => { const l = Math.max(snap(q.target / w), 1); const it = { z: { ...q, w, l }, dy }; dy = snap(dy + l); return it; }) });
  }
  return out;
}

function packRows(units: Unit[], W: number): Unit[][] {
  const rows: Unit[][] = [[]];
  let used = 0;
  for (const u of units) {
    if (used + u.w > W + 1e-6 && rows[rows.length - 1].length) { rows.push([]); used = 0; }
    rows[rows.length - 1].push(u); used += u.w;
  }
  return rows;
}

// Row layout: n rows of equal depth separated by aisles, filled in snake order (left to right, then
// right to left) so consecutive process steps stay neighbours. Tries 1..12 rows and keeps the one
// with the most square-like zones.
export function autoArrange(p: Project): ArrangeResult {
  const { width: W, length: L } = p.hall;
  const a = p.aisle;
  const order = flowOrder(p).map(id => p.zones.find(z => z.id === id)!);
  let best: { rows: Unit[][]; d: number; score: number } | null = null;

  for (let n = 1; n <= 12; n++) {
    const d = snap((L - (n - 1) * a) / n);
    if (d < 2) break;
    const rows = packRows(makeUnits(order, d), W);
    if (rows.length > n) continue;
    const flat = rows.flat().flatMap(u => u.items.map(it => it.z));
    const score = flat.reduce((s, z) => s + Math.abs(Math.log(z.w / z.l)), 0) / Math.max(flat.length, 1);
    if (!best || score < best.score) best = { rows, d, score };
  }

  let fits = true;
  if (!best) {
    // Does not fit: rows of 8 m depth that run out of the hall, reported to the user.
    fits = false;
    best = { rows: packRows(makeUnits(order, 8), W), d: 8, score: 0 };
  }

  const placed: Zone[] = [];
  best.rows.forEach((row, i) => {
    const y = snap(i * (best!.d + a));
    let x = i % 2 === 0 ? 0 : W;
    for (const u of row) {
      if (i % 2 !== 0) x -= u.w;
      for (const it of u.items) placed.push({ ...it.z, x: snap(x), y: snap(y + it.dy), placed: true });
      if (i % 2 === 0) x += u.w;
    }
  });
  const byId = new Map(placed.map(z => [z.id, z]));
  return { zones: p.zones.map(z => byId.get(z.id) ?? z), fits, rows: best.rows.length };
}

// Smallest hall (3:2, whole metres) in which the automatic arrangement fits, starting from
// total area x gross-up factor. Used when the brief gives no hall size.
export function proposeHall(p: Project, grossUp: number): { width: number; length: number } {
  const total = p.zones.reduce((s, z) => s + z.target, 0);
  let area = Math.max(total * grossUp, 100);
  for (let k = 0; k < 40; k++) {
    const width = Math.ceil(Math.sqrt(area * 1.5)), length = Math.ceil(area / width);
    if (autoArrange({ ...p, hall: { ...p.hall, width, length } }).fits) return { width, length };
    area *= 1.05;
  }
  const width = Math.ceil(Math.sqrt(area * 1.5));
  return { width, length: Math.ceil(area / width) };
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
  // zones the brief says must touch: gap between the rectangles bigger than one aisle
  for (const z of placed) for (const code of z.adjacent ?? []) {
    const o = placed.find(q => q.code.toLowerCase() === code.toLowerCase());
    if (!o || o.id === z.id || z.id > o.id && (o.adjacent ?? []).some(c => c.toLowerCase() === z.code.toLowerCase())) continue;
    const gx = Math.max(0, Math.max(o.x - (z.x + z.w), z.x - (o.x + o.w)));
    const gy = Math.max(0, Math.max(o.y - (z.y + z.l), z.y - (o.y + o.l)));
    const gap = Math.hypot(gx, gy);
    if (gap > p.aisle + 0.5) out.push({ level: 'warn', text: `${zoneLabel(z)} should be next to ${zoneLabel(o)} (now ${gap.toFixed(1)} m apart).`, zoneIds: [z.id, o.id] });
  }
  const total = p.zones.reduce((s, z) => s + z.target, 0);
  const hall = p.hall.width * p.hall.length;
  if (total > hall) out.push({ level: 'error', text: `Required area (${total.toFixed(0)} m²) exceeds the hall (${hall.toFixed(0)} m²).`, zoneIds: [] });
  return out;
}
