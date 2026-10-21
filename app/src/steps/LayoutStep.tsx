import { useEffect, useState } from 'react';
import { Store } from '../lib/store';
import { Zone, snap, zoneArea, zoneLabel } from '../lib/model';
import { autoArrange, findFreeSpot, layoutIssues } from '../lib/layout';
import PlanView from '../components/PlanView';
import { NumField } from '../components/fields';
import Issues from '../components/Issues';
import { useAsk } from '../components/Confirm';

export default function LayoutStep({ store }: { store: Store }) {
  const { project: p, update, checkpoint } = store;
  const ask = useAsk();
  const [sel, setSel] = useState<string | null>(null);
  const [showFlows, setShowFlows] = useState(true);
  const [note, setNote] = useState('');
  const [hl, setHl] = useState<string[]>([]);
  const z = p.zones.find(q => q.id === sel) ?? null;
  const issues = layoutIssues(p);

  const change = (id: string, patch: Partial<Zone>, record = true) =>
    update(q => ({ ...q, zones: q.zones.map(o => (o.id === id ? { ...o, ...patch } : o)) }), record);

  const arrange = async () => {
    if (p.zones.some(q => q.placed) && !(await ask({ text: 'Auto-arrange moves all zones. Continue? You can undo it with Ctrl+Z.', ok: 'Auto-arrange' }))) return;
    const r = autoArrange(p);
    update(q => ({ ...q, zones: r.zones }));
    setNote(r.fits
      ? `Zones placed in ${r.rows} row${r.rows === 1 ? '' : 's'}, in flow order, with ${p.aisle} m aisles between rows.`
      : 'The zones do not fit in the hall with the required aisles. They were placed anyway; enlarge the hall or reduce the areas.');
  };

  const rotate = (q: Zone) => change(q.id, { w: q.l, l: q.w });

  const place = (q: Zone) => {
    const spot = findFreeSpot(p, q);
    change(q.id, { ...spot, placed: true });
    setSel(q.id);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!z || (e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'r' || e.key === 'R') rotate(z);
      const step = e.shiftKey ? 1 : 0.05;
      const mv: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      if (mv[e.key]) { e.preventDefault(); change(z.id, { x: snap(z.x + mv[e.key][0]), y: snap(z.y + mv[e.key][1]) }); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  return (
    <div className="split">
      <div className="canvas-pane">
        <div className="toolbar">
          <button className="primary" disabled={!p.zones.length} onClick={arrange}>Auto-arrange</button>
          <label className="check"><input type="checkbox" checked={showFlows} onChange={e => setShowFlows(e.target.checked)} /> Show flows</label>
          <span className="muted small">Drag a zone to move it; the white handles resize it. Arrow keys: 5 cm (Shift: 1 m), R: rotate.</span>
        </div>
        {note && <div className="note">{note}</div>}
        <PlanView project={p} selectedId={sel} onSelect={setSel} showFlows={showFlows} highlight={hl}
          onZoneChange={change} onDragStart={checkpoint} svgId="plan-svg" />
      </div>

      <aside className="side">
        {z ? (
          <div className="card">
            <h3>{zoneLabel(z)}</h3>
            <div className="form two">
              <NumField label="X (SW corner)" unit="m" step={0.05} value={z.x} onChange={v => change(z.id, { x: snap(v) })} />
              <NumField label="Y (SW corner)" unit="m" step={0.05} value={z.y} onChange={v => change(z.id, { y: snap(v) })} />
              <NumField label="Width (X)" unit="m" min={1} value={z.w}
                onChange={v => change(z.id, { w: snap(v), ...(z.fixedArea ? { l: Math.max(snap(z.target / v), 1) } : {}) })} />
              <NumField label="Length (Y)" unit="m" min={1} value={z.l}
                onChange={v => change(z.id, { l: snap(v), ...(z.fixedArea ? { w: Math.max(snap(z.target / v), 1) } : {}) })} />
            </div>
            <p className="muted">Area: <b>{zoneArea(z).toFixed(1)} m²</b> (brief: {z.target} m²)</p>
            <label className="check"><input type="checkbox" checked={z.fixedArea} onChange={e => change(z.id, { fixedArea: e.target.checked })} /> Keep area when resizing</label>
            <div className="row">
              <button onClick={() => rotate(z)}>Rotate 90°</button>
              <button onClick={() => { change(z.id, { placed: false }); setSel(null); }}>Remove from plan</button>
            </div>
          </div>
        ) : (
          <div className="card muted">Select a zone on the plan to edit its position and size.</div>
        )}

        <div className="card">
          <h3>Zones</h3>
          <ul className="zone-list">
            {p.zones.map(q => {
              const dev = q.target ? (zoneArea(q) - q.target) / q.target : 0;
              const pct = Math.round(dev * 100) || 0;
              return (
                <li key={q.id} className={q.id === sel ? 'active' : ''} onClick={() => q.placed && setSel(q.id)}>
                  <i style={{ background: q.color }} />
                  <span>{zoneLabel(q)}</span>
                  {q.placed
                    ? <em className={Math.abs(dev) > 0.05 ? 'bad' : ''}>{pct > 0 ? '+' : ''}{pct} %</em>
                    : <button className="small" onClick={e => { e.stopPropagation(); place(q); }}>Place</button>}
                </li>
              );
            })}
          </ul>
        </div>

        <Issues title="Checks" items={issues} onHover={setHl} />
      </aside>
    </div>
  );
}
