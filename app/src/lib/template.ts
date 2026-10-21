// The project brief template (.xlsx) that consultants fill in at the client, and its reader.
// Writer and reader live together so the column names cannot drift apart.
import type { DataValidation, Worksheet } from 'exceljs';
import { AREA_TYPES, AreaType, matchAreaType } from './model';
import { Cell, Sheet, parseNumber, text } from './briefImport';

export const TEMPLATE_VERSION = '1.1';
export const PHASES = ['Launch', 'Phase 2', 'Phase 3'] as const;
export type Phase = typeof PHASES[number];

export const PROJECT_FIELDS = [
  { key: 'name', label: 'Project name', help: 'Shown on the layout and in file names.' },
  { key: 'client', label: 'Client', help: '' },
  { key: 'site', label: 'Site / location', help: '' },
  { key: 'preparedBy', label: 'Prepared by', help: 'Consultant who filled in the brief.' },
  { key: 'date', label: 'Date', help: 'YYYY-MM-DD' },
  { key: 'phase', label: 'Phase to lay out', help: 'Launch, Phase 2 or Phase 3: which area column is drawn.' },
  { key: 'width', label: 'Factory width X (m)', help: 'Leave empty: the configurator proposes a size from the total area.' },
  { key: 'length', label: 'Factory length Y (m)', help: 'Leave empty together with the width.' },
  { key: 'height', label: 'Clear height (m)', help: 'Default 8 m.' },
  { key: 'grossUp', label: 'Gross-up factor', help: 'Used only when the factory size is empty. Default 1.15.' },
] as const;

export const AREA_COLUMNS = [
  { key: 'id', label: 'ID *', width: 10, help: 'Unique, short (e.g. CR-03). Links Excel, layout and visTABLE.' },
  { key: 'stream', label: 'Stream / department', width: 24, help: 'Zones of one stream are kept together.' },
  { key: 'name', label: 'Area name *', width: 34, help: '' },
  { key: 'type', label: 'Area type *', width: 22, help: 'Choose from the list.' },
  { key: 'class', label: 'Area class / environment', width: 20, help: 'e.g. ISO 8, ESD, general.' },
  { key: 'a1', label: 'Launch net area (m²) *', width: 14, help: 'Net area incl. local clearance and operator access.' },
  { key: 'a2', label: 'Phase 2 net area (m²)', width: 14, help: 'Total in Phase 2. Empty = same as Launch.' },
  { key: 'a3', label: 'Phase 3 net area (m²)', width: 14, help: 'Total in Phase 3. Empty = same as Phase 2.' },
  { key: 'p1', label: 'Positions launch', width: 11, help: 'Workplaces / equipment positions.' },
  { key: 'p2', label: 'Positions phase 2', width: 11, help: '' },
  { key: 'p3', label: 'Positions phase 3', width: 11, help: '' },
  { key: 'adjacent', label: 'Adjacent to (IDs)', width: 18, help: 'IDs that must touch this area, comma separated.' },
  { key: 'notes', label: 'Notes', width: 40, help: 'Equipment, access, flow remarks.' },
] as const;

export const FLOW_COLUMNS = [
  { key: 'name', label: 'Product family / flow *', width: 28, help: '' },
  { key: 'volume', label: 'Annual volume (pcs) *', width: 16, help: '' },
  { key: 'perTransport', label: 'Pieces per transport *', width: 16, help: 'Load carrier quantity.' },
  { key: 'route', label: 'Route (area IDs in order) *', width: 60, help: 'e.g. S-01 > S-03 > CR-02 > CR-03' },
  { key: 'notes', label: 'Notes', width: 40, help: '' },
] as const;

const ORANGE = 'FFEE6B00', ORANGE4 = 'FFFDF2E8', GREY = 'FF6A6E79', LINE = 'FFD4D7DD';
const ROWS = 300;
const HEADER_ROW = 4;

const FONT = 'Arial';

function titleBlock(ws: Worksheet, title: string, sub: string, row = 1) {
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  ws.getCell(`A${row}`).value = title;
  ws.getCell(`A${row}`).font = { name: FONT, bold: true, size: 15 };
  ws.getCell(`A${row + 1}`).value = sub;
  ws.getCell(`A${row + 1}`).font = { name: FONT, italic: true, color: { argb: GREY } };
}

function validate(ws: Worksheet, cols: string[], dv: DataValidation) {
  for (let r = HEADER_ROW + 1; r <= HEADER_ROW + ROWS; r++) for (const c of cols) ws.getCell(`${c}${r}`).dataValidation = dv;
}

