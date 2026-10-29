# @orangemust/unsplash-cli

Search and download [Unsplash](https://unsplash.com) photos from the command line.

- Search with orientation / color / order filters
- Download the original or a specific size
- Writes a `<photo-id>.json` sidecar with photographer, source page and license
- Tracks downloads as required by the Unsplash API guidelines
- **Access Key stored in macOS Keychain** — never in `.env`, project files or shell history

## Install

```bash
npm install -g @orangemust/unsplash-cli
```

Local development:

```bash
npm install
npm run build
npm link
```

- npm: <https://www.npmjs.com/package/@orangemust/unsplash-cli>
- GitHub: <https://github.com/mack-peng/unsplash-cli>

> `unsplash-cli` on npm is an unrelated, unmaintained 2015 package. This project uses the scoped name `@orangemust/unsplash-cli`; the command is `unsplash` (alias `unsplash-cli`).

## Authentication

Get an Access Key from <https://unsplash.com/oauth/applications> (New application → Access Key, not the Secret Key).

Store it in the macOS Keychain:

```bash
unsplash auth set
# or paste from clipboard without putting the key in shell history
pbpaste | unsplash auth set --stdin
```

Do **not** run `unsplash auth set <key>` — the key would land in your shell history. The command only accepts the hidden prompt or `--stdin`.

Check status without printing the key:

```bash
unsplash auth status
# Configured: yes
# Source: macOS Keychain (service: unsplash-cli)
```

Remove it:

```bash
unsplash auth clear
```

The key is stored as a generic password with service `unsplash-cli` and account `default`. It is read with the macOS `security` command; the first read may show a Keychain access prompt — choose **Always Allow** if you do not want to see it again.

For CI or non-macOS environments, set `UNSPLASH_ACCESS_KEY`; it takes precedence over Keychain storage.

## Usage

```bash
# Search
unsplash search "minimal desk" --per-page 6
unsplash search "minimal desk" --orientation portrait --color white --json

# Download one photo by id or Unsplash URL
unsplash download abc123XYZ --out ./assets/desk.jpg
unsplash download https://unsplash.com/photos/some-slug-abc123XYZ --out-dir ./assets

# Search and download the first two results
unsplash search "minimal desk" --download 2 --out-dir ./assets/refs
```

### Options

`search`:

- `--per-page N` — 1–30, default 6
- `--page N` — default 1
- `--orientation landscape|portrait|squarish`
- `--color black_and_white|black|white|yellow|orange|red|purple|magenta|green|teal|blue`
- `--order-by relevant|latest`
- `--download N` — requires `--out-dir`
- `--out-dir DIR`
- `--size raw|full|regular|small|thumb` — default `full`
- `--json`

`download`:

- `--out FILE` or `--out-dir DIR`
- `--size raw|full|regular|small|thumb` — default `full`
- `--json`

## Output and compliance

Human output lists the photo id, dimensions, description, photographer credit and source page. `--json` returns a compact object for agents.

Each download saves the image plus a sidecar:

```json
{
  "provider": "unsplash",
  "id": "abc123XYZ",
  "photographer": { "name": "Jane Doe", "profile_url": "https://unsplash.com/@jane?utm_source=unsplash-cli&utm_medium=referral" },
  "photo_page": "https://unsplash.com/photos/abc123XYZ?utm_source=unsplash-cli&utm_medium=referral",
  "attribution": "Photo by Jane Doe on Unsplash (...)",
  "download_tracked": true,
  "license": "https://unsplash.com/license"
}
```

When publishing an image, keep the attribution and link. The Unsplash License allows free commercial use, but does not allow selling unmodified copies or building a competing image service.

The CLI calls Unsplash's `download_location` endpoint after saving an image. If tracking fails it warns but keeps the file. API errors (401/403/429) are reported without retrying.

## Architecture

Follows the same CLI conventions as the other `Cli-projects`:

- `src/cli/commands.ts` — zod schemas and descriptions for every command and flag
- `src/cli/command.ts` — `declareCommand` / `parseCommand` (zod validation and error formatting)
- `src/cli/minimist.ts` — argument parsing (`--flag`, `--no-flag`, `--key=value`, short flags)
- `src/cli/output.ts` — `TextOutput` / `JsonOutput`
- `src/cli/program.ts` — command dispatch
- `src/config/helpGenerator.ts` — help generated from the zod schemas
- `scripts/build.js` — `tsc` + `dist/help.json` generation

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
node bin/unsplash.js --help
```

Tests use a local mock API (`UNSPLASH_API_BASE`) and never touch the real Keychain or network.

## License

MIT
