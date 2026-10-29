import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { ApiError, RateLimit, UnsplashApi } from './api';
import {
  deleteKeychainKey,
  envKey,
  keychainStatus,
  readSecret,
  resolveKey,
  writeKeychainKey,
} from './auth';
import {
  CompactPhoto,
  DownloadRecord,
  PhotoSize,
  SIZES,
  compactPhoto,
  downloadPhoto,
} from './photos';

const HELP = `unsplash — search and download Unsplash photos

Usage:
  unsplash auth set [--stdin] [--skip-verify]
  unsplash auth status [--json]
  unsplash auth clear
  unsplash search "<query>" [options]
  unsplash download <id|url> [options]
  unsplash --version

Security:
  The Access Key is stored in the macOS Keychain (service "unsplash-cli").
  It is never written to .env or project files. The UNSPLASH_ACCESS_KEY
  environment variable overrides Keychain storage for CI.

Run \`unsplash <command> --help\` for command options.`;

const AUTH_HELP = `Usage:
  unsplash auth set [--stdin] [--skip-verify] [--json]
  unsplash auth status [--json]
  unsplash auth clear [--json]

  set      Store the Access Key in macOS Keychain (prompts, input hidden).
           Use --stdin to read from a pipe: pbpaste | unsplash auth set --stdin
  status   Show whether a key is configured; never prints the key.
  clear    Remove the Keychain entry.`;

const SEARCH_HELP = `Usage:
  unsplash search "<query>" [options]

Options:
  --per-page N        Results per page (1-30, default 6)
  --page N            Page number (default 1)
  --orientation X     landscape | portrait | squarish
  --color X           black_and_white, black, white, yellow, orange,
                      red, purple, magenta, green, teal, blue
  --order-by X        relevant | latest (default relevant)
  --download N        Download the first N results (requires --out-dir)
  --out-dir DIR       Directory for downloaded images
  --size X            raw | full | regular | small | thumb (default full)
  --json              Machine-readable JSON
  --help              Show this help`;

const DOWNLOAD_HELP = `Usage:
  unsplash download <id|url> [options]

Options:
  --out FILE          Exact output file path
  --out-dir DIR       Directory; file is named <photo-id>.<ext>
  --size X            raw | full | regular | small | thumb (default full)
  --json              Machine-readable JSON
  --help              Show this help

Each download writes a <photo-id>.json sidecar with photographer,
source page, license and download-tracking status.`;

interface SearchResultView {
  query: string;
  page: number;
  total: number;
  totalPages: number;
  rate: RateLimit;
  results: CompactPhoto[];
  downloads: DownloadRecord[];
}

export async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    console.log(HELP);
    return;
  }
  if (argv[0] === '--version' || argv[0] === '-v') {
    console.log(version());
    return;
  }

  const command = argv.shift();
  switch (command) {
    case 'auth':
      await runAuth(argv);
      return;
    case 'search':
      await runSearch(argv);
      return;
    case 'download':
      await runDownload(argv);
      return;
    default:
      throw new Error(`Unknown command: ${command}. Run \`unsplash --help\`.`);
  }
}

