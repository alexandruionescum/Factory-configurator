import { Project, areaType, zoneArea, zoneCenter, zoneLabel } from './model';
import { flowChecks, fmt, pairFlows, segments, tripsPerYear } from './flows';
import { layoutIssues } from './layout';

// File name convention: "YYMMDD Project_vNN_topic.ext"
export function fileName(p: Project, topic: string, ext: string) {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const name = p.name.replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '_') || 'Project';
  return `${ymd} ${name}_v${String(p.rev).padStart(2, '0')}_${topic}.${ext}`;
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// visTABLE Block Layout Table: 22 columns in this exact order; x / y = block centre in mm;
// colour = cell FILL of the Color[RGB] cell; flow points are fractions of the block size (-0.5 … 0.5).
export const BLOCK_COLUMNS = [
  'Name', 'x[mm]', 'y[mm]', 'z[mm]', 'Rotation[°]', 'Width[mm]', 'Length[mm]', 'Height[mm]', 'Area[mm²]', 'Area type[]',
  'Layer[]', 'Color[RGB]', 'Label[0/1]', 'Label area size[0/1]', 'Fixed area[0/1]', 'Flow entry X', 'Flow entry Y',
  'Flow exit X', 'Flow exit Y', '3D shadow[0/1]', '3D transparency[0/1]', '3D visibility[0/1]',
] as const;

const BLOCK_HEIGHT_MM = 10; // floor block, as in visTABLE block layouts

export function blockRows(p: Project) {
  return p.zones.filter(z => z.placed).map(z => {
    const c = zoneCenter(z);
    const w = Math.round(z.w * 1000), l = Math.round(z.l * 1000);
    return [
      zoneLabel(z), Math.round(c.x * 1000), Math.round(c.y * 1000), 0, 0, w, l, BLOCK_HEIGHT_MM, w * l,
      z.type, 'Block layout', z.color, 1, 1, z.fixedArea ? 1 : 0, -0.5, 0, 0.5, 0, 1, 0, 1,
    ] as (string | number)[];
  });
}

export async function blockLayoutXlsx(p: Project): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Block layout');
  ws.addRow([...BLOCK_COLUMNS]);
  ws.getRow(1).font = { bold: true };
  for (const r of blockRows(p)) {
    const color = r[11] as string;
    const row = ws.addRow(r.map((v, i) => (i === 11 ? '' : v)));
    row.getCell(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + color.slice(1).toUpperCase() } };
  }
  ws.columns.forEach((c, i) => { c.width = i === 0 ? 32 : 14; });
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function projectJson(p: Project): Blob {
  return new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
}

// Renders the on-screen plan SVG to a PNG (about 25 px per metre, max 4000 px wide).
export async function planPng(svgId: string, p: Project): Promise<Blob> {
  const src = document.getElementById(svgId) as SVGSVGElement | null;
  if (!src) throw new Error('The plan is not displayed.');
  const vb = src.viewBox.baseVal;
  const scale = Math.min(25, 4000 / vb.width);
  const clone = src.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(Math.round(vb.width * scale)));
  clone.setAttribute('height', String(Math.round(vb.height * scale)));
  const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  title.setAttribute('x', String(vb.x + 0.5)); title.setAttribute('y', String(vb.y + 2));
  title.setAttribute('font-size', String(Math.max(p.hall.width, p.hall.length) / 45)); title.setAttribute('fill', '#14171C');
  title.textContent = `${p.name} · v${String(p.rev).padStart(2, '0')}`;
  clone.appendChild(title);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('SVG')); img.src = url; });
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    cv.getContext('2d')!.drawImage(img, 0, 0);
    return await new Promise<Blob>((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('PNG'))), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

// Delivery report: zones vs brief, flows, open issues, assumptions.
export function reportMd(p: Project): string {
  const L: string[] = [];
  const total = p.zones.reduce((s, z) => s + z.target, 0);
  L.push(`# ${p.name} – v${String(p.rev).padStart(2, '0')}`, '');
  L.push(`Hall ${p.hall.width} × ${p.hall.length} m (${fmt(p.hall.width * p.hall.length)} m²), clear height ${fmt(p.hall.height, 1)} m, aisle ${fmt(p.aisle, 1)} m.`, '');
  L.push('## Zones', '', '| Zone | Type | Brief (m²) | Plan (m²) | Deviation | Centre position (m) | Size (m) |', '|---|---|---:|---:|---:|---|---|');
  for (const z of p.zones) {
    const a = zoneArea(z), c = zoneCenter(z);
    L.push(`| ${zoneLabel(z)} | ${areaType(z.type).label} | ${fmt(z.target)} | ${z.placed ? fmt(a, 1) : '–'} | ${z.placed && z.target ? `${fmt(100 * (a - z.target) / z.target, 1)} %` : '–'} | ${z.placed ? `${fmt(c.x, 2)} / ${fmt(c.y, 2)}` : 'not placed'} | ${fmt(z.w, 2)} × ${fmt(z.l, 2)} |`);
  }
  L.push('', `Brief total: ${fmt(total)} m².`, '');
  if (p.products.length) {
    L.push('## Flows', '', '| Family | Volume / year | Pieces / transport | Transports / year | Route |', '|---|---:|---:|---:|---|');
    const byId = new Map(p.zones.map(z => [z.id, z]));
    for (const pr of p.products) L.push(`| ${pr.name} | ${fmt(pr.volume)} | ${fmt(pr.perContainer)} | ${fmt(tripsPerYear(pr))} | ${pr.route.map(id => byId.get(id)?.code || byId.get(id)?.name || '?').join(' → ')} |`);
    L.push('', '| From | To | Transports / year | Distance (m) | Transport·m / year |', '|---|---|---:|---:|---:|');
    for (const f of pairFlows(p)) L.push(`| ${zoneLabel(f.from)} | ${zoneLabel(f.to)} | ${fmt(f.trips)} | ${fmt(f.dist, 1)} | ${fmt(f.work)} |`);
    L.push('', `Total distance × intensity: ${fmt(segments(p).reduce((s, x) => s + x.work, 0))} transport·m / year.`, '');
  }
  const issues = [...layoutIssues(p), ...flowChecks(p)];
  L.push('## Checks', '');
  L.push(...(issues.length ? issues.map(i => `- ${i.text}`) : ['- No issues found.']), '');
  L.push('## Assumptions', '',
    '- Distances are rectilinear between zone centres, not along the aisles.',
    `- Blocks are exported as floor blocks ${BLOCK_HEIGHT_MM} mm high, on the layer "Block layout".`,
    '- Flow entry / exit points are at the middle of the west / east side of each block.', '');
  return L.join('\n');
}