function header(ws: Worksheet, cols: readonly { label: string; width: number; help: string }[]) {
  const r = ws.getRow(HEADER_ROW);
  cols.forEach((c, i) => {
    const cell = r.getCell(i + 1);
    cell.value = c.label;
    cell.font = { name: FONT, bold: true, color: { argb: 'FF000000' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } };
    cell.alignment = { wrapText: true, vertical: 'middle' };
    ws.getColumn(i + 1).width = c.width;
  });
  r.height = 32;
  ws.views = [{ state: 'frozen', ySplit: HEADER_ROW }];
  for (let i = HEADER_ROW + 1; i <= HEADER_ROW + ROWS; i++)
    cols.forEach((_, k) => { ws.getRow(i).getCell(k + 1).border = { bottom: { style: 'thin', color: { argb: LINE } } }; });
}

const col = (i: number) => String.fromCharCode(65 + i);

// logoPng: base64 PNG shown on the Instructions sheet (branded builds only)
export async function buildTemplate(title: string, logoPng?: string): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = title;

  const ins = wb.addWorksheet('Instructions');
  if (logoPng) {
    const img = wb.addImage({ base64: logoPng, extension: 'png' });
    ins.addImage(img, { tl: { col: 0, row: 0 }, ext: { width: 176, height: 48 } });
    ins.getRow(1).height = 44;
  }
  titleBlock(ins, title, `Template version ${TEMPLATE_VERSION}. Fill in Project, Areas and Flows, then load the file in the configurator (step 1, Import brief).`, logoPng ? 2 : 1);
  const rules: [string, string][] = [
    ['1. One row per area', 'Every room, cell, store or zone is one row on the Areas sheet. The ID links the Excel, the layout and visTABLE: keep it unique and short (e.g. CR-03, S-01).'],
    ['2. Net areas', 'Areas are net m² and already include local equipment clearance and operator / trolley access. Do not invent values: leave a cell empty if it is not known yet.'],
    ['3. Phases', 'Phase 2 and Phase 3 columns hold the TOTAL net area in that phase. Empty = unchanged. 0 = not built in that phase (future option, not drawn).'],
    ['4. Circulation', 'Areas are drawn touching each other. List main aisles that belong to the brief as areas with type "Transportation / aisle". Extra aisles between zones are set later, in the Layout step.'],
    ['5. Flows', 'One row per product family. The route is the list of area IDs in process order separated by ">". Pieces per transport is the quantity on one load carrier.'],
    ['6. Adjacency', 'Adjacent to: IDs of areas that must touch this area, separated by commas. The configurator checks this on the layout.'],
    ['7. Hall', 'Leave the hall size empty to let the configurator propose one from total area x gross-up factor. The proposal is listed as an assumption in the report.'],
    ['Used now', 'ID, stream, name, type, net area of the chosen phase, positions, adjacency, flows, factory size. Area class and notes go to the report. The factory shape (I, L, U, S) is chosen in the Layout step.'],
  ];
  const top = logoPng ? 5 : 4;
  rules.forEach(([a, b], i) => {
    const r = ins.getRow(top + i);
    r.getCell(1).value = a; r.getCell(1).font = { name: FONT, bold: true }; r.getCell(1).alignment = { vertical: 'top' };
    r.getCell(2).value = b; r.getCell(2).font = { name: FONT }; r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    r.getCell(1).border = r.getCell(2).border = { bottom: { style: 'thin', color: { argb: LINE } } };
    r.height = 34;
  });
  ins.getColumn(1).width = 38; ins.getColumn(2).width = 110;
  // column guide (instead of cell comments, which some tools cannot read back)
  let g = top + rules.length + 1;
  ins.getCell(`A${g}`).value = 'Columns'; ins.getCell(`A${g}`).font = { name: FONT, bold: true, color: { argb: ORANGE } };
  for (const [sheet, cols] of [['Areas', AREA_COLUMNS], ['Flows', FLOW_COLUMNS]] as const)
    for (const c of cols) {
      g++;
      ins.getCell(`A${g}`).value = `${sheet}: ${c.label}`; ins.getCell(`A${g}`).font = { name: FONT, bold: true };
      ins.getCell(`B${g}`).value = c.help || '–'; ins.getCell(`B${g}`).font = { name: FONT, color: { argb: GREY } };
    }
  const ex = g + 2;
  ins.getCell(`A${ex}`).value = 'Example';
  ins.getCell(`A${ex}`).font = { name: FONT, bold: true, color: { argb: ORANGE } };
  const exRows: Cell[][] = [
    ['Areas', 'S-01 | Shared support | Goods receiving | Storage | General | 90 | | | 2 | | | S-02 | Dock side'],
    ['', 'CR-03 | Cleanroom | Kitting and preparation | Production | ISO 8 | 112 | 112 | 140 | 2 | 4 | 6 | CR-02, CR-04 |'],
    ['Flows', 'Product A | 12500 | 25 | S-01 > S-02 > S-03 > CR-02 > CR-03 > CR-04 | '],
  ];
  exRows.forEach((r, i) => { ins.getCell(`A${ex + 1 + i}`).value = r[0]; ins.getCell(`B${ex + 1 + i}`).value = r[1]; ins.getCell(`A${ex + 1 + i}`).font = { name: FONT, bold: true }; ins.getCell(`B${ex + 1 + i}`).font = { name: FONT, color: { argb: GREY } }; });

  const lists = wb.addWorksheet('Lists', { state: 'hidden' });
  lists.getCell('A1').value = 'Area type';
  AREA_TYPES.forEach((t, i) => { lists.getCell(`A${i + 2}`).value = t.label; });
  lists.getCell('B1').value = 'Phase';
  PHASES.forEach((p, i) => { lists.getCell(`B${i + 2}`).value = p; });

  const prj = wb.addWorksheet('Project');
  titleBlock(prj, 'Project', 'Column B is filled in. Empty values get defaults; every default is listed as an assumption.');
  prj.getRow(HEADER_ROW).values = ['Field', 'Value', 'Help'];
  prj.getRow(HEADER_ROW).eachCell(c => { c.font = { name: FONT, bold: true, color: { argb: 'FF000000' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } }; });
  PROJECT_FIELDS.forEach((f, i) => {
    const r = prj.getRow(HEADER_ROW + 1 + i);
    r.getCell(1).value = f.label; r.getCell(1).font = { name: FONT, bold: true };
    r.getCell(2).font = { name: FONT };
    [1, 2, 3].forEach(k => { r.getCell(k).border = { bottom: { style: 'thin', color: { argb: LINE } } }; });
    r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE4 } };
    r.getCell(3).value = f.help; r.getCell(3).font = { name: FONT, color: { argb: GREY } };
    if (f.key === 'phase') {
      r.getCell(2).value = 'Launch';
      r.getCell(2).dataValidation = { type: 'list', allowBlank: true, formulae: [`Lists!$B$2:$B$${PHASES.length + 1}`] };
    }
    if (['width', 'length', 'height', 'aisle', 'grossUp'].includes(f.key))
      r.getCell(2).dataValidation = { type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0], showErrorMessage: true, error: 'Enter a number.' };
  });
  prj.getColumn(1).width = 34; prj.getColumn(2).width = 30; prj.getColumn(3).width = 80;

  const ar = wb.addWorksheet('Areas');
  titleBlock(ar, 'Areas', 'One row per area. * = required. Hover a column heading for help.');
  header(ar, AREA_COLUMNS);
  const typeCol = col(AREA_COLUMNS.findIndex(c => c.key === 'type'));
  validate(ar, [typeCol], {
    type: 'list', allowBlank: true, formulae: [`Lists!$A$2:$A$${AREA_TYPES.length + 1}`], showErrorMessage: true, error: 'Choose an area type from the list.',
  });
  const first = col(AREA_COLUMNS.findIndex(c => c.key === 'a1')), last = col(AREA_COLUMNS.findIndex(c => c.key === 'p3'));
  // running totals per phase above the header (row 3); the reader ignores rows above the header
  const lab = ar.getCell(`${col(AREA_COLUMNS.findIndex(c => c.key === 'a1') - 1)}3`);
  lab.value = 'Total net m²'; lab.font = { name: FONT, bold: true }; lab.alignment = { horizontal: 'right' };
  for (const k of ['a1', 'a2', 'a3']) {
    const c = col(AREA_COLUMNS.findIndex(x => x.key === k));
    const cell = ar.getCell(`${c}3`);
    cell.value = { formula: `SUM(${c}${HEADER_ROW + 1}:${c}${HEADER_ROW + ROWS})` };
    cell.font = { name: FONT, bold: true }; cell.numFmt = '#,##0';
  }
  const numCols: string[] = [];
  for (let c = first.charCodeAt(0); c <= last.charCodeAt(0); c++) numCols.push(String.fromCharCode(c));
  validate(ar, numCols, {
    type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0], showErrorMessage: true, error: 'Enter a number (m² or count).',
  });

  const fl = wb.addWorksheet('Flows');
  titleBlock(fl, 'Flows', 'One row per product family. Route = area IDs in process order, separated by ">".');
  header(fl, FLOW_COLUMNS);
  validate(fl, ['B', 'C'], {
    type: 'decimal', operator: 'greaterThan', allowBlank: true, formulae: [0], showErrorMessage: true, error: 'Enter a number greater than 0.',
  });

  wb.calcProperties = { fullCalcOnLoad: true };
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

