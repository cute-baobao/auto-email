# AI db_insert Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the AI an insert-only DB write capability — a schema-aware `db_insert({ table, values })` tool (whitelisted tables, validated columns, auto id, parameterized), the schema summary injected into the prompt, and a `record` skill that uses it. First use: record 7 partner User IDs into `replies`.

**Architecture:** `database` exposes `WRITABLE_TABLES` + `describeSchema()` (from Drizzle `getTableColumns`). `server` adds `insertRow`/`db_insert` (in `agent/tools/db.ts`), injects `describeSchema()` into the system prompt for skills that allow `db_insert`, and ships a `record` skill.

**Tech Stack:** Bun, Drizzle (`getTableColumns`), Hono, `ai` tools, Zod, Vitest. Run from repo root. Existing 52 tests stay green. **No `any`.**

**Spec:** `docs/2026-07-04-ai-db-insert-tool-design.md`. Drizzle Column metadata verified: `.name/.primary/.notNull/.hasDefault/.dataType`; `getTableColumns` returns columns keyed by **TS property name** (`emailName`, not `email_name`) — `db.insert().values()` and `values` keys use those TS names.

---

## Task 1: `describeSchema` + `WRITABLE_TABLES` (database, TDD)

**Files:** Create `packages/database/src/describe.ts`, `packages/database/tests/describe.test.ts`; modify `packages/database/src/index.ts`

- [ ] **Step 1: Write the failing test** `packages/database/tests/describe.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { describeSchema, WRITABLE_TABLES } from '../src/describe';

describe('describeSchema', () => {
  it('lists the replies table with its TS-named columns', () => {
    const s = describeSchema();
    expect(s).toContain('Table replies:');
    expect(s).toContain('template');
    expect(s).toContain('emailName');
    expect(s).toContain('createdAt');
  });
  it('exposes replies in the writable whitelist', () => {
    expect(Object.keys(WRITABLE_TABLES)).toContain('replies');
  });
});
```

- [ ] **Step 2: Run it, verify FAIL** — `bun run test packages/database/tests/describe.test.ts` → FAIL (module missing).

- [ ] **Step 3: Create `packages/database/src/describe.ts`**:

```ts
import { getTableColumns } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { replies } from './schema';

// Tables the AI is allowed to INSERT into (insert-only).
export const WRITABLE_TABLES: Record<string, SQLiteTable> = { replies };

// Compact schema summary injected into the AI prompt. Column names are the
// Drizzle TS property names (what db.insert().values() expects).
export function describeSchema(): string {
  const lines: string[] = [];
  for (const [name, table] of Object.entries(WRITABLE_TABLES)) {
    lines.push(`Table ${name}:`);
    for (const [col, def] of Object.entries(getTableColumns(table))) {
      const flags = [
        def.primary ? 'PRIMARY KEY' : '',
        def.notNull ? 'NOT NULL' : 'nullable',
        def.hasDefault ? 'has default' : '',
      ].filter(Boolean).join(', ');
      lines.push(`- ${col} (${def.dataType})${flags ? ` [${flags}]` : ''}`);
    }
  }
  return `Database schema (insert-only):\n${lines.join('\n')}`;
}
```

- [ ] **Step 4: Export from `packages/database/src/index.ts`** — add `export * from './describe';`.

- [ ] **Step 5: Run it, verify PASS** — 2 tests pass.

- [ ] **Step 6: Commit** — `git add packages/database && git commit -m "feat(database): describeSchema + WRITABLE_TABLES"`

---

## Task 2: `insertRow` + `db_insert` tool (server, TDD)

**Files:** Modify `packages/server/src/agent/tools/db.ts`; Create `packages/server/tests/db-insert.test.ts`

