import { useState } from 'react';
import { Store } from '../lib/store';
import { BLOCK_COLUMNS, blockLayoutXlsx, blockRows, download, fileName, planPng, projectJson, reportMd } from '../lib/exports';
import { layoutIssues } from '../lib/layout';
import PlanView from '../components/PlanView';
import { NumField } from '../components/fields';

export default function ExportStep({ store }: { store: Store }) {
  const { project: p, update } = store;
  const [msg, setMsg] = useState('');
  const rows = blockRows(p);
  const errors = layoutIssues(p).filter(i => i.level === 'error');

  const run = async (what: string, fn: () => Promise<void> | void) => {
    try { await fn(); setMsg(`${what}: downloaded.`); } catch (e) { setMsg(`${what}: error – ${(e as Error).message}`); }
  };

  return (
    <div className="step-body">
      <h2>Export</h2>
      <p className="lead">Each delivery gets a new version number in the file name (e.g. "…_v03_…"). Source files are never changed.</p>

      <div className="card form">
        <NumField label="Version (vNN)" value={p.rev} min={1} onChange={v => update(q => ({ ...q, rev: Math.round(v) }))} />
      </div>

      {errors.length > 0 && (
        <div className="note bad">The layout has {errors.length} problem{errors.length === 1 ? '' : 's'} (overlaps or zones outside the hall). You can export, but check the Layout step.</div>
      )}

      <div className="export-grid">
        <div className="card main-export">
          <h3>Block Layout Table for visTABLE (.xlsx)</h3>
          <p className="muted">The 22 columns of the visTABLE Block Layout Table, with block centres in mm and the colour as cell fill.
            Import it with the Block Layout Table import in visTABLE. Existing blocks with the same unique name are updated.</p>
          <button className="primary" disabled={!rows.length}
            onClick={() => run('Block Layout Table', async () => download(await blockLayoutXlsx(p), fileName(p, 'block-layout', 'xlsx')))}>
            Download .xlsx ({rows.length} blocks)
          </button>
        </div>
        <div className="card">
          <h3>2D plan (.png)</h3>
          <p className="muted">Image of the plan with zones and flows, for presentations or for approval.</p>
          <button disabled={!rows.length} onClick={() => run('Plan PNG', async () => download(await planPng('export-plan', p), fileName(p, 'plan', 'png')))}>Download .png</button>
        </div>
        <div className="card">
          <h3>Report (.md)</h3>
          <p className="muted">Zones vs. the brief, flows, checks and the assumptions made.</p>
          <button onClick={() => run('Report', () => download(new Blob([reportMd(p)], { type: 'text/markdown' }), fileName(p, 'report', 'md')))}>Download report</button>
        </div>
        <div className="card">
          <h3>Project (.json)</h3>
          <p className="muted">Complete project save; open it later with "Open" in the top bar.</p>
          <button onClick={() => run('Project', () => download(projectJson(p), fileName(p, 'project', 'json')))}>Save project</button>
        </div>
      </div>
      {msg && <p className="muted">{msg}</p>}

      <div className="card table-wrap">
        <h3>Block Layout Table preview</h3>
        <table className="grid small">
          <thead><tr>{BLOCK_COLUMNS.map(c => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>{r.map((v, j) => <td key={j} className={typeof v === 'number' ? 'num' : ''} style={j === 11 ? { background: String(v) } : undefined}>{j === 11 ? '' : String(v)}</td>)}</tr>
            ))}
            {!rows.length && <tr><td colSpan={22} className="empty">No zones placed on the plan.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="hidden-plan"><PlanView project={p} showFlows svgId="export-plan" /></div>
    </div>
  );
}