// ---------- reader ----------

export interface BriefArea {
  row: number; id: string; stream: string; name: string; type: AreaType | null; typeText: string; cls: string;
  areas: (number | null)[]; positions: (number | null)[]; adjacent: string[]; notes: string;
}
export interface BriefFlow { row: number; name: string; volume: number | null; perTransport: number | null; route: string[]; notes: string }
export interface Brief {
  project: Record<string, Cell>;
  areas: BriefArea[];
  flows: BriefFlow[];
  problems: string[];
}

// labels of template 1.0, still read
const OLD_LABELS: Record<string, string> = {
  'hall width x m': 'width', 'hall length y m': 'length', 'gross-up factor for the hall': 'grossUp', 'aisle width between zone rows m': 'aisle',
};

const norm = (s: string) => s.toLowerCase().replace(/[*()²]/g, '').replace(/\s+/g, ' ').trim();
const find = (sheets: Sheet[], name: string) => sheets.find(s => s.name.trim().toLowerCase() === name.toLowerCase());

export const isTemplate = (sheets: Sheet[]) => !!find(sheets, 'Areas') && !!find(sheets, 'Project');

function columns(rows: Cell[][], cols: readonly { key: string; label: string }[]) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const hs = (rows[r] ?? []).map(c => norm(text(c)));
    const idx: Record<string, number> = {};
    cols.forEach(c => { idx[c.key] = hs.indexOf(norm(c.label)); });
    if (Object.values(idx).filter(i => i >= 0).length >= Math.ceil(cols.length / 2)) return { header: r, idx };
  }
  return null;
}

