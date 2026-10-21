import { useEffect, useState } from 'react';

// Number input that accepts "12,5" as well as "12.5" and only commits valid numbers.
export function NumInput({ value, onChange, min, step = 1, className }: {
  value: number; onChange: (v: number) => void; min?: number; step?: number; className?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <input
      className={className} inputMode="decimal" value={text} step={step}
      onChange={e => {
        setText(e.target.value);
        const v = Number(e.target.value.replace(',', '.'));
        if (e.target.value.trim() !== '' && Number.isFinite(v) && (min === undefined || v >= min)) onChange(v);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

export function NumField({ label, unit, ...rest }: {
  label: string; unit?: string; value: number; onChange: (v: number) => void; min?: number; step?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="with-unit"><NumInput {...rest} />{unit && <em>{unit}</em>}</div>
    </label>
  );
}
