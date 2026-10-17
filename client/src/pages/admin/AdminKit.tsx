/* Small building blocks shared by the admin console screens. */
import clsx from 'clsx';

export function FilterChips<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={clsx('rounded-full border px-3 py-1.5 text-sm font-semibold transition', value === v ? 'border-brand-600 bg-brand-600 text-white' : 'border-paper-line bg-white text-ink-soft hover:text-ink')}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export const fmtBytes = (n: number | string) => {
  const b = Number(n);
  if (!Number.isFinite(b)) return '';
  return b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`;
};

export function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-ink-faint">{label}</dt>
      <dd className="break-words text-sm text-ink">{children}</dd>
    </div>
  );
}