- [ ] **Step 1: Write the failing test** `packages/server/tests/db-insert.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from '@auto-email/database/test';
import { replies } from '@auto-email/database';
import { insertRow } from '../src/agent/tools/db';

describe('insertRow', () => {
  it('inserts a partner row into replies with an auto id', async () => {
    const db = await createTestDb();
    const out = await insertRow(db, 'replies', {
      template: 'partner', emailName: '787598579', metadata: '{"status":"applied"}',
    });
    expect(out.inserted).toBe(1);
    expect(out.id).toMatch(/[0-9a-f-]{36}/);
    const rows = await db.select().from(replies);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.emailName).toBe('787598579');
    expect(rows[0]!.template).toBe('partner');
  });
  it('rejects a non-whitelisted table', async () => {
    const db = await createTestDb();
    await expect(insertRow(db, 'secrets', { a: '1' })).rejects.toThrow();
  });
  it('rejects an unknown column', async () => {
    const db = await createTestDb();
    await expect(insertRow(db, 'replies', { template: 't', bogus: 'x' })).rejects.toThrow(/column/i);
  });
  it('rejects a missing NOT NULL column (template)', async () => {
    const db = await createTestDb();
    await expect(insertRow(db, 'replies', { emailName: 'x' })).rejects.toThrow(/template/);
  });
});
```

- [ ] **Step 2: Run it, verify FAIL** — `bun run test packages/server/tests/db-insert.test.ts` → FAIL (no `insertRow`).

- [ ] **Step 3: Add `insertRow` + the `db_insert` tool to `packages/server/src/agent/tools/db.ts`.** Current file exports `dbTools(db)` with `db_query_stats`. Add the import, the helper, and the new tool:

```ts
import { tool } from 'ai';
import { z } from 'zod';
import { getTableColumns } from 'drizzle-orm';
import { WRITABLE_TABLES, type Db } from '@auto-email/database';
import { queryStats } from '../../services/stats';

export async function insertRow(
  db: Db,
  table: string,
  values: Record<string, string | number | null>,
): Promise<{ inserted: number; id: string }> {
  const t = WRITABLE_TABLES[table];
  if (!t) throw new Error(`Table not allowed for insert: ${table}`);
  const cols = getTableColumns(t);
  const row: Record<string, string | number | null> = {};
  for (const [key, val] of Object.entries(values)) {
    if (!(key in cols)) throw new Error(`Unknown column: ${table}.${key}`);
    row[key] = val;
  }
  let pkKey = '';
  for (const [key, def] of Object.entries(cols)) {
    if (def.primary) pkKey = key;
    if (key in row) continue;
    if (def.primary && !def.hasDefault) row[key] = crypto.randomUUID();
    else if (def.notNull && !def.hasDefault) throw new Error(`Missing required column: ${table}.${key}`);
  }
  await db.insert(t).values(row);
  const id = pkKey && typeof row[pkKey] === 'string' ? (row[pkKey] as string) : '';
  return { inserted: 1, id };
}

export function dbTools(db: Db) {
  return {
    db_query_stats: tool({
      description:
        'Aggregate reply statistics. Omit dimension for the 3 preset panels; pass a metadata key to group by it.',
      inputSchema: z.object({ dimension: z.string().optional() }),
      execute: async ({ dimension }) => queryStats(db, dimension),
    }),
    db_insert: tool({
      description:
        'Insert ONE row into an allowed database table (INSERT only — cannot update or delete). Use the provided schema to choose the table and column names (TS property names).',
      inputSchema: z.object({
        table: z.string(),
        values: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
      }),
      execute: async ({ table, values }) => insertRow(db, table, values),
    }),
  };
}
```

