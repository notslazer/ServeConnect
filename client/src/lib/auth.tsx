import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, refreshAccess, setAccessToken, setOnAuthLost } from './api';
import { disconnectSocket } from './socket';
import type { Me } from './types';

type Status = 'loading' | 'authed' | 'anon';
interface Ctx {
  user: Me | null;
  status: Status;
  /** Call with the {accessToken, user} payload returned by any sign-in endpoint. */
  signIn: (payload: { accessToken: string; user: Me }) => void;
  signOut: () => Promise<void>;
  setUser: (u: Me) => void;
  reload: () => Promise<void>;
}
const AuthContext = createContext<Ctx>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<Me | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const qc = useQueryClient();

  useEffect(() => {
    const onUser = (e: Event) => setUserState((e as CustomEvent).detail);
    window.addEventListener('sc:user', onUser);
    setOnAuthLost(() => {
      setUserState(null);
      setStatus('anon');
      disconnectSocket();
    });
    refreshAccess().then((ok) => setStatus(ok ? 'authed' : 'anon'));
    return () => window.removeEventListener('sc:user', onUser);
  }, []);

  const signIn = useCallback((p: { accessToken: string; user: Me }) => {
    setAccessToken(p.accessToken);
    setUserState(p.user);
    setStatus('authed');
  }, []);

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST', noRefresh: true }).catch(() => {});
    setAccessToken(null);
    setUserState(null);
    setStatus('anon');
    disconnectSocket();
    qc.clear();
  }, [qc]);

  const reload = useCallback(async () => {
    setUserState(await api<Me>('/users/me'));
  }, []);

  return <AuthContext.Provider value={{ user, status, signIn, signOut, setUser: setUserState, reload }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
/** For components rendered only inside authenticated routes. */
export const useMe = () => useContext(AuthContext).user as Me;
