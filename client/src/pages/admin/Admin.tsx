import { ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { BarChart3, Flag, Megaphone, ScrollText, ShieldCheck, Users } from 'lucide-react';
import { PageHeader } from '../../components/ui';
import AdminOverview, { useAdminStats } from './AdminOverview';
import AdminVerifications from './AdminVerifications';
import AdminReports from './AdminReports';
import AdminUsers from './AdminUsers';
import AdminBroadcast from './AdminBroadcast';
import AdminAudit from './AdminAudit';

export default function Admin() {
  const { t } = useTranslation();
  const stats = useAdminStats();
  const items: { path: string; label: string; icon: ReactNode; badge?: number; element: ReactNode }[] = [
    { path: 'overview', label: t('admin.overview', 'Overview'), icon: <BarChart3 />, element: <AdminOverview /> },
    { path: 'verifications', label: t('admin.verifications', 'Verifications'), icon: <ShieldCheck />, badge: stats.data?.pendingVerifications, element: <AdminVerifications /> },
    { path: 'reports', label: t('admin.reports', 'Reports'), icon: <Flag />, badge: stats.data?.openReports, element: <AdminReports /> },
    { path: 'users', label: t('admin.users', 'Users'), icon: <Users />, element: <AdminUsers /> },
    { path: 'broadcast', label: t('admin.broadcast', 'Broadcast'), icon: <Megaphone />, element: <AdminBroadcast /> },
    { path: 'audit', label: t('admin.audit', 'Audit log'), icon: <ScrollText />, element: <AdminAudit /> },
  ];
  return (
    <div>
      <PageHeader title={t('nav.admin', 'Admin console')} subtitle="Review verifications, moderate reports and manage the platform." />
      <nav aria-label="Admin sections" className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-1.5 border-b border-paper-line">
          {items.map((i) => (
            <li key={i.path} className="shrink-0">
              <NavLink
                to={`/admin/${i.path}`}
                className={({ isActive }) =>
                  clsx('-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-[15px] font-semibold transition [&>svg]:h-[18px] [&>svg]:w-[18px]', isActive ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-soft hover:text-ink')
                }
              >
                {i.icon}
                {i.label}
                {i.badge ? <span className="rounded-full bg-blood-500 px-1.5 text-xs font-bold leading-5 text-white" aria-label={`${i.badge} waiting`}>{i.badge}</span> : null}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Routes>
        <Route index element={<Navigate to="overview" replace />} />
        {items.map((i) => <Route key={i.path} path={i.path} element={i.element} />)}
        <Route path="*" element={<Navigate to="/admin/overview" replace />} />
      </Routes>
    </div>
  );
}
