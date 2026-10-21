import { Store } from '../lib/store';
import { NumField } from '../components/fields';
import { fmt } from '../lib/flows';
import BriefStart from '../components/BriefStart';

export default function HallStep({ store, onGenerated }: { store: Store; onGenerated: () => void }) {
  const { project: p, update } = store;
  const setHall = (k: 'width' | 'length' | 'height', v: number) => update(q => ({ ...q, hall: { ...q.hall, [k]: v } }));
  const total = p.zones.reduce((s, z) => s + z.target, 0);
  const hallArea = p.hall.width * p.hall.length;

  return (
    <div className="step-body narrow">
      <h2>Project and hall</h2>
      <p className="lead">Basic building data. All dimensions are in metres; the export converts them to millimetres for visTABLE.</p>

      <BriefStart store={store} onGenerated={onGenerated} />

      <div className="card form">
        <label className="field wide">
          <span>Project name</span>
          <input value={p.name} onChange={e => update(q => ({ ...q, name: e.target.value }))} />
        </label>
        <NumField label="Hall width (X, west–east)" unit="m" value={p.hall.width} min={5} onChange={v => setHall('width', v)} />
        <NumField label="Hall length (Y, south–north)" unit="m" value={p.hall.length} min={5} onChange={v => setHall('length', v)} />
        <NumField label="Clear height" unit="m" value={p.hall.height} min={2} onChange={v => setHall('height', v)} />
        <NumField label="Aisle width between zone rows" unit="m" value={p.aisle} min={0} step={0.5}
          onChange={v => update(q => ({ ...q, aisle: v }))} />
      </div>

      <div className="card hint">
        <b>Typical aisle widths</b>
        <ul>
          <li>1.0 m: walkway for people</li>
          <li>3.0–3.5 m: transport aisle for carts / pallet trucks</li>
          <li>4.0–4.5 m: aisle for forklifts and large equipment</li>
        </ul>
      </div>

      <div className="stats">
        <div><span>Hall area</span><b>{fmt(hallArea)} m²</b></div>
        <div><span>Area required by zones</span><b>{fmt(total)} m²</b></div>
        <div><span>Occupancy</span><b className={total > hallArea ? 'bad' : ''}>{hallArea ? Math.round(100 * total / hallArea) : 0} %</b></div>
      </div>
    </div>
  );
}
