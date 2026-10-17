import { useNow } from '../lib/hooks';

/** Live countdown to an event start (REQ-EVT-3). */
export function Countdown({ to, end }: { to: string; end?: string }) {
  const now = useNow(1000);
  const start = new Date(to).getTime();
  const finish = end ? new Date(end).getTime() : start;
  if (now >= start && now <= finish) return <div className="font-display text-lg font-bold text-leaf-600">Happening now</div>;
  if (now > finish) return <div className="font-display text-lg font-bold text-ink-faint">Event has ended</div>;
  let s = Math.floor((start - now) / 1000);
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const parts: [number, string][] = d > 0 ? [[d, 'days'], [h, 'hrs'], [m, 'min']] : [[h, 'hrs'], [m, 'min'], [s, 'sec']];
  return (
    <div className="flex gap-3" aria-live="off" aria-label={`Starts in ${d} days ${h} hours ${m} minutes`}>
      {parts.map(([n, l]) => (
        <div key={l} className="min-w-[56px] rounded-xl bg-brand-600 px-2 py-1.5 text-center text-white">
          <div className="font-display text-2xl font-extrabold tabular-nums leading-none">{String(n).padStart(2, '0')}</div>
          <div className="mt-0.5 text-[11px] font-semibold opacity-80">{l}</div>
        </div>
      ))}
    </div>
  );
}
