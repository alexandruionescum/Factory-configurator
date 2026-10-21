// Project data model. All lengths in metres, areas in m², plan origin = hall south-west corner,
// X to the east, Y to the north (same orientation as visTABLE; export converts to mm).

// Area type keys are the internal visTABLE values (German); never use "ignorieren".
export type AreaType = 'Fertigung' | 'Montage' | 'Lager' | 'Transport' | 'Nebenfläche' | 'Verwaltung' | 'Unbestimmt';

export const AREA_TYPES: { key: AreaType; label: string; color: string; aliases: string[] }[] = [
  { key: 'Fertigung', label: 'Production', color: '#F4A15D', aliases: ['production', 'productie', 'producție', 'fertigung', 'manufacturing'] },
  { key: 'Montage', label: 'Assembly', color: '#F9C9A3', aliases: ['assembly', 'asamblare', 'montaj', 'montage'] },
  { key: 'Lager', label: 'Storage', color: '#A9ACB4', aliases: ['storage', 'depozitare', 'lager', 'warehouse'] },
  { key: 'Transport', label: 'Transportation / aisle', color: '#D4D7DD', aliases: ['transportation', 'transport', 'culoar', 'aisle'] },
  { key: 'Nebenfläche', label: 'Auxiliary', color: '#C2B8AC', aliases: ['auxiliary', 'auxiliar', 'nebenflache', 'nebenfläche'] },
  { key: 'Verwaltung', label: 'Administration', color: '#8A8E98', aliases: ['administration', 'administrativ', 'verwaltung', 'office'] },
  { key: 'Unbestimmt', label: 'Unspecified', color: '#EFF1F6', aliases: ['unspecified', 'nespecificat', 'unbestimmt'] },
];

export const areaType = (k: AreaType) => AREA_TYPES.find(t => t.key === k)!;

export function matchAreaType(text: string): AreaType | null {
  const s = text.trim().toLowerCase();
  if (!s) return null;
  return AREA_TYPES.find(t => t.label.toLowerCase() === s || t.aliases.includes(s))?.key ?? null;
}

export interface Rect { x: number; y: number; w: number; l: number }

export interface Hall {
  width: number; length: number; height: number;  // bounding box of the building
  footprint?: Rect[];  // building outline for L / U / S shapes (non-overlapping rectangles); none = full box
  wing?: number;       // wing width used by the last arrangement (L / U / S)
}

export type ShapeType = 'I' | 'L' | 'U' | 'S';
export type GroupBy = 'stream' | 'type' | 'flow';
export interface LayoutSettings {
  shape: ShapeType;
  rot: 0 | 90 | 180 | 270;
  wing: number | null;   // wing width of L / U / S in m; null = sized from the total area
  groupBy: GroupBy;
  separate: boolean;     // each group starts on a new lane
}
export const defaultLayout = (): LayoutSettings => ({ shape: 'I', rot: 0, wing: null, groupBy: 'stream', separate: false });

export interface Zone {
  id: string;
  code: string;          // short ID, e.g. "MA"
  name: string;
  type: AreaType;
  target: number;        // required area from the brief, m²
  x: number; y: number;  // south-west corner, m
  w: number; l: number;  // extent along X / along Y, m
  color: string;         // #RRGGBB
  fixedArea: boolean;    // resizing one side keeps the area
  placed: boolean;
  // from the brief template (optional)
  stream?: string;       // department / stream; zones of one stream are kept together
  adjacent?: string[];   // codes of zones that must touch this one
  positions?: number;    // workplaces / equipment positions in the chosen phase
  notes?: string;
}

export interface Product {
  id: string;
  name: string;
  color: string;
  volume: number;        // pieces per year
  perContainer: number;  // pieces per transport (load carrier)
  route: string[];       // zone ids in process order
}

export interface Project {
  schema: 1;
  name: string;
  rev: number;           // output version number used in file names (vNN)
  hall: Hall;
  aisle: number;         // aisle width between block rows, m
  zones: Zone[];
  products: Product[];
  meta?: ProjectMeta;
  layout?: LayoutSettings;
}

