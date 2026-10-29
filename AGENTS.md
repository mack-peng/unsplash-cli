# unsplash-cli

Agent notes for `@orangemust/unsplash-cli`.

## Commands

```bash
unsplash auth status --json
unsplash auth set --stdin          # pbpaste | unsplash auth set --stdin
unsplash auth clear
unsplash search "<query>" --json
unsplash search "<query>" --download 2 --out-dir <dir> --json
unsplash download <id|url> --out <file> --json
```

## Rules

- Never print, echo or log the Access Key.
- Never pass the key as a CLI argument; use `unsplash auth set` (hidden prompt) or `pbpaste | unsplash auth set --stdin`.
- Key lives in macOS Keychain (service `unsplash-cli`); `UNSPLASH_ACCESS_KEY` is an env override for CI only.
- Do not create `.env` files for this project.
- `--json` is the agent-facing output; human output is for terminals.
- Downloads write a `<photo-id>.json` sidecar and trigger Unsplash download tracking automatically.
- Keep attribution (`Photo by <name> on Unsplash`) when an image is published.
- 401/403/429 are not retried automatically; report the error.
- Tests: `npm test` (local mock API, no Keychain/network).

## Structure

- `src/cli/commands.ts` — zod command/flag schemas with descriptions
- `src/cli/command.ts` — `declareCommand` / `parseCommand`
- `src/cli/minimist.ts` — arg parser
- `src/cli/output.ts` — text/JSON output
- `src/cli/program.ts` — dispatch
- `src/config/helpGenerator.ts` — generated help
- `scripts/build.js` — build + `dist/help.json`

## Build

```bash
npm run typecheck
npm test
npm run build
```
