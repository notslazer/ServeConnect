import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { CalendarDays, MapPin, Users, Sun } from 'lucide-react';
import type { EventCard as E } from '../lib/types';
import { EVENT_CATEGORIES, SKILLS } from '../lib/constants';
import { relDay } from '../lib/format';
import { Pill, VerifiedBadge } from './ui';

export function EventCover({ event, className }: { event: Pick<E, 'coverUrl' | 'category' | 'title'>; className?: string }) {
  const cat = EVENT_CATEGORIES[event.category] ?? EVENT_CATEGORIES.other;
  return event.coverUrl ? (
    <img src={event.coverUrl} alt="" className={clsx('object-cover', className)} loading="lazy" />
  ) : (
    <div className={clsx('flex items-center justify-center bg-gradient-to-br from-brand-500 to-brand-700 text-5xl', className)} aria-hidden>
      <span className="drop-shadow">{cat.emoji}</span>
    </div>
  );
}

export function spotsText(e: Pick<E, 'capacity' | 'registered' | 'waitlisted' | 'status'>) {
  if (e.status === 'completed') return 'Completed';
  if (e.status === 'cancelled') return 'Cancelled';
  const left = e.capacity - e.registered;
  if (left <= 0) return e.waitlisted ? `Full · ${e.waitlisted} on waitlist` : 'Full · join waitlist';
  return left <= 5 ? `Only ${left} spot${left === 1 ? '' : 's'} left` : `${left} of ${e.capacity} spots open`;
}

export function EventCard({ event, compact }: { event: E; compact?: boolean }) {
  const cat = EVENT_CATEGORIES[event.category] ?? EVENT_CATEGORIES.other;
  const full = event.registered >= event.capacity;
  if (compact) {
    return (
      <Link to={`/events/${event.id}`} className="flex gap-3 rounded-xl p-2 hover:bg-paper">
        <EventCover event={event} className="h-14 w-14 shrink-0 rounded-xl text-2xl" />
        <div className="min-w-0">
          <div className="line-clamp-2 font-semibold leading-snug">{event.title}</div>
          <div className="text-sm text-ink-faint">{relDay(event.startAt)}</div>
        </div>
      </Link>
    );
  }
  return (
    <Link to={`/events/${event.id}`} className="card group flex flex-col overflow-hidden transition hover:shadow-lift">
      <div className="relative">
        <EventCover event={event} className="aspect-[16/9] w-full" />
        <div className="absolute left-3 top-3 flex gap-1.5">
          <Pill tone="neutral" className="bg-white/95">{cat.emoji} {cat.label}</Pill>
          {event.isOutdoor && <Pill tone="neutral" className="bg-white/95" icon={<Sun className="h-3 w-3" />}>Outdoor</Pill>}
        </div>
        {event.myStatus && (
          <Pill tone={event.myStatus === 'waitlisted' ? 'marigold' : event.myStatus === 'attended' ? 'leaf' : 'brand'} className="absolute right-3 top-3">
            {event.myStatus === 'waitlisted' ? `Waitlist #${event.waitlistPosition ?? ''}` : event.myStatus === 'attended' ? 'Attended' : event.myStatus === 'no_show' ? 'Missed' : 'Registered'}
          </Pill>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-1 text-sm font-semibold text-brand-600">{relDay(event.startAt)}</div>
        <h3 className="line-clamp-2 text-lg font-bold leading-snug group-hover:text-brand-700">{event.title}</h3>
        <div className="mt-2 space-y-1 text-sm text-ink-soft">
          <div className="flex items-center gap-1.5 truncate"><span className="truncate">{event.organizer.name}</span>{event.organizer.verified && <VerifiedBadge size={14} />}</div>
          {event.locationName && <div className="flex items-center gap-1.5"><MapPin className="h-4 w-4 shrink-0" /><span className="truncate">{event.locationName}</span>{event.distanceKm != null && <span className="shrink-0 text-ink-faint">· {Math.round(event.distanceKm)} km</span>}</div>}
        </div>
        {event.skillsNeeded.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {event.skillsNeeded.slice(0, 3).map((s) => <Pill key={s} tone="brand">{SKILLS[s] ?? s}</Pill>)}
            {event.skillsNeeded.length > 3 && <Pill>+{event.skillsNeeded.length - 3}</Pill>}
          </div>
        )}
        <div className={clsx('mt-auto flex items-center gap-1.5 pt-3 text-sm font-semibold', full ? 'text-marigold-700' : 'text-leaf-600')}>
          <Users className="h-4 w-4" /> {spotsText(event)}
        </div>
      </div>
    </Link>
  );
}

export function EventDateBlock({ date }: { date: string }) {
  const d = new Date(date);
  return (
    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-paper-line bg-white">
      <span className="text-[11px] font-bold uppercase text-blood-500">{d.toLocaleString('en', { month: 'short' })}</span>
      <span className="font-display text-xl font-extrabold leading-none">{d.getDate()}</span>
    </div>
  );
}
export { CalendarDays };
