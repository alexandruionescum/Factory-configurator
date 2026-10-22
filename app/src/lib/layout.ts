import { GroupBy, LayoutSettings, Project, Rect, ShapeType, Zone, defaultLayout, snap, zoneArea, zoneLabel } from './model';

// ---------- order and groups ----------

const groupKey = (z: Zone, by: GroupBy) => (by === 'stream' ? z.stream ?? '' : by === 'type' ? z.type : '');

// Zone order for the automatic arrangement: the routes of the products (highest volume first), then the
// zones no route uses, in list order. Zones of one group (stream or area type) stay together, groups in
// the order they first appear.
export function flowOrder(p: Project, by: GroupBy = layoutSettings(p).groupBy): string[] {
  const order: string[] = [];
  const products = [...p.products].sort((a, b) => b.volume - a.volume);
  for (const pr of products) for (const id of pr.route) if (!order.includes(id)) order.push(id);
  for (const z of p.zones) if (!order.includes(z.id)) order.push(z.id);
  const byId = new Map(p.zones.map(z => [z.id, z]));
  const live = order.filter(id => (byId.get(id)?.target ?? 0) > 0);
  const key = (id: string) => groupKey(byId.get(id)!, by);
  const groups = [...new Set(live.map(key))];
  return groups.flatMap(g => live.filter(id => key(id) === g));
}

export const layoutSettings = (p: Project): LayoutSettings => ({ ...defaultLayout(), ...(p.layout ?? {}) });

// ---------- building shapes ----------
// A shape is a path of segments (rectangles) in a local frame W' x L' (rotation 0). Zones are laid along
// the path: segment after segment, in lanes parallel to the segment, lanes filled back and forth.

interface Seg extends Rect { axis: 'x' | 'y'; sign: 1 | -1 }

function segments(shape: ShapeType, W: number, L: number, t: number): Seg[] {
  switch (shape) {
    case 'I': return [{ x: 0, y: 0, w: W, l: L, axis: 'x', sign: 1 }];
    case 'L': return [
      { x: 0, y: t, w: t, l: L - t, axis: 'y', sign: -1 },
      { x: 0, y: 0, w: W, l: t, axis: 'x', sign: 1 },
    ];
    case 'U': return [
      { x: 0, y: t, w: t, l: L - t, axis: 'y', sign: -1 },
      { x: 0, y: 0, w: W, l: t, axis: 'x', sign: 1 },
      { x: W - t, y: t, w: t, l: L - t, axis: 'y', sign: 1 },
    ];
    case 'S': {
      const h = (L - 3 * t) / 2;
      return [
        { x: 0, y: 0, w: W, l: t, axis: 'x', sign: 1 },
        { x: W - t, y: t, w: t, l: h, axis: 'y', sign: 1 },
        { x: 0, y: t + h, w: W, l: t, axis: 'x', sign: -1 },
        { x: 0, y: 2 * t + h, w: t, l: h, axis: 'y', sign: 1 },
        { x: 0, y: 2 * t + 2 * h, w: W, l: t, axis: 'x', sign: 1 },
      ];
    }
  }
}

const maxWing = (shape: ShapeType, W: number, L: number) =>
  shape === 'L' ? Math.min(W, L) - 1 : shape === 'U' ? Math.min(W / 2, L) - 1 : shape === 'S' ? Math.min(L / 3, W / 2) - 0.5 : Math.min(W, L);
const segArea = (ss: Seg[]) => ss.reduce((s, g) => s + g.w * g.l, 0);

// Wing width so the footprint holds the zones with ~8 % slack; the user can fix it instead.
export function wingFor(shape: ShapeType, W: number, L: number, need: number): number {
  const hi0 = maxWing(shape, W, L);
  if (shape === 'I') return hi0;
  let lo = 2, hi = hi0;
  if (segArea(segments(shape, W, L, hi)) < need) return snap(hi, 0.5);
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (segArea(segments(shape, W, L, m)) >= need) hi = m; else lo = m; }
  return snap(Math.min(hi + 0.25, hi0), 0.5);
}

