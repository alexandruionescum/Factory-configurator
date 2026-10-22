import { useState } from 'react';
import { Store } from '../lib/store';
import { AREA_TYPES, AreaType, Zone, areaType, matchAreaType, newZone, snap } from '../lib/model';
import { fmt } from '../lib/flows';
import { NumInput } from '../components/fields';
import ExcelImport from '../components/ExcelImport';

// Rows pasted from Excel: Code, Name, Type, Area (tab separated). Type and code are optional.
function parsePaste(text: string): { zones: Zone[]; skipped: number } {
  const zones: Zone[] = []; let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split('\t').map(c => c.trim());
    if (!cells.some(Boolean)) continue;
    // the area is the last numeric cell (a numeric code such as "01" may come first)
    const nums = cells.map(c => (c === '' ? NaN : Number(c.replace(/\s/g, '').replace(',', '.'))));
    let areaIdx = -1;
    nums.forEach((n, i) => { if (Number.isFinite(n) && n > 0) areaIdx = i; });
    if (areaIdx < 0) { skipped++; continue; }
    const target = nums[areaIdx];
    const rest = cells.filter((_, i) => i !== areaIdx && cells[i] !== '');
    // the type column comes after the name, so search from the end; a lone cell is always the name
    let type: AreaType = 'Unbestimmt';
    for (let i = rest.length - 1; i >= 0 && rest.length > 1; i--) {
      const t = matchAreaType(rest[i]);
      if (t) { type = t; rest.splice(i, 1); break; }
    }
    const [code, ...nameParts] = rest.length > 1 ? rest : ['', ...rest];
    zones.push(newZone({ code, name: nameParts.join(' ') || code || 'Zone', type, target }));
  }
  return { zones, skipped };
}

export default function ZonesStep({ store }: { store: Store }) {
  const { project: p, update } = store;
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState('');

  const set = (id: string, patch: Partial<Zone>) =>
    update(q => ({ ...q, zones: q.zones.map(z => (z.id === id ? { ...z, ...patch } : z)) }));

  const setTarget = (z: Zone, target: number) => {
    // keep the block shape, scale it to the new area
    const k = z.w * z.l > 0 ? Math.sqrt(target / (z.w * z.l)) : 1;
    set(z.id, { target, w: Math.max(snap(z.w * k), 1), l: Math.max(snap(z.l * k), 1) });
  };

  const remove = (id: string) =>
    update(q => ({ ...q, zones: q.zones.filter(z => z.id !== id), products: q.products.map(pr => ({ ...pr, route: pr.route.filter(r => r !== id) })) }));

  const importPaste = () => {
    const { zones, skipped } = parsePaste(paste);
    if (!zones.length) { setMsg('No rows with an area found. Each row needs at least a name and an area in m².'); return; }
    update(q => ({ ...q, zones: [...q.zones, ...zones] }));
    setMsg(`Added ${zones.length} zone${zones.length === 1 ? '' : 's'}${skipped ? `; skipped ${skipped} row${skipped === 1 ? '' : 's'} without an area` : ''}. Check the zones marked "Unspecified".`);
    setPaste('');
  };

  const total = p.zones.reduce((s, z) => s + z.target, 0);

  return (
    <div className="step-body">
      <h2>Zones (from the brief)</h2>
      <p className="lead">The list of required areas. Areas come from the brief; the app never invents values. The short code (e.g. "MA") is shown on the plan.</p>

      <div className="card table-wrap">
        <table className="grid">
          <thead>
            <tr><th>Code</th><th>Name</th><th>Area type</th><th className="num">Area (m²)</th><th className="num" title="Clear height the zone needs (empty = no requirement)">Height (m)</th><th>Colour</th><th title="Resizing keeps the area">Fixed area</th><th /></tr>
          </thead>
          <tbody>
            {p.zones.map(z => (
              <tr key={z.id}>
                <td><input className="code" value={z.code} onChange={e => set(z.id, { code: e.target.value })} /></td>
                <td><input value={z.name} onChange={e => set(z.id, { name: e.target.value })} /></td>
                <td>
                  <select value={z.type} onChange={e => {
                    const type = e.target.value as AreaType;
                    const recolor = z.color.toLowerCase() === areaType(z.type).color.toLowerCase();
                    set(z.id, { type, ...(recolor ? { color: areaType(type).color } : {}) });
                  }}>
                    {AREA_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </td>
                <td className="num"><NumInput className="num" value={z.target} min={1} onChange={v => setTarget(z, v)} /></td>
                <td className="num"><input className="num" inputMode="decimal" placeholder="–" aria-label="Height (m)" value={z.height ?? ''} onChange={e => {
                  const t = e.target.value.trim(), v = Number(t.replace(',', '.'));
                  if (t === '') set(z.id, { height: undefined }); else if (Number.isFinite(v) && v > 0) set(z.id, { height: v });
                }} /></td>
                <td><input type="color" value={z.color} onChange={e => set(z.id, { color: e.target.value })} /></td>
                <td className="center"><input type="checkbox" checked={z.fixedArea} onChange={e => set(z.id, { fixedArea: e.target.checked })} /></td>
                <td><button className="icon" title="Delete zone" onClick={() => remove(z.id)}>✕</button></td>
              </tr>
            ))}
            {!p.zones.length && <tr><td colSpan={8} className="empty">No zones yet. Add one or paste the list from Excel.</td></tr>}
          </tbody>
          <tfoot>
            <tr><td colSpan={3}>{p.zones.length} zones</td><td className="num"><b>{fmt(total)}</b></td><td colSpan={4} /></tr>
          </tfoot>
        </table>
        <button onClick={() => update(q => ({ ...q, zones: [...q.zones, newZone()] }))}>+ Add zone</button>
      </div>

      <div className="card">
        <h3>Paste rows from Excel</h3>
        <p className="muted">Copy the columns <b>Code, Name, Type, Area</b> from Excel (type and code are optional) and paste them here.
          Types are recognised in English, German or Romanian (e.g. Production / Fertigung / Producție).</p>
        <textarea rows={5} value={paste} onChange={e => setPaste(e.target.value)} placeholder={'MA\tMachining\tProduction\t520\nRM\tRaw material store\tStorage\t420'} />
        <div className="row"><button className="primary" disabled={!paste.trim()} onClick={importPaste}>Add zones</button>{msg && <span className="muted">{msg}</span>}</div>
      </div>

      <ExcelImport store={store} />
    </div>
  );
}
