import { useMemo, useState } from 'react';
import { Store } from '../lib/store';
import { areaType } from '../lib/model';
import { fmt } from '../lib/flows';
import { readWorkbook } from '../lib/briefImport';
import { Brief, PHASES, Phase, TEMPLATE_VERSION, areaInPhase, buildTemplate, isTemplate, phaseOf, readBrief } from '../lib/template';
import { briefToProject } from '../lib/briefProject';
import { download } from '../lib/exports';
import { BRANDED, BRIEF_TITLE } from '../lib/brand';
import { useAsk } from './Confirm';

// Step 1 entry point: the brief template consultants fill in at the client, and its import.
export default function BriefStart({ store, onGenerated }: { store: Store; onGenerated: () => void }) {
  const ask = useAsk();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [file, setFile] = useState('');
  const [phase, setPhase] = useState<Phase>('Launch');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const getTemplate = async () => {
    try {
      const logo = BRANDED ? (await import('../assets/efeso-logo.png?inline')).default.split(',')[1] : undefined;
      const buf = await buildTemplate(BRIEF_TITLE, logo);
      await download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${BRIEF_TITLE} - Template v${TEMPLATE_VERSION}.xlsx`);
    } catch (e) { setMsg({ ok: false, text: `Template: ${(e as Error).message}` }); }
  };

  const load = async (f: File) => {
    setMsg(null); setBrief(null);
    try {
      const sheets = await readWorkbook(await f.arrayBuffer());
      if (!isTemplate(sheets)) {
        setMsg({ ok: false, text: 'This file is not the brief template (it needs the sheets Project and Areas). Download the template above, or use Import from Excel in the Zones step to update zones from any Excel.' });
        return;
      }
      const b = readBrief(sheets);
      setBrief(b); setFile(f.name); setPhase(phaseOf(b.project.phase ?? null));
    } catch (e) { setMsg({ ok: false, text: `Could not read the file: ${(e as Error).message}` }); }
  };

  const result = useMemo(() => (brief ? briefToProject(brief, phase) : null), [brief, phase]);
  const streams = useMemo(() => {
    if (!brief) return [];
    const m = new Map<string, { n: number; area: number }>();
    for (const a of brief.areas) {
      const v = areaInPhase(a, phase) ?? 0;
      if (v <= 0) continue;
      const k = a.stream || '(no stream)';
      const e = m.get(k) ?? { n: 0, area: 0 };
      m.set(k, { n: e.n + 1, area: e.area + v });
    }
    return [...m.entries()];
  }, [brief, phase]);

  const generate = async () => {
    if (!result) return;
    if (store.project.zones.length && !(await ask({ text: 'Generate the layout from this brief? The current project is replaced (you can undo it with Ctrl+Z).', ok: 'Generate layout' }))) return;
    store.replace(result.project);
    setBrief(null); setFile('');
    onGenerated();
  };

  const p = result?.project;
  const total = p ? p.zones.reduce((s, z) => s + z.target, 0) : 0;

  return (
    <div className="card brief">
      <h3>Start from a project brief</h3>
      <p className="muted">Colleagues fill in the brief template at the client (areas, phases, flows). Load the filled file here and the configurator generates the layout.</p>
      <div className="row">
        <button onClick={getTemplate}>Download brief template</button>
        <label className="file-btn primary">
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ''; }} />
          <span>Import filled brief</span>
        </label>
      </div>
      {file && <p className="muted small" style={{ margin: '8px 0 0' }}>{file}</p>}
      {msg && <div className={`note${msg.ok ? '' : ' bad'}`} style={{ marginTop: 10 }}>{msg.text}</div>}

      {brief && result && p && (
        <div className="import">
          <div className="form map">
            <label className="field"><span>Project</span><output>{p.name}</output></label>
            {p.meta?.client && <label className="field"><span>Client</span><output>{p.meta.client}</output></label>}
            {p.meta?.preparedBy && <label className="field"><span>Prepared by</span><output>{p.meta.preparedBy}</output></label>}
            <label className="field"><span>Phase to lay out</span>
              <select value={phase} onChange={e => setPhase(e.target.value as Phase)}>
                {PHASES.map(ph => <option key={ph} value={ph}>{ph}</option>)}
              </select>
            </label>
          </div>

          <div className="stats compact">
            <div><span>Areas drawn</span><b>{p.zones.length}</b></div>
            <div><span>Net area</span><b>{fmt(total)} m²</b></div>
            <div><span>Hall</span><b>{p.hall.width} × {p.hall.length} m</b></div>
            <div><span>Flows</span><b>{p.products.length}</b></div>
          </div>

          {streams.length > 0 && (
            <div className="table-wrap">
              <table className="grid">
                <thead><tr><th>Stream</th><th className="num">Areas</th><th className="num">Net m²</th></tr></thead>
                <tbody>{streams.map(([s, v]) => <tr key={s}><td>{s}</td><td className="num">{v.n}</td><td className="num">{fmt(v.area)}</td></tr>)}</tbody>
              </table>
            </div>
          )}

          {result.assumptions.length > 0 && (
            <div className="note"><b>Assumptions</b> (listed in the report):<ul className="plain">{result.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
          )}
          {result.warnings.length > 0 && (
            <div className="note bad"><b>{result.warnings.length} point{result.warnings.length === 1 ? '' : 's'} to check in the brief</b><ul className="plain">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>
          )}
          {result.skipped.length > 0 && (
            <details className="skipped">
              <summary>{result.skipped.length} row{result.skipped.length === 1 ? '' : 's'} not drawn in {phase}</summary>
              <ul>{result.skipped.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </details>
          )}

          <details className="skipped">
            <summary>Areas read ({p.zones.length})</summary>
            <div className="table-wrap">
              <table className="grid small">
                <thead><tr><th>ID</th><th>Stream</th><th>Name</th><th>Type</th><th className="num">m²</th><th className="num">Positions</th><th>Adjacent to</th></tr></thead>
                <tbody>{p.zones.map(z => (
                  <tr key={z.id}><td>{z.code}</td><td>{z.stream ?? ''}</td><td>{z.name}</td><td>{areaType(z.type).label}</td>
                    <td className="num">{fmt(z.target)}</td><td className="num">{z.positions ?? ''}</td><td>{(z.adjacent ?? []).join(', ')}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </details>

          <div className="row">
            <button className="primary" disabled={!p.zones.length} onClick={generate}>Generate layout</button>
            <button onClick={() => { setBrief(null); setFile(''); }}>Cancel</button>
            {!result.fits && <span className="bad small">Does not fit the given hall; zones run outside.</span>}
          </div>
          <p className="muted small">Template version {TEMPLATE_VERSION}. The layout is a first proposal: blocks in rows, grouped by stream and in flow order. Refine it in the Layout step.</p>
        </div>
      )}
    </div>
  );
}
