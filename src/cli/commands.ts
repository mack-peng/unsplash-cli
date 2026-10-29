import * as z from 'zod';
import { SIZES } from '../photos';
import { declareCommand } from './command';

const orientationArg = z
  .enum(['landscape', 'portrait', 'squarish'])
  .describe('photo orientation: landscape, portrait or squarish');

const colorArg = z
  .enum([
    'black_and_white',
    'black',
    'white',
    'yellow',
    'orange',
    'red',
    'purple',
    'magenta',
    'green',
    'teal',
    'blue',
  ])
  .describe('filter results by color');

const orderByArg = z
  .enum(['relevant', 'latest'])
  .describe('result order: relevant or latest (default relevant)');

const sizeArg = z
  .enum(SIZES)
  .default('full')
  .describe('image size: raw, full, regular, small or thumb (default full)');

const perPageArg = z.coerce
  .number()
  .int()
  .min(1)
  .max(30)
  .default(6)
  .describe('results per page (1-30, default 6)');

const pageArg = z.coerce.number().int().min(1).default(1).describe('page number (default 1)');

const downloadCountArg = z.coerce
  .number()
  .int()
  .min(0)
  .max(30)
  .default(0)
  .describe('download the first N results (requires --out-dir)');

const authSet = declareCommand({
  name: 'auth set',
  category: 'auth',
  description: 'Store the Unsplash Access Key in macOS Keychain',
  options: z.object({
    stdin: z.boolean().optional().describe('read the key from stdin (for pbpaste or CI)'),
    'skip-verify': z.boolean().optional().describe('save without verifying the key against the API'),
  }),
});

const authStatus = declareCommand({
  name: 'auth status',
  category: 'auth',
  description: 'Show whether an Access Key is configured (never prints the key)',
});

const authClear = declareCommand({
  name: 'auth clear',
  category: 'auth',
  description: 'Remove the Access Key from macOS Keychain',
});

const search = declareCommand({
  name: 'search',
  category: 'photos',
  description: 'Search Unsplash photos',
  args: z.object({
    query: z.string().min(1).describe('search terms (English works best)'),
  }),
  options: z.object({
    'per-page': perPageArg,
    page: pageArg,
    orientation: orientationArg.optional(),
    color: colorArg.optional(),
    'order-by': orderByArg.optional(),
    download: downloadCountArg,
    'out-dir': z.string().optional().describe('directory for downloaded images'),
    size: sizeArg,
  }),
});

const download = declareCommand({
  name: 'download',
  category: 'photos',
  description: 'Download an Unsplash photo by id or URL',
  args: z.object({
    ref: z.string().min(1).describe('photo id or unsplash.com URL'),
  }),
  options: z.object({
    out: z.string().optional().describe('exact output file path'),
    'out-dir': z.string().optional().describe('directory; file is named <photo-id>.<ext>'),
    size: sizeArg,
  }),
});

export const commands = {
  'auth set': authSet,
  'auth status': authStatus,
  'auth clear': authClear,
  search,
  download,
};
