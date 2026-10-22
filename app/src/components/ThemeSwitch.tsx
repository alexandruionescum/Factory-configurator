import React, { useEffect, useState } from 'react';

// Light / dark switch (sun / moon) through data-theme on <html>, which styles.css honours.
// Until the user picks one, the page follows the operating system (or the embedding viewer).
type Mode = 'light' | 'dark';
const KEY = 'factory-configurator.theme';
const root = document.documentElement;

function current(): Mode {
  const t = root.getAttribute('data-theme');
  if (t === 'light' || t === 'dark') return t;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const Sun = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
  </svg>
);
const Moon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </svg>
);

export default function ThemeSwitch() {
  const [mode, setMode] = useState<Mode | null>(() => {
    try { const s = localStorage.getItem(KEY); return s === 'light' || s === 'dark' ? s : null; } catch { return null; }
  });
  const shown = mode ?? current();
  useEffect(() => {
    if (!mode) return;
    root.setAttribute('data-theme', mode);
    try { localStorage.setItem(KEY, mode); } catch { /* ignore */ }
  }, [mode]);

  const opts: [Mode, string, () => React.JSX.Element][] = [['light', 'Light mode', Sun], ['dark', 'Dark mode', Moon]];
  return (
    <div className="seg" role="group" aria-label="Colour theme">
      {opts.map(([m, title, Icon]) => (
        <button key={m} className={m === shown ? 'on' : ''} aria-pressed={m === shown} title={title} aria-label={title} onClick={() => setMode(m)}><Icon /></button>
      ))}
    </div>
  );
}
