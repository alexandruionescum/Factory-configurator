import { useState } from 'react';
import { Store } from '../lib/store';
import { zoneLabel } from '../lib/model';
import { BLOCK_COLUMNS, blockLayoutXlsx, blockRows, download, fileName } from '../lib/exports';
import { VtlxFile, matchZones, readVtlx, writeFlows } from '../lib/vtlx';
import { layoutIssues } from '../lib/layout';

export default function VistableStep({ store }: { store: Store }) {
  const { project: p } = store;
  const rows = blockRows(p);
  const errors = layoutIssues(p).filter(i => i.level === 'error');
  const [file, setFile] = useState<VtlxFile | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [xlsxMsg, setXlsxMsg] = useState('');

  const load = async (f: File) => {
    setMsg(null);
    try { setFile(readVtlx(f.name, await f.arrayBuffer())); }
    catch (e) { setFile(null); setMsg({ ok: false, text: (e as Error).message }); }
  };

  const matches = file ? matchZones(p, file) : [];
  const unmatched = matches.filter(m => !m.block);
  const flows = p.products.filter(pr => pr.route.length >= 2 && pr.perContainer > 0);
  const ready = !!file && file.template && !unmatched.length && flows.length > 0;

  const write = async () => {
    if (!file) return;
    try {
      const r = writeFlows(p, file);
      await download(r.blob, fileName(p, 'flows', 'vtlx'));
      setMsg({ ok: true, text: `Written: ${r.productLines} product famil${r.productLines === 1 ? 'y' : 'ies'}, ${r.transports} transports. Open the new file in visTABLE and switch on "Show material flow".` });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };

  return (
    <div className="step-body">
      <h2>visTABLE</h2>
      <p className="lead">Blocks go into visTABLE through its Block Layout Table import. Material flows are then written into a Pack and Go (.vtlx) that you export from visTABLE. Your files are never changed; you always get a new file.</p>

      <ol className="vt-steps">
        <li className="card">
          <h3>Import the blocks</h3>
          <p>Download the Block Layout Table and import it in visTABLE with the Block Layout Table import. Blocks are matched by name, so keep zone codes unique.</p>
          {errors.length > 0 && <div className="note bad">The layout has {errors.length} problem{errors.length === 1 ? '' : 's'} (overlaps or zones outside the hall). Check the Layout step first.</div>}
          <div className="row">
            <button className="primary" disabled={!rows.length}
              onClick={async () => { try { await download(await blockLayoutXlsx(p), fileName(p, 'block-layout', 'xlsx')); setXlsxMsg('Downloaded.'); } catch (e) { setXlsxMsg(`Error: ${(e as Error).message}`); } }}>
              Download .xlsx ({rows.length} blocks)
            </button>
            {xlsxMsg && <span className="muted">{xlsxMsg}</span>}
          </div>
          <p className="muted small">Tip: export the current Block Layout Table from visTABLE before importing, as a backup.</p>
        </li>

        <li className="card">
          <h3>Draw one sample flow</h3>
          <p>In visTABLE, create one material flow by hand: one product with one transport between two blocks. The app copies its transport type settings. You need this only once per file.</p>
        </li>

        <li className="card">
          <h3>Load the Pack and Go</h3>
          <p>Save the layout in visTABLE as Pack and Go (.vtlx) and load it here. It is read in your browser and not uploaded anywhere.</p>
          <div className="row">
            <label className="file-btn">
              <input type="file" accept=".vtlx" onChange={e => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ''; }} />
              <span>Choose .vtlx file</span>
            </label>
            {file && <span className="muted">{file.fileName}</span>}
          </div>

          {file && (
            <div className="vt-check">
              <div className="stats compact">
                <div><span>Objects found</span><b>{file.blocks.length}</b></div>
                <div><span>Product families in file</span><b>{file.productLines.length}</b></div>
                <div><span>Sample flow</span><b className={file.template ? '' : 'bad'}>{file.template ? 'Found' : 'Missing'}</b></div>
              </div>
              {!file.template && <div className="note bad">No sample flow in this file. Do step 2 in visTABLE, save the Pack and Go again and load it.</div>}
              {file.productLines.length > 0 && (
                <div className="note">These product families in the file will be replaced by the families from the Flows step: <b>{file.productLines.join(', ')}</b>.</div>
              )}
              <div className="table-wrap">
                <table className="grid">
                  <thead><tr><th>Zone in a route</th><th>Block in visTABLE</th><th>Status</th></tr></thead>
                  <tbody>
                    {matches.map(m => (
                      <tr key={m.zone.id}>
                        <td>{zoneLabel(m.zone)}</td>
                        <td>{m.block ? m.block.name : '–'}</td>
                        <td>{m.block ? <span className="tag ok">Linked</span>
                          : m.candidates > 1 ? <span className="tag bad">{m.candidates} blocks with this name</span>
                          : <span className="tag bad">Not found</span>}</td>
                      </tr>
                    ))}
                    {!matches.length && <tr><td colSpan={3} className="empty">No product family has a route yet (Flows step).</td></tr>}
                  </tbody>
                </table>
              </div>
              {unmatched.length > 0 && <p className="muted small">Import the blocks (step 1) into this layout, or give the blocks in visTABLE the same names as the zones.</p>}
            </div>
          )}
        </li>

        <li className="card">
          <h3>Write the material flows</h3>
          <p>{flows.length} product famil{flows.length === 1 ? 'y' : 'ies'} with {flows.reduce((s, pr) => s + Math.max(pr.route.length - 1, 0), 0)} transport steps from the Flows step go into a new .vtlx.</p>
          <div className="row">
            <button className="primary" disabled={!ready} onClick={write}>Download .vtlx with flows</button>
            <span className="tag">Beta</span>
          </div>
          {msg && <div className={`note${msg.ok ? '' : ' bad'}`}>{msg.text}</div>}
          <p className="muted small">Beta: the format follows the visTABLE toolkit. Open the first file in visTABLE and check the flows before relying on it.</p>
        </li>
      </ol>

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
    </div>
  );
}
