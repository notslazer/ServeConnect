import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { CameraOff } from 'lucide-react';

/** Rear-camera QR scanner. Calls onScan once per distinct code. Degrades gracefully when the camera is unavailable. */
export function QRScanner({ onScan, paused, onError }: { onScan: (text: string) => void; paused?: boolean; onError?: (msg: string) => void }) {
  const id = useRef(`qr-${Math.random().toString(36).slice(2)}`).current;
  const scanner = useRef<Html5Qrcode | null>(null);
  const last = useRef<string>('');
  const cb = useRef(onScan);
  cb.current = onScan;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (paused) return;
    const s = new Html5Qrcode(id, { verbose: false } as any);
    scanner.current = s;
    let stopped = false;
    s.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: (w, h) => { const size = Math.floor(Math.min(w, h) * 0.7); return { width: size, height: size }; } },
      (text) => {
        if (text === last.current) return;
        last.current = text;
        cb.current(text);
      },
      () => {},
    ).catch((e) => {
      if (stopped) return;
      const msg = String(e).includes('NotAllowed') ? 'Camera permission was denied.' : 'No camera is available on this device.';
      setError(msg);
      onError?.(msg);
    });
    return () => {
      stopped = true;
      s.isScanning ? s.stop().then(() => s.clear()).catch(() => {}) : s.clear();
    };
  }, [id, paused]);

  if (error) {
    return (
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl bg-ink/90 p-6 text-center text-white">
        <CameraOff className="h-10 w-10 opacity-70" />
        <div className="font-semibold">{error}</div>
        <div className="text-sm opacity-80">Use the event code or your personal check-in code below instead.</div>
      </div>
    );
  }
  return <div id={id} className="aspect-square w-full overflow-hidden rounded-2xl bg-ink [&_video]:!h-full [&_video]:!w-full [&_video]:object-cover" />;
}
