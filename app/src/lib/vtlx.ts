// Material flows into a visTABLE Pack and Go (.vtlx), in the browser.
// Port of .claude/skills/vistable-factory-layout/scripts/example_flows_platin.py:
// the ProductLines of platin_v1.xml are rebuilt from the app's product families; every Operation is linked
// to a block of LayoutData.v1.xml through its Guid. Nothing else in the file changes.
// .NET DataContract rules kept: unique z:Id, every z:Ref defined, no Ref before its Id.
import { unzipSync, zipSync } from 'fflate';
import { Product, Project, Zone, zoneLabel } from './model';
import { tripsPerYear } from './flows';

export interface VtlxBlock { guid: string; name: string }

export interface VtlxFile {
  fileName: string;
  entries: Record<string, Uint8Array>;
  layout: string;
  platin: string;
  platinBom: boolean;
  blocks: VtlxBlock[];
  productLines: string[];   // names of the product lines already in the file (will be replaced)
  template: boolean;        // the file has a transport type definition to copy
}

const BOM = [0xef, 0xbb, 0xbf];
const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TT_DEF = /<TransportType z:Id="(i\d+)">[\s\S]*?<\/TransportType>/;
const PL_BLOCK = /<ProductLines>[\s\S]*?<\/ProductLines>|<ProductLines\s*\/>/;

export function readVtlx(fileName: string, buf: ArrayBuffer): VtlxFile {
  let entries: Record<string, Uint8Array>;
  try { entries = unzipSync(new Uint8Array(buf)); } catch { throw new Error('This is not a Pack and Go file (.vtlx).'); }
  const lay = entries['LayoutData.v1.xml'], pl = entries['platin_v1.xml'];
  if (!lay || !pl) throw new Error('LayoutData.v1.xml or platin_v1.xml is missing: export the file from visTABLE with Pack and Go.');
  const dec = new TextDecoder('utf-8');
  const layout = dec.decode(lay);
  const platin = dec.decode(pl);
  const platinBom = BOM.every((b, i) => pl[i] === b);

  const blocks: VtlxBlock[] = [];
  for (const m of layout.matchAll(/i:type="PhysicalLayoutObject">([\s\S]*?)<\/ShowLabel>/g)) {
    const guid = /<Guid>([^<]*)<\/Guid>/.exec(m[1])?.[1];
    const name = /<Name>([^<]*)<\/Name>/.exec(m[1])?.[1];
    if (guid && name !== undefined) blocks.push({ guid, name: unescapeXml(name) });
  }
  const plSection = PL_BLOCK.exec(platin)?.[0] ?? '';
  const productLines = [...plSection.matchAll(/<ProductLine z:Id="i\d+">[\s\S]*?<Name>([^<]*)<\/Name>/g)].map(m => unescapeXml(m[1]));
  return { fileName, entries, layout, platin, platinBom, blocks, productLines, template: TT_DEF.test(platin) && /<PngBitmapByteArray>/.test(plSection) };
}

export interface ZoneMatch { zone: Zone; block: VtlxBlock | null; candidates: number }

// A zone matches the block whose name is the exported block name ("CODE Name"), else the block whose
// first word is the zone code, else the block named like the zone.
export function matchZones(p: Project, f: VtlxFile): ZoneMatch[] {
  const used = new Set(p.products.flatMap(pr => pr.route));
  return p.zones.filter(z => used.has(z.id)).map(z => {
    const tries = [
      (b: VtlxBlock) => b.name === zoneLabel(z),
      (b: VtlxBlock) => !!z.code && b.name.split(' ')[0] === z.code,
      (b: VtlxBlock) => b.name === z.name,
    ];
    for (const t of tries) {
      const c = f.blocks.filter(t);
      if (c.length) return { zone: z, block: c.length === 1 ? c[0] : null, candidates: c.length };
    }
    return { zone: z, block: null, candidates: 0 };
  });
}

const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)));

const idNum = (s: string) => Number(s.slice(1));

