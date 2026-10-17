/* Shared layout for the Terms of Service and Privacy Policy pages. */
import { ReactNode, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Scale } from 'lucide-react';
import { Notice } from './ui';

export interface LegalSection { id: string; title: string; body: ReactNode }

export function LegalDoc({ title, effective, intro, sections, other }: { title: string; effective: string; intro: ReactNode; sections: LegalSection[]; other: { to: string; label: string } }) {
  useEffect(() => { document.title = `${title} · ServeConnect`; }, [title]);
  return (
    <article className="mx-auto max-w-[920px]">
      <header className="mb-5">
        <h1 className="text-[28px] font-extrabold sm:text-4xl">{title}</h1>
        <p className="mt-1 text-ink-soft">Effective {effective}</p>
      </header>
      <div className="mb-6">
        <Notice tone="marigold" icon={<Scale className="h-5 w-5" />} title="Draft for legal review">
          This document has been prepared as a working draft and must be reviewed by a qualified lawyer before ServeConnect launches publicly.
        </Notice>
      </div>
      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Contents" className="lg:sticky lg:top-6 lg:self-start">
          <h2 className="mb-2 text-sm font-bold text-ink-soft">Contents</h2>
          <ol className="space-y-1 text-sm">
            {sections.map((s, i) => (
              <li key={s.id}><a href={`#${s.id}`} className="block rounded-lg px-2 py-1 text-ink-soft hover:bg-white hover:text-ink">{i + 1}. {s.title}</a></li>
            ))}
          </ol>
        </nav>
        <div className="card min-w-0 p-5 sm:p-8">
          <div className="legal space-y-3 text-[15px] leading-relaxed text-ink-soft [&_a]:text-brand-600 [&_a:hover]:underline [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
            {intro}
          </div>
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="mt-8 scroll-mt-20">
              <h2 id={`${s.id}-h`} className="mb-3 text-xl font-bold">{i + 1}. {s.title}</h2>
              <div className="space-y-3 text-[15px] leading-relaxed text-ink-soft [&_a]:text-brand-600 [&_a:hover]:underline [&_h3]:mt-4 [&_h3]:font-display [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-ink [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
                {s.body}
              </div>
            </section>
          ))}
          <p className="mt-10 border-t border-paper-line pt-4 text-sm text-ink-faint">
            See also our <Link to={other.to} className="link">{other.label}</Link> and the <Link to="/help" className="link">Help center</Link>.
          </p>
        </div>
      </div>
    </article>
  );
}
