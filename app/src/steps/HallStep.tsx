import { useState } from 'react';
import { Store } from '../lib/store';
import { NumField } from '../components/fields';
import { fmt } from '../lib/flows';
import { proposeHall } from '../lib/layout';
import { withSizeNote } from '../lib/model';
import BriefStart from '../components/BriefStart';

export default function HallStep({ store, onGenerated }: { store: Store; onGenerated: () => void }) {
  const { project: p, update } = store;
  const [grossUp, setGrossUp] = useState(1.15);
  const [msg, setMsg] = useState('');
  // a new size makes the stored building outline (L / U / S) stale; Auto-arrange in Layout redraws it
  const setHall = (k: 'width' | 'length' | 'height', v: number) =>
    update(q => ({ ...(k === 'height' ? q : withSizeNote(q, null)), hall: { ...q.hall, [k]: v, ...(k === 'height' ? {} : { footprint: undefined, wing: undefined }) } }));
  const total = p.zones.reduce((s, z) => s + z.target, 0);
  const hallArea = p.hall.width * p.hall.length;

  const propose = () => {
    const h = proposeHall(p, grossUp);
    update(q => ({ ...withSizeNote(q, `Factory size proposed: ${h.width} × ${h.length} m (net area × ${grossUp}).`), hall: { ...q.hall, ...h, footprint: undefined, wing: undefined } }));
    setMsg(`Proposed ${h.width} × ${h.length} m from ${fmt(total)} m² net × ${grossUp}, enlarged until a rectangular layout fits. Arrange the zones in the Layout step.`);
  };

  return (
    <div className="step-body narrow">
      <h2>Factory size configuration</h2>
      <p className="lead">Size of the factory building. All dimensions are in metres. For L, U and S shapes this is the outer box; the shape itself is chosen in the Layout step.</p>

      <BriefStart store={store} onGenerated={onGenerated} />

      <div className="card form">
        <label className="field wide">
          <span>Project name</span>
          <input value={p.name} onChange={e => update(q => ({ ...q, name: e.target.value }))} />
        </label>
        <NumField label="Factory width (X, west–east)" unit="m" value={p.hall.width} min={5} onChange={v => setHall('width', v)} />
        <NumField label="Factory length (Y, south–north)" unit="m" value={p.hall.length} min={5} onChange={v => setHall('length', v)} />
        <NumField label="Clear height" unit="m" value={p.hall.height} min={2} onChange={v => setHall('height', v)} />
      </div>

      <div className="card">
        <h3>Size from the areas</h3>
        <p className="muted">Proposes the smallest rectangular factory (3:2) that holds all zones, from the total net area times a gross-up factor.</p>
        <div className="row">
          <NumField label="Gross-up factor" value={grossUp} min={1} step={0.01} onChange={setGrossUp} />
          <button disabled={!total} onClick={propose} style={{ alignSelf: 'flex-end' }}>Propose size</button>
        </div>
        {msg && <div className="note" style={{ marginTop: 10 }}>{msg}</div>}
      </div>

      <div className="stats">
        <div><span>Factory area</span><b>{fmt(hallArea)} m²</b></div>
        <div><span>Area required by zones</span><b>{fmt(total)} m²</b></div>
        <div><span>Occupancy</span><b className={total > hallArea ? 'bad' : ''}>{hallArea ? Math.round(100 * total / hallArea) : 0} %</b></div>
      </div>
    </div>
  );
}
