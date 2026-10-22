import { Store } from '../lib/store';
import { Product, productColor, uid, zoneLabel } from '../lib/model';
import { flowChecks, fmt, pairFlows, segments, tripsPerYear } from '../lib/flows';
import PlanView from '../components/PlanView';
import Issues from '../components/Issues';
import { NumInput } from '../components/fields';

const Chevron = ({ left }: { left?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d={left ? 'M10 3 5 8l5 5' : 'M6 3l5 5-5 5'} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export default function FlowsStep({ store }: { store: Store }) {
  const { project: p, update } = store;
  const byId = new Map(p.zones.map(z => [z.id, z]));
  const setPr = (id: string, patch: Partial<Product>) =>
    update(q => ({ ...q, products: q.products.map(pr => (pr.id === id ? { ...pr, ...patch } : pr)) }));
  const addProduct = () => update(q => ({
    ...q,
    products: [...q.products, { id: uid(), name: `Family ${String.fromCharCode(65 + q.products.length)}`, color: productColor(q.products.length), volume: 0, perContainer: 1, route: [] }],
  }));
  const moveStep = (pr: Product, i: number, d: number) => {
    const r = [...pr.route]; const j = i + d;
    if (j < 0 || j >= r.length) return;
    [r[i], r[j]] = [r[j], r[i]]; setPr(pr.id, { route: r });
  };

  const segs = segments(p);
  const pairs = pairFlows(p);
  const totalWork = segs.reduce((s, x) => s + x.work, 0);

  return (
    <div className="split">
      <div className="scroll-pane">
        <h2>Material flows</h2>
        <p className="lead">For each product family: annual volume, pieces per transport and the route through the zones.
          Transports per year = volume / pieces per transport, rounded up.</p>

        {p.products.map(pr => (
          <div className="card product" key={pr.id}>
            <div className="product-head">
              <input type="color" value={pr.color} onChange={e => setPr(pr.id, { color: e.target.value })} />
              <input className="pname" value={pr.name} onChange={e => setPr(pr.id, { name: e.target.value })} />
              <button className="icon" title="Delete family" onClick={() => update(q => ({ ...q, products: q.products.filter(x => x.id !== pr.id) }))}>✕</button>
            </div>
            <div className="form three">
              <label className="field"><span>Annual volume (pcs)</span><NumInput value={pr.volume} min={0} onChange={v => setPr(pr.id, { volume: v })} /></label>
              <label className="field"><span>Pieces per transport</span><NumInput value={pr.perContainer} min={1} onChange={v => setPr(pr.id, { perContainer: v })} /></label>
              <label className="field"><span>Transports / year</span><output>{fmt(tripsPerYear(pr))}</output></label>
            </div>
            <div className="route">
              {pr.route.map((id, i) => {
                const z = byId.get(id);
                return (
                  <span key={i} className="chip" style={{ borderColor: z?.color }}>
                    <button className="move" disabled={i === 0} onClick={() => moveStep(pr, i, -1)} title="Move earlier" aria-label="Move earlier"><Chevron left /></button>
                    <span className="code">{z ? (z.code || z.name) : '?'}</span>
                    <button className="move" disabled={i === pr.route.length - 1} onClick={() => moveStep(pr, i, 1)} title="Move later" aria-label="Move later"><Chevron /></button>
                    <button className="tiny" onClick={() => setPr(pr.id, { route: pr.route.filter((_, k) => k !== i) })} title="Remove step">✕</button>
                  </span>
                );
              })}
              <select value="" onChange={e => e.target.value && setPr(pr.id, { route: [...pr.route, e.target.value] })}>
                <option value="">+ step…</option>
                {p.zones.map(z => <option key={z.id} value={z.id}>{zoneLabel(z)}</option>)}
              </select>
            </div>
          </div>
        ))}
        <button onClick={addProduct} disabled={!p.zones.length}>+ Add product family</button>
        {!p.zones.length && <p className="muted">Add the zones first (step 2).</p>}

        {pairs.length > 0 && (
          <div className="card table-wrap">
            <h3>Flow intensity</h3>
            <table className="grid">
              <thead><tr><th>From</th><th>To</th><th>Families</th><th className="num">Transports / year</th><th className="num">Distance (m)</th><th className="num">Transport·m / year</th></tr></thead>
              <tbody>
                {pairs.map(f => (
                  <tr key={`${f.from.id}>${f.to.id}`}>
                    <td>{zoneLabel(f.from)}</td><td>{zoneLabel(f.to)}</td>
                    <td>{f.products.map(x => <i key={x.id} className="dot" style={{ background: x.color }} title={x.name} />)}</td>
                    <td className="num">{fmt(f.trips)}</td><td className="num">{fmt(f.dist, 1)}</td><td className="num">{fmt(f.work)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={5}>Total (distance × intensity)</td><td className="num"><b>{fmt(totalWork)}</b></td></tr></tfoot>
            </table>
            <p className="muted small">Distance is rectilinear between zone centres: an approximation until routes follow the aisles.</p>
          </div>
        )}
      </div>

      <aside className="side wide">
        <div className="card plan-card">
          <PlanView project={p} showFlows />
        </div>
        <Issues title="Flow checks" items={flowChecks(p)} />
      </aside>
    </div>
  );
}
