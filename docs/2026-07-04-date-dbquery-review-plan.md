# Date + db_query + CLI Review — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `get_current_date` and `db_query` (SELECT-only) tools with CLI review intercept — AI selects the tool, fills parameters, but the user must approve the operation before it executes.

**Architecture:** Shared types gain `db-insert`/`db-query` RunResponse variants. Server adds `get_current_date` + `db_query` (with `queryRows` pure function, table/column/op whitelisted) and a `POST /api/execute` endpoint that reuses the same safe `insertRow`/`queryRows` for execution. CLI extends `repl.tsx` with a review card (ConfirmMenu style) that blocks auto-execution of DB writes until the user approves; `POST /api/execute` is called only after approval.

**Tech Stack:** Bun, Drizzle (eq/ne/gt/lt/gte/lte/like/and/asc/desc), Hono, ai tools, Zod, Vitest, `@opentui/react`. **No `any`.** Spec: `docs/2026-07-04-date-dbquery-review-design.md`.

---

## Task 1: Shared RunResponse variants (TDD)

**Files:** Modify `packages/shared/src/types.ts`, `packages/shared/src/schemas.ts`

- [ ] **Step 1: Write the failing test** — add `packages/shared/tests/db-response.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { RunResponseSchema } from '../src/schemas';

describe('RunResponse db variants', () => {
  it('parses a db-insert response', () => {
    const r = RunResponseSchema.parse({
      type: 'db-insert', table: 'replies', values: { template: 'partner' },
    });
    expect(r.type).toBe('db-insert');
  });
  it('parses a db-query response with a result', () => {
    const r = RunResponseSchema.parse({
      type: 'db-query', table: 'replies', query: { columns: ['template'] },
      result: [{ template: 'partner' }],
    });
    expect(r.type).toBe('db-query');
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — module/export missing.

- [ ] **Step 3: Extend `RunResponse` type** in `types.ts` by adding two variants to the union:

```ts
  | { type: 'db-insert'; table: string; values: Record<string, unknown> }
  | { type: 'db-query'; table: string; query: { columns?: string[]; where?: { column: string; op: string; value: unknown }[]; orderBy?: string; limit?: number }; result?: Record<string, unknown>[] }