export function checkDataContract(xml: string): string | null {
  const defs = [...xml.matchAll(/z:Id="(i\d+)"/g)];
  const ids = new Map<string, number>();
  for (const d of defs) {
    if (ids.has(d[1])) return `duplicate z:Id ${d[1]}`;
    ids.set(d[1], d.index!);
  }
  for (const r of xml.matchAll(/z:Ref="(i\d+)"/g)) {
    const at = ids.get(r[1]);
    if (at === undefined) return `z:Ref ${r[1]} has no definition`;
    if (at > r.index!) return `z:Ref ${r[1]} comes before its definition`;
  }
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return 'the XML does not parse';
  return null;
}

export interface FlowWriteResult { blob: Blob; productLines: number; transports: number }

export function writeFlows(p: Project, f: VtlxFile): FlowWriteResult {
  const pl = f.platin;
  const plm = PL_BLOCK.exec(pl);
  if (!plm) throw new Error('platin_v1.xml has no ProductLines section.');
  const prefix = pl.slice(0, plm.index), oldPl = plm[0], rest = pl.slice(plm.index + oldPl.length);
  const tt = TT_DEF.exec(pl);
  const png = /<PngBitmapByteArray>([\s\S]*?)<\/PngBitmapByteArray>/.exec(oldPl)?.[1];
  if (!tt || png === undefined) throw new Error('The file needs one sample material flow (one product with one transport) made in visTABLE, used as a template.');
  const docRef = /<Document z:Ref="(i\d+)"/.exec(oldPl)?.[1] ?? 'i1';

  const match = new Map(matchZones(p, f).map(m => [m.zone.id, m.block]));
  const missing = [...match].filter(([, b]) => !b).map(([id]) => p.zones.find(z => z.id === id)!);
  if (missing.length) throw new Error(`No unique block found for: ${missing.map(zoneLabel).join(', ')}.`);

  let next = Math.max(0, ...[...prefix.matchAll(/z:(?:Id|Ref)="(i\d+)"/g)].map(m => idNum(m[1]))) + 1;
  const newId = () => `i${next++}`;

  // template transport type, its inner ids renumbered
  const ttOld = tt[1];
  let ttId = '';
  const ttInline = () => {
    const map = new Map<string, string>();
    const def = tt[0].replace(/z:Id="(i\d+)"/g, (_, o) => { const n = newId(); map.set(o, n); return `z:Id="${n}"`; })
      .replace(/z:Ref="(i\d+)"/g, (s, o) => (map.has(o) ? `z:Ref="${map.get(o)}"` : s));
    ttId = map.get(ttOld)!;
    return def;
  };

  let lcId = '';
  let transports = 0;
  const lines: string[] = [];
  const stamp = new Date().toISOString().slice(0, 19);
  const products = p.products.filter(pr => pr.route.length >= 2 && pr.perContainer > 0);

  for (const pr of products) {
    const plId = newId();
    const nodes = [...new Set(pr.route)];
    const ops = new Map<string, string>();
    const opXml = nodes.map(zid => {
      const z = p.zones.find(q => q.id === zid)!, b = match.get(zid)!;
      const oid = newId(), rid = newId();
      ops.set(zid, oid);
      return `<Operation z:Id="${oid}"><Document z:Ref="${docRef}" /><Annotation i:nil="true" /><BZ>0</BZ><CT>0</CT><Color i:nil="true" /><Inventory i:nil="true" /><ManualPosition xmlns:d7p1="http://schemas.plavis.de/vistable/typeLibrary" i:nil="true" /><Name>${escapeXml(z.code || z.name)}</Name><Resource z:Id="${rid}"><Document z:Ref="${docRef}" /><GUID>${b.guid}</GUID></Resource><StoredItem i:nil="true" /><TimeField1></TimeField1><TimeFieldSetup1></TimeFieldSetup1><UseForLeadTimeCalculation>false</UseForLeadTimeCalculation><id>${uuid()}</id></Operation>`;
    });
    let itemId = '';
    const trXml: string[] = [];
    for (let i = 0; i + 1 < pr.route.length; i++) {
      const a = pr.route[i], b = pr.route[i + 1];
      if (a === b) continue;
      const tid = newId();
      let item: string, lc: string, ttx: string;
      if (!itemId) { itemId = newId(); item = `<Item z:Id="${itemId}"><Document z:Ref="${docRef}" /><Name>${escapeXml(pr.name)}</Name></Item>`; }
      else item = `<Item z:Ref="${itemId}" />`;
      if (!lcId) { lcId = newId(); lc = `<LoadCarrier z:Id="${lcId}"><Document z:Ref="${docRef}" /><Name>N/A</Name></LoadCarrier>`; }
      else lc = `<LoadCarrier z:Ref="${lcId}" />`;
      ttx = ttId ? `<TransportType z:Ref="${ttId}" />` : ttInline();
      trXml.push(`<Transport z:Id="${tid}"><Document z:Ref="${docRef}" /><ContainersPerTransport>1</ContainersPerTransport><Inventory>0</Inventory><IsCalculated>true</IsCalculated>${item}<ItemsPerContainer>${pr.perContainer}</ItemsPerContainer>${lc}<QtyPerProduct>1</QtyPerProduct><Quantity>${tripsPerYear(pr)}</Quantity><Sink z:Ref="${ops.get(b)}" /><Source z:Ref="${ops.get(a)}" />${ttx}<productLine z:Ref="${plId}" /><transportQtyDivProductLineQty>0</transportQtyDivProductLineQty></Transport>`);
      transports++;
    }
    lines.push(`<ProductLine z:Id="${plId}"><Document z:Ref="${docRef}" /><Color>${argb(pr)}</Color><IntensityBaseUnit>Transport</IntensityBaseUnit><LastChange>${stamp}</LastChange><LeadTimeCalculationMethod>CycletimeOfSuccessor</LeadTimeCalculationMethod><LeadTimeMode>false</LeadTimeMode><Name>${escapeXml(pr.name)}</Name><Operations>${opXml.join('')}</Operations><PngBitmapByteArray>${png}</PngBitmapByteArray><Quantity>${pr.volume}</Quantity><QuantityNotSpecified>false</QuantityNotSpecified><TaktTime i:nil="true" /><Transports>${trXml.join('')}</Transports><_manualPlacement>false</_manualPlacement></ProductLine>`);
  }
  if (!transports) throw new Error('No product family has a route with at least two steps and pieces per transport.');

  // everything after the product lines (transport type list, ...) is renumbered after the new ids;
  // a reference to the old template transport type now points to the copy inside the new product lines
  const map = new Map<string, string>([[ttOld, ttId]]);
  let tail = rest.includes(`z:Id="${ttOld}"`) ? rest.replace(tt[0], `<TransportType z:Ref="${ttId}" />`) : rest;
  tail = tail.replace(/z:Id="(i\d+)"/g, (_, o) => { const n = newId(); map.set(o, n); return `z:Id="${n}"`; });
  tail = tail.replace(/z:Ref="(i\d+)"/g, (s, o) => {
    if (map.has(o)) return `z:Ref="${map.get(o)}"`;
    if (oldPl.includes(`z:Id="${o}"`)) throw new Error(`The file refers to ${o} inside the old product lines; it cannot be rebuilt safely.`);
    return s;
  });

  const xml = prefix + `<ProductLines>${lines.join('')}</ProductLines>` + tail;
  const bad = checkDataContract(xml);
  if (bad) throw new Error(`Check failed, nothing was written: ${bad}.`);

  const body = new TextEncoder().encode(xml);
  const out = f.platinBom ? new Uint8Array([...BOM, ...body]) : body;
  const entries: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(f.entries)) entries[k] = k === 'platin_v1.xml' ? out : v;
  const zipped = zipSync(entries, { level: 6 });
  return { blob: new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }), productLines: lines.length, transports };
}

const argb = (pr: Product) => '#FF' + pr.color.replace('#', '').toUpperCase();
