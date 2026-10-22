import { GroupBy, LayoutSettings, ShapeType } from '../lib/model';
import { NumInput } from './fields';

// Building shape icons (rotation 0, flow starts at the arrow)
const ICON: Record<ShapeType, string> = {
  I: 'M3 6h18v12H3z',
  L: 'M3 3h7v11h11v7H3z',
  U: 'M3 3h6v11h6V3h6v18H3z',
  S: 'M3 3h18v5H9v3h12v10H3v-5h12v-3H3z',
};
const NAMES: Record<ShapeType, string> = { I: 'I shape: one straight hall', L: 'L shape: two wings', U: 'U shape: three wings', S: 'S shape: three bands with connectors' };

export default function ShapeControls({ value, aisle, wingUsed, size, onChange, onFit }: {
  value: LayoutSettings; aisle: number; wingUsed?: number; size: { width: number; length: number };
  onChange: (patch: Partial<LayoutSettings>, aisle?: number) => void; onFit: () => void;
}) {
  const v = value;
  return (
    <div className="card shape-card">
      <h3>Factory shape</h3>
      <div className="shape-row">
        <div className="seg shapes" role="group" aria-label="Building shape">
          {(['I', 'L', 'U', 'S'] as ShapeType[]).map(s => (
            <button key={s} className={v.shape === s ? 'on' : ''} aria-pressed={v.shape === s} title={NAMES[s]} onClick={() => onChange({ shape: s })}>
              <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" style={{ transform: `rotate(${-v.rot}deg)` }}><path d={ICON[s]} fill="currentColor" /></svg>
              <span>{s}</span>
            </button>
          ))}
        </div>
        <button className="rot" title="Rotate the shape by 90°" onClick={() => onChange({ rot: ((v.rot + 90) % 360) as LayoutSettings['rot'] })}>⟲ {v.rot}°</button>
      </div>

      <div className="fit-row">
        <span className="muted small">Factory {size.width} × {size.length} m</span>
        <button onClick={onFit} title="Outer size with balanced wings for this shape, just large enough for all zones">Fit factory size to shape</button>
      </div>

      {v.shape !== 'I' && (
        <div className="field">
          <span>Wing width</span>
          <div className="with-unit">
            <label className="check"><input type="checkbox" checked={v.wing === null} onChange={e => onChange({ wing: e.target.checked ? null : wingUsed ?? 20 })} /> Auto</label>
            {v.wing === null
              ? <output>{wingUsed !== undefined ? `${wingUsed} m` : '–'}</output>
              : <><NumInput value={v.wing} min={2} step={0.5} onChange={n => onChange({ wing: n })} /><em>m</em></>}
          </div>
        </div>
      )}

      <div className="field">
        <span>Group zones by</span>
        <select value={v.groupBy} onChange={e => onChange({ groupBy: e.target.value as GroupBy })}>
          <option value="type">Area type</option>
          <option value="stream">Stream / department</option>
          <option value="flow">Flow order only</option>
        </select>
      </div>
      <label className="check"><input type="checkbox" checked={v.separate} disabled={v.groupBy === 'flow'} onChange={e => onChange({ separate: e.target.checked })} /> Separate the groups (each group starts a new lane)</label>

      <div className="field">
        <span>Aisle between lanes</span>
        <div className="with-unit"><NumInput value={aisle} min={0} step={0.5} onChange={n => onChange({}, n)} /><em>m</em></div>
        <small className="muted">0 = zones touch. Typical: 1.0 m walkway, 3.0–3.5 m carts, 4.0–4.5 m forklifts.</small>
      </div>
    </div>
  );
}
