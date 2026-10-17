import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

let scriptPromise: Promise<void> | null = null;
function loadGsi() {
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function useAppConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => api<{ appName: string; googleClientId: string | null; vapidPublicKey: string | null; smsEnabled: boolean; emailEnabled: boolean; devMode: boolean }>('/auth/config'),
    staleTime: Infinity,
  });
}

/** Official "Sign in with Google" button (Google Identity Services). Hidden when the server has no GOOGLE_CLIENT_ID. */
export function GoogleButton({ onCredential, text = 'continue_with' }: { onCredential: (credential: string) => void; text?: 'signin_with' | 'signup_with' | 'continue_with' }) {
  const { data } = useAppConfig();
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!data?.googleClientId || !ref.current) return;
    loadGsi()
      .then(() => {
        window.google.accounts.id.initialize({ client_id: data.googleClientId, callback: (r: any) => cb.current(r.credential), ux_mode: 'popup' });
        window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', shape: 'pill', text, width: Math.min(ref.current!.offsetWidth || 360, 400) });
      })
      .catch(() => setFailed(true));
  }, [data?.googleClientId, text]);
  if (!data?.googleClientId || failed) return null;
  return <div ref={ref} className="flex min-h-[44px] w-full justify-center" />;
}
