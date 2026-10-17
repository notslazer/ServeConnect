export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <rect width="512" height="512" rx="112" fill="#313C99" />
      <circle cx="256" cy="256" r="150" fill="none" stroke="#F6B12A" strokeWidth="28" strokeDasharray="18 14" />
      <path d="M176 262c0-46 36-78 80-78 30 0 52 12 66 32l-34 24c-8-12-18-18-32-18-22 0-38 16-38 40s16 40 38 40c14 0 24-6 32-18l34 24c-14 20-36 32-66 32-44 0-80-32-80-78z" fill="#fff" />
    </svg>
  );
}

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={compact ? 30 : 34} />
      <span className={`font-display font-extrabold tracking-tight text-brand-700 ${compact ? 'text-lg' : 'text-xl'}`}>ServeConnect</span>
    </span>
  );
}