export function readBrief(sheets: Sheet[]): Brief {
  const problems: string[] = [];
  const project: Record<string, Cell> = {};
  const prj = find(sheets, 'Project');
  for (const row of prj?.rows ?? []) {
    const label = norm(text(row[0] ?? null));
    const key = PROJECT_FIELDS.find(p => norm(p.label) === label)?.key ?? OLD_LABELS[label];
    if (key) project[key] = row[1] ?? null;
  }

  const areas: BriefArea[] = [];
  const as = find(sheets, 'Areas')!;
  const ac = columns(as.rows, AREA_COLUMNS);
  if (!ac) problems.push('The Areas sheet has no header row with the template columns.');
  else {
    const g = (r: Cell[], k: string) => (ac.idx[k] >= 0 ? r[ac.idx[k]] ?? null : null);
    for (let i = ac.header + 1; i < as.rows.length; i++) {
      const r = as.rows[i] ?? [];
      const id = text(g(r, 'id')), name = text(g(r, 'name'));
      if (!id && !name) continue;
      const typeText = text(g(r, 'type'));
      areas.push({
        row: i + 1, id, name: name || id, stream: text(g(r, 'stream')), typeText, type: typeText ? matchAreaType(typeText) : null,
        cls: text(g(r, 'class')), notes: text(g(r, 'notes')),
        areas: ['a1', 'a2', 'a3'].map(k => parseNumber(g(r, k))),
        positions: ['p1', 'p2', 'p3'].map(k => parseNumber(g(r, k))),
        adjacent: text(g(r, 'adjacent')).split(/[,;/]+/).map(s => s.trim()).filter(Boolean),
      });
    }
  }

  const flows: BriefFlow[] = [];
  const fs = find(sheets, 'Flows');
  const fc = fs ? columns(fs.rows, FLOW_COLUMNS) : null;
  if (fs && fc) {
    const g = (r: Cell[], k: string) => (fc.idx[k] >= 0 ? r[fc.idx[k]] ?? null : null);
    for (let i = fc.header + 1; i < fs.rows.length; i++) {
      const r = fs.rows[i] ?? [];
      const name = text(g(r, 'name')), route = text(g(r, 'route'));
      if (!name && !route) continue;
      flows.push({
        row: i + 1, name: name || `Flow ${flows.length + 1}`, volume: parseNumber(g(r, 'volume')), perTransport: parseNumber(g(r, 'perTransport')),
        route: route.split(/\s*(?:>|→|->|,|;)\s*/).map(s => s.trim()).filter(Boolean), notes: text(g(r, 'notes')),
      });
    }
  }
  return { project, areas, flows, problems };
}

// Net area of a row in a phase: phases are cumulative, an empty cell repeats the previous phase.
export function areaInPhase(a: BriefArea, phase: Phase): number | null {
  const k = PHASES.indexOf(phase);
  let v: number | null = null;
  for (let i = 0; i <= k; i++) if (a.areas[i] !== null) v = a.areas[i];
  return v;
}
export function positionsInPhase(a: BriefArea, phase: Phase): number | null {
  const k = PHASES.indexOf(phase);
  let v: number | null = null;
  for (let i = 0; i <= k; i++) if (a.positions[i] !== null) v = a.positions[i];
  return v;
}

export const phaseOf = (c: Cell): Phase => PHASES.find(p => p.toLowerCase() === text(c).toLowerCase()) ?? 'Launch';
