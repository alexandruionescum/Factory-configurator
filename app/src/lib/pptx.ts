// PowerPoint presentation of the layout (16:9): title, block layout, area overview, zone list,
// material flows, checks and assumptions. Built in the browser with pptxgenjs.
import type PptxT from 'pptxgenjs';
import { AREA_TYPES, Project, areaType, zoneArea } from './model';

type Slide = ReturnType<PptxT['addSlide']>;
import { layoutIssues, layoutSettings } from './layout';
import { flowChecks, fmt, pairFlows, segments } from './flows';

const ORANGE = 'EE6B00', INK = '000000', GREY = '6A6E79', LINE = 'D4D7DD', LIGHT = 'FDF2E8';
const FONT = 'Arial';

export interface PptxOptions {
  footer: string;          // left footer text
  logoPng?: string;        // base64 PNG (branded builds)
  planPng: string;         // data URL of the plan image
  planAspect: number;      // width / height of the plan image
}

export async function buildPptx(p: Project, o: PptxOptions): Promise<Blob> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
  pres.title = p.name;
  const logo = o.logoPng ? `data:image/png;base64,${o.logoPng}` : undefined;
  const date = new Date().toISOString().slice(0, 10);
  const rev = `v${String(p.rev).padStart(2, '0')}`;

  pres.defineSlideMaster({
    title: 'CONTENT',
    background: { color: 'FFFFFF' },
    objects: [
      { rect: { x: 0, y: 7.38, w: 13.33, h: 0.12, fill: { color: ORANGE } } },
      { text: { text: `${o.footer} · ${p.name} · ${rev} · ${date}`, options: { x: 0.5, y: 6.98, w: 10, h: 0.3, fontSize: 9, color: GREY, fontFace: FONT } } },
      ...(logo ? [{ image: { x: 11.55, y: 0.32, w: 1.3, h: 0.355, data: logo } }] : []),
    ],
    slideNumber: { x: 12.4, y: 6.98, w: 0.5, h: 0.3, fontSize: 9, color: GREY, fontFace: FONT },
  });

  const title = (s: Slide, t: string, sub?: string) => {
    s.addShape(pres.ShapeType.rect, { x: 0.5, y: 0.42, w: 0.08, h: 0.5, fill: { color: ORANGE }, line: { color: ORANGE } });
    s.addText(t, { x: 0.7, y: 0.32, w: 10.5, h: 0.5, fontSize: 24, bold: true, color: INK, fontFace: FONT });
    if (sub) s.addText(sub, { x: 0.7, y: 0.8, w: 10.5, h: 0.32, fontSize: 12, color: GREY, fontFace: FONT });
  };
  const head = (cells: string[]) => cells.map(c => ({ text: c, options: { bold: true, fill: { color: ORANGE }, color: INK } }));
  const tableOpts = (colW: number[], y = 1.35) => ({
    x: 0.5, y, w: colW.reduce((a, b) => a + b, 0), colW, fontSize: 10, fontFace: FONT, color: INK,
    border: { type: 'solid' as const, pt: 0.5, color: LINE }, margin: 0.05, valign: 'middle' as const,
  });

  const st = layoutSettings(p);
  const placed = p.zones.filter(z => z.placed);
  const net = p.zones.reduce((s, z) => s + z.target, 0);
  const fp = p.hall.footprint?.length ? p.hall.footprint : [{ x: 0, y: 0, w: p.hall.width, l: p.hall.length }];
  const fpArea = fp.reduce((s, r) => s + r.w * r.l, 0);

  // 1. title
  const t = pres.addSlide();
  t.background = { color: 'FFFFFF' };
  t.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.35, h: 7.5, fill: { color: ORANGE }, line: { color: ORANGE } });
  if (logo) t.addImage({ data: logo, x: 0.95, y: 0.8, w: 2.6, h: 0.71 });
  t.addText(p.name, { x: 0.95, y: 2.5, w: 11.5, h: 1.0, fontSize: 36, bold: true, color: INK, fontFace: FONT });
  t.addText('Factory layout concept', { x: 0.95, y: 3.45, w: 11.5, h: 0.55, fontSize: 20, color: ORANGE, fontFace: FONT });
  const m = p.meta ?? {};
  const info = [m.client && `Client: ${m.client}`, m.site && `Site: ${m.site}`, m.phase && `Phase: ${m.phase}`, m.preparedBy && `Prepared by: ${m.preparedBy}`, `${rev} · ${date}`].filter(Boolean).join('\n');
  t.addText(info, { x: 0.95, y: 4.3, w: 11.5, h: 1.6, fontSize: 14, color: GREY, fontFace: FONT, valign: 'top' });

  // 2. block layout
  const s2 = pres.addSlide({ masterName: 'CONTENT' });
  title(s2, 'Block layout', `${st.shape} shape${st.rot ? `, rotated ${st.rot}°` : ''} · ${p.hall.width} × ${p.hall.length} m${m.phase ? ` · ${m.phase}` : ''}`);
  const bw = 9.4, bh = 5.6;
  const iw = Math.min(bw, bh * o.planAspect), ih = iw / o.planAspect;
  s2.addImage({ data: o.planPng, x: 0.5 + (bw - iw) / 2, y: 1.25 + (bh - ih) / 2, w: iw, h: ih });
  const kx = 10.2;
  const facts: [string, string][] = [
    ['Factory', `${p.hall.width} × ${p.hall.length} m`], ['Building area', `${fmt(fpArea)} m²`], ['Net area of zones', `${fmt(net)} m²`],
    ['Occupancy', `${fpArea ? Math.round(100 * net / fpArea) : 0} %`], ['Zones', String(placed.length)],
  ];
  facts.forEach(([k, v], i) => {
    s2.addText(k.toUpperCase(), { x: kx, y: 1.3 + i * 0.62, w: 2.7, h: 0.22, fontSize: 8, color: GREY, bold: true, fontFace: FONT, charSpacing: 1 });
    s2.addText(v, { x: kx, y: 1.5 + i * 0.62, w: 2.7, h: 0.32, fontSize: 15, color: INK, fontFace: FONT });
  });
  const used = AREA_TYPES.filter(a => placed.some(z => z.type === a.key));
  used.forEach((a, i) => {
    const y = 4.55 + i * 0.3;
    s2.addShape(pres.ShapeType.rect, { x: kx, y: y + 0.05, w: 0.18, h: 0.18, fill: { color: a.color.slice(1) }, line: { color: '999999', width: 0.5 } });
    s2.addText(a.label, { x: kx + 0.28, y, w: 2.4, h: 0.28, fontSize: 10, color: INK, fontFace: FONT });
  });

  // 3. area overview by stream (or by area type when there are no streams)
  const byStream = p.zones.some(z => z.stream);
  const groups = new Map<string, { n: number; brief: number; drawn: number }>();
  for (const z of p.zones) {
    const k = byStream ? z.stream ?? '(no stream)' : areaType(z.type).label;
    const g = groups.get(k) ?? { n: 0, brief: 0, drawn: 0 };
    groups.set(k, { n: g.n + 1, brief: g.brief + z.target, drawn: g.drawn + (z.placed ? zoneArea(z) : 0) });
  }
  const s3 = pres.addSlide({ masterName: 'CONTENT' });
  title(s3, 'Area overview', byStream ? 'Net areas by stream' : 'Net areas by area type');
  const rows3 = [...groups.entries()].map(([k, g]) => [k, String(g.n), fmt(g.brief), fmt(g.drawn), `${net ? Math.round(100 * g.brief / net) : 0} %`]);
  const drawnTotal = placed.reduce((s, z) => s + zoneArea(z), 0);
  s3.addTable([
    head([byStream ? 'Stream' : 'Area type', 'Zones', 'Brief m²', 'Drawn m²', 'Share']),
    ...rows3.map(r => r.map((c, i) => ({ text: c, options: { align: (i ? 'right' : 'left') as 'right' | 'left' } }))),
    ['Total', String(p.zones.length), fmt(net), fmt(drawnTotal), '100 %'].map((c, i) => ({ text: c, options: { bold: true, fill: { color: LIGHT }, align: (i ? 'right' : 'left') as 'right' | 'left' } })),
  ] as never, tableOpts([5.5, 1.3, 1.8, 1.8, 1.4]));

  // 4. zone list, 15 rows per slide
  const per = 15;
  const zs = [...p.zones].sort((a, b) => (a.stream ?? '').localeCompare(b.stream ?? '') || a.code.localeCompare(b.code));
  for (let i = 0; i < zs.length; i += per) {
    const s = pres.addSlide({ masterName: 'CONTENT' });
    const pages = Math.ceil(zs.length / per);
    title(s, 'Zone list', pages > 1 ? `Page ${i / per + 1} of ${pages}` : undefined);
    s.addTable([
      head(['ID', 'Name', 'Stream', 'Type', 'Positions', 'Brief m²', 'Drawn m²', 'Deviation']),
      ...zs.slice(i, i + per).map(z => {
        const d = z.placed ? zoneArea(z) : 0;
        const dev = z.placed && z.target ? `${fmt(100 * (d - z.target) / z.target, 1)} %` : 'not placed';
        return [z.code, z.name, z.stream ?? '', areaType(z.type).label, z.positions === undefined ? '' : String(z.positions), fmt(z.target), z.placed ? fmt(d) : '–', dev]
          .map((c, k) => ({ text: c, options: { align: (k >= 4 ? 'right' : 'left') as 'right' | 'left' } }));
      }),
    ] as never, { ...tableOpts([0.9, 3.6, 2.4, 1.5, 0.9, 1.0, 1.0, 1.0]), fontSize: 9 });
  }

  // 5. material flows
  const pf = pairFlows(p);
  if (pf.length) {
    const s = pres.addSlide({ masterName: 'CONTENT' });
    title(s, 'Material flows', 'Transports per year between zones; distance rectilinear between zone centres');
    const work = segments(p).reduce((a, x) => a + x.work, 0);
    s.addTable([
      head(['From', 'To', 'Families', 'Transports / year', 'Distance m', 'Transport·m / year']),
      ...pf.slice(0, 14).map(f => [`${f.from.code} ${f.from.name}`, `${f.to.code} ${f.to.name}`, f.products.map(x => x.name).join(', '), fmt(f.trips), fmt(f.dist, 1), fmt(f.work)]
        .map((c, k) => ({ text: c, options: { align: (k >= 3 ? 'right' : 'left') as 'right' | 'left' } }))),
      ['Total (distance × intensity)', '', '', '', '', fmt(work)].map((c, k) => ({ text: c, options: { bold: true, fill: { color: LIGHT }, align: (k >= 3 ? 'right' : 'left') as 'right' | 'left' } })),
    ] as never, tableOpts([3.2, 3.2, 2.0, 1.4, 1.1, 1.4]));
  }

  // 6. checks and assumptions
  const s6 = pres.addSlide({ masterName: 'CONTENT' });
  title(s6, 'Checks and assumptions');
  const checks = [...layoutIssues(p), ...flowChecks(p)].map(i => i.text);
  const assum = [
    'Areas are net m² from the brief; zones are drawn as rectangles touching each other unless aisles are set.',
    'Flow distances are rectilinear between zone centres, not along aisles.',
    ...(m.assumptions ?? []),
  ];
  const bullets = (xs: string[]) => xs.map(x => ({ text: x, options: { bullet: true, breakLine: true } }));
  s6.addText('CHECKS', { x: 0.5, y: 1.3, w: 6, h: 0.3, fontSize: 10, bold: true, color: ORANGE, fontFace: FONT, charSpacing: 1 });
  s6.addText(bullets(checks.length ? checks.slice(0, 14) : ['No issues found.']), { x: 0.5, y: 1.65, w: 6, h: 5.1, fontSize: 11, color: INK, fontFace: FONT, valign: 'top', paraSpaceAfter: 4 });
  s6.addText('ASSUMPTIONS', { x: 6.9, y: 1.3, w: 6, h: 0.3, fontSize: 10, bold: true, color: ORANGE, fontFace: FONT, charSpacing: 1 });
  s6.addText(bullets(assum), { x: 6.9, y: 1.65, w: 6, h: 5.1, fontSize: 11, color: INK, fontFace: FONT, valign: 'top', paraSpaceAfter: 4 });

  return (await pres.write({ outputType: 'blob' })) as Blob;
}
