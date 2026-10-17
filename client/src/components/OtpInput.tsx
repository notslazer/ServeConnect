import { useRef } from 'react';
import clsx from 'clsx';

/** Six separate digit boxes with paste support and auto-advance. Supports SMS autofill via autocomplete="one-time-code". */
export function OtpInput({ value, onChange, onComplete, error, length = 6, autoFocus = true }: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; error?: boolean; length?: number; autoFocus?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const set = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    refs.current[Math.min(clean.length, length - 1)]?.focus();
  };
  return (
    <div className="flex justify-between gap-2" role="group" aria-label="One-time code">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          autoFocus={autoFocus && i === 0}
          aria-label={`Digit ${i + 1}`}
          maxLength={length}
          value={value[i] ?? ''}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '');
            if (v.length > 1) return set(v); // paste or autofill
            const arr = value.split('');
            arr[i] = v;
            set(arr.join('').slice(0, i + 1) + value.slice(i + 1));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !value[i] && i > 0) {
              onChange(value.slice(0, i - 1));
              refs.current[i - 1]?.focus();
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            set(e.clipboardData.getData('text'));
          }}
          className={clsx('h-14 w-full max-w-[52px] rounded-xl border bg-white text-center font-display text-2xl font-bold text-ink focus:outline-none focus:ring-2', error ? 'border-blood-500 focus:ring-blood-100' : 'border-paper-line focus:border-brand-400 focus:ring-brand-100')}
        />
      ))}
    </div>
  );
}
