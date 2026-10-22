import { useState } from 'react';
import { Store } from '../lib/store';
import { download, fileName, planPng } from '../lib/exports';
import { layoutIssues } from '../lib/layout';
import { buildPptx } from '../lib/pptx';
import { EXPORT_VIEWS, render3D } from '../lib/scene3d';
import { BRANDED } from '../lib/brand';
import PlanView from '../components/PlanView';
import { NumField } from '../components/fields';

const toDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(b); });

export default function ExportStep({ store }: { store: Store }) {
  const { project: p, update } = store;
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const placed = p.zones.some(z => z.placed);
  const errors = layoutIssues(p).filter(i => i.level === 'error');

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(true); setMsg(`${what}: preparing…`);
    try { await fn(); setMsg(`${what}: downloaded.`); } catch (e) { setMsg(`${what}: error – ${(e as Error).message}`); }
    setBusy(false);
  };

  const pptx = async () => {
    const png = await planPng('export-plan', p, false);
    const svg = document.getElementById('export-plan') as unknown as SVGSVGElement;
    const vb = svg.viewBox.baseVal;
    // 3D stills need WebGL; without it the presentation is built without the 3D slide
    let views3d: { title: string; png: string; aspect: number }[] = [];
    try { views3d = EXPORT_VIEWS.map(v => ({ title: v.title, png: render3D(p, v), aspect: 1.6 })); } catch { views3d = []; }
    const logoPng = BRANDED ? (await import('../assets/efeso-logo.png?inline')).default.split(',')[1] : undefined;
    const blob = await buildPptx(p, {
      footer: BRANDED ? 'EFESO Management Consultants' : 'Factory Layout Configurator',
      logoPng, planPng: await toDataUrl(png), planAspect: vb.width / vb.height, views3d,
    });
    await download(blob, fileName(p, 'layout', 'pptx'));
  };

  return (
    <div className="step-body">
      <h2>Export</h2>
      <p className="lead">Each delivery gets a new version number in the file name (e.g. "…_v03_…").</p>

      <div className="card form">
        <NumField label="Version (vNN)" value={p.rev} min={1} onChange={v => update(q => ({ ...q, rev: Math.round(v) }))} />
      </div>

      {errors.length > 0 && (
        <div className="note bad">The layout has {errors.length} problem{errors.length === 1 ? '' : 's'} (overlaps or zones outside the factory). You can export, but check the Layout step.</div>
      )}

      <div className="export-grid">
        <div className="card main-export">
          <h3>Presentation (.pptx)</h3>
          <p className="muted">PowerPoint in 16:9: title, block layout with key figures and legend, two 3D views, area overview, zone list, material flows, checks and assumptions.</p>
          <button className="primary" disabled={!placed || busy} onClick={() => run('Presentation', pptx)}>Download PowerPoint</button>
        </div>
        <div className="card">
          <h3>Layout image (.png)</h3>
          <p className="muted">The plan with zones, flows and dimensions, for e-mails and documents.</p>
          <button disabled={!placed || busy} onClick={() => run('Image', async () => download(await planPng('export-plan', p), fileName(p, 'layout', 'png')))}>Download image</button>
        </div>
      </div>
      {msg && <p className="muted">{msg}</p>}
      <p className="muted small">To keep working on the project later, use Save in the top bar.</p>

      <div className="hidden-plan"><PlanView project={p} showFlows svgId="export-plan" /></div>
    </div>
  );
}
