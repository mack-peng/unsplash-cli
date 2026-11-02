import fs from 'node:fs';
import path from 'node:path';
import { ApiError, RateLimit, UnsplashApi } from '../api';
import { readSecret } from '../auth';
import {
  clearAccessKey,
  createProfile,
  credentialStatus,
  envKey,
  getRcConfig,
  loadConfig,
  maskKey,
  rcFilePath,
  setActiveProfile,
  writeRcConfig,
} from '../config/config';
import {
  CompactPhoto,
  DownloadRecord,
  compactPhoto,
  downloadPhoto,
} from '../photos';
import { generateHelpJSON } from '../config/helpGenerator';
import { parseCommand } from './command';
import type { AnyCommandSchema, HelpData, HelpEntry } from './command';
import { commands } from './commands';
import { minimist } from './minimist';
import type { MinimistArgs } from './minimist';
import { JsonOutput, TextOutput } from './output';
import type { Output } from './output';

const globalOptions = ['json', 'help', 'h', 'version', 'v', 'p', 'profile'];

interface SearchResultView {
  query: string;
  page: number;
  total: number;
  totalPages: number;
  rate: RateLimit;
  results: CompactPhoto[];
  downloads: DownloadRecord[];
}

export async function program(): Promise<void> {
  const help = loadHelp();
  const rawArgs = minimist(process.argv.slice(2), {
    boolean: [...help.booleanOptions, 'help', 'h', 'version', 'v', 'json'],
    string: ['_'],
  });
  if (rawArgs.p && !rawArgs.profile) {
    rawArgs.profile = rawArgs.p;
    delete rawArgs.p;
  }
  const output: Output = rawArgs.json ? new JsonOutput() : new TextOutput();
  const commandName = normalizeCommand(rawArgs);
  const cmdEntry = commandName ? help.commands[commandName] : undefined;
  const command = commandName ? commands[commandName as keyof typeof commands] : undefined;

  try {
    if (rawArgs.version || rawArgs.v) {
      output.version(version());
      return;
    }

    if (rawArgs.help || rawArgs.h || !commandName) {
      output.help(cmdEntry ? cmdEntry.help : help.global);
      return;
    }

    if (!command || !cmdEntry) {
      output.error(`Unknown command: ${commandName}`);
    }

    validateFlags(rawArgs, cmdEntry);

    if (commandName === 'auth set' && rawArgs._.length > 1) {
      throw new Error(
        'Do not pass the Access Key as an argument. Run `unsplash auth set` for a hidden prompt, or `pbpaste | unsplash auth set --stdin`.',
      );
    }

    const parsed = parseCommand(command as AnyCommandSchema, splitArgs(rawArgs));

    switch (commandName) {
      case 'auth set':
        await runAuthSet(parsed, rawArgs, output);
        return;
      case 'auth status':
        runAuthStatus(rawArgs, output);
        return;
      case 'auth clear':
        runAuthClear(rawArgs, output);
        return;
      case 'config-show':
        runConfigShow(rawArgs, output);
        return;
      case 'config-set':
        runConfigSet(parsed, rawArgs, output);
        return;
      case 'config-path':
        runConfigPath(output);
        return;
      case 'config-list':
        runConfigList(output);
        return;
      case 'config-use':
        runConfigUse(parsed, output);
        return;
      case 'config-new':
        runConfigNew(parsed, output);
        return;
      case 'search':
        await runSearch(parsed, rawArgs, output);
        return;
      case 'download':
        await runDownload(parsed, rawArgs, output);
        return;
      default:
        output.error(`Unknown command: ${commandName}`);
    }
  } catch (error) {
    output.error(error instanceof Error ? error.message : String(error));
  }
}

async function runAuthSet(
  parsed: Record<string, any>,
  args: MinimistArgs,
  output: Output,
): Promise<void> {
  const key = await readSecret('Unsplash Access Key: ', Boolean(parsed.stdin));
  if (!key) throw new Error('No key provided.');

  if (!parsed['skip-verify']) {
    const api = new UnsplashApi(key);
    try {
      await api.random();
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        console.error('warning: key could not be verified because the rate limit is exhausted; saving anyway.');
      } else {
        throw error;
      }
    }
  }

  const profile = typeof args.profile === 'string' ? args.profile : undefined;
  const result = writeRcConfig('access-key', key, profile);
  if (output.json) {
    console.log(
      output.format({
        configured: true,
        source: 'config',
        profile: result.profile,
        path: rcFilePath(),
      }),
    );
  } else {
    console.log(
      `Saved Unsplash Access Key to ${rcFilePath()} (profile: ${result.profile}, mode 600).`,
    );
  }
}

