// Brief template -> project: zones of the chosen phase, flows, hall, then the automatic layout.
// Values come only from the brief; every default the configurator has to use is listed as an assumption.
import { Project, Zone, emptyProject, newZone, productColor, uid } from './model';
import { autoArrange, proposeHall } from './layout';
import { Brief, Phase, areaInPhase, positionsInPhase } from './template';
import { parseNumber, text } from './briefImport';

export interface BriefResult {
  project: Project;
  warnings: string[];
  skipped: string[];     // rows not drawn, with the reason
  assumptions: string[];
  fits: boolean;
}

const fmt = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 1 });

export function briefToProject(b: Brief, phase: Phase): BriefResult {
  const warnings: string[] = [...b.problems], skipped: string[] = [], assumptions: string[] = [];
  const pv = (k: string) => b.project[k] ?? null;
  const p = emptyProject();
  p.name = text(pv('name')) || 'Imported brief';

  const seen = new Set<string>();
  const zones: Zone[] = [];
  for (const a of b.areas) {
    const label = `${a.id || '(no ID)'} ${a.name}`;
    const area = areaInPhase(a, phase);
    if (area === null) { skipped.push(`Row ${a.row} ${label}: no net area for ${phase}.`); continue; }
    if (area <= 0) { skipped.push(`Row ${a.row} ${label}: 0 m² in ${phase} (future option).`); continue; }
    if (!a.id) warnings.push(`Row ${a.row} ${a.name}: no ID; it cannot be used in routes or adjacency.`);
    else if (seen.has(a.id.toLowerCase())) warnings.push(`ID ${a.id} is used more than once (row ${a.row}).`);
    seen.add(a.id.toLowerCase());
    if (!a.type) warnings.push(a.typeText ? `Row ${a.row} ${label}: area type "${a.typeText}" is not in the list; set to Unspecified.` : `Row ${a.row} ${label}: no area type; set to Unspecified.`);
    const pos = positionsInPhase(a, phase);
    zones.push(newZone({
      code: a.id, name: a.name, type: a.type ?? 'Unbestimmt', target: area,
      stream: a.stream || undefined, adjacent: a.adjacent.length ? a.adjacent : undefined,
      positions: pos ?? undefined, notes: [a.cls, a.notes].filter(Boolean).join(' · ') || undefined,
    }));
  }
  const byCode = new Map(zones.filter(z => z.code).map(z => [z.code.toLowerCase(), z]));
  for (const z of zones) for (const c of z.adjacent ?? [])
    if (!byCode.has(c.toLowerCase())) warnings.push(`${z.code}: "Adjacent to" names ${c}, which is not an area of ${phase}.`);

  for (const f of b.flows) {
    const route: string[] = [];
    for (const c of f.route) {
      const z = byCode.get(c.toLowerCase());
      if (z) route.push(z.id); else warnings.push(`Flow ${f.name}: ${c} is not an area of ${phase}; step left out.`);
    }
    if (f.volume === null) warnings.push(`Flow ${f.name}: no annual volume.`);
    if (f.perTransport === null) warnings.push(`Flow ${f.name}: no pieces per transport.`);
    p.products.push({ id: uid(), name: f.name, color: productColor(p.products.length), volume: f.volume ?? 0, perContainer: f.perTransport ?? 0, route });
  }

  p.zones = zones;
  const num = (k: string) => parseNumber(pv(k));
  const height = num('height');
  p.hall.height = height && height > 0 ? height : 8;
  if (!(height && height > 0)) assumptions.push('Clear height not given: 8 m used.');
  const aisle = num('aisle');
  p.aisle = aisle !== null && aisle >= 0 ? aisle : 3.5;
  if (aisle === null) assumptions.push('Aisle width between zone rows not given: 3.5 m used.');

  const w = num('width'), l = num('length');
  if (w && l && w > 0 && l > 0) p.hall = { ...p.hall, width: w, length: l };
  else {
    const g = num('grossUp');
    const grossUp = g && g >= 1 ? g : 1.15;
    if (!(g && g >= 1)) assumptions.push('Gross-up factor not given: 1.15 used.');
    const total = zones.reduce((s, z) => s + z.target, 0);
    p.hall = { ...p.hall, ...proposeHall(p, grossUp) };
    assumptions.push(`Hall size not given: ${p.hall.width} × ${p.hall.length} m proposed (net ${fmt(total)} m² × ${grossUp}, enlarged until the automatic layout fits, 3:2 shape).`);
  }

  const r = autoArrange(p);
  p.zones = r.zones;
  if (!r.fits) warnings.push(`The areas do not fit in the hall of ${p.hall.width} × ${p.hall.length} m with ${p.aisle} m aisles; zones run outside the hall.`);
  p.meta = {
    client: text(pv('client')) || undefined, site: text(pv('site')) || undefined,
    preparedBy: text(pv('preparedBy')) || undefined, date: text(pv('date')) || undefined, phase, assumptions,
  };
  return { project: p, warnings, skipped, assumptions, fits: r.fits };
}
