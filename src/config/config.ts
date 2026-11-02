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

export function rcFilePath(): string {
  return process.env.UNSPLASH_RC_PATH || path.join(os.homedir(), '.unsplashrc');
}

let cachedRc: { path: string; rc: RcFile; mtime: number } | null = null;

function emptyRc(): RcFile {
  return { active: 'default', profiles: {} };
}

function normalizeProfile(value: unknown): ProfileConfig {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return { 'access-key': typeof raw['access-key'] === 'string' ? raw['access-key'] : '' };
}

function normalizeRc(value: unknown): RcFile {
  if (!value || typeof value !== 'object') return emptyRc();
  const raw = value as { active?: unknown; profiles?: unknown };
  const profiles: Record<string, ProfileConfig> = {};
  if (raw.profiles && typeof raw.profiles === 'object') {
    for (const [name, profile] of Object.entries(raw.profiles as Record<string, unknown>)) {
      profiles[name] = normalizeProfile(profile);
    }
  }
  const active = typeof raw.active === 'string' && raw.active ? raw.active : 'default';
  return { active, profiles };
}

function readRcFile(): RcFile {
  try {
    const target = rcFilePath();
    const stat = fs.statSync(target);
    if (cachedRc && cachedRc.path === target && cachedRc.mtime === stat.mtimeMs) return cachedRc.rc;
    if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
      try {
        fs.chmodSync(target, 0o600);
      } catch {
        // keep reading even if permissions cannot be tightened
      }
    }
    const rc = normalizeRc(JSON.parse(fs.readFileSync(target, 'utf-8')));
    cachedRc = { path: target, rc, mtime: stat.mtimeMs };
    return rc;
  } catch {
    return emptyRc();
  }
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
  try {
    return (fs.statSync(rcFilePath()).mode & 0o777).toString(8).padStart(3, '0');
  } catch {
    return null;
  }
}

function resolveProfileName(args: MinimistArgs): string {
  const fromArgs =
    typeof args.p === 'string'
      ? args.p
      : typeof args.profile === 'string'
        ? args.profile
        : undefined;
  if (fromArgs) return fromArgs;
  if (process.env.UNSPLASH_PROFILE) return process.env.UNSPLASH_PROFILE;
  return readRcFile().active;
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
      'Unsplash Access Key is not configured. Set UNSPLASH_ACCESS_KEY, or run: unsplash config-set access-key <key> (or unsplash auth set).',
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
  if (!rc.profiles[name]) rc.profiles[name] = { 'access-key': '' };
  rc.profiles[name][key] = value;
  writeRcFile(rc);
  return { profile: name, [key]: maskKey(value) };
}

export function getRcConfig(): RcFile {
  return readRcFile();
}

export function setActiveProfile(name: string): void {
  const rc = readRcFile();
  if (!rc.profiles[name]) throw new Error(`Profile '${name}' not found`);
  rc.active = name;
  writeRcFile(rc);
}

export function createProfile(name: string): void {
  const rc = readRcFile();
  if (rc.profiles[name]) throw new Error(`Profile '${name}' already exists`);
  rc.profiles[name] = { 'access-key': '' };
  writeRcFile(rc);
}

export function clearAccessKey(profileName?: string): { profile: string; cleared: boolean } {
  const rc = readRcFile();
  const name = profileName || rc.active;
  const profile = rc.profiles[name];
  if (!profile || !profile['access-key']) return { profile: name, cleared: false };
  profile['access-key'] = '';
  writeRcFile(rc);
  return { profile: name, cleared: true };
}
