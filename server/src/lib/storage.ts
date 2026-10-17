/* Media storage abstraction.
 *  - local:      files on disk under UPLOAD_DIR (public/ is served at /uploads, private/ is never served)
 *  - cloudinary: free-tier Cloudinary account (set CLOUDINARY_URL) — recommended for production hosting
 * Private files (verification documents) are AES-256-GCM encrypted before they are stored anywhere. */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';
import { encryptBuffer, decryptBuffer } from './crypto';

const root = path.resolve(env.storage.localDir);
if (env.storage.driver === 'local') {
  fs.mkdirSync(path.join(root, 'public'), { recursive: true });
  fs.mkdirSync(path.join(root, 'private'), { recursive: true });
}
if (env.storage.driver === 'cloudinary') {
  if (!env.storage.cloudinaryUrl) throw new Error('STORAGE_DRIVER=cloudinary requires CLOUDINARY_URL');
  // The SDK reads CLOUDINARY_URL from the environment automatically.
  cloudinary.config({ secure: true });
}

export const uploadsRoot = root;

export interface Stored {
  key: string;
  url: string;
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf',
};

function cloudUpload(buf: Buffer, folder: string, resourceType: 'image' | 'raw', publicId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `serveconnect/${folder}`, resource_type: resourceType, public_id: publicId, overwrite: false },
      (err, res) => (err ? reject(err) : resolve(res)),
    );
    stream.end(buf);
  });
}

/** Store a public file (avatars, posts, galleries). Returns an absolute URL. */
export async function putPublic(buf: Buffer, mime: string, folder: string): Promise<Stored> {
  const id = crypto.randomUUID();
  const ext = EXT[mime] ?? 'bin';
  if (env.storage.driver === 'cloudinary') {
    const res = await cloudUpload(buf, folder, mime.startsWith('image/') ? 'image' : 'raw', id);
    return { key: res.public_id, url: res.secure_url };
  }
  const rel = path.posix.join('public', folder, `${id}.${ext}`);
  fs.mkdirSync(path.join(root, 'public', folder), { recursive: true });
  await fs.promises.writeFile(path.join(root, rel), buf);
  return { key: rel, url: `${env.storage.publicBaseUrl}/uploads/${folder}/${id}.${ext}` };
}

/** Store a private, encrypted file (verification documents). Only readable through getPrivate(). */
export async function putPrivate(buf: Buffer, folder: string): Promise<Stored> {
  const id = crypto.randomUUID();
  const enc = encryptBuffer(buf);
  if (env.storage.driver === 'cloudinary') {
    const res = await cloudUpload(enc, `private/${folder}`, 'raw', `${id}.bin`);
    return { key: res.secure_url, url: '' };
  }
  const rel = path.posix.join('private', folder, `${id}.bin`);
  fs.mkdirSync(path.join(root, 'private', folder), { recursive: true });
  await fs.promises.writeFile(path.join(root, rel), enc);
  return { key: rel, url: '' };
}

export async function getPrivate(key: string): Promise<Buffer> {
  let enc: Buffer;
  if (key.startsWith('http')) {
    const res = await fetch(key);
    if (!res.ok) throw new Error('Could not fetch stored file');
    enc = Buffer.from(await res.arrayBuffer());
  } else {
    const full = path.join(root, key);
    if (!full.startsWith(root)) throw new Error('Invalid key');
    enc = await fs.promises.readFile(full);
  }
  return decryptBuffer(enc);
}

export async function removeFile(key: string): Promise<void> {
  try {
    if (key.startsWith('http')) {
      // Cloudinary raw private file: derive public id from URL
      const m = key.match(/\/upload\/(?:v\d+\/)?(.+)$/);
      if (m) await cloudinary.uploader.destroy(m[1], { resource_type: 'raw' });
      return;
    }
    if (env.storage.driver === 'cloudinary' && !key.startsWith('public/') && !key.startsWith('private/')) {
      await cloudinary.uploader.destroy(key);
      return;
    }
    const full = path.join(root, key);
    if (full.startsWith(root)) await fs.promises.unlink(full);
  } catch (e: any) {
    console.warn('[storage] remove failed', key, e.message);
  }
}