// rotation of a local rectangle into the world box (W x L), counter-clockwise
function rotRect(r: Rect, rot: number, W: number, L: number): Rect {
  switch (rot) {
    case 90: return { x: W - (r.y + r.l), y: r.x, w: r.l, l: r.w };
    case 180: return { x: W - (r.x + r.w), y: L - (r.y + r.l), w: r.w, l: r.l };
    case 270: return { x: r.y, y: L - (r.x + r.w), w: r.l, l: r.w };
    default: return r;
  }
}

// ---------- filling ----------

export interface ArrangeResult { zones: Zone[]; fits: boolean; rows: number; footprint: Rect[]; wing: number }

// A unit is one slot along a lane: one zone over the full lane depth, or several small zones of the same
// group stacked across the lane (so small rooms do not become thin strips).
interface Unit { len: number; group: string; items: { z: Zone; off: number; depth: number }[] }

function makeUnits(order: Zone[], d: number, key: (z: Zone) => string): Unit[] {
  const small = (z: Zone) => z.target < 0.35 * d * d;
  const out: Unit[] = [];
  for (let i = 0; i < order.length;) {
    const z = order[i];
    if (!small(z)) {
      const len = Math.max(snap(z.target / d), 1);
      out.push({ len, group: key(z), items: [{ z, off: 0, depth: d }] });
      i++; continue;
    }
    const col = [z]; let sum = z.target; i++;
    while (i < order.length && small(order[i]) && key(order[i]) === key(z) && sum + order[i].target <= 0.9 * d * d) {
      sum += order[i].target; col.push(order[i]); i++;
    }
    const len = Math.max(snap(Math.max(sum / d, Math.sqrt(Math.max(...col.map(q => q.target))))), 1);
    let off = 0;
    out.push({ len, group: key(z), items: col.map(q => { const depth = Math.max(snap(q.target / len), 1); const it = { z: q, off, depth }; off = snap(off + depth); return it; }) });
  }
  return out;
}

interface Fill { zones: Zone[]; fits: boolean; lanes: number; score: number }

function fill(units: Unit[], segs: Seg[], d: number, aisle: number, separate: boolean): Fill {
  const placed: Zone[] = [];
  let si = 0, lane = 0, s = 0, lanes = 1, fits = true, lastGroup: string | null = null;
  const laneInfo = (g: Seg) => {
    const depth = g.axis === 'x' ? g.l : g.w;
    const k = Math.max(1, Math.floor((depth + aisle) / (d + aisle) + 1e-6));
    return { k, ld: Math.floor(((depth - (k - 1) * aisle) / k) / 0.05 + 1e-6) * 0.05, len: g.axis === 'x' ? g.w : g.l };
  };
  // a single zone spans the lane depth and keeps its area; stacked small zones keep their unit length
  const ulen = (u: Unit, ld: number) => (u.items.length === 1 ? Math.max(snap(u.items[0].z.target / ld), 1) : u.len);
  const stackOk = (u: Unit, ld: number) => u.items.length === 1 || u.items[u.items.length - 1].off + u.items[u.items.length - 1].depth <= ld + 1e-6;

  for (const u of units) {
    let outside = false;
    for (;;) {
      if (si >= segs.length) { outside = true; fits = false; break; }
      const g = segs[si], li = laneInfo(g);
      const newGroup = separate && lastGroup !== null && u.group !== lastGroup && s > 0;
      if (!newGroup && s + ulen(u, li.ld) <= li.len + 1e-6 && stackOk(u, li.ld)) break;
      // otherwise the next lane (a zone too big for an empty lane skips it, e.g. a short S connector)
      lane++; s = 0; lanes++;
      if (lane >= li.k) { si++; lane = 0; }
    }
    if (outside) {
      // past the last segment: continue next to the building so nothing is lost
      const last = segs[segs.length - 1];
      for (const it of u.items) placed.push({ ...it.z, x: snap(last.x + last.w + 2 + s), y: snap(last.y + it.off), w: u.len, l: it.depth, placed: true });
      s += u.len; continue;
    }
    const g = segs[si], li = laneInfo(g), len = ulen(u, li.ld);
    const forward = (lane % 2 === 0) === (g.sign === 1);
    const a0 = forward ? s : li.len - s - len;   // along the segment
    const c0 = lane * (li.ld + aisle);           // across the segment
    for (const it of u.items) {
      const depth = u.items.length === 1 ? li.ld : it.depth;
      const r = g.axis === 'x'
        ? { x: g.x + a0, y: g.y + c0 + it.off, w: len, l: depth }
        : { x: g.x + c0 + it.off, y: g.y + a0, w: depth, l: len };
      placed.push({ ...it.z, x: snap(r.x), y: snap(r.y), w: snap(r.w), l: snap(r.l), placed: true });
    }
    s = snap(s + len);
    lastGroup = u.group;
  }
  const score = placed.reduce((acc, z) => acc + Math.abs(Math.log(z.w / z.l)), 0) / Math.max(placed.length, 1);
  return { zones: placed, fits, lanes, score };
}

