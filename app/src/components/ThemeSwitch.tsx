import { useEffect, useState } from 'react';

// Light / dark / automatic (follows the operating system). Works through data-theme on <html>,
// which styles.css already honours. "Auto" restores whatever the page had at start-up
// (an embedding viewer may set its own data-theme).
type Mode = 'auto' | 'light' | 'dark';
const KEY = 'factory-configurator.theme';
const root = document.documentElement;
const initial = root.getAttribute('data-theme');

function apply(mode: Mode) {
  if (mode === 'auto') {
    if (initial) root.setAttribute('data-theme', initial); else root.removeAttribute('data-theme');
  } else root.setAttribute('data-theme', mode);
}

export default function ThemeSwitch() {
  const [mode, setMode] = useState<Mode>(() => {
    try { return (localStorage.getItem(KEY) as Mode) || 'auto'; } catch { return 'auto'; }
  });
  useEffect(() => {
    apply(mode);
    try { localStorage.setItem(KEY, mode); } catch { /* ignore */ }
  }, [mode]);

  const opts: [Mode, string, string][] = [['light', 'Light', 'Light mode'], ['dark', 'Dark', 'Dark mode'], ['auto', 'Auto', 'Follow the system setting']];
  return (
    <div className="seg" role="group" aria-label="Colour theme">
      {opts.map(([m, label, title]) => (
        <button key={m} className={m === mode ? 'on' : ''} aria-pressed={m === mode} title={title} onClick={() => setMode(m)}>{label}</button>
      ))}
    </div>
  );
}
