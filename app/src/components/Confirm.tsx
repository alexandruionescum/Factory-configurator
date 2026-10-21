import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// In-page confirmation dialog (browser confirm()/alert() are blocked in some embedded viewers).
interface Ask { text: string; ok?: string; cancel?: string | null }
type AskFn = (a: Ask) => Promise<boolean>;

const Ctx = createContext<AskFn>(async () => true);
export const useAsk = () => useContext(Ctx);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [cur, setCur] = useState<(Ask & { resolve: (v: boolean) => void }) | null>(null);
  const okBtn = useRef<HTMLButtonElement>(null);
  const ask = useCallback<AskFn>(a => new Promise(resolve => setCur({ ...a, resolve })), []);
  const close = (v: boolean) => { cur?.resolve(v); setCur(null); };

  useEffect(() => {
    if (!cur) return;
    okBtn.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  return (
    <Ctx.Provider value={ask}>
      {children}
      {cur && (
        <div className="modal-back" onPointerDown={() => close(false)}>
          <div className="modal" role="dialog" aria-modal="true" onPointerDown={e => e.stopPropagation()}>
            <p>{cur.text}</p>
            <div className="row end">
              {cur.cancel !== null && <button onClick={() => close(false)}>{cur.cancel ?? 'Cancel'}</button>}
              <button ref={okBtn} className="primary" onClick={() => close(true)}>{cur.ok ?? 'OK'}</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
