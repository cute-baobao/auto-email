# hynote Auto-Start Backend + /api/health — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `hynote` auto-start the backend — probe the port, reuse a running server or spawn one (logging to `~/.bao-auto-mail/server.log`), wait for readiness, then render the TUI and kill the spawned server on exit — plus a dedicated `GET /api/health` probe endpoint.

**Architecture:** New `packages/cli/src/server-boot.ts` (`probeServer`/`ensureServer`/`registerCleanup`) spawns the server via `node:child_process` (`process.execPath` = bun) with paths resolved relative to `import.meta.url`; `index.tsx` calls it before rendering. Server gains a trivial `GET /api/health`.

**Tech Stack:** Bun, `node:child_process`, Hono, `@opentui`, Vitest. CLI tsconfig is `types:["node"]` — use `node:child_process` (typed by `@types/node`), NOT `Bun.spawn`.

**Spec:** `docs/2026-07-04-hynote-autostart-server-design.md`. Run from repo root. Existing 40 tests stay green.

---

## Task 1: Server `/api/health` route (TDD)

**Files:** Modify `packages/server/src/app.ts`, `packages/server/tests/app.test.ts`

- [ ] **Step 1: Write the failing test** — append to `packages/server/tests/app.test.ts`:

```ts
describe('GET /api/health', () => {
  it('returns 200 { ok: true }', async () => {
    const app = createApp({ db, templatesDir, skillsDir, ai: fakeAi() });
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `bun run test packages/server/tests/app.test.ts`
Expected: FAIL — the new health test gets 404.

- [ ] **Step 3: Add the route** in `packages/server/src/app.ts`, right after `const app = new Hono();`:

```ts
  app.get('/api/health', (c) => c.json({ ok: true }));
```

- [ ] **Step 4: Run it, verify PASS**

Run: `bun run test packages/server/tests/app.test.ts`
Expected: PASS (health test + all prior app tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server && git commit -m "feat(server): GET /api/health probe endpoint"
```

---

## Task 2: CLI `server-boot.ts` (probeServer TDD + ensureServer/registerCleanup)

**Files:** Create `packages/cli/src/server-boot.ts`, `packages/cli/tests/server-boot.test.ts`

- [ ] **Step 1: Write the failing test** `packages/cli/tests/server-boot.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { probeServer } from '../src/server-boot';

afterEach(() => vi.restoreAllMocks());

describe('probeServer', () => {
  it('returns true when the server responds 2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    expect(await probeServer(3999)).toBe(true);
  });
  it('returns false when fetch rejects (nothing listening)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await probeServer(3999)).toBe(false);
  });
  it('returns false on a non-ok status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));
    expect(await probeServer(3999)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `bun run test packages/cli/tests/server-boot.test.ts`
Expected: FAIL — cannot find `../src/server-boot`.

- [ ] **Step 3: Create `packages/cli/src/server-boot.ts`** (exact spec §3.2 code):

```ts
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)); // packages/cli/src
const SERVER_ENTRY = resolve(HERE, '../../server/src/index.ts');
const REPO_ROOT = resolve(HERE, '../../..');
const PORT = Number(process.env.HYNOTE_PORT ?? 3000);
const CONFIG_DIR = join(homedir(), '.bao-auto-mail');
const LOG_PATH = join(CONFIG_DIR, 'server.log');

export async function probeServer(port = PORT): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 500);
    const res = await fetch(`http://localhost:${port}/api/health`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

export async function ensureServer(): Promise<{ proc: ChildProcess | null }> {
  if (await probeServer()) return { proc: null }; // reuse a running server

  mkdirSync(CONFIG_DIR, { recursive: true });
  const fd = openSync(LOG_PATH, 'a');
  const proc = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: REPO_ROOT,
    stdio: ['ignore', fd, fd],
    env: process.env,
  });

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await probeServer()) return { proc };
    await new Promise((r) => setTimeout(r, 250));
  }
  proc.kill();
  throw new Error(`server 未在 10s 内就绪，见 ${LOG_PATH}`);
}

