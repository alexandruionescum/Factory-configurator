import { useMemo, useState } from 'react';
import { Store } from '../lib/store';
import { areaType, zoneLabel } from '../lib/model';
import { fmt } from '../lib/flows';
import { Field, Mapping, Sheet, applyImport, guessHeader, planImport, readRows, readWorkbook, text } from '../lib/briefImport';

const FIELDS: [Field, string][] = [['code', 'Code'], ['name', 'Name'], ['type', 'Area type'], ['area', 'Area']];

export default function ExcelImport({ store }: { store: Store }) {
  const { project: p, update } = store;
  const [file, setFile] = useState('');
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [si, setSi] = useState(0);
  const [header, setHeader] = useState(0);
  const [map, setMap] = useState<Mapping>({ code: -1, name: -1, type: -1, area: -1 });
  const [unit, setUnit] = useState<1 | 1e-6>(1);
  const [removeMissing, setRemoveMissing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const pickSheet = (all: Sheet[], i: number) => {
    setSi(i);
    const g = guessHeader(all[i]?.rows ?? []);
    setHeader(g.header); setMap(g.mapping);
  };

  const load = async (f: File) => {
    setMsg(null);
    try {
      const all = (await readWorkbook(await f.arrayBuffer())).filter(s => s.rows.length);
      if (!all.length) throw new Error('The workbook has no data.');
      // start on the first sheet where an area column and a name/code column are recognised
      const first = Math.max(0, all.findIndex(s => { const g = guessHeader(s.rows); return g.mapping.area >= 0; }));
      setFile(f.name); setSheets(all); pickSheet(all, first);
    } catch (e) {
      setSheets([]); setFile('');
      setMsg({ ok: false, text: `Could not read the file: ${(e as Error).message}. Use an .xlsx file (Excel 2007 or later).` });
    }
  };

  const sheet = sheets[si];
  const headers = (sheet?.rows[header] ?? []).map((c, i) => text(c) || `Column ${i + 1}`);
  const ready = !!sheet && map.area >= 0 && (map.name >= 0 || map.code >= 0);
  const { items, skipped } = useMemo(() => (ready ? readRows(sheet.rows, header, map, unit) : { items: [], skipped: [] }), [sheet, header, map, unit, ready]);
  const plan = useMemo(() => planImport(p, items), [p, items]);
  const counts = {
    update: plan.changes.filter(c => c.kind === 'update').length,
    add: plan.changes.filter(c => c.kind === 'new').length,
    same: plan.changes.filter(c => c.kind === 'same').length,
  };

  const apply = () => {
    update(q => applyImport(q, planImport(q, items), removeMissing, t => areaType(t).color));
    setMsg({ ok: true, text: `Applied: ${counts.update} updated, ${counts.add} added${removeMissing && plan.missing.length ? `, ${plan.missing.length} removed` : ''}. Resized zones may now overlap: check the Layout step. Undo with Ctrl+Z.` });
    setSheets([]); setFile('');
  };

  return (
    <div className="card">
      <h3>Import from Excel</h3>
      <p className="muted">Load the brief as .xlsx. Columns are recognised by their headings (English, German or Romanian). You see every change before it is applied; zones keep their place on the plan and are resized to the new area.</p>
      <div className="row">
        <label className="file-btn">
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ''; }} />
          <span>Choose Excel file</span>
        </label>
        {file && <span className="muted">{file}</span>}
      </div>
      {msg && <div className={`note${msg.ok ? '' : ' bad'}`} style={{ marginTop: 10 }}>{msg.text}</div>}

      {sheet && (
        <div className="import">
          <div className="form map">
            {sheets.length > 1 && (
              <label className="field"><span>Sheet</span>
                <select value={si} onChange={e => pickSheet(sheets, Number(e.target.value))}>
                  {sheets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
                </select>
              </label>
            )}
            <label className="field"><span>Header row</span>
              <select value={header} onChange={e => setHeader(Number(e.target.value))}>
                {sheet.rows.slice(0, 20).map((r, i) => <option key={i} value={i}>{i + 1}: {r.map(text).filter(Boolean).join(' · ').slice(0, 50) || '(empty)'}</option>)}
              </select>
            </label>
            {FIELDS.map(([f, label]) => (
              <label key={f} className="field"><span>{label}{f === 'area' ? ' *' : ''}</span>
                <select value={map[f]} onChange={e => setMap({ ...map, [f]: Number(e.target.value) })}>
                  <option value={-1}>— not used —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </label>
            ))}
            <label className="field"><span>Area unit</span>
              <select value={unit} onChange={e => setUnit(Number(e.target.value) as 1 | 1e-6)}>
                <option value={1}>m²</option>
                <option value={1e-6}>mm² (visTABLE export)</option>
              </select>
            </label>
          </div>

          {!ready && <div className="note bad">Choose the area column and a name or code column.</div>}

          {ready && (
            <>
              <div className="stats compact">
                <div><span>Rows read</span><b>{items.length}</b></div>
                <div><span>Updated</span><b>{counts.update}</b></div>
                <div><span>New</span><b>{counts.add}</b></div>
                <div><span>Unchanged</span><b>{counts.same}</b></div>
              </div>
              {plan.duplicates.length > 0 && <div className="note bad">These appear more than once in the Excel: {plan.duplicates.join(', ')}. Each row becomes its own zone.</div>}

              <div className="table-wrap">
                <table className="grid">
                  <thead><tr><th>Row</th><th>Zone</th><th>Type</th><th className="num">Area now</th><th className="num">Area in Excel</th><th>Change</th></tr></thead>
                  <tbody>
                    {plan.changes.map((c, i) => (
                      <tr key={i}>
                        <td className="muted">{c.item.row}</td>
                        <td>{[c.item.code, c.item.name !== c.item.code ? c.item.name : ''].filter(Boolean).join(' ')}</td>
                        <td>{c.item.type ? areaType(c.item.type).label : c.item.typeText ? <span className="bad" title="Not a known area type; kept as is">{c.item.typeText} ?</span> : '–'}</td>
                        <td className="num">{c.kind === 'new' ? '–' : fmt(c.zone.target, 1)}</td>
                        <td className="num"><b>{fmt(c.item.area, 1)}</b></td>
                        <td>{c.kind === 'new' ? <span className="tag ok">New</span>
                          : c.kind === 'same' ? <span className="tag">Unchanged</span>
                          : <span className="tag warn">{[c.area && 'area', c.name && 'name', c.type && 'type'].filter(Boolean).join(', ')}</span>}</td>
                      </tr>
                    ))}
                    {!plan.changes.length && <tr><td colSpan={6} className="empty">No rows with a name and an area under the header row.</td></tr>}
                  </tbody>
                </table>
              </div>

              {skipped.length > 0 && (
                <details className="skipped">
                  <summary>{skipped.length} row{skipped.length === 1 ? '' : 's'} skipped</summary>
                  <ul>{skipped.map(s => <li key={s.row}>Row {s.row}: {s.reason}{s.label ? ` (${s.label})` : ''}</li>)}</ul>
                </details>
              )}

              {plan.missing.length > 0 && (
                <div className="note">
                  {plan.missing.length} zone{plan.missing.length === 1 ? ' is' : 's are'} in the project but not in the Excel: {plan.missing.map(zoneLabel).join(', ')}.
                  <label className="check" style={{ marginTop: 6 }}><input type="checkbox" checked={removeMissing} onChange={e => setRemoveMissing(e.target.checked)} /> Remove them (also from the flow routes)</label>
                </div>
              )}

              <div className="row">
                <button className="primary" disabled={!counts.update && !counts.add && !(removeMissing && plan.missing.length)} onClick={apply}>Apply changes</button>
                <button onClick={() => { setSheets([]); setFile(''); }}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