export interface ProjectMeta {
  client?: string;
  site?: string;
  preparedBy?: string;
  date?: string;
  phase?: string;
  assumptions?: string[]; // values the configurator had to assume; listed in the report
}

export const SNAP = 0.05; // 5 cm grid, as recommended for visTABLE block edges

export const snap = (v: number, s = SNAP) => Number((Math.round(v / s) * s).toFixed(3));
export const uid = () => Math.random().toString(36).slice(2, 10);
export const zoneLabel = (z: Zone) => (z.code ? `${z.code} ${z.name}` : z.name);
export const zoneArea = (z: Zone) => z.w * z.l;
export const zoneCenter = (z: Zone) => ({ x: z.x + z.w / 2, y: z.y + z.l / 2 });

// EFESO palette: charcoal, orange, deep bronze, bronze, slate, taupe
const PRODUCT_COLORS = ['#3B3D43', '#EE6B00', '#8F490E', '#BF6113', '#6A6E79', '#7C7062'];
export const productColor = (i: number) => PRODUCT_COLORS[i % PRODUCT_COLORS.length];

export function newZone(partial: Partial<Zone> = {}): Zone {
  const type = partial.type ?? 'Fertigung';
  const target = partial.target ?? 100;
  const side = snap(Math.sqrt(target));
  return {
    id: uid(), code: '', name: 'New zone', type, target,
    x: 0, y: 0, w: side, l: side, color: areaType(type).color, fixedArea: true, placed: false,
    ...partial,
  };
}

export function emptyProject(): Project {
  return { schema: 1, name: 'New project', rev: 1, hall: { width: 60, length: 40, height: 8 }, aisle: 0, zones: [], products: [] };
}

// Demo data so the interface can be tried without a brief. Clearly fictitious.
export function exampleProject(): Project {
  const z = (code: string, name: string, type: AreaType, target: number) => newZone({ code, name, type, target });
  const zones = [
    z('GR', 'Goods receipt', 'Lager', 200),
    z('RM', 'Raw material store', 'Lager', 420),
    z('MA', 'Machining', 'Fertigung', 520),
    z('WE', 'Welding', 'Fertigung', 300),
    z('PA', 'Painting', 'Fertigung', 260),
    z('AS', 'Assembly', 'Montage', 460),
    z('QC', 'Quality control', 'Nebenfläche', 120),
    z('FG', 'Finished goods store', 'Lager', 300),
    z('SH', 'Shipping', 'Lager', 200),
    z('OF', 'Production offices', 'Verwaltung', 150),
  ];
  const id = (code: string) => zones.find(q => q.code === code)!.id;
  return {
    schema: 1, name: 'Example (fictitious data)', rev: 1,
    hall: { width: 60, length: 54, height: 9 }, aisle: 0, zones,
    products: [
      { id: uid(), name: 'Family A', color: productColor(0), volume: 120000, perContainer: 50,
        route: ['GR', 'RM', 'MA', 'WE', 'PA', 'AS', 'QC', 'FG', 'SH'].map(id) },
      { id: uid(), name: 'Family B', color: productColor(1), volume: 40000, perContainer: 20,
        route: ['GR', 'RM', 'MA', 'AS', 'QC', 'FG', 'SH'].map(id) },
    ],
  };
}

// Replaces the assumption about the factory size (the brief may have proposed one); null removes it.
export function withSizeNote(p: Project, note: string | null): Project {
  const rest = (p.meta?.assumptions ?? []).filter(a => !a.startsWith('Factory size'));
  return { ...p, meta: { ...p.meta, assumptions: note ? [...rest, note] : rest } };
}

// Light shape check for files opened by the user.
export function parseProject(text: string): Project {
  const p = JSON.parse(text);
  if (p?.schema !== 1 || !p.hall || !Array.isArray(p.zones) || !Array.isArray(p.products)) {
    throw new Error('This file is not a Factory Configurator project.');
  }
  return p as Project;
}