export function registerCleanup(proc: ChildProcess): void {
  const kill = () => {
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
  };
  process.on('exit', kill);
  process.on('SIGINT', kill);
  process.on('SIGTERM', kill);
}
```

- [ ] **Step 4: Run it, verify PASS**

Run: `bun run test packages/cli/tests/server-boot.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `bunx tsc -p packages/cli/tsconfig.json --noEmit`
Expected: exit 0 (`ChildProcess`, `spawn`, fs/os/path/url all from `@types/node`; no `Bun` global used).

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/server-boot.ts packages/cli/tests/server-boot.test.ts
git commit -m "feat(cli): server-boot (probe/spawn/cleanup)"
```

---

## Task 3: Wire `ensureServer` into the CLI entry

**Files:** Modify `packages/cli/src/index.tsx`

- [ ] **Step 1: Edit `index.tsx`** to boot the server before rendering:

```tsx
#!/usr/bin/env bun
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { RootLayout } from './layouts/root-layout';
import { Repl } from './screens/repl';
import { ensureServer, registerCleanup } from './server-boot';

const { proc } = await ensureServer();
if (proc) registerCleanup(proc);

const router = createMemoryRouter([
  { path: '/', element: <RootLayout />, children: [{ index: true, element: <Repl /> }] },
]);

const renderer = await createCliRenderer({ targetFps: 60, exitOnCtrlC: false });
createRoot(renderer).render(<RouterProvider router={router} />);
```

- [ ] **Step 2: Typecheck + bundle + tests**

Run: `bunx tsc -p packages/cli/tsconfig.json --noEmit` (exit 0); `bun build packages/cli/src/index.tsx --target bun --outdir /tmp/ae-boot` (success); `bun run test` (all pass).

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/index.tsx && git commit -m "feat(cli): auto-start backend on hynote launch"
```

---

## Task 4: Verify

- [ ] **Step 1: Final gate** — `bun run test` (existing 40 + `/api/health` + 3 probe = 44) and `bunx tsc -p packages/{shared,database,server,cli}/tsconfig.json --noEmit` (all exit 0) and `bun build packages/cli/src/index.tsx --target bun --outdir /tmp/ae-boot` (success).
- [ ] **Step 2 (user, needs real `.env` + TTY):** Live checks:
  - `hynote` alone → server auto-starts (first launch a few seconds), then TUI; `~/.bao-auto-mail/server.log` has server output; after quitting, `lsof -ti:3000` is empty (spawned server killed).
  - `bun run dev:server` first, then `hynote` → reuses it (no second process), and quitting `hynote` leaves the dev server running.
  - Verify path resolution works for the globally-linked `hynote` (bin symlink) — if `../../server` doesn't resolve (symlink not followed), switch to walking up from `HERE` to the workspace root that contains `packages/server`. (Spec §7 risk.)

---

## Self-Review Notes (author checklist — applied)

- **Spec coverage:** `/api/health` (Task 1); probe-reuse-else-spawn + log file + readiness wait + kill-on-timeout (Task 2 `ensureServer`); cleanup on exit/SIGINT/SIGTERM (Task 2 `registerCleanup`); wired before TUI render (Task 3); node:child_process for tsc-clean typing under `types:["node"]` (Task 2). Reuse-vs-spawn + log path + path resolution all covered.
- **Placeholder scan:** none — full code per step; Task 4 Step 2's symlink fallback is a concrete conditional verification, not deferred work.
- **Type consistency:** `probeServer(port?)`, `ensureServer(): {proc: ChildProcess|null}`, `registerCleanup(proc: ChildProcess)` consistent across server-boot.ts, its test (calls `probeServer(3999)`), and index.tsx (`const {proc} = await ensureServer(); if (proc) registerCleanup(proc)`). `/api/health` body `{ ok: true }` matches the probe's `res.ok` check + the app test.
