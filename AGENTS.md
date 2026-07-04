# AGENTS.md — Auto Email (`hynote-email-agent`)

Guidance for AI agents working in this repo. Follow these conventions; they reflect the owner's established preferences.

## Workflow (non-negotiable)

Every change — even a one-liner — goes through the superpowers flow:

1. **brainstorming** → clarify one question at a time, present a short design, get approval.
2. **Write a spec** to `docs/YYYY-MM-DD-<topic>-design.md` and commit.
3. **writing-plans** → write a plan to `docs/YYYY-MM-DD-<topic>-plan.md` (full code per step, TDD, bite-sized), commit.
4. **subagent-driven-development** → the owner almost always picks **"1" (subagent-driven)**. Dispatch a fresh implementer per task/phase; spec-review the substantive ones; keep small verbatim ports inline-approved.
5. Do NOT write implementation code before the design is approved.

Specs and plans live in the project `docs/` folder (NOT `docs/superpowers/`).

## Language

- The owner communicates in **Chinese** — reply in Chinese.
- Code, identifiers, commit messages, and `AGENTS.md`/docs headings stay in **English**.
- Commit style: conventional-ish, one commit per task: `feat(cli): …`, `fix(server): …`, `refactor(stats): …`, `docs: …`, `chore: …`.

## Stack & layout

- **Bun** runtime + TypeScript monorepo. Packages: `shared` (types/Zod) · `database` (Drizzle + D1) · `server` (Hono + agent runtime) · `cli` (@opentui/react TUI).
- **Tests: Vitest**, per-package **flat `tests/` folder** (`packages/<pkg>/tests/*.test.ts`), importing the code under test via `../src/...`. Run: `bun run test`.
- **Typecheck:** `bunx tsc -p packages/<pkg>/tsconfig.json --noEmit` must be exit 0 for every touched package.
- `tsconfig.base.json` sets `"types": ["node"]` and `@types/node` is a dep. **Use `node:*` builtins** (e.g. `node:child_process`) — do NOT use `Bun.*` globals in typed code (`Bun` isn't in the `types` array → `Cannot find name 'Bun'`). `process.execPath` is the bun binary.
- **No `any`.** Prefer extracting pure logic into small, unit-tested functions (e.g. `previewInput`, `shouldConfirm`, `probeServer`).

## AI / provider

- **deepseek-only** via `@ai-sdk/deepseek` (`createDeepSeek`), `thinking: { type: 'enabled' }` + `reasoningEffort: 'high'`. Default model **`deepseek-v4-flash`**. Base URL `https://api.deepseek.com/v1`.
- Do NOT use `generateObject` (DeepSeek rejects its json-schema response format). Use `generateText`/`streamText` + a tolerant JSON-parse helper with explicit shape prompts.
- Streaming: `POST /api/run/stream` (Hono `streamSSE`) drives `AiPort.streamSkill` (consume `streamText().fullStream`, map parts → `RunStreamEvent`, then emit a final `result`). `POST /api/run` (non-streaming) stays for tests/fallback.
- The reply skill returns an **empty `template`** for non-email input (plain conversational text); the CLI only shows the confirm flow when `shouldConfirm(res)` (reply with a non-empty template).

## Database

- **Cloudflare D1**: runtime via `drizzle-orm/sqlite-proxy` hitting the D1 `/query` HTTP API; migrations via `drizzle-kit` `driver: 'd1-http'` (`bun run db:push`).
- Tests use an in-memory **libsql** drizzle instance (`@hynote/database/test` `createTestDb`) — NOT the remote D1. `@libsql/client` is a devDependency; keep test helpers out of the runtime barrel.
- Prefer the **Drizzle query builder** over raw `db.all(sql\`…\`)` (the builder maps proxy rows to named objects consistently; raw sql returns positional arrays under the proxy).

## Config, secrets, ports

- Secrets in root **`.env`** (gitignored): `CLOUDFLARE_ACCOUNT_ID/DATABASE_ID/D1_TOKEN`, `DEEPSEEK_API_KEY`, optional `HYNOTE_PORT`.
- Non-secret config in **`~/.bao-auto-mail/config.json`** (the runtime source `loadConfig` reads — updating `DEFAULT_CONFIG` only affects fresh seeds; **also update the seeded file** for existing installs). Templates/skills seeded to `~/.bao-auto-mail/{templates,skills}`.
- Default port **45678** (avoid common ports like 3000); overridable via `HYNOTE_PORT` (read by both server and CLI).
- **When you change a bundled asset** (`packages/server/src/assets/skills|templates/…`), also sync the already-seeded copy under `~/.bao-auto-mail/` (seeding only fills missing files).

## CLI / UI

- The TUI mirrors **baocode's `packages/cli`** look exactly (owner's standard). Reference: `/Users/bao/data/code/baocode/packages/cli/src`. Copy baocode's generic infra **verbatim** (theme, providers: theme/keyboard-layer/toast/dialog, border, spinner, dialog-search-list, InputBar shell) with only namespace/`MODE`/mentions edits; adapt domain pieces.
- Brand shown in UI is **"Auto Email"** (`<ascii-font font="tiny">` "Auto"(orange)+"Email"), command is `hynote`.
- Message rendering follows baocode `bot-message.tsx`: `│` left-bar DIM boxes for reasoning/tool, `<markdown>` for text, `◉ provider › model` footer. User input renders as a `UserMessage` card (left primary accent + `colors.surface`), previewed to ~6 lines.
- `hynote` **auto-starts the backend**: `server-boot.ts` probes `/api/health` on the port → reuses a running server or spawns one (`node:child_process`, cwd=repo root, logs to `~/.bao-auto-mail/server.log`), kills it on exit.
- **TUI has no automated tests** (needs a TTY). Verify UI changes with `bunx tsc` + `bun build packages/cli/src/index.tsx --target bun --outdir /tmp/...` + hand off the interactive check to the owner. Extract any logic into pure, testable functions.

## Reference

Design/plan docs in `docs/` capture every change's rationale — read the relevant one before touching a subsystem. README covers usage + bundling.
