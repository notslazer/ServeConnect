import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import toast from 'react-hot-toast';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Pick up to `max` images with previews and client-side size/type checks (the server re-validates). */
export function ImagePicker({ files, onChange, max = 6, maxMb = 8, label = 'Add photos' }: { files: File[]; onChange: (f: File[]) => void; max?: number; maxMb?: number; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const u = files.map((f) => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach(URL.revokeObjectURL);
  }, [files]);
  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!ALLOWED.includes(f.type)) { toast.error(`${f.name}: only JPG, PNG, WebP or GIF images.`); continue; }
      if (f.size > maxMb * 1024 * 1024) { toast.error(`${f.name} is larger than ${maxMb} MB.`); continue; }
      if (next.length >= max) { toast.error(`You can add up to ${max} photos.`); break; }
      next.push(f);
    }
    onChange(next);
  };
  return (
    <div>
      {files.length > 0 && (
        <div className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {urls.map((u, i) => (
            <div key={u} className="relative aspect-square overflow-hidden rounded-xl bg-paper">
              <img src={u} alt="" className="h-full w-full object-cover" />
              <button type="button" aria-label="Remove photo" onClick={() => onChange(files.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-ink/70 p-1 text-white"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
      <input ref={input} type="file" accept={ALLOWED.join(',')} multiple={max > 1} hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      {files.length < max && (
        <button type="button" onClick={() => input.current?.click()} className="inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold text-brand-600 hover:bg-brand-50">
          <ImagePlus className="h-5 w-5" /> {label}
        </button>
      )}
    </div>
  );
}

/** Single-file upload button used for avatars, covers, documents. */
export function FileButton({ accept, onFile, children, className }: { accept: string; onFile: (f: File) => void; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept={accept} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      <button type="button" className={className} onClick={() => ref.current?.click()}>{children}</button>
    </>
  );
}