// Lays the zones along the building shape. Tries a range of lane depths and keeps the arrangement that fits
// with the most square-like zones. With an automatic wing width (L / U / S) the wing grows until it fits.
export function autoArrange(p: Project): ArrangeResult {
  const st = layoutSettings(p);
  const a = Math.max(0, p.aisle);
  const zoneById = new Map(p.zones.map(z => [z.id, z]));
  const order = flowOrder(p, st.groupBy).map(id => zoneById.get(id)!);
  const total = order.reduce((s, z) => s + z.target, 0);
  const { width: W, length: L } = p.hall;
  const swap = st.rot === 90 || st.rot === 270;
  const Wl = swap ? L : W, Ll = swap ? W : L;
  const key = (z: Zone) => groupKey(z, st.groupBy);
  const top = maxWing(st.shape, Wl, Ll);

  const tryWing = (wing: number) => {
    const segs = segments(st.shape, Wl, Ll, wing);
    const minDepth = Math.min(...segs.map(g => (g.axis === 'x' ? g.l : g.w)));
    let best: Fill | null = null;
    const tried = new Set<number>();
    for (let i = 0; i <= 24; i++) {
      const d = snap(Math.max(3, Math.min(minDepth, 3 + (minDepth - 3) * (i / 24) ** 1.5)), 0.5);
      if (tried.has(d)) continue;
      tried.add(d);
      const f = fill(makeUnits(order, d, key), segs, d, a, st.separate);
      if (!best || (f.fits && !best.fits) || (f.fits === best.fits && f.score < best.score)) best = f;
    }
    return { fill: best!, segs, wing };
  };

  let r: { fill: Fill; segs: Seg[]; wing: number };
  if (st.shape === 'I') r = tryWing(top);
  else if (st.wing !== null) r = tryWing(Math.min(st.wing, top));
  else {
    let wing = wingFor(st.shape, Wl, Ll, total * 1.08);
    r = tryWing(wing);
    while (!r.fill.fits && wing < top) { wing = Math.min(top, snap(wing * 1.08 + 0.5, 0.5)); r = tryWing(wing); }
  }
  const world = r.fill.zones.map(z => ({ ...z, ...rotRect(z, st.rot, W, L) }));
  const byId = new Map(world.map(z => [z.id, z]));
  return {
    zones: p.zones.map(z => byId.get(z.id) ?? z), fits: r.fill.fits, rows: r.fill.lanes,
    footprint: r.segs.map(g => rotRect(g, st.rot, W, L)), wing: r.wing,
  };
}

// Applies the arrangement and stores the building outline with it.
export function arranged(p: Project): { project: Project; result: ArrangeResult } {
  const r = autoArrange(p);
  const st = layoutSettings(p);
  return { project: { ...p, zones: r.zones, hall: { ...p.hall, footprint: st.shape === 'I' ? undefined : r.footprint, wing: st.shape === 'I' ? undefined : r.wing } }, result: r };
}

