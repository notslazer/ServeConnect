/* ServeConnect design system primitives. Every page builds from these so the app stays consistent. */
import {
  ButtonHTMLAttributes, forwardRef, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes,
  useCallback, useEffect, useId, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, LinkProps, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { ArrowLeft, BadgeCheck, Loader2, X } from 'lucide-react';
import { ApiError } from '../lib/api';
import { initials } from '../lib/format';

// ───────────────────────── buttons ─────────────────────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'marigold' | 'outline';
type Size = 'sm' | 'md' | 'lg';
const btnBase = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition select-none disabled:opacity-55 disabled:cursor-not-allowed whitespace-nowrap';
const btnVariant: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800',
  secondary: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
  outline: 'border border-paper-line bg-white text-ink hover:bg-paper',
  ghost: 'text-ink-soft hover:bg-paper hover:text-ink',
  danger: 'bg-blood-500 text-white hover:bg-blood-600',
  marigold: 'bg-marigold-400 text-ink hover:bg-marigold-500',
};
const btnSize: Record<Size, string> = { sm: 'text-sm px-3 py-1.5', md: 'text-[15px] px-4 py-2.5', lg: 'text-base px-5 py-3' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} className={clsx(btnBase, btnVariant[variant], btnSize[size], block && 'w-full', className)} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({ variant = 'primary', size = 'md', icon, block, className, children, ...rest }: LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode; block?: boolean }) {
  return (
    <Link className={clsx(btnBase, btnVariant[variant], btnSize[size], block && 'w-full', className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={clsx('inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-paper hover:text-ink transition', className)} {...rest}>
      {children}
    </button>
  );
}

// ───────────────────────── form fields ─────────────────────────
interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
}
function FieldShell({ id, label, hint, error, optional, className, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className={clsx('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="block text-sm font-semibold text-ink">
          {label} {optional && <span className="font-normal text-ink-faint">(optional)</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-err`} role="alert" className="text-sm text-blood-600">{error}</p>
      ) : hint ? (
        <p className="text-sm text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(function Input(
  { label, hint, error, optional, className, id, ...rest }, ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} optional={optional} className={className}>
      <input ref={ref} id={fid} aria-invalid={Boolean(error)} aria-describedby={error ? `${fid}-err` : undefined} className={clsx('input', error && 'input-error')} {...rest} />
    </FieldShell>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps>(function Textarea(
  { label, hint, error, optional, className, id, rows = 4, ...rest }, ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} optional={optional} className={className}>
      <textarea ref={ref} id={fid} rows={rows} aria-invalid={Boolean(error)} className={clsx('input resize-y', error && 'input-error')} {...rest} />
    </FieldShell>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldProps & { options: Record<string, string> | [string, string][]; placeholder?: string }>(function Select(
  { label, hint, error, optional, className, id, options, placeholder, ...rest }, ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  const entries = Array.isArray(options) ? options : Object.entries(options);
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} optional={optional} className={className}>
      <select ref={ref} id={fid} aria-invalid={Boolean(error)} className={clsx('input pr-8', error && 'input-error')} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {entries.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </FieldShell>
  );
});

export function Checkbox({ label, checked, onChange, hint, error, id }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode; error?: string; id?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div>
      <label htmlFor={fid} className="flex cursor-pointer items-start gap-3">
        <input id={fid} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 rounded border-paper-line text-brand-600 focus:ring-brand-400" />
        <span className="text-[15px] text-ink">
          {label}
          {hint && <span className="block text-sm text-ink-faint">{hint}</span>}
        </span>
      </label>
      {error && <p role="alert" className="mt-1 text-sm text-blood-600">{error}</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <div className="text-[15px] font-medium text-ink">{label}</div>
        {hint && <div className="text-sm text-ink-faint">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx('relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50', checked ? 'bg-brand-600' : 'bg-paper-line')}
      >
        <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </div>
  );
}

/** Multi-select chips (skills, interests). */
export function ChipSelect({ options, value, onChange, max }: { options: Record<string, string>; value: string[]; onChange: (v: string[]) => void; max?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(options).map(([k, l]) => {
        const on = value.includes(k);
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => {
              if (on) onChange(value.filter((x) => x !== k));
              else if (!max || value.length < max) onChange([...value, k]);
              else toast(`You can pick up to ${max}.`);
            }}
            className={clsx('rounded-full border px-3 py-1.5 text-sm font-medium transition', on ? 'border-brand-500 bg-brand-600 text-white' : 'border-paper-line bg-white text-ink-soft hover:border-brand-300 hover:text-ink')}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

// ───────────────────────── display ─────────────────────────
export function Card({ className, children, padded = true, ...rest }: { className?: string; children: ReactNode; padded?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('card', padded && 'p-4 sm:p-5', className)} {...rest}>{children}</div>;
}

type Tone = 'brand' | 'marigold' | 'blood' | 'leaf' | 'neutral';
const tones: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-700',
  marigold: 'bg-marigold-50 text-marigold-700',
  blood: 'bg-blood-50 text-blood-600',
  leaf: 'bg-leaf-50 text-leaf-700',
  neutral: 'bg-paper text-ink-soft',
};
export function Pill({ tone = 'neutral', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}>{icon}{children}</span>;
}

export function VerifiedBadge({ className, size = 16 }: { className?: string; size?: number }) {
  return <BadgeCheck aria-label="Verified" className={clsx('inline shrink-0 fill-marigold-400 text-white', className)} width={size} height={size} />;
}

const avatarColors = ['bg-brand-500', 'bg-marigold-500', 'bg-leaf-500', 'bg-blood-500', 'bg-brand-700', 'bg-ink-soft'];
export function Avatar({ src, name, size = 40, className }: { src?: string | null; name: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const color = avatarColors[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % avatarColors.length];
  return src && !failed ? (
    <img src={src} alt="" width={size} height={size} onError={() => setFailed(true)} className={clsx('shrink-0 rounded-full object-cover bg-paper', className)} style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className={clsx('inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white', color, className)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name || '?')}
    </span>
  );
}

/** Avatar + name + verified tick, linking to the profile. */
export function UserLine({ user, sub, size = 40, className }: { user: { name: string; handle: string; avatarUrl: string | null; verified?: boolean }; sub?: ReactNode; size?: number; className?: string }) {
  return (
    <Link to={`/u/${user.handle}`} className={clsx('flex min-w-0 items-center gap-3 group', className)}>
      <Avatar src={user.avatarUrl} name={user.name} size={size} />
      <span className="min-w-0">
        <span className="flex items-center gap-1 font-semibold text-ink group-hover:underline">
          <span className="truncate">{user.name}</span>
          {user.verified && <VerifiedBadge />}
        </span>
        {sub && <span className="block truncate text-sm text-ink-faint">{sub}</span>}
      </span>
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 aria-label="Loading" className={clsx('h-5 w-5 animate-spin text-brand-500', className)} />;
}
export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner className="h-7 w-7" />
    </div>
  );
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-lg bg-paper-line/70', className)} />;
}

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex flex-col items-center px-6 py-12 text-center', className)}>
      {icon && <div className="mb-3 text-ink-faint [&>svg]:h-10 [&>svg]:w-10">{icon}</div>}
      <h3 className="text-lg font-bold">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-ink-soft">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong.';
  return <EmptyState title={(error as ApiError)?.status === 404 ? 'Not found' : "Couldn't load this"} body={msg} action={retry && <Button variant="outline" onClick={retry}>Try again</Button>} />;
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: boolean | string }) {
  const nav = useNavigate();
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        {back && (
          <IconButton label="Back" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))} className="-ml-2 mt-0.5">
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold sm:text-[28px]">{title}</h1>
          {subtitle && <p className="mt-0.5 text-ink-soft">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [value]);
  return (
    <div ref={ref} role="tablist" className={clsx('flex gap-1 overflow-x-auto border-b border-paper-line', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={clsx('-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[15px] font-semibold transition', value === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-soft hover:text-ink')}
        >
          {t.label}
          {t.count !== undefined && <span className="rounded-full bg-paper px-1.5 text-xs text-ink-soft">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Stat({ value, label, tone }: { value: ReactNode; label: ReactNode; tone?: 'brand' | 'marigold' | 'blood' | 'leaf' }) {
  const color = { brand: 'text-brand-600', marigold: 'text-marigold-600', blood: 'text-blood-500', leaf: 'text-leaf-600' }[tone ?? 'brand'];
  return (
    <div>
      <div className={clsx('font-display text-2xl font-extrabold', color)}>{value}</div>
      <div className="text-sm text-ink-soft">{label}</div>
    </div>
  );
}

export function ProgressBar({ value, max, tone = 'brand' }: { value: number; max: number; tone?: 'brand' | 'leaf' | 'marigold' | 'blood' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = { brand: 'bg-brand-500', leaf: 'bg-leaf-500', marigold: 'bg-marigold-400', blood: 'bg-blood-500' }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-paper-line" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ───────────────────────── overlays ─────────────────────────
export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input,textarea,select,button:not([data-close])')?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}
        className={clsx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }[size])}>
        <div className="flex items-center justify-between border-b border-paper-line px-5 py-3.5">
          <h2 className="text-lg font-bold">{title}</h2>
          <IconButton label="Close" data-close onClick={onClose}><X className="h-5 w-5" /></IconButton>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-paper-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Promise-based confirmation dialog: const [confirm, dialog] = useConfirm(); if (await confirm({...})) … */
export function useConfirm() {
  const [state, setState] = useState<null | { title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean; resolve: (v: boolean) => void }>(null);
  const confirm = useCallback(
    (o: { title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean }) => new Promise<boolean>((resolve) => setState({ ...o, resolve })),
    [],
  );
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const dialog = (
    <Modal open={Boolean(state)} onClose={() => close(false)} title={state?.title ?? ''} size="sm"
      footer={<><Button variant="ghost" onClick={() => close(false)}>Cancel</Button><Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{state?.confirmLabel ?? 'Confirm'}</Button></>}>
      {state?.body && <div className="text-ink-soft">{state.body}</div>}
    </Modal>
  );
  return [confirm, dialog] as const;
}

// ───────────────────────── errors ─────────────────────────
/** Show an API error as a toast (use for actions that aren't forms). */
export function toastError(e: unknown) {
  toast.error(e instanceof Error ? e.message : 'Something went wrong.');
}
/** Pull a field-specific message out of an ApiError. */
export const fieldError = (e: unknown, field: string) => (e instanceof ApiError ? e.fields[field] : undefined);

export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return <div role="alert" className="rounded-xl border border-blood-100 bg-blood-50 px-3.5 py-2.5 text-sm text-blood-700">{msg}</div>;
}

export function Notice({ tone = 'brand', title, children, action, icon }: { tone?: Tone; title?: ReactNode; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  const border = { brand: 'border-brand-100', marigold: 'border-marigold-100', blood: 'border-blood-100', leaf: 'border-leaf-100', neutral: 'border-paper-line' }[tone];
  return (
    <div className={clsx('flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center', tones[tone], border)}>
      {icon && <div className="shrink-0">{icon}</div>}
      <div className="flex-1 text-sm">
        {title && <div className="font-bold">{title}</div>}
        {children && <div className="opacity-90">{children}</div>}
      </div>
      {action}
    </div>
  );
}
