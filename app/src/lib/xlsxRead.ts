// Minimal .xlsx value reader: sheet names and cell values (shared strings, inline strings, numbers,
// booleans, cached formula results). It ignores styles, comments and drawings, so files saved by
// Excel, LibreOffice or other tools all read the same way.
import { unzipSync } from 'fflate';
import type { Cell, Sheet } from './briefImport';

const dec = new TextDecoder('utf-8');
const parse = (s: string) => new DOMParser().parseFromString(s, 'application/xml');
const els = (d: Document | Element, tag: string) => Array.from(d.getElementsByTagNameNS('*', tag));
const colIndex = (ref: string) => {
  const letters = ref.replace(/\d+$/, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export function readXlsx(buf: ArrayBuffer): Sheet[] {
  const files = unzipSync(new Uint8Array(buf));
  const text = (p: string) => (files[p] ? dec.decode(files[p]) : null);
  const wbXml = text('xl/workbook.xml');
  if (!wbXml) throw new Error('not an .xlsx workbook');

  const shared: string[] = [];
  const ss = text('xl/sharedStrings.xml');
  if (ss) for (const si of els(parse(ss), 'si')) shared.push(els(si, 't').map(t => t.textContent ?? '').join(''));

  const rels = new Map<string, string>();
  const relXml = text('xl/_rels/workbook.xml.rels');
  if (relXml) for (const r of els(parse(relXml), 'Relationship')) {
    const target = r.getAttribute('Target') ?? '';
    rels.set(r.getAttribute('Id') ?? '', target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  }

  const sheets: Sheet[] = [];
  for (const s of els(parse(wbXml), 'sheet')) {
    const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? s.getAttribute('r:id') ?? '';
    const xml = text(rels.get(rid) ?? '');
    if (!xml) continue;
    const rows: Cell[][] = [];
    for (const row of els(parse(xml), 'row')) {
      const r = Number(row.getAttribute('r')) - 1;
      const cells: Cell[] = [];
      for (const c of els(row, 'c')) {
        const t = c.getAttribute('t');
        const v = els(c, 'v')[0]?.textContent ?? null;
        let val: Cell = null;
        if (t === 's') val = v === null ? null : shared[Number(v)] ?? null;
        else if (t === 'inlineStr') val = els(c, 't').map(x => x.textContent ?? '').join('');
        else if (t === 'str' || t === 'e') val = v;
        else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
        else if (v !== null && v !== '') val = Number(v);
        cells[colIndex(c.getAttribute('r') ?? 'A1')] = val;
      }
      rows[r] = Array.from(cells, x => x ?? null);
    }
    sheets.push({ name: s.getAttribute('name') ?? '', rows: Array.from(rows, x => x ?? []) });
  }
  return sheets;
}
