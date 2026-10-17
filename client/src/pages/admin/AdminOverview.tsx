import { ReactNode, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, subMonths } from 'date-fns';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Flag, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { EVENT_CATEGORIES } from '../../lib/constants';
import { hours as fmtHours } from '../../lib/format';
import { Card, EmptyState, ErrorState, Notice, Skeleton, Stat } from '../../components/ui';
import { CHART, ChartTooltip } from '../../components/EventsKit';

export interface AdminStats {
  users: number;
  volunteers: number;
  organizers: number;
  verified: number;
  suspended: number;
  newUsers7d: number;
  active24h: number;
  liveEvents: number;
  completedEvents: number;
  checkins: number;
  hours: { month: string; hours: number; checkins: number }[];
  openBlood: number;
  openResources: number;
  pendingVerifications: number;
  openReports: number;
  certificates: number;
  signups: { day: string; n: number }[];
  categories: { category: string; n: number }[];
}

export function useAdminStats() {
  return useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api<AdminStats>('/admin/stats'), refetchInterval: 60_000 });
}

function ChartCard({ title, subtitle, children, empty }: { title: string; subtitle?: string; children: ReactNode; empty?: boolean }) {
  return (
    <Card>
      <h2 className="text-base font-bold">{title}</h2>
      {subtitle && <p className="text-sm text-ink-faint">{subtitle}</p>}
      <div className="mt-3 h-56">{empty ? <EmptyState title="No data yet" className="py-8" /> : children}</div>
    </Card>
  );
}

const axis = { stroke: CHART.axis, fontSize: 12, tickLine: false, axisLine: false } as const;

export default function AdminOverview() {
  const q = useAdminStats();

  // The API returns only days/months that have data — fill the gaps so the axes are continuous.
  const signups = useMemo(() => {
    const map = new Map((q.data?.signups ?? []).map((s) => [s.day, s.n]));
    return Array.from({ length: 30 }, (_, i) => {
      const d = subDays(new Date(), 29 - i);
      const key = format(d, 'yyyy-MM-dd');
      return { key, label: format(d, 'd MMM'), n: map.get(key) ?? 0 };
    });
  }, [q.data]);
  const monthly = useMemo(() => {
    const map = new Map((q.data?.hours ?? []).map((h) => [h.month, h]));
    return Array.from({ length: 12 }, (_, i) => {
      const d = subMonths(new Date(), 11 - i);
      const key = format(d, 'yyyy-MM');
      return { key, label: format(d, 'MMM'), full: format(d, 'MMMM yyyy'), hours: map.get(key)?.hours ?? 0 };
    });
  }, [q.data]);
  const categories = useMemo(
    () => (q.data?.categories ?? []).map((c) => ({ label: EVENT_CATEGORIES[c.category]?.label ?? c.category, n: c.n })),
    [q.data],
  );

  if (q.isPending) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const s = q.data;
  const tiles: { value: ReactNode; label: string; tone?: 'brand' | 'marigold' | 'blood' | 'leaf' }[] = [
    { value: s.users, label: `Users · ${s.newUsers7d} new this week` },
    { value: s.active24h, label: 'Active in last 24 h' },
    { value: s.volunteers, label: 'Volunteers' },
    { value: s.organizers, label: `Organizers & CSR · ${s.verified} verified users`, tone: 'leaf' },
    { value: s.liveEvents, label: `Live events · ${s.completedEvents} completed` },
    { value: fmtHours(monthly.reduce((a, m) => a + m.hours, 0)), label: `Verified hours (12 mo) · ${s.checkins} check-ins` },
    { value: s.openBlood, label: `Open blood requests · ${s.openResources} donation drives`, tone: 'blood' },
    { value: s.certificates, label: 'Certificates issued', tone: 'marigold' },
  ];

  return (
    <div className="space-y-4">
      {(s.pendingVerifications > 0 || s.openReports > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {s.pendingVerifications > 0 && (
            <Notice tone="marigold" icon={<ShieldCheck className="h-5 w-5" />} title={`${s.pendingVerifications} verification ${s.pendingVerifications === 1 ? 'request' : 'requests'} waiting`}
              action={<Link to="/admin/verifications" className="font-semibold underline">Review</Link>}>
              Organizers can't publish until they're verified.
            </Notice>
          )}
          {s.openReports > 0 && (
            <Notice tone="blood" icon={<Flag className="h-5 w-5" />} title={`${s.openReports} open ${s.openReports === 1 ? 'report' : 'reports'}`}
              action={<Link to="/admin/reports" className="font-semibold underline">Moderate</Link>}>
              Safety reports are listed first.
            </Notice>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => <Card key={t.label} className="p-4"><Stat value={t.value} label={t.label} tone={t.tone} /></Card>)}
      </div>
      {s.suspended > 0 && <p className="text-sm text-ink-soft">{s.suspended} suspended {s.suspended === 1 ? 'account' : 'accounts'} · <Link to="/admin/users" className="link">Manage users</Link></p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Sign-ups per day" subtitle="Last 30 days" empty={!s.signups.length}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={signups} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={24} />
              <YAxis {...axis} allowDecimals={false} width={44} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: CHART.axis, strokeDasharray: '3 3' }} />
              <Line isAnimationActive={false} type="linear" dataKey="n" name="Sign-ups" stroke={CHART.primary} strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Verified volunteer hours" subtitle="By month, last 12 months" empty={!s.hours.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="label" {...axis} interval={0} tick={{ fontSize: 11 }} />
              <YAxis {...axis} allowDecimals={false} width={44} />
              <Tooltip content={<ChartTooltip labelFormat={(l) => monthly.find((m) => m.label === l)?.full ?? l} />} cursor={{ fill: CHART.grid, opacity: 0.5 }} />
              <Bar isAnimationActive={false} dataKey="hours" name="Hours" fill={CHART.primary} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card>
        <h2 className="text-base font-bold">Events by category</h2>
        <p className="text-sm text-ink-faint">Published and completed events</p>
        {categories.length === 0 ? (
          <EmptyState title="No events yet" className="py-8" />
        ) : (
          <div className="mt-3" style={{ height: Math.max(160, categories.length * 34 + 20) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categories} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} horizontal={false} />
                <XAxis type="number" {...axis} allowDecimals={false} />
                <YAxis type="category" dataKey="label" {...axis} width={150} tick={{ fill: '#4A5468', fontSize: 13 }} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: CHART.grid, opacity: 0.5 }} />
                <Bar isAnimationActive={false} dataKey="n" name="Events" fill={CHART.primary} radius={[0, 4, 4, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {categories.length > 0 && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-ink-soft">Show as table</summary>
            <table className="mt-2 w-full max-w-sm text-left">
              <thead><tr className="text-ink-faint"><th className="py-1 font-semibold">Category</th><th className="py-1 text-right font-semibold">Events</th></tr></thead>
              <tbody>{categories.map((c) => <tr key={c.label} className="border-t border-paper-line"><td className="py-1">{c.label}</td><td className="py-1 text-right tabular-nums">{c.n}</td></tr>)}</tbody>
            </table>
          </details>
        )}
      </Card>
    </div>
  );
}
