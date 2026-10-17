/* Upload handling: size limits, magic-byte file-type validation and optional ClamAV virus scanning. */
import multer from 'multer';
import net from 'net';
import { RequestHandler } from 'express';
import { env } from '../config/env';
import { badRequest } from './errors';

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const DOC_TYPES = [...IMAGE_TYPES, 'application/pdf'];

/** Detect the real file type from its first bytes (never trust the client-supplied mimetype). */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 6).toString('ascii') === 'GIF87a' || buf.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image/gif';
  if (buf.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

/** Streams a buffer to a clamd daemon (INSTREAM). Returns true when clean. Skipped when CLAMAV_HOST is unset. */
export function scanBuffer(buf: Buffer): Promise<boolean> {
  if (!env.clamavHost) return Promise.resolve(true);
  return new Promise((resolve) => {
    const sock = net.createConnection(env.clamavPort, env.clamavHost);
    let reply = '';
    sock.setTimeout(15000, () => { sock.destroy(); resolve(false); });
    sock.on('connect', () => {
      sock.write('zINSTREAM\0');
      for (let i = 0; i < buf.length; i += 64 * 1024) {
        const chunk = buf.subarray(i, i + 64 * 1024);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length);
        sock.write(len);
        sock.write(chunk);
      }
      sock.write(Buffer.alloc(4));
    });
    sock.on('data', (d) => (reply += d.toString()));
    sock.on('end', () => resolve(/OK/.test(reply) && !/FOUND/.test(reply)));
    sock.on('error', () => resolve(false));
  });
}

const memory = multer.memoryStorage();

export function uploader(opts: { maxMb: number; maxFiles: number; field: string }): RequestHandler {
  return multer({ storage: memory, limits: { fileSize: opts.maxMb * 1024 * 1024, files: opts.maxFiles } }).array(opts.field, opts.maxFiles);
}

export interface CheckedFile {
  buffer: Buffer;
  mime: string;
  name: string;
  size: number;
}

/** Validates every uploaded file: real type must be in `allowed` and the virus scan must pass. */
export async function checkFiles(files: Express.Multer.File[] | undefined, allowed: string[]): Promise<CheckedFile[]> {
  const out: CheckedFile[] = [];
  for (const f of files ?? []) {
    const mime = sniffMime(f.buffer);
    if (!mime || !allowed.includes(mime)) {
      throw badRequest(`"${f.originalname}" is not an allowed file type. Allowed: ${allowed.map((m) => m.split('/')[1]).join(', ')}`);
    }
    if (!(await scanBuffer(f.buffer))) throw badRequest(`"${f.originalname}" failed the security scan and was rejected.`);
    out.push({ buffer: f.buffer, mime, name: f.originalname.slice(0, 200), size: f.size });
  }
  return out;
}
