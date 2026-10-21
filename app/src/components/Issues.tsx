export interface IssueItem { level: 'error' | 'warn' | 'info'; text: string; zoneIds?: string[] }

const LABEL = { error: 'Error', warn: 'Warning', info: 'Note' };

export default function Issues({ title, items, onHover }: { title: string; items: IssueItem[]; onHover?: (ids: string[]) => void }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      {items.length === 0
        ? <p className="ok">No issues found.</p>
        : (
          <ul className="issues">
            {items.map((it, i) => (
              <li key={i} className={it.level} onMouseEnter={() => onHover?.(it.zoneIds ?? [])} onMouseLeave={() => onHover?.([])}>
                <span className="lvl">{LABEL[it.level]}</span>{it.text}
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
