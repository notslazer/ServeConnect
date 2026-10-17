import { format, formatDistanceToNowStrict, isSameDay, isToday, isTomorrow, isYesterday } from 'date-fns';

export const fmtDate = (d: string | Date) => format(new Date(d), 'EEE, d MMM yyyy');
export const fmtTime = (d: string | Date) => format(new Date(d), 'h:mm a');
export const fmtDateTime = (d: string | Date) => format(new Date(d), "EEE, d MMM · h:mm a");
export const fmtShort = (d: string | Date) => format(new Date(d), 'd MMM');

export function fmtRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  if (isSameDay(s, e)) return `${fmtDate(s)} · ${fmtTime(s)} – ${fmtTime(e)}`;
  return `${fmtDateTime(s)} – ${fmtDateTime(e)}`;
}

export function relDay(d: string | Date) {
  const x = new Date(d);
  if (isToday(x)) return `Today, ${fmtTime(x)}`;
  if (isTomorrow(x)) return `Tomorrow, ${fmtTime(x)}`;
  if (isYesterday(x)) return `Yesterday, ${fmtTime(x)}`;
  return fmtDateTime(x);
}

export function ago(d: string | Date) {
  const x = new Date(d);
  const s = Math.floor((Date.now() - x.getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d`;
  return format(x, x.getFullYear() === new Date().getFullYear() ? 'd MMM' : 'd MMM yyyy');
}

export const untilText = (d: string | Date) => formatDistanceToNowStrict(new Date(d), { addSuffix: true });

export const plural = (n: number, word: string, pluralWord = word + 's') => `${n} ${n === 1 ? word : pluralWord}`;
export const hours = (h: number | string | null | undefined) => {
  const n = Number(h ?? 0);
  return Number.isInteger(n) ? `${n}` : n.toFixed(1);
};
export const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
