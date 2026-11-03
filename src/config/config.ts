import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { MinimistArgs } from '../cli/minimist';

export interface ProfileConfig {
  'access-key': string;
}

interface RcFile {
  active: string;
  profiles: Record<string, ProfileConfig>;
}

export interface Config {
  'access-key': string;
  profile: string;
  output: 'text' | 'json';
  raw: boolean;
}

export interface CredentialStatus {
  configured: boolean;
  source: 'env' | 'config' | null;
  env: boolean;
  profile: string;
  'access-key': string;
  config_path: string;
  permissions: string | null;
}

const RESERVED_PROFILE_NAMES = new Set(['__proto__', 'constructor', 'prototype']);
const PROFILE_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

export function rcFilePath(): string {
  return process.env.UNSPLASH_RC_PATH || path.join(os.homedir(), '.unsplashrc');
}

export function isValidProfileName(name: string): boolean {
  return PROFILE_NAME_PATTERN.test(name) && !RESERVED_PROFILE_NAMES.has(name);
}

function assertValidProfileName(name: string): void {
  if (!isValidProfileName(name)) {
    throw new Error(
      `Invalid profile name '${name}'. Use letters, numbers, dots, underscores or hyphens.`,
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

let cachedRc: { path: string; rc: RcFile; mtime: number } | null = null;

function emptyProfiles(): Record<string, ProfileConfig> {
  return Object.create(null) as Record<string, ProfileConfig>;
}

function emptyRc(): RcFile {
  return { active: 'default', profiles: emptyProfiles() };
}

function normalizeProfile(value: unknown): ProfileConfig {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return { 'access-key': typeof raw['access-key'] === 'string' ? raw['access-key'] : '' };
}

function normalizeRc(value: unknown, target: string): RcFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid config in ${target}: expected a JSON object.`);
  }
  const raw = value as { active?: unknown; profiles?: unknown };
  const profiles = emptyProfiles();
  if (raw.profiles !== undefined) {
    if (!raw.profiles || typeof raw.profiles !== 'object' || Array.isArray(raw.profiles)) {
      throw new Error(`Invalid config in ${target}: "profiles" must be an object.`);
    }
    for (const [name, profile] of Object.entries(raw.profiles as Record<string, unknown>)) {
      if (!isValidProfileName(name)) continue;
      profiles[name] = normalizeProfile(profile);
    }
  }
  const active = typeof raw.active === 'string' && raw.active ? raw.active : 'default';
  if (!isValidProfileName(active)) {
    throw new Error(`Invalid config in ${target}: "active" is not a valid profile name.`);
  }
  return { active, profiles };
}

function readRcFile(): RcFile {
  const target = rcFilePath();
  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyRc();
    throw new Error(`Cannot read ${target}: ${errorMessage(error)}`);
  }
  if (cachedRc && cachedRc.path === target && cachedRc.mtime === stat.mtimeMs) return cachedRc.rc;
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
    try {
      fs.chmodSync(target, 0o600);
    } catch {
      // keep reading even if permissions cannot be tightened
    }
  }
  let content: string;
  try {
    content = fs.readFileSync(target, 'utf-8');
  } catch (error) {
    throw new Error(`Cannot read ${target}: ${errorMessage(error)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Invalid JSON in ${target}. Fix the file or move it aside before retrying.`);
  }
  const rc = normalizeRc(parsed, target);
  cachedRc = { path: target, rc, mtime: stat.mtimeMs };
  return rc;
}

function writeRcFile(rc: RcFile): void {
  const target = rcFilePath();
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(rc, null, 2) + '\n', { mode: 0o600 });
    if (process.platform !== 'win32') fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, target);
  } catch (error) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // ignore cleanup failure
    }
    throw error;
  }
  cachedRc = null;
}

export function envKey(): string | null {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  return key || null;
}

export function maskKey(value?: string): string {
  if (!value) return '(not set)';
  if (value.length <= 6) return '****';
  return value.slice(0, 4) + '***' + value.slice(-2);
}

export function filePermissions(): string | null {
  if (process.platform === 'win32') return null;
  try {
    return (fs.statSync(rcFilePath()).mode & 0o777).toString(8).padStart(3, '0');
  } catch {
    return null;
  }
}

export function explicitProfileName(args: MinimistArgs): string | undefined {
  const fromArgs =
    typeof args.profile === 'string'
      ? args.profile
      : typeof args.p === 'string'
        ? args.p
        : undefined;
  if (fromArgs) {
    assertValidProfileName(fromArgs);
    return fromArgs;
  }
  if (process.env.UNSPLASH_PROFILE) {
    assertValidProfileName(process.env.UNSPLASH_PROFILE);
    return process.env.UNSPLASH_PROFILE;
  }
  return undefined;
}

export function resolveProfileName(args: MinimistArgs): string {
  const explicit = explicitProfileName(args);
  if (explicit) return explicit;
  const active = readRcFile().active;
  assertValidProfileName(active);
  return active;
}

export function profileExists(name: string): boolean {
  return Boolean(readRcFile().profiles[name]);
}

function resolveProfile(args: MinimistArgs): { name: string; profile: ProfileConfig } {
  const name = resolveProfileName(args);
  const profile = readRcFile().profiles[name];
  if (profile) return { name, profile };
  if (name === 'default') return { name, profile: { 'access-key': '' } };
  throw new Error(`Profile '${name}' not found. Run: unsplash config-new ${name}`);
}

export function loadConfig(args: MinimistArgs): Config {
  const { name, profile } = resolveProfile(args);
  const accessKey = envKey() || profile['access-key'];
  if (!accessKey) {
    throw new Error(
      'Unsplash Access Key is not configured. Set UNSPLASH_ACCESS_KEY, or run: unsplash config-set access-key (or unsplash auth set).',
    );
  }
  return {
    'access-key': accessKey,
    profile: name,
    output: args.json ? 'json' : 'text',
    raw: !!args.raw,
  };
}

export function credentialStatus(args: MinimistArgs): CredentialStatus {
  const env = envKey();
  const profileName = resolveProfileName(args);
  const profile = readRcFile().profiles[profileName];
  const profileKey = profile?.['access-key'] || '';
  const key = env || profileKey;
  return {
    configured: Boolean(key),
    source: env ? 'env' : profileKey ? 'config' : null,
    env: Boolean(env),
    profile: profileName,
    'access-key': maskKey(key),
    config_path: rcFilePath(),
    permissions: filePermissions(),
  };
}

export function writeRcConfig(
  key: keyof ProfileConfig,
  value: string,
  profileName?: string,
): Record<string, string> {
  const rc = readRcFile();
  const name = profileName || rc.active;
  assertValidProfileName(name);
  if (!rc.profiles[name]) rc.profiles[name] = { 'access-key': '' };
  rc.profiles[name][key] = value;
  writeRcFile(rc);
  return { profile: name, [key]: maskKey(value) };
}

export function getRcConfig(): RcFile {
  return readRcFile();
}

export function setActiveProfile(name: string): void {
  assertValidProfileName(name);
  const rc = readRcFile();
  if (!rc.profiles[name]) throw new Error(`Profile '${name}' not found`);
  rc.active = name;
  writeRcFile(rc);
}

export function createProfile(name: string): void {
  assertValidProfileName(name);
  const rc = readRcFile();
  if (rc.profiles[name]) throw new Error(`Profile '${name}' already exists`);
  rc.profiles[name] = { 'access-key': '' };
  writeRcFile(rc);
}

export function clearAccessKey(profileName?: string): { profile: string; cleared: boolean } {
  const rc = readRcFile();
  const name = profileName || rc.active;
  assertValidProfileName(name);
  const profile = rc.profiles[name];
  if (!profile || !profile['access-key']) return { profile: name, cleared: false };
  profile['access-key'] = '';
  writeRcFile(rc);
  return { profile: name, cleared: true };
}
