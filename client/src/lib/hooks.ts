import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Ask for the device location on demand. */
export function useGeolocation() {
  const [state, setState] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const locate = () =>
    new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (!navigator.geolocation) {
        setError('Location is not available on this device.');
        return resolve(null);
      }
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const v = { lat: p.coords.latitude, lng: p.coords.longitude };
          setState(v);
          setError(null);
          setLoading(false);
          resolve(v);
        },
        () => {
          setError('Location permission was denied. You can type your area instead.');
          setLoading(false);
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
      );
    });
  return { coords: state, error, loading, locate };
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [q]);
  return m;
}