```

- [ ] **Step 4: Extend `RunResponseSchema`** in `schemas.ts` by adding two more variants to the existing `z.union([...])`:

```ts
  z.object({
    type: z.literal('db-insert'),
    table: z.string(),
    values: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal('db-query'),
    table: z.string(),
    query: z.object({
      columns: z.array(z.string()).optional(),
      where: z.array(z.object({
        column: z.string(), op: z.string(), value: z.unknown(),
      })).optional(),
      orderBy: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    result: z.array(z.record(z.string(), z.unknown())).optional(),
  }),
```

- [ ] **Step 5: Run it, verify PASS** — 2 tests pass.

- [ ] **Step 6: Commit** — `git add packages/shared && git commit -m "feat(shared): db-insert/db-query RunResponse variants"`

---

## Task 2: `get_current_date` tool

**Files:** Create `packages/server/src/agent/tools/system.ts`; modify `packages/server/src/agent/tools/index.ts`

- [ ] **Step 1: Create `system.ts`**:

```ts
import { tool } from 'ai';
import { z } from 'zod';

export function systemTools() {
  return {
    get_current_date: tool({
      description: 'Return the current date/time in UTC (today). Use this to know the current date for date-related queries or calculations.',
      inputSchema: z.object({}),
      execute: async () => {
        const d = new Date();
        return {
          date: d.toISOString().slice(0, 10),
          iso: d.toISOString(),
          timestamp: d.getTime(),
          dayOfWeek: d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
        };
      },
    }),
  };
}
```

- [ ] **Step 2: Register** in `packages/server/src/agent/tools/index.ts` — import `systemTools` and spread it into `buildToolRegistry` return:

```ts
import { systemTools } from './system';
// in buildToolRegistry: return { ...systemTools(), ...templateTools(deps.templatesDir), ...dbTools(deps.db) };
```

- [ ] **Step 3: Typecheck + test** — `bunx tsc -p packages/server/tsconfig.json --noEmit` (exit 0); `bun run test` (59 pass). Commit `feat(server): get_current_date tool`.

---

## Task 3: `queryRows` + `db_query` tool (TDD)

**Files:** Modify `packages/server/src/agent/tools/db.ts`, `packages/server/tests/db-insert.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append to `packages/server/tests/db-insert.test.ts`:

```ts
import { queryRows } from '../src/agent/tools/db';
import { eq } from 'drizzle-orm';

describe('queryRows', () => {
  it('selects all rows with default limit 20', async () => {
    const db = await createTestDb();
    await db.insert(replies).values([
      { id: 'a', template: 'partner', replyContent: '.' },
      { id: 'b', template: 'partner', replyContent: '.' },
    ]);
    const { rows } = await queryRows(db, 'replies', {});
    expect(rows).toHaveLength(2);
  });
  it('filters by template with an eq where clause', async () => {
    const db = await createTestDb();
    await db.insert(replies).values([
      { id: 'a', template: 'partner', replyContent: '.' },
      { id: 'b', template: 'kol-media-support', replyContent: '.' },
    ]);
    const { rows } = await queryRows(db, 'replies', {
      where: [{ column: 'template', op: '=', value: 'partner' }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.template).toBe('partner');
  });
  it('selects specific columns', async () => {
    const db = await createTestDb();
    await db.insert(replies).values({ id: 'a', template: 't', replyContent: '.' });
    const { rows } = await queryRows(db, 'replies', { columns: ['template'] });
    expect(rows[0]!).toHaveProperty('template');
    expect(rows[0]!).not.toHaveProperty('replyContent');
  });
  it('rejects a non-whitelisted table', async () => {
    const db = await createTestDb();
    await expect(queryRows(db, 'secrets', {})).rejects.toThrow();
  });
  it('rejects an unknown column', async () => {
    const db = await createTestDb();
    await expect(queryRows(db, 'replies', { columns: ['bogus'] })).rejects.toThrow(/column/i);
  });
  it('rejects a forbidden op', async () => {
    const db = await createTestDb();
    await expect(queryRows(db, 'replies', {
      where: [{ column: 'template', op: 'DROP', value: 'x' }],
    })).rejects.toThrow(/op/i);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `queryRows` not exported.

- [ ] **Step 3: Add `queryRows` + `db_query` to `db.ts`.** Import `eq, ne, gt, gte, lt, lte, like, and, asc, desc` from `drizzle-orm`. Then:

```ts
const OPS: Record<string, (col: any, val: any) => any> = { '=': eq, '!=': ne, '>': gt, '>=': gte, '<': lt, '<=': lte, 'LIKE': like };

export async function queryRows(
  db: Db, table: string,
  opts: { columns?: string[]; where?: { column: string; op: string; value: unknown }[]; orderBy?: string; limit?: number },
): Promise<{ rows: Record<string, unknown>[] }> {
  const t = WRITABLE_TABLES[table];
  if (!t) throw new Error(`Table not allowed: ${table}`);
  const cols = getTableColumns(t);
  const selectCols: Record<string, any> = {};
  const names = opts.columns && opts.columns.length > 0 ? opts.columns : Object.keys(cols);
  for (const c of names) {
    if (!(c in cols)) throw new Error(`Unknown column: ${table}.${c}`);
    selectCols[c] = (cols as any)[c];
  }
  let q: any = db.select(selectCols).from(t);
  if (opts.where && opts.where.length > 0) {
    const filters = opts.where.map((w) => {
      const col = (cols as any)[w.column];
      if (!col) throw new Error(`Unknown column: ${table}.${w.column}`);
      const fn = OPS[w.op];
      if (!fn) throw new Error(`Unknown or unsupported op: ${w.op}`);
      return fn(col, w.value);
    });
    q = q.where(and(...filters));
  }
  const limit = Math.min(opts.limit ?? 20, 100);
  q = q.limit(limit);
  if (opts.orderBy) {
    q = q.orderBy(desc((cols as any)[opts.orderBy] ?? desc((cols as any).id ?? '')));
  }
  const rows = await q;
  return { rows };
}
```

(The `(cols as any)[c]` casts are to access dynamic column keys — keep the cast but do NOT use `any` elsewhere.)

- [ ] **Step 4: Add `db_query` tool** to `dbTools`:

```ts
db_query: tool({
  description: 'SELECT rows from an allowed table. READ-ONLY (cannot insert/update/delete). Use the schema to pick table, columns, optional filters, order, and limit.',
  inputSchema: z.object({
    table: z.string(),
    columns: z.array(z.string()).optional(),
    where: z.array(z.object({
      column: z.string(), op: z.enum(['=', '!=', '>', '<', '>=', '<=', 'LIKE']), value: z.union([z.string(), z.number()]),
    })).optional(),
    orderBy: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  execute: async ({ table, columns, where, orderBy, limit }) =>
    queryRows(db, table, { columns, where, orderBy, limit }),
}),
```

- [ ] **Step 5: Run, verify PASS** — all 4+6=10 db tool tests pass.

- [ ] **Step 6: Typecheck + commit** — `bunx tsc -p packages/server/tsconfig.json --noEmit` (exit 0); `git add packages/server && git commit -m "feat(server): db_query tool + queryRows (SELECT-only)"`

---

## Task 4: `POST /api/execute` endpoint (TDD)

**Files:** Modify `packages/server/src/app.ts`, `packages/server/tests/app.test.ts`

- [ ] **Step 1: Write the failing test** — `app.test.ts` append:

```ts
describe('POST /api/execute', () => {
  it('executes a db-insert action', async () => {
    const app = createApp({ db, templatesDir, skillsDir, ai: fakeAi() });
    const res = await app.request('/api/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'db-insert', table: 'replies', values: { template: 'test', replyContent: 'x' } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { inserted: number; id: string };
    expect(body.inserted).toBe(1);
    expect(body.id).toMatch(/[0-9a-f-]{36}/);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — 404.

- [ ] **Step 3: Add the route** to `app.ts`:

```ts
app.post('/api/execute', async (c) => {
  const body = await c.req.json<{ action: string; table: string; values?: Record<string, string | number | null>; query?: Record<string, unknown> }>();
  try {
    if (body.action === 'db-insert') {
      const out = await insertRow(deps.db, body.table!, body.values ?? {});
      return c.json(out);
    }
    if (body.action === 'db-query') {
      const out = await queryRows(deps.db, body.table!, body.query as any ?? {});
      return c.json(out);
    }
    return c.json({ error: `Unknown action: ${body.action}` }, 400);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});
```

(Import `insertRow, queryRows` from `./agent/tools/db`.)

- [ ] **Step 4: Run, verify PASS** — new test passes.

- [ ] **Step 5: Typecheck + full suite** — `bunx tsc -p packages/server/tsconfig.json --noEmit` (exit 0); `bun run test` (all pass). Commit `feat(server): POST /api/execute endpoint`.

---

## Task 5: CLI review card + `executeAction` client

**Files:** Modify `packages/cli/src/client.ts` (+ `executeAction`), `packages/cli/src/screens/repl.tsx` (+ review card)

- [ ] **Step 1: Add `executeAction` to `client.ts`**:

```tsx
export async function executeAction(action: string, payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${BASE}/api/execute`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}
```

- [ ] **Step 2: Repl — detect review-needed results and show a review card.** In `screens/repl.tsx`, after `setResult(res)` in `runTurn`, when `res.type === 'db-insert' || res.type === 'db-query'`:
  - Set `pendingDb` state (type `{ res }`), `setResult(null)`, enter a review mode.
  - Render a review card in the input area (via `inputSlot`): two options — `[确认执行]` / `[取消]` (↑/↓, Enter), showing the operation summary (e.g. `INSERT INTO replies: template='partner', emailName='...'`).
  - Confirm → call `executeAction(...)` then setResult with the returned `{ inserted, id }`/`{ rows }` + toast `执行成功`.
  - Cancel → toast `已取消`, clear pendingDb.

(EditBar ConfirmMenu pattern — reuse the confirmIndex/inputSlot approach. Put review card render logic into `renderers/review.tsx` or inline; follow existing patterns.)

- [ ] **Step 3: Typecheck + bundle + tests** — `bunx tsc -p packages/cli/tsconfig.json --noEmit` (exit 0); `bun build packages/cli/src/index.tsx --target bun --outdir /tmp/ae-review` (success); `bun run test` (all pass). Commit `feat(cli): DB action review card + executeAction`.

---

## Task 6: Verify (final gate + live)

- [ ] **Step 1: Final gate** — `bun run test` (passed) + `bunx tsc -p packages/{shared,database,server,cli}/tsconfig.json --noEmit` (all exit 0).
- [ ] **Step 2: Live (user, TTY)** — Send a query like "今天是什么日期？" → expects `get_current_date` response; "把 123456 记录为 partner" → review card appears → confirm → row inserted; "查一下所有 partner" → review card appears → confirm → rows returned.

---

## Self-Review Notes (author checklist — applied)

- **Spec coverage:** RunResponse variants (Task 1); get_current_date (Task 2); queryRows + db_query with table/col/op whitelist (Task 3); /api/execute endpoint with `insertRow`/`queryRows` safety (Task 4); CLI review card + executeAction (Task 5). No update/delete tool anywhere.
- **Placeholder scan:** none — full code per step. The `(cols as any)[c]` cast is the deliberate dynamic-column-access pattern — no `any` elsewhere.
- **Type consistency:** `queryRows` signature matches its test + the `POST /api/execute` handler + the `db_query` tool. `executeAction(action, payload)` matches the review card's confirm path. `RunResponse` variants match schemas.
