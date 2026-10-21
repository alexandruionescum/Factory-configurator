// Zone list from an Excel brief: read the workbook, find the header row and the columns
// (English / German / Romanian headers), then compare with the zones already in the project.
import { AreaType, Project, Zone, matchAreaType, newZone, snap } from './model';
import { readXlsx } from './xlsxRead';

export type Cell = string | number | null;
export interface Sheet { name: string; rows: Cell[][] }

// Cell values only; see xlsxRead.ts for why this does not use exceljs.
export async function readWorkbook(buf: ArrayBuffer): Promise<Sheet[]> {
  return readXlsx(buf);
}

export const text = (c: Cell) => (c === null ? '' : String(c).trim());

// "1.234,5" / "1,234.5" / "1 234" / "520 m²" -> number
export function parseNumber(c: Cell): number | null {
  if (typeof c === 'number') return Number.isFinite(c) ? c : null;
  let s = text(c).replace(/m²|m2|sqm/gi, '').replace(/[\s ']/g, '');
  if (!s) return null;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  // a single separator followed by exactly three digits is a thousands separator (areas rarely have 3 decimals)
  else if (lc >= 0) s = /^\d{1,3}(,\d{3})+$/.test(s) && !/^0,/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  else if (ld >= 0 && (/^\d{1,3}\.\d{3}$/.test(s) && !/^0\./.test(s) || /^\d{1,3}(\.\d{3}){2,}$/.test(s))) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type Field = 'code' | 'name' | 'type' | 'area';
export type Mapping = Record<Field, number>; // column index, -1 = not used

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').trim();

const SYN: Record<Field, string[]> = {
  area: ['area', 'surface', 'suprafata', 'flache', 'flaeche', 'nutzflache', 'sqm', 'm2', 'm²'],
  code: ['code', 'cod', 'id', 'kurzel', 'kuerzel', 'kurzzeichen', 'abbr', 'short', 'nr', 'no', 'nummer'],
  type: ['area type', 'type', 'tip', 'tip suprafata', 'flachenart', 'flaechenart', 'art', 'category', 'kategorie', 'categorie'],
  name: ['name', 'nume', 'denumire', 'zone', 'zona', 'bezeichnung', 'benennung', 'bereich', 'description', 'descriere', 'raum', 'room'],
};

function score(header: string, f: Field): number {
  const h = norm(header);
  if (!h) return 0;
  if (SYN[f].includes(h)) return 3;
  if (f === 'area' && /m2|m²|sqm/.test(h)) return 2;
  if (SYN[f].some(s => s.length > 2 && h.includes(s))) return 1;
  return 0;
}

export function guessHeader(rows: Cell[][]): { header: number; mapping: Mapping } {
  let best = { header: 0, mapping: { code: -1, name: -1, type: -1, area: -1 } as Mapping, hits: 0 };
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const cells = rows[r] ?? [];
    const m: Mapping = { code: -1, name: -1, type: -1, area: -1 };
    const taken = new Set<number>();
    for (const f of ['area', 'type', 'code', 'name'] as Field[]) {
      let bi = -1, bs = 0;
      cells.forEach((c, i) => { const s = taken.has(i) ? 0 : score(text(c), f); if (s > bs) { bs = s; bi = i; } });
      if (bi >= 0) { m[f] = bi; taken.add(bi); }
    }
    const hits = Object.values(m).filter(i => i >= 0).length;
    if (hits > best.hits && m.area >= 0 && (m.name >= 0 || m.code >= 0)) best = { header: r, mapping: m, hits };
  }
  return { header: best.header, mapping: best.mapping };
}

export interface BriefRow { row: number; code: string; name: string; typeText: string; type: AreaType | null; area: number }
export interface Skipped { row: number; reason: string; label: string }

export function readRows(rows: Cell[][], header: number, m: Mapping, unit: 1 | 1e-6): { items: BriefRow[]; skipped: Skipped[] } {
  const items: BriefRow[] = [], skipped: Skipped[] = [];
  for (let r = header + 1; r < rows.length; r++) {
    const c = rows[r] ?? [];
    const get = (i: number) => (i >= 0 ? c[i] ?? null : null);
    const code = text(get(m.code)), name = text(get(m.name)), typeText = text(get(m.type));
    const label = [code, name].filter(Boolean).join(' ');
    if (!code && !name) { if (c.some(x => text(x))) skipped.push({ row: r + 1, reason: 'no name or code', label: c.map(text).filter(Boolean).join(' · ') }); continue; }
    if (/^(sub)?total|^summe|^gesamt|^sum\b/i.test(name || code)) { skipped.push({ row: r + 1, reason: 'total row', label }); continue; }
    const a = parseNumber(get(m.area));
    if (a === null || a <= 0) { skipped.push({ row: r + 1, reason: 'no area', label }); continue; }
    items.push({ row: r + 1, code, name: name || code, typeText, type: typeText ? matchAreaType(typeText) : null, area: Number((a * unit).toFixed(2)) });
  }
  return { items, skipped };
}

export type Change =
  | { kind: 'update'; zone: Zone; item: BriefRow; area: boolean; name: boolean; type: boolean }
  | { kind: 'same'; zone: Zone; item: BriefRow }
  | { kind: 'new'; item: BriefRow };

export interface ImportPlan { changes: Change[]; missing: Zone[]; duplicates: string[] }

const key = (s: string) => s.trim().toLowerCase();

// A row matches a zone by code when the row has one, otherwise by name.
export function planImport(p: Project, items: BriefRow[]): ImportPlan {
  const used = new Set<string>();
  const seen = new Map<string, number>();
  const duplicates: string[] = [];
  const changes: Change[] = items.map(item => {
    const k = item.code ? `c:${key(item.code)}` : `n:${key(item.name)}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
    if (seen.get(k) === 2) duplicates.push(item.code || item.name);
    const zone = p.zones.find(z => !used.has(z.id) && (item.code ? key(z.code) === key(item.code) : key(z.name) === key(item.name)));
    if (!zone) return { kind: 'new', item };
    used.add(zone.id);
    const area = Math.abs(zone.target - item.area) > 1e-6;
    const name = !!item.name && item.name !== item.code && zone.name !== item.name;
    const type = !!item.type && zone.type !== item.type;
    return area || name || type ? { kind: 'update', zone, item, area, name, type } : { kind: 'same', zone, item };
  });
  return { changes, missing: p.zones.filter(z => !used.has(z.id)), duplicates };
}

export function applyImport(p: Project, plan: ImportPlan, removeMissing: boolean, typeColor: (t: AreaType) => string): Project {
  const upd = new Map<string, Zone>();
  for (const c of plan.changes) {
    if (c.kind !== 'update') continue;
    const z = c.zone, it = c.item;
    const k = c.area && z.w * z.l > 0 ? Math.sqrt(it.area / (z.w * z.l)) : 1;
    const type = c.type && it.type ? it.type : z.type;
    const recolor = c.type && z.color.toLowerCase() === typeColor(z.type).toLowerCase();
    upd.set(z.id, {
      ...z, target: it.area, w: Math.max(snap(z.w * k), 1), l: Math.max(snap(z.l * k), 1),
      ...(c.name ? { name: it.name } : {}), type, ...(recolor ? { color: typeColor(type) } : {}),
    });
  }
  const gone = new Set(removeMissing ? plan.missing.map(z => z.id) : []);
  const added = plan.changes.filter(c => c.kind === 'new').map(c => newZone({
    code: c.item.code, name: c.item.name, type: c.item.type ?? 'Unbestimmt', target: c.item.area,
  }));
  return {
    ...p,
    zones: [...p.zones.filter(z => !gone.has(z.id)).map(z => upd.get(z.id) ?? z), ...added],
    products: p.products.map(pr => ({ ...pr, route: pr.route.filter(id => !gone.has(id)) })),
  };
}