function runAuthStatus(args: MinimistArgs, output: Output): void {
  const status = credentialStatus(args);
  if (output.json) {
    console.log(output.format(status));
    return;
  }
  console.log(`Configured: ${status.configured ? 'yes' : 'no'}`);
  if (status.configured) {
    console.log(
      `Source: ${status.source === 'env' ? 'UNSPLASH_ACCESS_KEY environment variable' : `config file (profile: ${status.profile})`}`,
    );
  }
  console.log(`Profile: ${status.profile}`);
  console.log(
    `Config: ${status.config_path}${status.permissions ? ` (mode ${status.permissions})` : ''}`,
  );
  console.log(`Environment: ${status.env ? 'set' : 'not set'}`);
  if (!status.configured) console.log('\nRun: unsplash auth set');
}

function runAuthClear(args: MinimistArgs, output: Output): void {
  const profile = typeof args.profile === 'string' ? args.profile : undefined;
  const result = clearAccessKey(profile);
  if (output.json) {
    console.log(
      output.format({
        cleared: result.cleared,
        profile: result.profile,
        path: rcFilePath(),
      }),
    );
  } else {
    console.log(
      result.cleared
        ? `Removed Unsplash Access Key from ${rcFilePath()} (profile: ${result.profile}).`
        : `No Access Key found in profile '${result.profile}'.`,
    );
  }
  if (envKey()) {
    console.error('warning: UNSPLASH_ACCESS_KEY is still set in this environment and will take precedence.');
  }
}

function runConfigShow(args: MinimistArgs, output: Output): void {
  const status = credentialStatus(args);
  if (output.json) {
    console.log(output.format(status));
    return;
  }
  console.log(`Profile: ${status.profile}`);
  console.log(`Access Key: ${status['access-key']}`);
  console.log(`Source: ${status.source ?? '(not configured)'}`);
  console.log(
    `Config: ${status.config_path}${status.permissions ? ` (mode ${status.permissions})` : ''}`,
  );
  console.log(`Environment: ${status.env ? 'set' : 'not set'}`);
}

function runConfigSet(parsed: Record<string, any>, args: MinimistArgs, output: Output): void {
  const profile = typeof args.profile === 'string' ? args.profile : undefined;
  const result = writeRcConfig(
    parsed.key as 'access-key',
    parsed.value as string,
    profile,
  );
  if (output.json) {
    console.log(output.format({ ...result, path: rcFilePath() }));
  } else {
    console.log(
      `Set ${parsed.key}=${result[parsed.key]} for profile '${result.profile}' in ${rcFilePath()}.`,
    );
  }
}

function runConfigPath(output: Output): void {
  if (output.json) {
    console.log(output.format({ path: rcFilePath() }));
  } else {
    console.log(rcFilePath());
  }
}

function runConfigList(output: Output): void {
  const rc = getRcConfig();
  const profiles = Object.entries(rc.profiles).map(([name, profile]) => ({
    name,
    active: name === rc.active,
    'access-key': maskKey(profile['access-key']),
  }));
  if (output.json) {
    console.log(output.format({ active: rc.active, profiles }));
    return;
  }
  console.log(`Active: ${rc.active}`);
  console.log(output.format(profiles));
}

function runConfigUse(parsed: Record<string, any>, output: Output): void {
  setActiveProfile(parsed.name);
  if (output.json) {
    console.log(output.format({ active: parsed.name }));
  } else {
    console.log(`Active profile: ${parsed.name}`);
  }
}

function runConfigNew(parsed: Record<string, any>, output: Output): void {
  createProfile(parsed.name);
  if (output.json) {
    console.log(output.format({ created: parsed.name }));
  } else {
    console.log(`Created profile: ${parsed.name}`);
  }
}