(If `db.insert(t).values(row)` fails tsc because `t: SQLiteTable` has a loose insert type, cast the argument to the table's insert shape WITHOUT `any` — e.g. `.values(row as typeof t.$inferInsert)`; verify tsc.)

- [ ] **Step 4: Run it, verify PASS** — 4 tests pass. `db_insert` is auto-registered because `buildToolRegistry` already spreads `dbTools(db)` (verify in `agent/tools/index.ts`; no change expected).

- [ ] **Step 5: Typecheck + commit** — `bunx tsc -p packages/server/tsconfig.json --noEmit` (exit 0); `git add packages/server && git commit -m "feat(server): db_insert tool (insert-only)"`

---

## Task 3: Inject `describeSchema()` into the prompt

**Files:** Modify `packages/server/src/services/ai.ts`

- [ ] **Step 1: Import** — add `describeSchema` to the `@auto-email/database`… no: import from shared? It's in `@auto-email/database`. Add `import { describeSchema } from '@auto-email/database';` near the other imports.

- [ ] **Step 2: Add a `systemFor` helper** (module scope in `ai.ts`):

```ts
function systemFor(skill: SkillManifest): string {
  return skill.allowedTools.includes('db_insert')
    ? `${skill.body}\n\n${describeSchema()}`
    : skill.body;
}
```
(`SkillManifest` is already imported for the AiPort types; if not, add it to the `@auto-email/shared` type import.)

- [ ] **Step 3: Use `systemFor(skill)`** everywhere the runtime currently passes `system: skill.body`:
  - in `runSkill`'s `generateText({ ... system: skill.body ... })` → `system: systemFor(skill)`;
  - in `streamSkill`'s `streamText({ ... system: skill.body ... })` → `system: systemFor(skill)`;
  - in both `generateJson(model, schema, { system: skill.body, ... })` calls (reply + stats branches) → `system: systemFor(skill)`.

- [ ] **Step 4: Typecheck + tests + commit** — `bunx tsc -p packages/server/tsconfig.json --noEmit` (exit 0); `bun run test` (all pass); `git add packages/server && git commit -m "feat(server): inject db schema into prompt for db_insert skills"`

---

## Task 4: `record` skill (bundled + seeded)

**Files:** Create `packages/server/src/assets/skills/record/SKILL.md`; sync `~/.bao-auto-mail/skills/record/`

- [ ] **Step 1: Create `packages/server/src/assets/skills/record/SKILL.md`**:

```markdown
---
name: record
description: Use when the user asks to record or save data into the database (e.g. a list of User IDs / partners). NOT for replying to emails or viewing stats.
allowed_tools: [db_insert]
output: text
---
You save data into the database. INSERT only — you cannot update or delete. The database schema is provided below the instructions.

For each item the user gives you, call db_insert with the correct table and column names (use the TS property names from the schema).

Recording a partner who has applied but not yet been notified: insert into the `replies` table with template="partner", emailName=<the User ID>, and metadata='{"status":"applied"}'. Insert each ID as its own row, exactly as given (do not skip or "fix" unusual-looking IDs).

When finished, reply in one short line stating how many rows you inserted.
```

- [ ] **Step 2: Seed the copy** — `mkdir -p ~/.bao-auto-mail/skills/record && cp packages/server/src/assets/skills/record/SKILL.md ~/.bao-auto-mail/skills/record/SKILL.md` (seeding only fills a missing skills dir; the dir already exists, so copy explicitly).

- [ ] **Step 3: Commit** — `git add packages/server/src/assets/skills/record/SKILL.md && git commit -m "feat(server): record skill (db_insert)"`

---

## Task 5: Verify + record the 7 partner IDs (dogfood)

- [ ] **Step 1: Final gate** — `bun run test` (prior 52 + 2 describe + 4 db-insert = 58) and `bunx tsc -p packages/{shared,database,server,cli}/tsconfig.json --noEmit` (all exit 0).
- [ ] **Step 2 (user, needs real `.env` + TTY/server):** In `auto-email` (or `curl` the running server) send:
  `记录这些 partner 到数据库：787598579, 261872805, 893014664, 6ece.0358, 258141459, 679652778, uisehsj72`
  → routes to `record` → 7 × `db_insert` into `replies` (template='partner', emailName=ID, metadata='{"status":"applied"}'), all IDs exactly as given.
- [ ] **Step 3: Confirm** — 7 new `replies` rows with `template='partner'` (e.g. `GET /api/stats?dimension=template` shows partner=7, or query the DB). The reply agent's normal flow is unaffected.

---

## Self-Review Notes (author checklist — applied)

- **Spec coverage:** `describeSchema`+`WRITABLE_TABLES` (Task 1); insert-only `db_insert`/`insertRow` with table+column whitelist, auto id, required-NOT-NULL check, parameterized (Task 2); schema injected into system for db_insert skills (Task 3); `record` skill + seed (Task 4); dogfood the 7 IDs (Task 5). No update/delete tool anywhere.
- **Placeholder scan:** none — full code per step; the `.values(row as typeof t.$inferInsert)` note is a concrete tsc-fallback (no `any`), not deferred work.
- **Type consistency:** `insertRow(db: Db, table: string, values: Record<string,string|number|null>): {inserted, id}` matches the test calls + the `db_insert` `execute`. Column keys are TS property names (`emailName`, `template`, `createdAt`) consistently across `describeSchema`, the tool, the `record` SKILL.md, and the test. `WRITABLE_TABLES` / `describeSchema` imported from `@auto-email/database`.