async function runAuth(argv: string[]): Promise<void> {
  const sub = argv[0];
  if (!sub || sub === '--help' || sub === '-h' || argv.includes('--help') || argv.includes('-h')) {
    console.log(AUTH_HELP);
    return;
  }

  if (sub === 'set') {
    const { values } = parseArgs({
      args: argv.slice(1),
      options: {
        stdin: { type: 'boolean' },
        'skip-verify': { type: 'boolean' },
        json: { type: 'boolean' },
      },
      allowPositionals: false,
      strict: true,
    });

    const key = await readSecret('Unsplash Access Key: ', Boolean(values.stdin));
    if (!key) throw new Error('No key provided.');

    if (!values['skip-verify']) {
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

    writeKeychainKey(key);
    if (values.json) {
      console.log(JSON.stringify({ configured: true, source: 'keychain' }, null, 2));
    } else {
      console.log('Saved Unsplash Access Key to macOS Keychain (service: unsplash-cli).');
    }
    return;
  }

  if (sub === 'status') {
    const { values } = parseArgs({
      args: argv.slice(1),
      options: { json: { type: 'boolean' } },
      allowPositionals: false,
      strict: true,
    });
    const env = Boolean(envKey());
    const keychain = keychainStatus();
    const source = env ? 'env' : keychain === 'configured' ? 'keychain' : null;
    const configured = source !== null;

    if (values.json) {
      console.log(JSON.stringify({ configured, source, env, keychain }, null, 2));
      return;
    }
    console.log(`Configured: ${configured ? 'yes' : 'no'}`);
    if (configured) {
      console.log(
        `Source: ${source === 'env' ? 'UNSPLASH_ACCESS_KEY environment variable' : 'macOS Keychain (service: unsplash-cli)'}`,
      );
    }
    console.log(`Keychain: ${keychain}`);
    console.log(`Environment: ${env ? 'set' : 'not set'}`);
    if (!configured) console.log('\nRun: unsplash auth set');
    return;
  }

  if (sub === 'clear') {
    const { values } = parseArgs({
      args: argv.slice(1),
      options: { json: { type: 'boolean' } },
      allowPositionals: false,
      strict: true,
    });
    const removed = deleteKeychainKey();
    if (values.json) {
      console.log(JSON.stringify({ cleared: removed }, null, 2));
      return;
    }
    console.log(
      removed
        ? 'Removed Unsplash Access Key from macOS Keychain.'
        : 'No Keychain entry found.',
    );
    if (envKey()) {
      console.error('warning: UNSPLASH_ACCESS_KEY is still set in this environment and will take precedence.');
    }
    return;
  }

  throw new Error(`Unknown auth command: ${sub}. Run \`unsplash auth --help\`.`);
}

async function runSearch(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      'per-page': { type: 'string' },
      page: { type: 'string' },
      orientation: { type: 'string' },
      color: { type: 'string' },
      'order-by': { type: 'string' },
      download: { type: 'string' },
      'out-dir': { type: 'string' },
      size: { type: 'string' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help) {
    console.log(SEARCH_HELP);
    return;
  }

  const query = positionals.join(' ').trim();
  if (!query) throw new Error('search requires a query.');
  const perPage = intOption(values['per-page'], '--per-page', 6, 1, 30);
  const page = intOption(values.page, '--page', 1, 1, Number.MAX_SAFE_INTEGER);
  const downloadCount = intOption(values.download, '--download', 0, 0, 30);
  const size = sizeOption(values.size);
  const outDir = values['out-dir'];
  if (downloadCount > 0 && !outDir) throw new Error('--out-dir is required with --download.');

  const { key } = resolveKey();
  const api = new UnsplashApi(key);
  const data = await api.search(query, {
    perPage,
    page,
    orientation: values.orientation,
    color: values.color,
    orderBy: values['order-by'],
  });
  const results = data.results.map((photo) => compactPhoto(photo, query));

  const downloads: DownloadRecord[] = [];
  if (downloadCount > 0 && outDir) {
    for (const result of results.slice(0, downloadCount)) {
      downloads.push(await downloadPhoto(api, result.id, { outDir, size }));
    }
  }

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          query,
          page,
          total: data.total,
          totalPages: data.total_pages,
          rate: api.lastRate,
          results,
          ...(downloads.length ? { downloads } : {}),
        },
        null,
        2,
      ),
    );
    return;
  }

  printSearch({
    query,
    page,
    total: data.total,
    totalPages: data.total_pages,
    rate: api.lastRate,
    results,
    downloads,
  });
}

async function runDownload(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      out: { type: 'string' },
      'out-dir': { type: 'string' },
      size: { type: 'string' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help) {
    console.log(DOWNLOAD_HELP);
    return;
  }

  const ref = positionals[0];
  if (!ref) throw new Error('download requires a photo id or URL.');
  if (!values.out && !values['out-dir']) {
    throw new Error('download requires --out or --out-dir.');
  }

  const size = sizeOption(values.size);
  const { key } = resolveKey();
  const api = new UnsplashApi(key);
  const record = await downloadPhoto(api, ref, {
    out: values.out,
    outDir: values['out-dir'],
    size,
  });

  if (values.json) {
    console.log(JSON.stringify(record, null, 2));
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

function intOption(
  value: string | boolean | undefined,
  flag: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${flag} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function sizeOption(value: string | boolean | undefined): PhotoSize {
  const size = (value ?? 'full') as PhotoSize;
  if (!SIZES.includes(size)) {
    throw new Error(`--size must be one of: ${SIZES.join(', ')}.`);
  }
  return size;
}

function version(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
    ) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