// Smallest hall (3:2, whole metres, rectangular) in which the arrangement fits, starting from
// total area x gross-up factor. Used when the brief gives no hall size.
export function proposeHall(p: Project, grossUp: number): { width: number; length: number } {
  const total = p.zones.reduce((s, z) => s + z.target, 0);
  const q: Project = { ...p, layout: { ...layoutSettings(p), shape: 'I', rot: 0 } };
  let area = Math.max(total * grossUp, 100);
  for (let k = 0; k < 40; k++) {
    const width = Math.ceil(Math.sqrt(area * 1.5)), length = Math.ceil(area / width);
    if (autoArrange({ ...q, hall: { ...q.hall, width, length } }).fits) return { width, length };
    area *= 1.05;
  }
  const width = Math.ceil(Math.sqrt(area * 1.5));
  return { width, length: Math.ceil(area / width) };
}

// Outer size for the chosen shape with balanced proportions (wing t): L 2.5t x 2.5t, U 3t x 2.5t,
// S 3t x 5t, I 3:2; enlarged in 5 % steps until the arrangement fits.
export function proposeForShape(p: Project): { width: number; length: number } {
  const st = layoutSettings(p);
  const total = p.zones.reduce((s, z) => s + z.target, 0);
  const k = { I: 1, L: 4, U: 6, S: 11 }[st.shape];
  const swap = st.rot === 90 || st.rot === 270;
  let area = Math.max(total * 1.08, 100);
  let best = { width: 10, length: 10 };
  for (let i = 0; i < 40; i++) {
    let wl: number, ll: number;
    if (st.shape === 'I') { wl = Math.sqrt(area * 1.5); ll = area / wl; }
    else {
      const t = Math.sqrt(area / k);
      [wl, ll] = st.shape === 'L' ? [2.5 * t, 2.5 * t] : st.shape === 'U' ? [3 * t, 2.5 * t] : [3 * t, 5 * t];
    }
    const width = Math.ceil(swap ? ll : wl), length = Math.ceil(swap ? wl : ll);
    best = { width, length };
    if (autoArrange({ ...p, hall: { ...p.hall, width, length }, layout: { ...st, wing: null } }).fits) return best;
    area *= 1.05;
  }
  return best;
}

const outline = (p: Project): Rect[] => (p.hall.footprint?.length ? p.hall.footprint : [{ x: 0, y: 0, w: p.hall.width, l: p.hall.length }]);
export const buildingArea = (p: Project) => outline(p).reduce((s, r) => s + r.w * r.l, 0);

// Area of a zone inside the building outline.
export function insideArea(p: Project, z: Rect): number {
  return outline(p).reduce((s, r) => {
    const dx = Math.min(z.x + z.w, r.x + r.w) - Math.max(z.x, r.x);
    const dy = Math.min(z.y + z.l, r.y + r.l) - Math.max(z.y, r.y);
    return s + (dx > 0 && dy > 0 ? dx * dy : 0);
  }, 0);
}

// Free spot for a single zone: first position on a 1 m scan inside the building that overlaps nothing.
export function findFreeSpot(p: Project, z: Zone): { x: number; y: number } {
  const others = p.zones.filter(o => o.placed && o.id !== z.id);
  for (let y = 0; y + z.l <= p.hall.length; y += 1)
    for (let x = 0; x + z.w <= p.hall.width; x += 1) {
      const at = { ...z, x, y };
      if (insideArea(p, at) >= zoneArea(at) - 0.01 && !others.some(o => overlap(at, o) > 0)) return { x, y };
    }
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
    out.push({ level: 'info', text: `${zoneLabel(z)} is not placed in the factory.`, zoneIds: [z.id] });
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++) {
      const o = overlap(placed[i], placed[j]);
      if (o > 0) out.push({ level: 'error', text: `${zoneLabel(placed[i])} overlaps ${zoneLabel(placed[j])} (${o.toFixed(1)} m²).`, zoneIds: [placed[i].id, placed[j].id] });
    }
  for (const z of placed) {
    if (insideArea(p, z) < zoneArea(z) - 0.05)
      out.push({ level: 'error', text: `${zoneLabel(z)} extends outside the factory.`, zoneIds: [z.id] });
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
  const building = buildingArea(p);
  if (total > building) out.push({ level: 'error', text: `Required area (${total.toFixed(0)} m²) exceeds the factory (${building.toFixed(0)} m²).`, zoneIds: [] });
  return out;
}
