import { lazy, ReactNode, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import type { Role } from './lib/types';
import { PageLoader } from './components/ui';
import Layout from './components/Layout';
import PublicLayout from './components/PublicLayout';

// Route-level code splitting keeps the first load fast on 4G (SRS §5.1).
const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const Forgot = lazy(() => import('./pages/auth/Forgot'));
const GuardianConsent = lazy(() => import('./pages/auth/GuardianConsent'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Feed = lazy(() => import('./pages/Feed'));
const PostDetail = lazy(() => import('./pages/PostDetail'));
const Explore = lazy(() => import('./pages/Explore'));
const EventsList = lazy(() => import('./pages/events/EventsList'));
const EventDetail = lazy(() => import('./pages/events/EventDetail'));
const EventForm = lazy(() => import('./pages/events/EventForm'));
const EventManage = lazy(() => import('./pages/events/EventManage'));
const MyEvents = lazy(() => import('./pages/events/MyEvents'));
const CheckIn = lazy(() => import('./pages/events/CheckIn'));
const Dashboard = lazy(() => import('./pages/events/Dashboard'));
const RequestsHome = lazy(() => import('./pages/requests/RequestsHome'));
const BloodForm = lazy(() => import('./pages/requests/BloodForm'));
const BloodDetail = lazy(() => import('./pages/requests/BloodDetail'));
const ResourceForm = lazy(() => import('./pages/requests/ResourceForm'));
const ResourceDetail = lazy(() => import('./pages/requests/ResourceDetail'));
const Messages = lazy(() => import('./pages/Messages'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const Certificates = lazy(() => import('./pages/Certificates'));
const VerifyCertificate = lazy(() => import('./pages/VerifyCertificate'));
const Csr = lazy(() => import('./pages/Csr'));
const Profile = lazy(() => import('./pages/Profile'));
const Settings = lazy(() => import('./pages/settings/Settings'));
const Admin = lazy(() => import('./pages/admin/Admin'));
const Help = lazy(() => import('./pages/static/Help'));
const Terms = lazy(() => import('./pages/static/Terms'));
const Privacy = lazy(() => import('./pages/static/Privacy'));
const NotFound = lazy(() => import('./pages/NotFound'));

function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, status } = useAuth();
  const loc = useLocation();
  if (status === 'loading') return <PageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!user.onboardingCompleted && loc.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/feed" replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const loc = useLocation();
  if (status === 'loading') return <PageLoader />;
  if (user) return <Navigate to={new URLSearchParams(loc.search).get('next') || '/feed'} replace />;
  return <>{children}</>;
}

/** Pages anyone can open; signed-in users see them inside the full app shell. */
function AdaptiveShell() {
  const { user, status } = useAuth();
  if (status === 'loading') return <PageLoader />;
  return user ? <Layout /> : <PublicLayout />;
}

export default function App() {
  const org: Role[] = ['organizer', 'csr', 'admin'];
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<GuestOnly><Landing /></GuestOnly>} />
        <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
        <Route path="/forgot" element={<Forgot />} />
        <Route path="/guardian-consent/:token" element={<GuardianConsent />} />
        <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />

        <Route element={<AdaptiveShell />}>
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/u/:handle" element={<Profile />} />
          <Route path="/posts/:id" element={<PostDetail />} />
          <Route path="/verify/:serial" element={<VerifyCertificate />} />
          <Route path="/help" element={<Help />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
        </Route>

        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/feed" element={<Feed />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/events" element={<EventsList />} />
          <Route path="/events/mine" element={<MyEvents />} />
          <Route path="/events/new" element={<RequireAuth roles={org}><EventForm /></RequireAuth>} />
          <Route path="/events/:id/edit" element={<RequireAuth roles={org}><EventForm /></RequireAuth>} />
          <Route path="/events/:id/manage" element={<EventManage />} />
          <Route path="/scan" element={<CheckIn />} />
          <Route path="/checkin/:eventId" element={<CheckIn />} />
          <Route path="/dashboard" element={<RequireAuth roles={org}><Dashboard /></RequireAuth>} />
          <Route path="/requests" element={<RequestsHome />} />
          <Route path="/requests/blood/new" element={<BloodForm />} />
          <Route path="/requests/blood/:id" element={<BloodDetail />} />
          <Route path="/requests/resources/new" element={<RequireAuth roles={org}><ResourceForm /></RequireAuth>} />
          <Route path="/requests/resources/:id/edit" element={<RequireAuth roles={org}><ResourceForm /></RequireAuth>} />
          <Route path="/requests/resources/:id" element={<ResourceDetail />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/messages/:id" element={<Messages />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/certificates" element={<Certificates />} />
          <Route path="/csr" element={<RequireAuth roles={['csr', 'admin']}><Csr /></RequireAuth>} />
          <Route path="/me" element={<MeRedirect />} />
          <Route path="/settings/*" element={<Settings />} />
          <Route path="/admin/*" element={<RequireAuth roles={['admin']}><Admin /></RequireAuth>} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

function MeRedirect() {
  const { user } = useAuth();
  return <Navigate to={`/u/${user?.handle}`} replace />;
}
