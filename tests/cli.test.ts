import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { createServer, Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { UnsplashApi } from '../src/api';
import { compactPhoto, downloadPhoto, parsePhotoId } from '../src/photos';

let server: Server;
let base = '';
let trackingCalls = 0;

const PHOTO = {
  id: 'abc123XYZ',
  description: 'A test photo',
  alt_description: 'test',
  width: 4000,
  height: 3000,
  color: '#112233',
  urls: {
    raw: '/raw.jpg',
    full: '/full.jpg',
    regular: '/regular.jpg',
  },
  user: {
    name: 'Test Photographer',
    username: 'testphotographer',
    links: { html: 'https://unsplash.com/@testphotographer' },
  },
  links: { html: 'https://unsplash.com/photos/abc123XYZ' },
};

function json(response: import('node:http').ServerResponse, body: unknown): void {
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
}

before(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
    if (url.pathname === '/search/photos') {
      response.setHeader('x-ratelimit-limit', '50');
      response.setHeader('x-ratelimit-remaining', '49');
      json(response, { total: 1, total_pages: 1, results: [PHOTO] });
      return;
    }
    if (url.pathname === '/photos/abc123XYZ') {
      json(response, {
        ...PHOTO,
        urls: {
          raw: `${base}/raw.jpg`,
          full: `${base}/full.jpg`,
          regular: `${base}/regular.jpg`,
        },
        links: {
          html: 'https://unsplash.com/photos/abc123XYZ',
          download_location: `${base}/photos/abc123XYZ/download`,
        },
      });
      return;
    }
    if (url.pathname === '/photos/abc123XYZ/download') {
      trackingCalls += 1;
      json(response, { url: `${base}/full.jpg` });
      return;
    }
    if (url.pathname === '/full.jpg') {
      response.setHeader('content-type', 'image/jpeg');
      response.end(Buffer.from('fake-image-bytes'));
      return;
    }
    response.statusCode = 404;
    json(response, { errors: ['not found'] });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not start');
  base = `http://127.0.0.1:${address.port}`;
  process.env.UNSPLASH_API_BASE = base;
});

after(() => {
  server.close();
  delete process.env.UNSPLASH_API_BASE;
});

test('parsePhotoId accepts ids, page URLs and download URLs', () => {
  assert.equal(parsePhotoId('abc123XYZ'), 'abc123XYZ');
  assert.equal(parsePhotoId('https://unsplash.com/photos/a-photo-abc123XYZ'), 'abc123XYZ');
  assert.equal(parsePhotoId('https://unsplash.com/photos/abc123XYZ/download'), 'abc123XYZ');
  assert.throws(() => parsePhotoId('not a url'), /Invalid photo id or URL/);
});

test('search maps photos and rate limit headers', async () => {
  const api = new UnsplashApi('test-key');
  const data = await api.search('desk');
  assert.equal(data.total, 1);
  assert.equal(api.lastRate.remaining, '49');

  const result = compactPhoto(data.results[0], 'desk');
  assert.equal(result.id, 'abc123XYZ');
  assert.equal(result.photographer.name, 'Test Photographer');
  assert.equal(result.query, 'desk');
  assert.match(result.attribution, /utm_source=unsplash-cli/);
  assert.match(result.photo_page, /utm_medium=referral/);
});

test('download writes the image, sidecar and tracks the download', async () => {
  const api = new UnsplashApi('test-key');
  const directory = mkdtempSync(join(tmpdir(), 'unsplash-cli-'));
  try {
    const record = await downloadPhoto(
      api,
      'https://unsplash.com/photos/a-photo-abc123XYZ',
      { outDir: directory, size: 'full' },
    );
    assert.equal(record.id, 'abc123XYZ');
    assert.equal(record.download_tracked, true);
    assert.ok(trackingCalls > 0);
    assert.ok(existsSync(record.file));
    assert.ok(record.sidecar && existsSync(record.sidecar));

    const sidecar = JSON.parse(readFileSync(record.sidecar as string, 'utf8'));
    assert.equal(sidecar.photographer.name, 'Test Photographer');
    assert.equal(sidecar.license, 'https://unsplash.com/license');
    assert.equal(readFileSync(record.file, 'utf8'), 'fake-image-bytes');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
