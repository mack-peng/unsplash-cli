import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import {
  clearAccessKey,
  createProfile,
  credentialStatus,
  loadConfig,
  maskKey,
  rcFilePath,
  resolveProfileName,
  setActiveProfile,
  writeRcConfig,
} from '../src/config/config';
import type { MinimistArgs } from '../src/cli/minimist';

const args = (value: Record<string, string> = {}): MinimistArgs => ({ _: [], ...value });
let directory = '';

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'unsplash-config-'));
  process.env.UNSPLASH_RC_PATH = join(directory, 'unsplashrc');
  delete process.env.UNSPLASH_PROFILE;
  delete process.env.UNSPLASH_ACCESS_KEY;
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  delete process.env.UNSPLASH_RC_PATH;
  delete process.env.UNSPLASH_PROFILE;
  delete process.env.UNSPLASH_ACCESS_KEY;
});

test('writes, reads and masks the access key', () => {
  const result = writeRcConfig('access-key', 'secret-key-123456');
  assert.equal(result.profile, 'default');
  assert.equal(result['access-key'], 'secr***56');

  const config = loadConfig(args());
  assert.equal(config['access-key'], 'secret-key-123456');
  assert.equal(config.profile, 'default');
  assert.equal(maskKey('short'), '****');
});

test('uses profiles and respects profile selection', () => {
  writeRcConfig('access-key', 'default-key-123456');
  createProfile('work');
  writeRcConfig('access-key', 'work-key-123456', 'work');

  assert.equal(resolveProfileName(args({ profile: 'work' })), 'work');
  assert.equal(loadConfig(args({ profile: 'work' }))['access-key'], 'work-key-123456');

  process.env.UNSPLASH_PROFILE = 'work';
  assert.equal(resolveProfileName(args()), 'work');
  assert.equal(loadConfig(args())['access-key'], 'work-key-123456');

  setActiveProfile('work');
  assert.equal(resolveProfileName(args()), 'work');
});

test('environment variable takes precedence over the profile', () => {
  writeRcConfig('access-key', 'config-key-123456');
  process.env.UNSPLASH_ACCESS_KEY = 'env-key-123456';

  const config = loadConfig(args());
  assert.equal(config['access-key'], 'env-key-123456');
  const status = credentialStatus(args());
  assert.equal(status.source, 'env');
  assert.equal(status.env, true);
  assert.equal(status['access-key'], 'env-***56');
});

test('tightens loose permissions on read', { skip: process.platform === 'win32' }, () => {
  writeRcConfig('access-key', 'secret-key-123456');
  chmodSync(rcFilePath(), 0o644);
  loadConfig(args());
  assert.equal(statSync(rcFilePath()).mode & 0o777, 0o600);
});

test('corrupt config throws instead of being silently overwritten', () => {
  const path = rcFilePath();
  writeFileSync(path, '{invalid', 'utf8');

  assert.throws(() => writeRcConfig('access-key', 'new-key-123456'), /Invalid JSON/);
  assert.equal(readFileSync(path, 'utf8'), '{invalid');
});

test('rejects reserved and malformed profile names', () => {
  assert.throws(() => createProfile('__proto__'), /Invalid profile name/);
  assert.throws(() => createProfile('constructor'), /Invalid profile name/);
  assert.throws(() => resolveProfileName(args({ profile: 'two words' })), /Invalid profile name/);
});

test('clears only the selected profile', () => {
  writeRcConfig('access-key', 'default-key-123456');
  createProfile('work');
  writeRcConfig('access-key', 'work-key-123456', 'work');

  const result = clearAccessKey('work');
  assert.equal(result.cleared, true);
  assert.equal(loadConfig(args())['access-key'], 'default-key-123456');
  assert.throws(() => loadConfig(args({ profile: 'work' })), /Access Key is not configured/);
});
