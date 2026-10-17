/* Shared types and helpers for the events pages (list, detail, form, manage, check-in, dashboard). */
import { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { getSocket } from '../lib/socket';
import { Pill } from './ui';
import type { UserCard } from '../lib/types';

// ───────────────────────── API shapes (camelCase, from server/src/modules/events + teams) ─────────────────────────
export type EventStatus = 'draft' | 'published' | 'completed' | 'cancelled';
export type RegStatus = 'registered' | 'waitlisted' | 'attended' | 'no_show' | 'cancelled';

export interface WeatherDay { date: string; code: number; summary: string; tMax: number; tMin: number; precipProb: number; precipMm: number; windKmh: number }
export interface WeatherAdvisory { checkedAt: string; days: WeatherDay[]; adverse: boolean; alerts: string[] }

export interface Counts { registered: number; waitlisted: number; attended: number }

export interface MyRegistration {
  status: RegStatus;
  checkinCode: string;
  checkedInAt: string | null;
  hours: string | number | null;
  createdAt: string;
  waitlistPosition: number;
  reviewed: boolean;
  certificateSerial: string | null;
  team: { id: string; name: string; conversationId: string | null } | null;
}

export interface EventDetail {
  id: string;
  organizerId: string;
  title: string;
  description: string;
  category: string;
  coverUrl: string | null;
  status: EventStatus;
  isOutdoor: boolean;
  startAt: string;
  endAt: string;
  locationName: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  capacity: number;
  skillsNeeded: string[];
  requirements: string | null;
  minAge: number | null;
  checkinGraceMin: number;
  reminderOffsets: number[];
  weather: WeatherAdvisory | null;
  publishedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  manualCode?: string;
  organizer: UserCard & { avgRating: number | null; completedEvents: number };
  counts: Counts;
  rating: { avg: number | null; n: number };
  hours: number;
  myRegistration: MyRegistration | null;
  isOwner: boolean;
  isTeamLead: boolean;
  checkinOpen: boolean;
}

export interface Attendee {
  registrationId: string;
  status: RegStatus;
  checkinCode: string;
  checkedInAt: string | null;
  checkinMethod: 'qr' | 'event_code' | 'manual' | 'organizer' | null;
  hours: string | number | null;
  createdAt: string;
  note: string | null;
  user: UserCard;
  skills: string[];
  isMinor: boolean;
  noShowCount: number;
  attendedCount: number;
  team: { id: string; name: string } | null;
  registeredByName: string | null;
}

export interface Team {
  id: string;
  name: string;
  roleDescription: string | null;
  createdAt: string;
  conversationId: string | null;
  lead: UserCard | null;
  members: { user: UserCard; role: string | null; skills: string[] }[];
}

export interface Analytics {
  registered: number;
  waitlisted: number;
  attended: number;
  noShows: number;
  cancellations: number;
  viaQr: number;
  viaManual: number;
  totalHours: number;
  capacity: number;
  rating: { avg: number | null; n: number };
  timeline: { day: string; n: number }[];
  skills: { skill: string; n: number }[];
}

export interface CheckinQr { url: string; qr: string; eventCode: string; refreshInMs: number; open: boolean; counts: Counts }

// ───────────────────────── small helpers ─────────────────────────
export const STATUS_LABEL: Record<EventStatus, string> = { draft: 'Draft', published: 'Published', completed: 'Completed', cancelled: 'Cancelled' };
const STATUS_TONE = { draft: 'neutral', published: 'leaf', completed: 'brand', cancelled: 'blood' } as const;
export function EventStatusPill({ status }: { status: EventStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>;
}

export const REG_LABEL: Record<RegStatus, string> = { registered: 'Registered', waitlisted: 'Waitlisted', attended: 'Attended', no_show: 'No-show', cancelled: 'Cancelled' };
const REG_TONE = { registered: 'brand', waitlisted: 'marigold', attended: 'leaf', no_show: 'blood', cancelled: 'neutral' } as const;
export function RegStatusPill({ status }: { status: RegStatus }) {
  return <Pill tone={REG_TONE[status]}>{REG_LABEL[status]}</Pill>;
}

export const METHOD_LABEL: Record<string, string> = { qr: 'QR scan', event_code: 'Event code', manual: 'Personal code', organizer: 'Marked by organizer' };

/** ISO → value for <input type="datetime-local"> in the viewer's timezone. */
export const toLocalInput = (iso: string | null | undefined) => (iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : '');
/** <input type="datetime-local"> value → ISO string with offset (the API requires datetime({offset:true})). */
export const fromLocalInput = (v: string) => new Date(v).toISOString();

export const directionsUrl = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

const icsDate = (d: string) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** Generates an .ics file client-side so the event can be added to any calendar app. */
export function downloadIcs(e: Pick<EventDetail, 'id' | 'title' | 'description' | 'startAt' | 'endAt' | 'locationName' | 'address'>) {
  const url = `${window.location.origin}/events/${e.id}`;
  const location = [e.locationName, e.address].filter(Boolean).join(', ');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ServeConnect//Events//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.id}@serveconnect`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(e.startAt)}`,
    `DTEND:${icsDate(e.endAt)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    `DESCRIPTION:${icsEscape(`${e.description.slice(0, 900)}\n\n${url}`)}`,
    location ? `LOCATION:${icsEscape(location)}` : '',
    `URL:${url}`,
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(e.title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${e.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'event'}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Share via the OS share sheet when available, otherwise copy the link. Returns what happened. */
export async function shareLink(title: string, url: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** Joins the public `event:<id>` socket room and calls back with live registration counts. Signed-in users only. */
export function useEventCounts(eventId: string | undefined, enabled: boolean, onCounts: (c: Counts) => void) {
  const cb = useRef(onCounts);
  cb.current = onCounts;
  useEffect(() => {
    if (!eventId || !enabled) return;
    const s = getSocket();
    const room = `event:${eventId}`;
    const join = () => s.emit('watch', room);
    const handler = (d: Counts & { eventId: string }) => {
      if (d.eventId === eventId) cb.current({ registered: d.registered, waitlisted: d.waitlisted, attended: d.attended });
    };
    join();
    s.on('connect', join);
    s.on('event:counts', handler);
    return () => {
      s.emit('unwatch', room);
      s.off('connect', join);
      s.off('event:counts', handler);
    };
  }, [eventId, enabled]);
}

/** Recharts tooltip styled like the rest of the app. */
export function ChartTooltip({ active, payload, label, labelFormat }: { active?: boolean; payload?: any[]; label?: any; labelFormat?: (l: any) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-paper-line bg-white px-3 py-2 text-sm shadow-lift">
      <div className="mb-1 font-semibold text-ink">{labelFormat ? labelFormat(label) : label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-ink-soft">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color ?? p.fill }} aria-hidden />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums text-ink">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Chart colors: validated pair (light surface) from the brand + leaf ramps. */
export const CHART = { primary: '#5F6CCB', secondary: '#1F8A5B', grid: '#E3E6EC', axis: '#7A8396' };