async function runSearch(
  parsed: Record<string, any>,
  args: MinimistArgs,
  output: Output,
): Promise<void> {
  const query = parsed.query as string;
  const perPage = parsed['per-page'] as number;
  const page = parsed.page as number;
  const downloadCount = parsed.download as number;
  const size = parsed.size as DownloadRecord['size'];
  const outDir = parsed['out-dir'] as string | undefined;
  if (downloadCount > 0 && !outDir) throw new Error('--out-dir is required with --download.');

  const config = loadConfig(args);
  const api = new UnsplashApi(config['access-key']);
  const data = await api.search(query, {
    perPage,
    page,
    orientation: parsed.orientation as string | undefined,
    color: parsed.color as string | undefined,
    orderBy: parsed['order-by'] as string | undefined,
  });
  const results = data.results.map((photo) => compactPhoto(photo, query));

  const downloads: DownloadRecord[] = [];
  if (downloadCount > 0 && outDir) {
    for (const result of results.slice(0, downloadCount)) {
      downloads.push(await downloadPhoto(api, result.id, { outDir, size }));
    }
  }

  const view: SearchResultView = {
    query,
    page,
    total: data.total,
    totalPages: data.total_pages,
    rate: api.lastRate,
    results,
    downloads,
  };

  if (output.json) {
    console.log(
      output.format({
        query,
        page,
        total: data.total,
        totalPages: data.total_pages,
        rate: api.lastRate,
        results,
        ...(downloads.length ? { downloads } : {}),
      }),
    );
    return;
  }

  printSearch(view);
}

async function runDownload(
  parsed: Record<string, any>,
  args: MinimistArgs,
  output: Output,
): Promise<void> {
  const out = parsed.out as string | undefined;
  const outDir = parsed['out-dir'] as string | undefined;
  if (!out && !outDir) throw new Error('download requires --out or --out-dir.');

  const config = loadConfig(args);
  const api = new UnsplashApi(config['access-key']);
  const record = await downloadPhoto(api, parsed.ref as string, {
    out,
    outDir,
    size: parsed.size as DownloadRecord['size'],
  });

  if (output.json) {
    console.log(output.format(record));
    return;
  }
  console.log(`File: ${record.file}`);
  if (record.sidecar) console.log(`Sidecar: ${record.sidecar}`);
  console.log(`Size: ${record.width}x${record.height} (${record.size})`);
  console.log(`Credit: ${record.attribution}`);
  console.log(`Page: ${record.photo_page}`);
}

function printSearch(result: SearchResultView): void {
  console.log(
    `${result.total} results for "${result.query}" (page ${result.page}/${result.totalPages})`,
  );
  result.results.forEach((photo, index) => {
    console.log(`\n${index + 1}. ${photo.id}  ${photo.width}x${photo.height}`);
    console.log(`   ${photo.description || '(no description)'}`);
    console.log(`   ${photo.attribution}`);
    console.log(`   ${photo.photo_page}`);
  });
  if (result.downloads.length) {
    console.log('\nDownloaded:');
    result.downloads.forEach((item) => {
      console.log(`- ${item.file}  (${item.attribution})`);
    });
  }
  console.log(`\nRate: ${result.rate.remaining ?? '?'}/${result.rate.limit ?? '?'} remaining`);
}

function normalizeCommand(args: MinimistArgs): string | undefined {
  const first = args._[0];
  if (first === 'auth') {
    const sub = args._[1];
    if (sub === 'set' || sub === 'status' || sub === 'clear') {
      args._ = [`auth ${sub}`, ...args._.slice(2)];
      return `auth ${sub}`;
    }
    return sub ? first : undefined;
  }
  return first;
}

function splitArgs(args: MinimistArgs): MinimistArgs {
  const result: MinimistArgs = { _: args._ };
  for (const key of Object.keys(args)) {
    if (key === '_' || globalOptions.includes(key)) continue;
    result[key] = args[key];
  }
  return result;
}

function validateFlags(args: MinimistArgs, cmdEntry: HelpEntry): void {
  const unknownFlags = Object.keys(args).filter(
    (key) => key !== '_' && !globalOptions.includes(key) && !(key in cmdEntry.flags),
  );
  if (unknownFlags.length) {
    throw new Error(
      `Unknown option${unknownFlags.length > 1 ? 's' : ''}: ${unknownFlags.map((flag) => `--${flag}`).join(', ')}`,
    );
  }
}

function loadHelp(): HelpData {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'help.json'), 'utf8'),
    ) as HelpData;
  } catch {
    return generateHelpJSON();
  }
}

function version(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
    ) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}
