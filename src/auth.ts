import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';
import { createInterface } from 'node:readline';

const SERVICE = 'unsplash-cli';
const ACCOUNT = 'default';

export type KeySource = 'env' | 'keychain';

export interface KeyInfo {
  key: string;
  source: KeySource;
}

export function keychainSupported(): boolean {
  return platform() === 'darwin';
}

export function keychainStatus(): 'configured' | 'missing' | 'unsupported' {
  if (!keychainSupported()) return 'unsupported';
  try {
    execFileSync('security', ['find-generic-password', '-s', SERVICE, '-a', ACCOUNT], {
      stdio: 'ignore',
    });
    return 'configured';
  } catch {
    return 'missing';
  }
}

export function readKeychainKey(): string | null {
  if (!keychainSupported()) return null;
  try {
    const key = execFileSync(
      'security',
      ['find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return key || null;
  } catch {
    return null;
  }
}

export function writeKeychainKey(key: string): void {
  if (!keychainSupported()) {
    throw new Error('macOS Keychain is not available on this platform. Use UNSPLASH_ACCESS_KEY instead.');
  }
  execFileSync(
    'security',
    ['add-generic-password', '-U', '-s', SERVICE, '-a', ACCOUNT, '-w', key],
    { stdio: 'ignore' },
  );
}

export function deleteKeychainKey(): boolean {
  if (!keychainSupported()) return false;
  try {
    execFileSync('security', ['delete-generic-password', '-s', SERVICE, '-a', ACCOUNT], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

export function envKey(): string | null {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  return key || null;
}

export function resolveKey(): KeyInfo {
  const env = envKey();
  if (env) return { key: env, source: 'env' };
  const keychain = readKeychainKey();
  if (keychain) return { key: keychain, source: 'keychain' };
  throw new Error('Unsplash Access Key is not configured. Run `unsplash auth set`.');
}

export async function readSecret(label: string, forceStdin = false): Promise<string> {
  if (forceStdin || !process.stdin.isTTY) {
    if (forceStdin && process.stdin.isTTY) {
      throw new Error('--stdin requires piped input. Pipe the key or omit --stdin.');
    }
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8').trim();
  }

  process.stdout.write(label);
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    (rl as unknown as { _writeToOutput: () => void })._writeToOutput = () => {};
    rl.question('', (value) => {
      rl.close();
      process.stdout.write('\n');
      resolve(value.trim());
    });
    rl.on('SIGINT', () => {
      rl.close();
      process.stdout.write('\n');
      reject(new Error('Cancelled.'));
    });
  });
}
