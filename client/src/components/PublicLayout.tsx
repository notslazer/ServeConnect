import { Link, Outlet } from 'react-router-dom';
import { Logo } from './Logo';
import { ButtonLink } from './ui';

/** Minimal chrome for signed-out visitors viewing public pages (events, profiles, certificates, help). */
export default function PublicLayout() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-paper-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1040px] items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/"><Logo compact /></Link>
          <div className="flex gap-2">
            <ButtonLink to="/login" variant="ghost" size="sm">Sign in</ButtonLink>
            <ButtonLink to="/register" size="sm">Join free</ButtonLink>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1040px] px-4 py-6 sm:px-6"><Outlet /></main>
      <footer className="border-t border-paper-line py-6 text-center text-sm text-ink-faint">
        <Link to="/help" className="hover:underline">Help</Link> · <Link to="/terms" className="hover:underline">Terms</Link> · <Link to="/privacy" className="hover:underline">Privacy</Link>
      </footer>
    </div>
  );
}
