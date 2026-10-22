import { useCallback, useEffect, useRef, useState } from 'react';
import { Project, emptyProject, exampleProject, parseProject } from './model';

const KEY = 'factory-configurator.project';

function load(): Project | null {
  try {
    const s = localStorage.getItem(KEY);
    return s ? parseProject(s) : null;
  } catch { return null; }
}

function save(p: Project) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable: work in memory */ }
}

// Project state with undo / redo and autosave in the browser.
// update(fn, false) changes without an undo point (used while dragging; checkpoint() is set at drag start).
export function useProject() {
  const [project, setProject] = useState<Project>(() => load() ?? exampleProject());
  const ref = useRef(project); ref.current = project;
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const [, bump] = useState(0);

  // autosave once the edits pause (dragging changes the project on every pointer move)
  useEffect(() => {
    const t = setTimeout(() => save(project), 300);
    return () => clearTimeout(t);
  }, [project]);
  // closing the tab right after an edit still saves it
  useEffect(() => {
    const flush = () => save(ref.current);
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  const last = useRef(0);
  const checkpoint = useCallback(() => {
    past.current.push(ref.current);
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    last.current = Date.now();
    bump(x => x + 1);
  }, []);

  // edits in quick succession (typing a number) share one undo point
  const update = useCallback((fn: (p: Project) => Project, record = true) => {
    if (record && Date.now() - last.current > 700) checkpoint();
    else if (record) last.current = Date.now();
    setProject(p => fn(p));
  }, [checkpoint]);

  const replace = useCallback((p: Project) => { checkpoint(); setProject(p); }, [checkpoint]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(ref.current); setProject(prev);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(ref.current); setProject(next);
  }, []);

  return {
    project, update, replace, checkpoint, undo, redo,
    canUndo: past.current.length > 0, canRedo: future.current.length > 0,
    reset: () => replace(emptyProject()),
    loadExample: () => replace(exampleProject()),
  };
}

export type Store = ReturnType<typeof useProject>;
