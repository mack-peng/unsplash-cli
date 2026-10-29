import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { UnsplashApi, UnsplashPhoto } from './api';

export const SIZES = ['raw', 'full', 'regular', 'small', 'thumb'] as const;
export type PhotoSize = (typeof SIZES)[number];

export interface CompactPhoto {
  id: string;
  description: string;
  width: number;
  height: number;
  color: string;
  urls: Record<string, string>;
  photographer: {
    name: string;
    username: string;
    profile_url: string;
  };
  photo_page: string;
  download_location: string;
  attribution: string;
  query?: string;
}

export interface DownloadOptions {
  out?: string;
  outDir?: string;
  size: PhotoSize;
  track?: boolean;
  sidecar?: boolean;
}

export interface DownloadRecord extends CompactPhoto {
  provider: 'unsplash';
  size: PhotoSize;
  file: string;
  bytes: number;
  download_tracked: boolean;
  downloaded_at: string;
  license: string;
  sidecar: string | null;
}

export function withUtm(url: string): string {
  if (!url) return '';
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}utm_source=unsplash-cli&utm_medium=referral`;
}

export function compactPhoto(photo: UnsplashPhoto, query = ''): CompactPhoto {
  const user = photo.user ?? {};
  const profile =
    user.links?.html || (user.username ? `https://unsplash.com/@${user.username}` : '');
  const name = user.name || user.username || 'Unknown';
  return {
    id: photo.id,
    description: photo.description || photo.alt_description || '',
    width: photo.width,
    height: photo.height,
    color: photo.color || '',
    urls: photo.urls,
    photographer: {
      name,
      username: user.username || '',
      profile_url: withUtm(profile),
    },
    photo_page: withUtm(photo.links?.html || ''),
    download_location: photo.links?.download_location || '',
    attribution: `Photo by ${name} on Unsplash (${withUtm(profile)})`,
    ...(query ? { query } : {}),
  };
}

export function parsePhotoId(ref: string): string {
  if (/^[A-Za-z0-9_-]{6,}$/.test(ref)) return ref;

  let parsed: URL;
  try {
    parsed = new URL(ref);
  } catch {
    throw new Error(`Invalid photo id or URL: ${ref}`);
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  let last = parts.pop() ?? '';
  if (last === 'download') last = parts.pop() ?? '';
  const id = last.includes('-') ? last.slice(last.lastIndexOf('-') + 1) : last;
  if (!id) throw new Error(`Could not parse photo id from URL: ${ref}`);
  return id;
}

export async function downloadPhoto(
  api: UnsplashApi,
  ref: string,
  options: DownloadOptions,
): Promise<DownloadRecord> {
  const id = parsePhotoId(ref);
  const photo = await api.photo(id);
  const meta = compactPhoto(photo);
  const source = photo.urls[options.size] ?? photo.urls.full ?? photo.urls.regular;
  if (!source) throw new Error(`Photo ${id} has no image URL for size ${options.size}.`);

  const image = await api.fetchImage(source);
  const extension = extensionFor(image.contentType);
  const file = options.out ?? join(options.outDir ?? '.', `${id}${extension}`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, image.buffer);

  const shouldTrack = options.track !== false && Boolean(meta.download_location);
  const tracked = shouldTrack ? await api.track(meta.download_location) : false;
  if (shouldTrack && !tracked) {
    console.error('warning: Unsplash download tracking failed; the image was saved.');
  }

  const record: DownloadRecord = {
    provider: 'unsplash',
    ...meta,
    size: options.size,
    file,
    bytes: image.buffer.length,
    download_tracked: tracked,
    downloaded_at: new Date().toISOString(),
    license: 'https://unsplash.com/license',
    sidecar: null,
  };

  if (options.sidecar !== false) {
    const sidecar = join(dirname(file), `${basename(file, extname(file))}.json`);
    writeFileSync(sidecar, `${JSON.stringify(record, null, 2)}\n`);
    record.sidecar = sidecar;
  }

  return record;
}

function extensionFor(contentType: string): string {
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('gif')) return '.gif';
  return '.jpg';
}
