import { api } from './api';

const b64ToUint8 = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Asks permission and subscribes this device to Web Push. Returns a human-readable status. */
export async function enablePush(): Promise<string> {
  if (!pushSupported()) return 'Push notifications are not supported on this browser. On iPhone, add ServeConnect to your Home Screen first.';
  const { key } = await api<{ key: string | null }>('/notifications/push/public-key');
  if (!key) return 'Push notifications are not configured on the server.';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'Notifications are blocked. Allow them in your browser settings.';
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key) });
  await api('/notifications/push/subscribe', { body: sub.toJSON() });
  return 'ok';
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (sub) {
    await api('/notifications/push/unsubscribe', { body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe();
  }
}
