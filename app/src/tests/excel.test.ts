import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { exampleProject } from '../lib/model';
import { applyImport, guessHeader, parseNumber, planImport, readRows, readWorkbook } from '../lib/briefImport';
import { AREA_COLUMNS, FLOW_COLUMNS, buildTemplate, isTemplate, readBrief } from '../lib/template';
import { briefToProject } from '../lib/briefProject';
import { layoutIssues } from '../lib/layout';

describe('numbers from Excel cells', () => {
  it.each([
    [520, 520], ['520', 520], ['300,5', 300.5], ['1.250', 1250], ['1,250', 1250], ['1.234,5', 1234.5],
    ['1,234.5', 1234.5], ['1 234', 1234], ['520 m²', 520], ['0,75', 0.75], ['12.5', 12.5], ['', null], ['abc', null],
  ])('%s -> %s', (input, out) => expect(parseNumber(input as string | number)).toBe(out));
});

async function toBuffer(wb: ExcelJS.Workbook) {
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe('any Excel: header detection and zone update', () => {
  it('finds a German header under title rows and plans updates', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Raumprogramm');
    ws.addRow(['Raumprogramm Werk Nord']); ws.addRow([]); ws.addRow([]);
    ws.addRow(['Kürzel', 'Bezeichnung', 'Flächenart', 'Fläche [m²]']);
    ws.addRow(['GR', 'Goods receipt', 'Lager', 250]);
    ws.addRow(['RM', 'Raw material store', 'Storage', 420]);
    ws.addRow(['KA', 'Kantine', 'Nebenfläche', '1.250']);
    ws.addRow(['', 'Summe', '', 1920]);
    const sheets = readWorkbook(await toBuffer(wb));
    const rows = sheets.find(s => s.name === 'Raumprogramm')!.rows;
    const g = guessHeader(rows);
    expect(g.header).toBe(3);
    expect(g.mapping).toEqual({ code: 0, name: 1, type: 2, area: 3 });
    const { items, skipped } = readRows(rows, g.header, g.mapping, 1);
    expect(items.map(i => i.area)).toEqual([250, 420, 1250]);
    expect(skipped[0].reason).toBe('total row');
    const p = exampleProject();
    const plan = planImport(p, items);
    expect(plan.changes.map(c => c.kind)).toEqual(['update', 'same', 'new']);
    const after = applyImport(p, plan, true, () => '#000000');
    expect(after.zones.find(z => z.code === 'GR')!.target).toBe(250);
    expect(after.zones.some(z => z.code === 'KA')).toBe(true);
    expect(after.zones.some(z => z.code === 'MA')).toBe(false);          // removed: not in the Excel
    expect(after.products.every(pr => pr.route.every(id => after.zones.some(z => z.id === id)))).toBe(true);
  });
});

describe('brief template', () => {
  it('round-trips: template -> filled -> project with layout', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildTemplate('Test brief'));
    expect(wb.worksheets.map(s => s.name)).toEqual(['Instructions', 'Lists', 'Project', 'Areas', 'Flows']);

    const prj = wb.getWorksheet('Project')!;
    prj.eachRow(r => {
      const k = String(r.getCell(1).value ?? '');
      if (k === 'Project name') r.getCell(2).value = 'Test plant';
      if (k === 'Client') r.getCell(2).value = 'ACME';
      if (k === 'Phase to lay out') r.getCell(2).value = 'Phase 2';
    });
    const ar = wb.getWorksheet('Areas')!;
    const col = (k: string) => AREA_COLUMNS.findIndex(c => c.key === k) + 1;
    const rows: (string | number | null)[][] = [
      ['A-01', 'Line', 'Assembly line', 'Assembly', 'ISO 8', 400, null, 600, 4, 6, 8, 'A-02', ''],
      ['A-02', 'Line', 'Test', 'Production', '', 150, 200, null, 2, null, null, '', ''],
      ['S-01', 'Support', 'Warehouse', 'Storage', '', 500, null, null, null, null, null, '', ''],
      ['S-02', 'Support', 'Future option', 'Storage', '', 0, 0, 300, null, null, null, '', ''],
      ['S-03', 'Support', 'Odd type', 'Something', '', 50, null, null, null, null, null, 'X-99', ''],
    ];
    rows.forEach((r, i) => r.forEach((v, k) => { if (v !== null) ar.getRow(5 + i).getCell(k + 1).value = v; }));
    expect(col('a1')).toBe(6);
    const fl = wb.getWorksheet('Flows')!;
    const fr = fl.getRow(5);
    ['Product A', 10000, 20, 'S-01 > A-01 > A-02 > Z-00'].forEach((v, k) => { fr.getCell(k + 1).value = v; });
    expect(FLOW_COLUMNS.length).toBe(5);

    const sheets = readWorkbook(await toBuffer(wb));
    expect(isTemplate(sheets)).toBe(true);
    const brief = readBrief(sheets);
    expect(brief.areas).toHaveLength(5);
    const r = briefToProject(brief, 'Phase 2');
    const byCode = Object.fromEntries(r.project.zones.map(z => [z.code, z]));
    expect(byCode['A-01'].target).toBe(400);           // Phase 2 empty: same as Launch
    expect(byCode['A-01'].positions).toBe(6);
    expect(byCode['A-02'].target).toBe(200);
    expect(byCode['S-02']).toBeUndefined();            // 0 m² in Phase 2: future option
    expect(r.skipped.some(s => s.includes('S-02'))).toBe(true);
    expect(byCode['S-03'].type).toBe('Unbestimmt');
    expect(r.warnings.some(w => w.includes('Something'))).toBe(true);
    expect(r.warnings.some(w => w.includes('X-99'))).toBe(true);
    expect(r.warnings.some(w => w.includes('Z-00'))).toBe(true);
    expect(r.project.products[0].route).toHaveLength(3);
    expect(r.project.meta?.client).toBe('ACME');
    expect(r.assumptions.some(a => a.startsWith('Factory size proposed'))).toBe(true);
    expect(r.fits).toBe(true);
    expect(layoutIssues(r.project).filter(i => i.level === 'error')).toEqual([]);
    const p3 = briefToProject(brief, 'Phase 3').project.zones;
    expect(p3.find(z => z.code === 'A-01')!.target).toBe(600);
    expect(p3.find(z => z.code === 'S-02')!.target).toBe(300);
  });

  it('still reads the 1.0 project labels', () => {
    const brief = readBrief([
      { name: 'Project', rows: [[], [], [], ['Field', 'Value'], ['Hall width X (m)', 80], ['Hall length Y (m)', 50], ['Aisle width between zone rows (m)', 2]] },
      { name: 'Areas', rows: [[], [], [], AREA_COLUMNS.map(c => c.label), ['A-01', '', 'Hall', 'Production', '', 100]] },
    ]);
    expect(brief.project).toMatchObject({ width: 80, length: 50, aisle: 2 });
    const p = briefToProject(brief, 'Launch').project;
    expect(p.hall).toMatchObject({ width: 80, length: 50 });
    expect(p.aisle).toBe(2);
  });
});
