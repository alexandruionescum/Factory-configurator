import { useRef } from 'react';
import { Project, Zone, snap, zoneArea, zoneCenter } from '../lib/model';
import { pairFlows } from '../lib/flows';

// 2D plan in SVG. Coordinates in metres; SVG y = hall length - plan y (plan Y points north).
// Colours are written as attributes (not CSS) so the exported PNG looks the same as the screen.

type Handle = 'move' | 'e' | 'n' | 'ne';

interface Props {
  project: Project;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onZoneChange?: (id: string, patch: Partial<Zone>, record: boolean) => void;
  onDragStart?: () => void;
  showFlows?: boolean;
  highlight?: string[];
  svgId?: string;
}

const M = 4; // margin around the hall, m

export default function PlanView({ project, selectedId, onSelect, onZoneChange, onDragStart, showFlows, highlight = [], svgId }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; h: Handle; x0: number; y0: number; z: Zone } | null>(null);
  const { width: W, length: L } = project.hall;
  const sy = (y: number) => L - y;
  const editable = !!onZoneChange;

  const toPlan = (e: React.PointerEvent) => {
    const pt = svg.current!.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return { x: p.x, y: L - p.y };
  };

  const down = (e: React.PointerEvent, z: Zone, h: Handle) => {
    e.stopPropagation();
    onSelect?.(z.id);
    if (!editable) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = toPlan(e);
    drag.current = { id: z.id, h, x0: p.x, y0: p.y, z };
    onDragStart?.();
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !onZoneChange) return;
    const p = toPlan(e);
    const dx = p.x - d.x0, dy = p.y - d.y0, z = d.z;
    if (d.h === 'move') { onZoneChange(d.id, { x: snap(z.x + dx), y: snap(z.y + dy) }, false); return; }
    let w = z.w, l = z.l;
    if (d.h === 'e' || d.h === 'ne') w = Math.max(snap(z.w + dx), 1);
    if (d.h === 'n' || d.h === 'ne') l = Math.max(snap(z.l + dy), 1);
    if (z.fixedArea && z.target > 0) {
      if (d.h === 'e') l = Math.max(snap(z.target / w), 1);
      if (d.h === 'n') w = Math.max(snap(z.target / l), 1);
    }
    onZoneChange(d.id, { w, l }, false);
  };

  const up = () => { drag.current = null; };

  const flows = showFlows ? pairFlows(project) : [];
  const maxTrips = Math.max(1, ...flows.map(f => f.trips));
  const placed = project.zones.filter(z => z.placed);
  const ext = Math.max(W, L);

  return (
    <svg
      ref={svg} id={svgId} className="plan"
      viewBox={`${-M} ${-M} ${W + 2 * M} ${L + 2 * M}`}
      onPointerMove={move} onPointerUp={up} onPointerLeave={up}
      onPointerDown={() => onSelect?.(null)}
      fontFamily="Arial, Helvetica, sans-serif"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="g1" width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M1 0H0V1" fill="none" stroke="#E6E8ED" strokeWidth="0.03" />
        </pattern>
        <pattern id="g5" width="5" height="5" patternUnits="userSpaceOnUse" y={L % 5}>
          <rect width="5" height="5" fill="url(#g1)" />
          <path d="M5 0H0V5" fill="none" stroke="#D4D7DD" strokeWidth="0.06" />
        </pattern>
        {project.products.map(pr => (
          <marker key={pr.id} id={`arr-${pr.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="2.6" markerHeight="2.6" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={pr.color} />
          </marker>
        ))}
        <marker id="arr-mix" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="2.6" markerHeight="2.6" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="#3B3D43" />
        </marker>
      </defs>

      <rect x={-M} y={-M} width={W + 2 * M} height={L + 2 * M} fill="#FFFFFF" />
      <rect x={0} y={0} width={W} height={L} fill="url(#g5)" stroke="#3B3D43" strokeWidth={ext / 300} />
      <text x={W / 2} y={-1.2} fontSize={ext / 50} textAnchor="middle" fill="#6A6E79">{W} m</text>
      <text x={-1.2} y={L / 2} fontSize={ext / 50} textAnchor="middle" fill="#6A6E79" transform={`rotate(-90 ${-1.2} ${L / 2})`}>{L} m</text>
      <text x={W + 1.5} y={0} fontSize={ext / 45} textAnchor="middle" fill="#6A6E79">N ↑</text>

      {placed.map(z => {
        const sel = z.id === selectedId;
        const hi = highlight.includes(z.id);
        return (
          <rect key={z.id} x={z.x} y={sy(z.y + z.l)} width={z.w} height={z.l} fill={z.color} fillOpacity={0.85}
            stroke={hi ? '#DB2100' : sel ? '#EE6B00' : '#3B3D43'} strokeWidth={sel || hi ? ext / 250 : ext / 600}
            style={{ cursor: editable ? 'move' : 'pointer' }} onPointerDown={e => down(e, z, 'move')} />
        );
      })}

      {flows.map(f => {
        const a = zoneCenter(f.from), b = zoneCenter(f.to);
        const one = f.products.length === 1 ? f.products[0] : null;
        const sw = 0.15 + 0.9 * (f.trips / maxTrips);
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const cut = Math.min(ext / 40, len / 4);
        const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
        return (
          <line key={`${f.from.id}>${f.to.id}`} x1={a.x + ux * cut} y1={sy(a.y + uy * cut)} x2={b.x - ux * cut} y2={sy(b.y - uy * cut)}
            stroke={one ? one.color : '#3B3D43'} strokeOpacity={0.75} strokeWidth={sw} strokeLinecap="round"
            markerEnd={`url(#arr-${one ? one.id : 'mix'})`} pointerEvents="none" />
        );
      })}

      {placed.map(z => {
        const fs = Math.min(Math.max(Math.min(z.w, z.l) / 6, 0.45), ext / 55);
        const cx = z.x + z.w / 2, cy = sy(z.y + z.l / 2);
        const halo = { paintOrder: 'stroke', stroke: '#FFFFFF', strokeWidth: fs * 0.25, strokeOpacity: 0.85 } as const;
        return (
          <g key={z.id} pointerEvents="none" fill="#000000" textAnchor="middle">
            <text x={cx} y={cy - fs * 0.15} fontSize={fs} fontWeight={600} style={halo}>{z.code || z.name}</text>
            <text x={cx} y={cy + fs * 1.05} fontSize={fs * 0.8} style={halo}>{zoneArea(z).toFixed(0)} m²</text>
          </g>
        );
      })}

      {editable && placed.filter(z => z.id === selectedId).map(z => {
        const r = ext / 160;
        const hs: [Handle, number, number][] = [
          ['e', z.x + z.w, sy(z.y + z.l / 2)],
          ['n', z.x + z.w / 2, sy(z.y + z.l)],
          ['ne', z.x + z.w, sy(z.y + z.l)],
        ];
        return hs.map(([h, x, y]) => (
          <circle key={h} cx={x} cy={y} r={r} fill="#FFFFFF" stroke="#EE6B00" strokeWidth={r / 2.5}
            style={{ cursor: h === 'e' ? 'ew-resize' : h === 'n' ? 'ns-resize' : 'nesw-resize' }}
            onPointerDown={e => down(e, z, h)} />
        ));
      })}
    </svg>
  );
}
