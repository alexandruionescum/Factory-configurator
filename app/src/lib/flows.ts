import { Product, Project, Zone, zoneCenter, zoneLabel } from './model';

export interface Segment {
  product: Product;
  from: Zone; to: Zone;
  trips: number;     // transports per year
  dist: number;      // m, rectilinear between block centres
  work: number;      // transport-metres per year = trips × dist
}

export const tripsPerYear = (pr: Product) => (pr.perContainer > 0 ? Math.ceil(pr.volume / pr.perContainer) : 0);

// Distance is rectilinear (|dx| + |dy|) between block centres: an approximation until routes follow aisles.
export function segments(p: Project): Segment[] {
  const byId = new Map(p.zones.map(z => [z.id, z]));
  const out: Segment[] = [];
  for (const pr of p.products) {
    const trips = tripsPerYear(pr);
    for (let i = 0; i + 1 < pr.route.length; i++) {
      const from = byId.get(pr.route[i]); const to = byId.get(pr.route[i + 1]);
      if (!from || !to || from.id === to.id) continue;
      const a = zoneCenter(from), b = zoneCenter(to);
      const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      out.push({ product: pr, from, to, trips, dist, work: trips * dist });
    }
  }
  return out;
}

export interface PairFlow { from: Zone; to: Zone; trips: number; dist: number; work: number; products: Product[] }

// Flows aggregated per (from, to) pair, highest intensity first.
export function pairFlows(p: Project): PairFlow[] {
  const m = new Map<string, PairFlow>();
  for (const s of segments(p)) {
    const k = `${s.from.id}>${s.to.id}`;
    const f = m.get(k) ?? { from: s.from, to: s.to, trips: 0, dist: s.dist, work: 0, products: [] };
    f.trips += s.trips; f.work += s.work;
    if (!f.products.includes(s.product)) f.products.push(s.product);
    m.set(k, f);
  }
  return [...m.values()].sort((a, b) => b.trips - a.trips);
}

function properCross(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) {
  const o = (p: typeof a, q: typeof a, r: typeof a) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

export interface FlowCheck { text: string; level: 'warn' | 'info' }

export function flowChecks(p: Project): FlowCheck[] {
  const out: FlowCheck[] = [];
  const byId = new Map(p.zones.map(z => [z.id, z]));
  for (const pr of p.products) {
    if (pr.route.length < 2) out.push({ level: 'info', text: `${pr.name}: the route has fewer than two steps.` });
    if (!(pr.perContainer > 0)) out.push({ level: 'warn', text: `${pr.name}: pieces per transport is missing.` });
    pr.route.forEach((id, i) => {
      const z = byId.get(id);
      if (z && !z.placed) out.push({ level: 'warn', text: `${pr.name}: ${zoneLabel(z)} is not placed, so its distance is not real.` });
      if (i > 0 && pr.route.slice(0, i - 1).includes(id) && pr.route[i - 1] !== id)
        out.push({ level: 'warn', text: `${pr.name}: back-flow to ${z ? zoneLabel(z) : '?'} (step ${i + 1}).` });
    });
  }
  const pf = pairFlows(p);
  for (let i = 0; i < pf.length; i++)
    for (let j = i + 1; j < pf.length; j++) {
      const A = pf[i], B = pf[j];
      if ([A.from.id, A.to.id].some(id => id === B.from.id || id === B.to.id)) continue;
      if (properCross(zoneCenter(A.from), zoneCenter(A.to), zoneCenter(B.from), zoneCenter(B.to)))
        out.push({ level: 'warn', text: `Crossing flows: ${A.from.code || A.from.name}→${A.to.code || A.to.name} and ${B.from.code || B.from.name}→${B.to.code || B.to.name}.` });
    }
  return out;
}

export const fmt = (n: number, d = 0) =>
  (Math.abs(n) < 0.5 * 10 ** -d ? 0 : n).toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
