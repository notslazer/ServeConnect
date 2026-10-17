import { Star } from 'lucide-react';
import clsx from 'clsx';

export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} width={size} height={size} className={clsx(i <= Math.round(value) ? 'fill-marigold-400 text-marigold-400' : 'text-paper-line')} />
      ))}
    </span>
  );
}

export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={`${i} star${i > 1 ? 's' : ''}`} onClick={() => onChange(i)} className="p-0.5">
          <Star className={clsx('h-8 w-8 transition', i <= value ? 'fill-marigold-400 text-marigold-400' : 'text-paper-line hover:text-marigold-300')} />
        </button>
      ))}
    </div>
  );
}
