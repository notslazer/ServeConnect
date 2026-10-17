import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  Award, Bell, BarChart3, Building2, CalendarDays, HandHeart, HelpCircle, Home, LogOut, MessageCircle, Plus, QrCode,
  Search, Settings, Shield, Trophy, User, Compass, Droplet, PenSquare, CalendarPlus, PackagePlus, Ticket,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, useMe } from '../lib/auth';
import { getSocket } from '../lib/socket';
import { Avatar, Notice, VerifiedBadge } from './ui';
import { Logo } from './Logo';

function useCounts() {
  const { status } = useAuth();
  const enabled = status === 'authed';
  const notif = useQuery({ queryKey: ['notif-count'], queryFn: () => api<{ count: number }>('/notifications/unread-count'), enabled, refetchInterval: 60_000 });
  const chat = useQuery({ queryKey: ['chat-count'], queryFn: () => api<{ count: number }>('/chat/unread-count'), enabled, refetchInterval: 60_000 });
  return { notifications: notif.data?.count ?? 0, messages: chat.data?.count ?? 0 };
}

/** Real-time listeners shared by the whole signed-in app. */
function useRealtime() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const loc = useLocation();
  const locRef = useRef(loc.pathname);
  locRef.current = loc.pathname;
  useEffect(() => {
    const s = getSocket();
    const onNotif = (n: any) => {
      qc.invalidateQueries({ queryKey: ['notif-count'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      if (n.type === 'message' && locRef.current.startsWith('/messages')) return;
      toast(
        (t) => (
          <button className="text-left" onClick={() => { toast.dismiss(t.id); if (n.link) nav(n.link); }}>
            <div className="font-semibold">{n.title}</div>
            {n.body && <div className="text-sm text-ink-soft line-clamp-2">{n.body}</div>}
          </button>
        ),
        { duration: n.priority === 'high' ? 8000 : 4500, icon: n.priority === 'high' ? '🚨' : '🔔' },
      );
    };
    const onConv = () => {
      qc.invalidateQueries({ queryKey: ['chat-count'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    };
    s.on('notification', onNotif);
    s.on('conversation:updated', onConv);
    return () => {
      s.off('notification', onNotif);
      s.off('conversation:updated', onConv);
    };
  }, [qc, nav]);
}

function NavItem({ to, icon, label, badge, end }: { to: string; icon: ReactNode; label: string; badge?: number; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition', isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-soft hover:bg-white hover:text-ink')
      }
    >
      <span className="relative [&>svg]:h-[22px] [&>svg]:w-[22px]">
        {icon}
        {badge ? <span className="absolute -right-2 -top-1.5 min-w-[18px] rounded-full bg-blood-500 px-1 text-center text-[11px] font-bold leading-[18px] text-white">{badge > 99 ? '99+' : badge}</span> : null}
      </span>
      {label}
    </NavLink>
  );
}

function CreateMenu({ onDone, className }: { onDone?: () => void; className?: string }) {
  const me = useMe();
  const nav = useNavigate();
  const isOrg = ['organizer', 'csr', 'admin'].includes(me.role);
  const go = (to: string) => { onDone?.(); nav(to); };
  const item = 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] hover:bg-paper';
  return (
    <div className={clsx('w-64 rounded-2xl border border-paper-line bg-white p-1.5 shadow-lift', className)}>
      <button className={item} onClick={() => go('/feed?compose=1')}><PenSquare className="h-5 w-5 text-brand-600" /> Write a post</button>
      {isOrg && <button className={item} onClick={() => go('/events/new')}><CalendarPlus className="h-5 w-5 text-brand-600" /> Create an event</button>}
      <button className={item} onClick={() => go('/requests/blood/new')}><Droplet className="h-5 w-5 text-blood-500" /> Request blood</button>
      {isOrg && <button className={item} onClick={() => go('/requests/resources/new')}><PackagePlus className="h-5 w-5 text-marigold-600" /> Start a donation drive</button>}
    </div>
  );
}

function Sidebar() {
  const me = useMe();
  const { signOut } = useAuth();
  const { t } = useTranslation();
  const counts = useCounts();
  const [createOpen, setCreateOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-paper-line px-3 py-4 lg:flex">
      <Link to="/feed" className="mb-5 px-3"><Logo /></Link>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Main">
        <NavItem to="/feed" icon={<Home />} label={t('nav.home')} />
        <NavItem to="/explore" icon={<Compass />} label={t('nav.explore')} />
        <NavItem to="/events" icon={<CalendarDays />} label={t('nav.events')} end />
        <NavItem to="/requests" icon={<HandHeart />} label={t('nav.requests')} />
        <NavItem to="/messages" icon={<MessageCircle />} label={t('nav.messages')} badge={counts.messages} />
        <NavItem to="/notifications" icon={<Bell />} label={t('nav.notifications')} badge={counts.notifications} />
        <NavItem to="/events/mine" icon={<Ticket />} label={t('nav.myEvents')} />
        <NavItem to="/scan" icon={<QrCode />} label={t('nav.scan')} />
        <NavItem to="/leaderboard" icon={<Trophy />} label={t('nav.leaderboard')} />
        <NavItem to="/certificates" icon={<Award />} label={t('nav.certificates')} />
        {['organizer', 'admin'].includes(me.role) && <NavItem to="/dashboard" icon={<BarChart3 />} label={t('nav.dashboard')} />}
        {me.role === 'csr' && <NavItem to="/csr" icon={<Building2 />} label={t('nav.csr')} />}
        {me.role === 'admin' && <NavItem to="/admin" icon={<Shield />} label={t('nav.admin')} />}
        <NavItem to={`/u/${me.handle}`} icon={<User />} label={t('nav.profile')} />
        <div className="relative mt-3 px-1">
          <button onClick={() => setCreateOpen((v) => !v)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white hover:bg-brand-700">
            <Plus className="h-5 w-5" /> {t('nav.create')}
          </button>
          {createOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setCreateOpen(false)} />
              <CreateMenu className="absolute left-0 top-14 z-40" onDone={() => setCreateOpen(false)} />
            </>
          )}
        </div>
      </nav>
      <div className="relative mt-3">
        <button onClick={() => setUserOpen((v) => !v)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white">
          <Avatar src={me.avatarUrl} name={me.name} size={36} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 truncate font-semibold">{me.name}{me.verificationStatus === 'verified' && <VerifiedBadge />}</span>
            <span className="block truncate text-sm text-ink-faint">@{me.handle}</span>
          </span>
        </button>
        {userOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setUserOpen(false)} />
            <div className="absolute bottom-14 left-0 z-40 w-56 rounded-2xl border border-paper-line bg-white p-1.5 shadow-lift">
              <Link onClick={() => setUserOpen(false)} to="/settings" className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-paper"><Settings className="h-5 w-5" /> {t('nav.settings')}</Link>
              <Link onClick={() => setUserOpen(false)} to="/help" className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-paper"><HelpCircle className="h-5 w-5" /> {t('nav.help')}</Link>
              <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-blood-600 hover:bg-paper"><LogOut className="h-5 w-5" /> {t('nav.signOut')}</button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function MobileTopBar() {
  const me = useMe();
  const counts = useCounts();
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-paper-line bg-paper/95 px-4 py-2.5 backdrop-blur lg:hidden">
      <Link to="/feed"><Logo compact /></Link>
      <div className="flex items-center gap-1">
        <Link to="/explore" aria-label="Search" className="rounded-full p-2 text-ink-soft hover:bg-white"><Search className="h-[22px] w-[22px]" /></Link>
        <Link to="/notifications" aria-label="Notifications" className="relative rounded-full p-2 text-ink-soft hover:bg-white">
          <Bell className="h-[22px] w-[22px]" />
          {counts.notifications > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-blood-500 ring-2 ring-paper" />}
        </Link>
        <Link to="/messages" aria-label="Messages" className="relative rounded-full p-2 text-ink-soft hover:bg-white">
          <MessageCircle className="h-[22px] w-[22px]" />
          {counts.messages > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-blood-500 ring-2 ring-paper" />}
        </Link>
        <Link to="/settings" aria-label="Settings" className="ml-1"><Avatar src={me.avatarUrl} name={me.name} size={30} /></Link>
      </div>
    </header>
  );
}

function MobileBottomNav() {
  const me = useMe();
  const [createOpen, setCreateOpen] = useState(false);
  const cls = ({ isActive }: { isActive: boolean }) => clsx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold', isActive ? 'text-brand-600' : 'text-ink-faint');
  return (
    <>
      {createOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={() => setCreateOpen(false)} />
          <CreateMenu className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 lg:hidden" onDone={() => setCreateOpen(false)} />
        </>
      )}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex border-t border-paper-line bg-white lg:hidden" aria-label="Main">
        <NavLink to="/feed" className={cls}><Home className="h-6 w-6" />Home</NavLink>
        <NavLink to="/events" end className={cls}><CalendarDays className="h-6 w-6" />Events</NavLink>
        <button onClick={() => setCreateOpen((v) => !v)} className="flex flex-1 flex-col items-center justify-center" aria-label="Create">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lift"><Plus className="h-6 w-6" /></span>
        </button>
        <NavLink to="/scan" className={cls}><QrCode className="h-6 w-6" />Check in</NavLink>
        <NavLink to={`/u/${me.handle}`} className={cls}><User className="h-6 w-6" />Profile</NavLink>
      </nav>
    </>
  );
}

function AccountBanners() {
  const me = useMe();
  if (me.accountStatus === 'suspended') {
    return <div className="mb-4"><Notice tone="blood" title="Your account is suspended">{me.suspendedReason ?? 'You can browse, but posting, registering and messaging are disabled.'} Contact support to appeal.</Notice></div>;
  }
  if (me.isMinor && me.guardianConsent !== 'granted') {
    return (
      <div className="mb-4">
        <Notice tone="marigold" title={me.guardianConsent === 'denied' ? 'Your guardian declined consent' : 'Waiting for your parent or guardian'}
          action={<Link to="/settings/account" className="font-semibold underline">Manage</Link>}>
          You can explore and follow causes. In-person events unlock once {me.guardianEmail ?? 'your guardian'} approves.
        </Notice>
      </div>
    );
  }
  return null;
}

export default function Layout() {
  useRealtime();
  const loc = useLocation();
  const fullBleed = loc.pathname.startsWith('/messages');
  return (
    <div className="mx-auto flex max-w-[1320px]">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <MobileTopBar />
        <main id="main" className={clsx('mx-auto w-full', fullBleed ? 'max-w-none px-0 pb-0 lg:px-4 lg:py-4' : 'max-w-[1040px] px-4 pb-24 pt-4 sm:px-6 lg:pb-10 lg:pt-6')}>
          {!fullBleed && <AccountBanners />}
          <Outlet />
        </main>
        <MobileBottomNav />
      </div>
    </div>
  );
}
