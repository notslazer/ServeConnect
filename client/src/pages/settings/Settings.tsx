import { ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Bell, Building2, Droplet, Eye, KeyRound, ShieldCheck, User, UserCog } from 'lucide-react';
import { useMe } from '../../lib/auth';
import { PageHeader } from '../../components/ui';
import AccountSettings from './AccountSettings';
import ProfileSettings from './ProfileSettings';
import SecuritySettings from './SecuritySettings';
import PrivacySettings from './PrivacySettings';
import NotificationSettings from './NotificationSettings';
import DonorSettings from './DonorSettings';
import VerificationSettings from './VerificationSettings';
import CompanySettings from './CompanySettings';

interface Item { path: string; label: string; icon: ReactNode; element: ReactNode; show: boolean }

export default function Settings() {
  const me = useMe();
  const { t } = useTranslation();
  const items: Item[] = [
    { path: 'account', label: t('settings.account', 'Account'), icon: <UserCog />, element: <AccountSettings />, show: true },
    { path: 'profile', label: t('settings.profile', 'Profile'), icon: <User />, element: <ProfileSettings />, show: true },
    { path: 'security', label: t('settings.security', 'Security'), icon: <KeyRound />, element: <SecuritySettings />, show: true },
    { path: 'privacy', label: t('settings.privacy', 'Privacy'), icon: <Eye />, element: <PrivacySettings />, show: true },
    { path: 'notifications', label: t('settings.notifications', 'Notifications'), icon: <Bell />, element: <NotificationSettings />, show: true },
    { path: 'donor', label: t('settings.donor', 'Blood donor'), icon: <Droplet />, element: <DonorSettings />, show: true },
    { path: 'verification', label: t('settings.verification', 'Verification'), icon: <ShieldCheck />, element: <VerificationSettings />, show: me.role !== 'admin' },
    { path: 'company', label: t('settings.company', 'Company team'), icon: <Building2 />, element: <CompanySettings />, show: me.role === 'volunteer' },
  ];
  const visible = items.filter((i) => i.show);

  return (
    <div>
      <PageHeader title={t('nav.settings', 'Settings')} subtitle="Manage your account, profile, privacy and notifications." />
      <div className="grid gap-5 lg:grid-cols-[210px_1fr]">
        <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
          <ul className="flex gap-1.5 lg:sticky lg:top-6 lg:flex-col lg:gap-0.5">
            {visible.map((i) => (
              <li key={i.path} className="shrink-0">
                <NavLink
                  to={`/settings/${i.path}`}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-2.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[15px] font-semibold transition lg:rounded-xl lg:px-3 lg:py-2.5 [&>svg]:h-[18px] [&>svg]:w-[18px]',
                      isActive ? 'bg-brand-600 text-white lg:bg-brand-50 lg:text-brand-700' : 'border border-paper-line bg-white text-ink-soft hover:text-ink lg:border-transparent lg:bg-transparent lg:hover:bg-white',
                    )
                  }
                >
                  {i.icon}
                  {i.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          <Routes>
            <Route index element={<Navigate to="account" replace />} />
            {visible.map((i) => <Route key={i.path} path={i.path} element={i.element} />)}
            <Route path="*" element={<Navigate to="/settings/account" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
