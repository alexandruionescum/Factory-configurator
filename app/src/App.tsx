import { useEffect, useRef, useState } from 'react';
import { useProject } from './lib/store';
import { parseProject } from './lib/model';
import { layoutIssues } from './lib/layout';
import { useAsk } from './components/Confirm';
import ThemeSwitch from './components/ThemeSwitch';
import logoSvg from './assets/efeso-logo.svg?raw';
import { BRANDED } from './lib/brand';
import HallStep from './steps/HallStep';
import ZonesStep from './steps/ZonesStep';
import LayoutStep from './steps/LayoutStep';
import FlowsStep from './steps/FlowsStep';
import View3DStep from './steps/View3DStep';
import VistableStep from './steps/VistableStep';
import ExportStep from './steps/ExportStep';

// black wordmark follows the theme text colour; the orange bars stay orange
const LOGO = logoSvg.replace(/fill="#000"/g, 'fill="currentColor"');

const STEPS = [
  { key: 'hall', title: 'Hall', sub: 'size, aisles' },
  { key: 'zones', title: 'Zones', sub: 'areas from the brief' },
  { key: 'layout', title: 'Layout', sub: '2D plan' },
  { key: 'flows', title: 'Flows', sub: 'families, routes' },
  { key: '3d', title: '3D', sub: 'overview' },
  { key: 'vistable', title: 'visTABLE', sub: 'blocks, flows, Pack and Go' },
  { key: 'export', title: 'Export', sub: 'PNG, report, project' },
] as const;
type StepKey = typeof STEPS[number]['key'];

export default function App() {
  const store = useProject();
  const { project: p } = store;
  const [step, setStep] = useState<StepKey>(() => {
    try { return (localStorage.getItem('factory-configurator.step') as StepKey) || 'hall'; } catch { return 'hall'; }
  });
  const file = useRef<HTMLInputElement>(null);
  const ask = useAsk();

  useEffect(() => { try { localStorage.setItem('factory-configurator.step', step); } catch { /* ignore */ } }, [step]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement).closest('input, textarea')) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(); }
      if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) { e.preventDefault(); store.redo(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [store]);

  const open = async (f: File) => {
    try { store.replace(parseProject(await f.text())); setStep('layout'); }
    catch (e) { ask({ text: (e as Error).message, cancel: null }); }
  };

  const badge = (k: StepKey) => {
    if (k === 'zones') return p.zones.length || null;
    if (k === 'flows') return p.products.length || null;
    if (k === 'layout') { const n = layoutIssues(p).filter(i => i.level === 'error').length; return n || null; }
    return null;
  };

  return (
    <div className="app">
      <header className="top">
        <div className={`brand${BRANDED ? '' : ' neutral'}`}>
          {BRANDED && <span className="logo" role="img" aria-label="EFESO" dangerouslySetInnerHTML={{ __html: LOGO }} />}
          <span className="product">Factory Layout <em className="accent">Configurator</em></span>
        </div>
        <div className="pname">{p.name}</div>
        <ThemeSwitch />
        <div className="actions">
          <button onClick={store.undo} disabled={!store.canUndo} title="Undo (Ctrl+Z)">↶</button>
          <button onClick={store.redo} disabled={!store.canRedo} title="Redo (Ctrl+Y)">↷</button>
          <button onClick={async () => { if (await ask({ text: 'Start an empty project? The current project is lost unless you saved it (Export → Project).', ok: 'Start new project' })) { store.reset(); setStep('hall'); } }}>New</button>
          <button onClick={() => file.current?.click()}>Open</button>
          <button onClick={async () => { if (await ask({ text: 'Load the example project (fictitious data)? The current project will be replaced.', ok: 'Load example' })) store.loadExample(); }}>Example</button>
          <input ref={file} type="file" accept=".json,application/json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) open(f); e.target.value = ''; }} />
        </div>
      </header>

      <nav className="steps">
        {STEPS.map((s, i) => (
          <button key={s.key} className={s.key === step ? 'active' : ''} onClick={() => setStep(s.key)}>
            <span className="n">{i + 1}</span>
            <span className="t"><b>{s.title}</b><small>{s.sub}</small></span>
            {badge(s.key) && <span className={`badge${s.key === 'layout' ? ' bad' : ''}`}>{badge(s.key)}</span>}
          </button>
        ))}
      </nav>

      <main className="main">
        {step === 'hall' && <HallStep store={store} onGenerated={() => setStep('layout')} />}
        {step === 'zones' && <ZonesStep store={store} />}
        {step === 'layout' && <LayoutStep store={store} />}
        {step === 'flows' && <FlowsStep store={store} />}
        {step === '3d' && <View3DStep project={p} />}
        {step === 'vistable' && <VistableStep store={store} />}
        {step === 'export' && <ExportStep store={store} />}
      </main>
    </div>
  );
}
