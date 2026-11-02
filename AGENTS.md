# unsplash-cli

Agent notes for `@orangemust/unsplash-cli`.

## Commands

```bash
unsplash auth status --json
unsplash auth set --stdin          # pbpaste | unsplash auth set --stdin
unsplash auth clear
unsplash config-show
unsplash config-set access-key <key>
unsplash config-path
unsplash config-new <profile>
unsplash -p <profile> auth set
unsplash config-use <profile>
unsplash config-list
unsplash search "<query>" --json
unsplash search "<query>" --download 2 --out-dir <dir> --json
unsplash download <id|url> --out <file> --json
```

## Rules

- Never print, echo or log the Access Key.
- Never pass the key as a CLI argument; use `unsplash auth set` (hidden prompt) or `pbpaste | unsplash auth set --stdin`. `config-set access-key <key>` works but may expose the key in shell history.
- Key lives in `~/.unsplashrc` (JSON, mode 600, profiles); `UNSPLASH_ACCESS_KEY` is an env override. `UNSPLASH_RC_PATH` overrides the file path.
- Profile selection: `-p/--profile` > `UNSPLASH_PROFILE` > `active` in the config file.
- Do not create `.env` files for this project.
- `--json` is the agent-facing output; human output is for terminals.
- Downloads write a `<photo-id>.json` sidecar and trigger Unsplash download tracking automatically.
- Keep attribution (`Photo by <name> on Unsplash`) when an image is published.
- 401/403/429 are not retried automatically; report the error.
- Tests: `npm test` (local mock API, no config file/network).

## Structure

- `src/cli/commands.ts` — zod command/flag schemas with descriptions
- `src/cli/command.ts` — `declareCommand` / `parseCommand`
- `src/cli/minimist.ts` — arg parser
- `src/cli/output.ts` — text/JSON output
- `src/cli/program.ts` — dispatch
- `src/config/config.ts` — `~/.unsplashrc` profiles and credential resolution
- `src/config/helpGenerator.ts` — generated help
- `scripts/build.js` — build + `dist/help.json`

## Build

```bash
npm run typecheck
npm test
npm run build
```
