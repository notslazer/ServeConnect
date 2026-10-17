/* Typed fetch wrapper: attaches the in-memory access token, transparently refreshes it once on 401
 * using the httpOnly refresh cookie, and turns API errors into ApiError with per-field messages. */
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

let accessToken: string | null = null;
let onAuthLost: (() => void) | null = null;
export const setAccessToken = (t: string | null) => (accessToken = t);
export const getAccessToken = () => accessToken;
export const setOnAuthLost = (fn: () => void) => (onAuthLost = fn);

export class ApiError extends Error {
  status: number;
  code: string;
  fields: Record<string, string>;
  data: any;
  constructor(status: number, message: string, code = 'error', fields: Record<string, string> = {}, data?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.data = data;
  }
}

interface Opts {
  method?: string;
  body?: unknown;
  form?: FormData;
  query?: Record<string, string | number | boolean | undefined | null>;
  raw?: boolean;
  noRefresh?: boolean;
}

let refreshing: Promise<boolean> | null = null;
export function refreshAccess(): Promise<boolean> {
  refreshing ??= fetch(`${API_URL}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (r) => {
      if (!r.ok) return false;
      const d = await r.json();
      accessToken = d.accessToken;
      window.dispatchEvent(new CustomEvent('sc:user', { detail: d.user }));
      return true;
    })
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  let url = `${API_URL}/api${path}`;
  if (opts.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    const s = qs.toString();
    if (s) url += (url.includes('?') ? '&' : '?') + s;
  }
  const doFetch = () =>
    fetch(url, {
      method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
      credentials: 'include',
      headers: {
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  let res: Response;
  try {
    res = await doFetch();
  } catch {
    throw new ApiError(0, "Can't reach ServeConnect. Check your internet connection and try again.", 'network');
  }
  if (res.status === 401 && !opts.noRefresh && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh')) {
    if (await refreshAccess()) res = await doFetch();
    else if (accessToken) {
      accessToken = null;
      onAuthLost?.();
    }
  }
  if (opts.raw) {
    if (!res.ok) throw new ApiError(res.status, 'Download failed.');
    return res as unknown as T;
  }
  const isJson = res.headers.get('content-type')?.includes('json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const e = (data as any)?.error ?? {};
    throw new ApiError(res.status, e.message ?? 'Something went wrong.', e.code, e.details?.fields ?? {}, data);
  }
  return data as T;
}

/** Downloads an authenticated file (PDF/CSV) and triggers the browser save dialog. */
export async function download(path: string, filename: string) {
  const res = await api<Response>(path, { raw: true });
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
/** Opens an authenticated file in a new tab. */
export async function openFile(path: string) {
  const w = window.open('', '_blank');
  const res = await api<Response>(path, { raw: true });
  const url = URL.createObjectURL(await res.blob());
  if (w) w.location.href = url;
  else window.location.href = url;
}
