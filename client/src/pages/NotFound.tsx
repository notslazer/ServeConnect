import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarDays, Home, LifeBuoy } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ButtonLink } from '../components/ui';
import { Logo } from '../components/Logo';

export default function NotFound() {
  const { user } = useAuth();
  const loc = useLocation();
  useEffect(() => { document.title = 'Page not found · ServeConnect'; }, []);
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="mx-auto w-full max-w-[1040px] px-4 py-4 sm:px-6">
        <Link to={user ? '/feed' : '/'} aria-label="ServeConnect home"><Logo compact /></Link>
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="max-w-md text-center">
          <div className="stamp mx-auto h-28 w-28" aria-hidden>
            <span className="text-3xl leading-none">404</span>
            <span className="text-[10px] font-bold">not found</span>
          </div>
          <h1 className="mt-8 text-3xl font-extrabold">This page didn’t show up</h1>
          <p className="mt-2 text-ink-soft">
            We couldn’t find <span className="break-all font-mono text-sm text-ink">{loc.pathname}</span>. The link may be mistyped, or the page may have been moved or removed.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <ButtonLink to={user ? '/feed' : '/'} icon={<Home className="h-4 w-4" />}>{user ? 'Go to my feed' : 'Go to home page'}</ButtonLink>
            <ButtonLink to="/events" variant="outline" icon={<CalendarDays className="h-4 w-4" />}>Browse events</ButtonLink>
          </div>
          <p className="mt-6 text-sm text-ink-faint">
            <LifeBuoy className="mr-1 inline h-4 w-4 align-[-3px]" aria-hidden />Looking for something specific? Try the <Link to="/help" className="link">Help center</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}
