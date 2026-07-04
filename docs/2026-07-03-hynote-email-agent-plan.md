# HyNote Email Reply Agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Bun monorepo CLI that runs a persistent REPL where operators reply to HyNote Affiliate emails and view stats, driven by an extensible SKILL.md/tool agent runtime on a local Hono server backed by Cloudflare D1.

**Architecture:** `shared` (types/Zod) → `database` (Drizzle schema + D1 sqlite-proxy client + libsql test db) → `server` (Hono; agent runtime = AI SDK `generateText` + tools + `stopWhen`; skill loader; DI-injected `AiPort` so routes are e2e-testable with AI faked) → `cli` (@opentui/react REPL, slash commands, output renderers). Secrets in `.env`; templates/skills/config seeded into `~/.bao-auto-mail/` on first run.

**Tech Stack:** Bun, TypeScript, Hono, `ai` v6 + `@ai-sdk/openai-compatible`, Drizzle ORM + `drizzle-kit` (`d1-http`), `drizzle-orm/sqlite-proxy` (runtime) / `@libsql/client` (tests), Zod v4, `@opentui/react`, Vitest, `yaml`, `clipboardy`.

**Design doc:** `docs/2026-07-03-hynote-email-agent-design.md`

**Tooling note (tool names):** OpenAI-compatible function names must match `^[a-zA-Z0-9_-]+$`, so tool identifiers use underscores (`template_list`, `template_get`, `template_fill`, `db_query_stats`). SKILL.md `allowed_tools` uses these same underscore names.

**Test layout convention:** Every package keeps its Vitest test files in a flat `tests/` folder at the package root (e.g. `packages/server/tests/template.test.ts`), NOT colocated next to sources. Test files import the code under test with a `../src/...` relative path. The root `vitest.config.ts` glob `packages/**/*.test.ts` already discovers them.

**Run all commands from the repo root** `/Users/bao/data/code/hynote-email-agent` unless stated otherwise.

---

## Phase 0 — Monorepo scaffold

### Task 0.1: Root workspace files

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `mprocs.yaml`, `.gitignore`, `.env.example`, `vitest.config.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "hynote-email-agent",
  "version": "0.0.1",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "mprocs",
    "dev:server": "bun run --hot packages/server/src/index.ts",
    "dev:cli": "bun run packages/cli/src/index.tsx",
    "test": "vitest run",
    "db:generate": "bun run --cwd packages/database db:generate",
    "db:push": "bun run --cwd packages/database db:push"
  },
  "devDependencies": {
    "@types/react": "^19.2.15",
    "bun-types": "^1.3.14",
    "mprocs": "^0.9.3",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Create `tsconfig.base.json`** (copied from baocode conventions)

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "jsxImportSource": "@opentui/react",
    "allowJs": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  }
}
```

- [ ] **Step 3: Create `mprocs.yaml`**

```yaml
procs:
  server:
    cmd: ["bun", "run", "dev:server"]
  cli:
    cmd: ["bun", "run", "dev:cli"]
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules
dist
.env
*.local
.DS_Store
```

- [ ] **Step 5: Create `.env.example`**

```
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_DATABASE_ID=
CLOUDFLARE_D1_TOKEN=
DEEPSEEK_API_KEY=
OPENAI_API_KEY=
HYNOTE_PORT=3000
```

- [ ] **Step 6: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts'],
  },
});
```

- [ ] **Step 7: Initialize git and commit**

```bash
cd /Users/bao/data/code/hynote-email-agent
git init
git add -A
git commit -m "chore: monorepo scaffold"
```

---

## Phase 1 — `shared` package (types + Zod schemas)

### Task 1.1: shared package skeleton

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@hynote/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "zod": "^4.4.3" }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 3: Install deps**

Run: `bun install`
Expected: lockfile written, no errors.

### Task 1.2: Types and schemas (TDD)

**Files:**
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/schemas.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/tests/schemas.test.ts`

- [ ] **Step 1: Write `packages/shared/src/types.ts`**

```ts
export type SkillOutput = 'reply' | 'stats' | 'text';

export interface SkillManifest {
  name: string;
  description: string;
  allowedTools: string[];
  output: SkillOutput;
  body: string;
}

export interface SkillSummary {
  name: string;
  description: string;
  output: SkillOutput;
}

export interface RunRequest {
  input: string;
  skill?: string;
}

export interface StatsPanel {
  title: string;
  rows: { label: string; count: number }[];
}

export type RunResponse =
  | {
      type: 'reply';
      skill: string;
      template: string;
      reply: string;
      metadata: Record<string, string>;
      email_name?: string;
      email_from?: string;
    }
  | { type: 'stats'; skill: string; panels: StatsPanel[] }
  | { type: 'text'; skill: string; text: string };

export interface ReplyRecord {
  template: string;
  email_from?: string;
  email_name?: string;
  email_content?: string;
  reply_content: string;
  metadata: Record<string, string>;
  confirmed: boolean;
}

export interface ProviderConfig {
  base_url: string;
  model: string;
}

export interface AppConfig {
  providers: { default: string } & Record<string, ProviderConfig>;
}
```

- [ ] **Step 2: Write the failing test `packages/shared/tests/schemas.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { RunRequestSchema, ReplyRecordSchema } from '../src/schemas';

describe('RunRequestSchema', () => {
  it('accepts input with optional skill', () => {
    expect(RunRequestSchema.parse({ input: 'hi' })).toEqual({ input: 'hi' });
    expect(RunRequestSchema.parse({ input: 'hi', skill: 'reply' }).skill).toBe('reply');
  });
  it('rejects empty input', () => {
    expect(() => RunRequestSchema.parse({ input: '' })).toThrow();
  });
});

describe('ReplyRecordSchema', () => {
  it('defaults metadata and confirmed', () => {
    const r = ReplyRecordSchema.parse({ template: 't', reply_content: 'x' });
    expect(r.metadata).toEqual({});
    expect(r.confirmed).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test packages/shared`
Expected: FAIL — cannot find module `./schemas`.

- [ ] **Step 4: Write `packages/shared/src/schemas.ts`**

```ts
import { z } from 'zod';

export const RunRequestSchema = z.object({
  input: z.string().min(1),
  skill: z.string().optional(),
});

export const ReplyRecordSchema = z.object({
  template: z.string().min(1),
  email_from: z.string().optional(),
  email_name: z.string().optional(),
  email_content: z.string().optional(),
  reply_content: z.string().min(1),
  metadata: z.record(z.string(), z.string()).default({}),
  confirmed: z.boolean().default(false),
});

export const ProviderConfigSchema = z.object({
  base_url: z.string().url(),
  model: z.string().min(1),
});

export const AppConfigSchema = z.object({
  providers: z
    .object({ default: z.string().min(1) })
    .catchall(ProviderConfigSchema),
});
```

- [ ] **Step 5: Write `packages/shared/src/index.ts`**

```ts
export * from './types';
export * from './schemas';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bun run test packages/shared`
Expected: PASS (both suites).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(shared): types and zod schemas"
```

---

## Phase 2 — `database` package

### Task 2.1: database skeleton + schema

**Files:**
- Create: `packages/database/package.json`, `packages/database/tsconfig.json`
- Create: `packages/database/src/schema.ts`
- Create: `packages/database/src/index.ts`

- [ ] **Step 1: Create `packages/database/package.json`**

```json
{
  "name": "@hynote/database",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push"
  },
  "dependencies": {
    "drizzle-orm": "^0.45.2",
    "@libsql/client": "^0.14.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30.5",
    "dotenv": "^17.4.2"
  }
}
```

- [ ] **Step 2: Create `packages/database/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "drizzle.config.ts"] }
```

- [ ] **Step 3: Write `packages/database/src/schema.ts`**

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

export const replies = sqliteTable('replies', {
  id: text('id').primaryKey(),
  template: text('template').notNull(),
  emailFrom: text('email_from'),
  emailName: text('email_name'),
  emailContent: text('email_content'),
  replyContent: text('reply_content'),
  metadata: text('metadata').default('{}'),
  confirmed: integer('confirmed').default(0),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const schema = { replies };

export type Db = BaseSQLiteDatabase<'async', unknown, typeof schema>;

export const CREATE_REPLIES_SQL = sql`
  CREATE TABLE IF NOT EXISTS replies (
    id            TEXT PRIMARY KEY,
    template      TEXT NOT NULL,
    email_from    TEXT,
    email_name    TEXT,
    email_content TEXT,
    reply_content TEXT,
    metadata      TEXT DEFAULT '{}',
    confirmed     INTEGER DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;
```

- [ ] **Step 4: Install deps**

Run: `bun install`
Expected: success.

### Task 2.2: D1 sqlite-proxy client + libsql test db

**Files:**
- Create: `packages/database/src/client.ts`
- Create: `packages/database/src/test-db.ts`
- Create: `packages/database/src/index.ts`
- Test: `packages/database/tests/test-db.test.ts`

- [ ] **Step 1: Write the failing test `packages/database/tests/test-db.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from '../src/test-db';
import { replies } from '../src/schema';

describe('createTestDb', () => {
  it('creates an in-memory db with the replies table', async () => {
    const db = await createTestDb();
    await db.insert(replies).values({ id: '1', template: 't', replyContent: 'hi' });
    const rows = await db.select().from(replies);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.template).toBe('t');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test packages/database`
Expected: FAIL — cannot find `./test-db`.

- [ ] **Step 3: Write `packages/database/src/test-db.ts`**

```ts
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { CREATE_REPLIES_SQL, schema, type Db } from './schema';

export async function createTestDb(): Promise<Db> {
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema }) as unknown as Db;
  await db.run(CREATE_REPLIES_SQL);
  return db;
}
```

- [ ] **Step 4: Write `packages/database/src/client.ts`**

```ts
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { schema, type Db } from './schema';

export interface D1Env {
  accountId: string;
  databaseId: string;
  token: string;
}

export function createD1Client(env: D1Env): Db {
  return drizzle(
    async (sqlText, params, method) => {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.accountId}/d1/database/${env.databaseId}/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sql: sqlText, params }),
        },
      );
      if (!res.ok) throw new Error(`D1 error ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as {
        result: { results: Record<string, unknown>[] }[];
      };
      const rows = data.result[0]!.results.map((r) => Object.values(r));
      return { rows: method === 'get' ? rows[0]! : rows };
    },
    { schema },
  ) as unknown as Db;
}
```

- [ ] **Step 5: Write `packages/database/src/index.ts`**

```ts
export * from './schema';
export * from './client';
export * from './test-db';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bun run test packages/database`
Expected: PASS.

### Task 2.3: drizzle-kit config for D1 migrations

**Files:**
- Create: `packages/database/drizzle.config.ts`

- [ ] **Step 1: Write `packages/database/drizzle.config.ts`**

```ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle',
  schema: './src/schema.ts',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
    token: process.env.CLOUDFLARE_D1_TOKEN!,
  },
});
```

- [ ] **Step 2: Generate the migration**

Run: `bun run db:generate`
Expected: a `packages/database/drizzle/0000_*.sql` file containing `CREATE TABLE replies`.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(database): schema, D1 client, test db, migration"
```

> Note: `bun run db:push` applies to remote D1 and requires real `.env` credentials — run it manually during setup, not in this plan.

---

## Phase 3 — `server` package: config + template + stats services

### Task 3.1: server skeleton + bundled assets

**Files:**
- Create: `packages/server/package.json`, `packages/server/tsconfig.json`
- Create: `packages/server/src/assets/templates/{user-id-trial,technical-support,affiliate-enablement,kol-media-support}.md`
- Create: `packages/server/src/assets/skills/reply/SKILL.md`
- Create: `packages/server/src/assets/skills/stats/SKILL.md`

- [ ] **Step 1: Create `packages/server/package.json`**

```json
{
  "name": "@hynote/server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts", "./app": "./src/app.ts" },
  "scripts": { "dev": "bun run --hot src/index.ts" },
  "dependencies": {
    "@ai-sdk/openai-compatible": "^1.0.0",
    "@hono/zod-validator": "^0.8.0",
    "@hynote/database": "workspace:*",
    "@hynote/shared": "workspace:*",
    "ai": "^6.0.197",
    "dotenv": "^17.4.2",
    "drizzle-orm": "^0.45.2",
    "hono": "^4.12.23",
    "yaml": "^2.6.1",
    "zod": "^4.4.3"
  }
}
```

- [ ] **Step 2: Create `packages/server/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 3: Create the 4 template assets** (variables use `{{firstName}}`)

`packages/server/src/assets/templates/user-id-trial.md`:

```markdown
Hi {{firstName}},

Thanks for your message!

To help you get started, please send me your **HyNote User ID**, and I'll apply for your free trial access.

You can find it here:

- Mobile app: Settings → My Account → Copy User ID
- Web app: Account → Copy User ID

Once I receive it, I'll activate your trial right away.

Best regards,
Joanna
```

`packages/server/src/assets/templates/technical-support.md`:

```markdown
Hi {{firstName}},

Sorry about the issue, and thank you for letting me know.

Could you please try again and share a bit more detail if it still happens?

For example:
- Are you using web or mobile?
- iOS or Android?
- What exactly happens when the issue occurs?

I'll forward this to our technical team for further investigation.

Sorry again for the inconvenience, and thanks for your patience!

Best regards,
Joanna
```

`packages/server/src/assets/templates/affiliate-enablement.md`:

```markdown
Hi {{firstName}},

Thanks for your message!

The HyNote Affiliate Program is managed through Impact, which handles tracking and performance reporting.

📦 Marketing materials & brand assets:
https://help.impact.com/partner/what-would-you-like-to-learn-about/platform-features/marketing-content/resources/view-brand-resources

🔗 How to create affiliate tracking links:
https://help.impact.com/partner/what-would-you-like-to-learn-about/platform-features/tracking/tracking-links/create-and-manage-links/create-tracking-links

You can generate your own tracking links directly from your Impact dashboard — no custom links are needed.

If you have any questions, feel free to ask anytime!

Best regards,
Joanna
```

`packages/server/src/assets/templates/kol-media-support.md`:

```markdown
Hi {{firstName}},

Thank you so much for your message — really appreciate your interest in HyNote!

Great to hear you're planning content around it.

📦 Marketing materials & brand assets:
https://help.impact.com/partner/what-would-you-like-to-learn-about/platform-features/marketing-content/resources/view-brand-resources

🔗 Tracking link setup guide:
https://help.impact.com/partner/what-would-you-like-to-learn-about/platform-features/tracking/tracking-links/create-and-manage-links/create-tracking-links

You can create your own affiliate tracking links directly in Impact.

Looking forward to your content!

Best regards,
Joanna
```

- [ ] **Step 4: Create `packages/server/src/assets/skills/reply/SKILL.md`**

```markdown
---
name: reply
description: Use when the user pastes an incoming email that needs a reply. Classify intent, pick the best template, fill variables, and extract statistics metadata.
allowed_tools: [template_list, template_get, template_fill]
output: reply
---
You are the email reply assistant for the HyNote Affiliate Program.

Steps:
1. Call template_list to see the available templates and their purpose.
2. Choose the single best template for the email's intent.
3. Call template_fill with that template's name and variables (firstName, extracted from the email sender).
4. Extract statistics metadata when present: promotion_date (YYYY-MM), promotion_quarter, platform, user_id_status (pending|submitted|activated), user_id_value.
5. Return the chosen template name, the filled reply text, the metadata object, and the sender's name/email.
```

- [ ] **Step 5: Create `packages/server/src/assets/skills/stats/SKILL.md`**

```markdown
---
name: stats
description: Use when the user asks to see reply statistics or metrics, optionally filtered to one dimension.
allowed_tools: [db_query_stats]
output: stats
---
You show reply statistics for the HyNote Affiliate Program.

If the user names a specific dimension (e.g. platform, promotion_date, user_id_status), call db_query_stats with that dimension. Otherwise call db_query_stats with no dimension to get the three preset panels. Return the resulting panels unchanged.
```

- [ ] **Step 6: Install deps and commit**

```bash
bun install
git add -A && git commit -m "feat(server): skeleton + bundled templates and skills"
```

### Task 3.2: template service (TDD)

**Files:**
- Create: `packages/server/src/services/template.ts`
- Test: `packages/server/tests/template.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listTemplates, getTemplate, fillTemplate } from '../src/services/template';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tmpl-'));
  await writeFile(join(dir, 'kol-media-support.md'), 'Hi {{firstName}}, welcome!');
  await writeFile(join(dir, 'user-id-trial.md'), 'Hi {{firstName}}, send your ID.');
});

describe('template service', () => {
  it('lists template names', async () => {
    const names = (await listTemplates(dir)).map((t) => t.name).sort();
    expect(names).toEqual(['kol-media-support', 'user-id-trial']);
  });
  it('gets raw template', async () => {
    expect(await getTemplate(dir, 'kol-media-support')).toContain('{{firstName}}');
  });
  it('fills variables and leaves unknown placeholders intact', () => {
    expect(fillTemplate('Hi {{firstName}} {{x}}', { firstName: 'Alex' })).toBe('Hi Alex {{x}}');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test packages/server/tests/template.test.ts`
Expected: FAIL — cannot find `./template`.

- [ ] **Step 3: Write `packages/server/src/services/template.ts`**

```ts
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface TemplateInfo {
  name: string;
  preview: string;
}

export async function listTemplates(dir: string): Promise<TemplateInfo[]> {
  const files = await readdir(dir);
  const infos: TemplateInfo[] = [];
  for (const f of files) {
    if (!f.endsWith('.md')) continue;
    const raw = await readFile(join(dir, f), 'utf8');
    infos.push({ name: f.replace(/\.md$/, ''), preview: raw.slice(0, 120) });
  }
  return infos;
}

export async function getTemplate(dir: string, name: string): Promise<string> {
  return readFile(join(dir, `${name}.md`), 'utf8');
}

export function fillTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    key in vars ? vars[key]! : `{{${key}}}`,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test packages/server/tests/template.test.ts`
Expected: PASS.

### Task 3.3: stats service (TDD)

**Files:**
- Create: `packages/server/src/services/stats.ts`
- Test: `packages/server/tests/stats.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb, replies } from '@hynote/database';
import { queryStats } from '../src/services/stats';

async function seed() {
  const db = await createTestDb();
  await db.insert(replies).values([
    { id: '1', template: 'kol-media-support', replyContent: 'a', metadata: JSON.stringify({ platform: 'YouTube', user_id_status: 'pending' }) },
    { id: '2', template: 'kol-media-support', replyContent: 'b', metadata: JSON.stringify({ platform: 'TikTok', user_id_status: 'pending' }) },
    { id: '3', template: 'user-id-trial', replyContent: 'c', metadata: JSON.stringify({ user_id_status: 'submitted' }) },
  ]);
  return db;
}

describe('queryStats', () => {
  it('returns 3 preset panels when no dimension', async () => {
    const panels = await queryStats(await seed());
    expect(panels.map((p) => p.title)).toEqual(['template', 'promotion_date', 'user_id_status']);
    const tmpl = panels[0]!.rows.find((r) => r.label === 'kol-media-support');
    expect(tmpl!.count).toBe(2);
  });
  it('groups by an arbitrary whitelisted metadata dimension', async () => {
    const panels = await queryStats(await seed(), 'platform');
    expect(panels).toHaveLength(1);
    expect(panels[0]!.rows.map((r) => r.label).sort()).toEqual(['TikTok', 'YouTube']);
  });
  it('rejects a non-whitelisted dimension', async () => {
    await expect(queryStats(await seed(), 'evil; DROP TABLE')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test packages/server/tests/stats.test.ts`
Expected: FAIL — cannot find `./stats`.

- [ ] **Step 3: Write `packages/server/src/services/stats.ts`**

```ts
import { sql } from 'drizzle-orm';
import type { Db } from '@hynote/database';
import type { StatsPanel } from '@hynote/shared';

const DIMENSION_WHITELIST = [
  'template',
  'promotion_date',
  'promotion_quarter',
  'platform',
  'user_id_status',
];

async function groupBy(db: Db, dimension: string): Promise<StatsPanel> {
  const expr =
    dimension === 'template'
      ? sql`template`
      : sql`json_extract(metadata, ${'$.' + dimension})`;
  const rows = await db.all<{ value: string | null; count: number }>(sql`
    SELECT ${expr} AS value, COUNT(*) AS count
    FROM replies
    WHERE ${expr} IS NOT NULL
    GROUP BY 1
    ORDER BY count DESC
  `);
  return {
    title: dimension,
    rows: rows.map((r) => ({ label: r.value ?? '未明确', count: Number(r.count) })),
  };
}

export async function queryStats(db: Db, dimension?: string): Promise<StatsPanel[]> {
  if (dimension) {
    if (!DIMENSION_WHITELIST.includes(dimension)) {
      throw new Error(`Unknown stats dimension: ${dimension}`);
    }
    return [await groupBy(db, dimension)];
  }
  return [
    await groupBy(db, 'template'),
    await groupBy(db, 'promotion_date'),
    await groupBy(db, 'user_id_status'),
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test packages/server/tests/stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(server): template and stats services"
```

---

## Phase 4 — agent tools registry (TDD)

### Task 4.1: tools

**Files:**
- Create: `packages/server/src/agent/tools/template.ts`
- Create: `packages/server/src/agent/tools/db.ts`
- Create: `packages/server/src/agent/tools/index.ts`
- Test: `packages/server/tests/tools.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDb, replies, type Db } from '@hynote/database';
import { buildToolRegistry, pickTools } from '../src/agent/tools/index';

let dir: string;
let db: Db;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tools-'));
  await writeFile(join(dir, 'kol-media-support.md'), 'Hi {{firstName}}!');
  db = await createTestDb();
  await db.insert(replies).values({ id: '1', template: 'kol-media-support', replyContent: 'x', metadata: '{"platform":"YouTube"}' });
});

describe('tool registry', () => {
  it('template_fill fills a template', async () => {
    const reg = buildToolRegistry({ templatesDir: dir, db });
    const out = await reg.template_fill!.execute!({ name: 'kol-media-support', vars: { firstName: 'Alex' } }, {} as any);
    expect(out).toBe('Hi Alex!');
  });
  it('db_query_stats returns panels', async () => {
    const reg = buildToolRegistry({ templatesDir: dir, db });
    const out = await reg.db_query_stats!.execute!({ dimension: 'platform' }, {} as any);
    expect((out as any)[0].rows[0].label).toBe('YouTube');
  });
  it('pickTools returns only allowed tools', () => {
    const reg = buildToolRegistry({ templatesDir: dir, db });
    expect(Object.keys(pickTools(reg, ['template_list']))).toEqual(['template_list']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test packages/server/tests/tools.test.ts`
Expected: FAIL — cannot find `./index`.

- [ ] **Step 3: Write `packages/server/src/agent/tools/template.ts`**

```ts
import { tool } from 'ai';
import { z } from 'zod';
import { listTemplates, getTemplate, fillTemplate } from '../../services/template';

export function templateTools(dir: string) {
  return {
    template_list: tool({
      description: 'List available reply templates with a short preview.',
      inputSchema: z.object({}),
      execute: async () => listTemplates(dir),
    }),
    template_get: tool({
      description: 'Get the raw content of a template by name.',
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => getTemplate(dir, name),
    }),
    template_fill: tool({
      description: 'Fill a template with variables (e.g. firstName).',
      inputSchema: z.object({
        name: z.string(),
        vars: z.record(z.string(), z.string()),
      }),
      execute: async ({ name, vars }) => fillTemplate(await getTemplate(dir, name), vars),
    }),
  };
}
```

- [ ] **Step 4: Write `packages/server/src/agent/tools/db.ts`**

```ts
import { tool } from 'ai';
import { z } from 'zod';
import type { Db } from '@hynote/database';
import { queryStats } from '../../services/stats';

export function dbTools(db: Db) {
  return {
    db_query_stats: tool({
      description:
        'Aggregate reply statistics. Omit dimension for the 3 preset panels; pass a metadata key to group by it.',
      inputSchema: z.object({ dimension: z.string().optional() }),
      execute: async ({ dimension }) => queryStats(db, dimension),
    }),
  };
}
```

- [ ] **Step 5: Write `packages/server/src/agent/tools/index.ts`**

```ts
import type { ToolSet } from 'ai';
import type { Db } from '@hynote/database';
import { templateTools } from './template';
import { dbTools } from './db';

export function buildToolRegistry(deps: { templatesDir: string; db: Db }): ToolSet {
  return { ...templateTools(deps.templatesDir), ...dbTools(deps.db) } as ToolSet;
}

export function pickTools(registry: ToolSet, allowed: string[]): ToolSet {
  const picked: ToolSet = {};
  for (const name of allowed) {
    if (registry[name]) picked[name] = registry[name]!;
  }
  return picked;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bun run test packages/server/tests/tools.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(server): agent tool registry"
```

---

## Phase 5 — skill loader (TDD)

### Task 5.1: SKILL.md parse + load

**Files:**
- Create: `packages/server/src/agent/skill.ts`
- Test: `packages/server/tests/skill.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSkill, loadSkills } from '../src/agent/skill';

describe('parseSkill', () => {
  it('parses frontmatter and body', () => {
    const s = parseSkill(
      '---\nname: reply\ndescription: reply to email\nallowed_tools: [template_list]\noutput: reply\n---\nDo the thing.',
    );
    expect(s).toEqual({
      name: 'reply',
      description: 'reply to email',
      allowedTools: ['template_list'],
      output: 'reply',
      body: 'Do the thing.',
    });
  });
  it('defaults output to text and tools to empty', () => {
    const s = parseSkill('---\nname: x\ndescription: y\n---\nbody');
    expect(s.output).toBe('text');
    expect(s.allowedTools).toEqual([]);
  });
  it('throws without frontmatter', () => {
    expect(() => parseSkill('no frontmatter')).toThrow();
  });
});

describe('loadSkills', () => {
  it('loads skills from subdirectories, skipping dirs without SKILL.md', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skills-'));
    await mkdir(join(dir, 'reply'));
    await writeFile(join(dir, 'reply', 'SKILL.md'), '---\nname: reply\ndescription: d\noutput: reply\n---\nb');
    await mkdir(join(dir, 'empty'));
    const skills = await loadSkills(dir);
    expect(skills.map((s) => s.name)).toEqual(['reply']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test packages/server/tests/skill.test.ts`
Expected: FAIL — cannot find `./skill`.

- [ ] **Step 3: Write `packages/server/src/agent/skill.ts`**

```ts
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { SkillManifest, SkillOutput } from '@hynote/shared';

export function parseSkill(raw: string): SkillManifest {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error('SKILL.md is missing frontmatter');
  const fm = (parseYaml(m[1]!) ?? {}) as {
    name?: string;
    description?: string;
    allowed_tools?: string[];
    output?: SkillOutput;
  };
  if (!fm.name || !fm.description) {
    throw new Error('SKILL.md frontmatter must include name and description');
  }
  return {
    name: fm.name,
    description: fm.description,
    allowedTools: fm.allowed_tools ?? [],
    output: fm.output ?? 'text',
    body: m[2]!.trim(),
  };
}

export async function loadSkills(dir: string): Promise<SkillManifest[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const skills: SkillManifest[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      const raw = await readFile(join(dir, e.name, 'SKILL.md'), 'utf8');
      skills.push(parseSkill(raw));
    } catch {
      // directory without a SKILL.md — skip
    }
  }
  return skills;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test packages/server/tests/skill.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(server): SKILL.md loader"
```

---

## Phase 6 — AI port (production impl; faked in route tests)

### Task 6.1: AiPort interface + OpenAI-compatible implementation

**Files:**
- Create: `packages/server/src/agent/ai-port.ts`
- Create: `packages/server/src/services/ai.ts`

> This module wraps the AI SDK. Per the testing strategy the LLM calls are NOT unit-tested; route tests inject a fake `AiPort`. No test file for this task.

- [ ] **Step 1: Write `packages/server/src/agent/ai-port.ts`**

```ts
import type { ToolSet } from 'ai';
import type { SkillManifest, RunResponse } from '@hynote/shared';

export interface AiPort {
  routeSkill(input: string, skills: SkillManifest[]): Promise<string>;
  runSkill(skill: SkillManifest, input: string, tools: ToolSet): Promise<RunResponse>;
}
```

- [ ] **Step 2: Write `packages/server/src/services/ai.ts`**

```ts
import { generateText, generateObject, stepCountIs, type ToolSet } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { z } from 'zod';
import type { AppConfig, SkillManifest, RunResponse } from '@hynote/shared';
import type { AiPort } from '../agent/ai-port';

function resolveModel(config: AppConfig) {
  const name = config.providers.default;
  const p = config.providers[name];
  if (!p || typeof p === 'string') throw new Error(`Missing provider config: ${name}`);
  const apiKey = process.env[`${name.toUpperCase()}_API_KEY`];
  if (!apiKey) throw new Error(`Missing ${name.toUpperCase()}_API_KEY in environment`);
  const provider = createOpenAICompatible({ name, baseURL: p.base_url, apiKey });
  return provider(p.model);
}

const replyOutputSchema = z.object({
  template: z.string(),
  reply: z.string(),
  metadata: z.record(z.string(), z.string()),
  email_name: z.string().optional(),
  email_from: z.string().optional(),
});

const statsOutputSchema = z.object({
  panels: z.array(
    z.object({
      title: z.string(),
      rows: z.array(z.object({ label: z.string(), count: z.number() })),
    }),
  ),
});

export function createAiService(config: AppConfig): AiPort {
  const model = resolveModel(config);
  return {
    async routeSkill(input, skills) {
      const names = skills.map((s) => s.name) as [string, ...string[]];
      const { object } = await generateObject({
        model,
        schema: z.object({ skill: z.enum(names) }),
        prompt:
          `Available skills:\n` +
          skills.map((s) => `- ${s.name}: ${s.description}`).join('\n') +
          `\n\nUser input:\n${input}\n\nChoose the single best skill.`,
      });
      return object.skill;
    },
    async runSkill(skill, input, tools) {
      const gen = await generateText({
        model,
        system: skill.body,
        prompt: input,
        tools,
        stopWhen: stepCountIs(6),
      });
      if (skill.output === 'text') {
        return { type: 'text', skill: skill.name, text: gen.text };
      }
      const schema = skill.output === 'reply' ? replyOutputSchema : statsOutputSchema;
      const { object } = await generateObject({
        model,
        schema,
        messages: [
          ...gen.response.messages,
          { role: 'user', content: 'Produce the final structured result as JSON.' },
        ],
      });
      return { type: skill.output, skill: skill.name, ...object } as RunResponse;
    },
  };
}
```

- [ ] **Step 3: Typecheck compiles**

Run: `bunx tsc -p packages/server/tsconfig.json --noEmit`
Expected: no errors (warnings about unused OK). If `createOpenAICompatible` types differ by version, adjust import per installed `@ai-sdk/openai-compatible`.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(server): AiPort + OpenAI-compatible ai service"
```

---

## Phase 7 — Hono app + routes (end-to-end tests, AI faked)

### Task 7.1: createApp with DI

**Files:**
- Create: `packages/server/src/app.ts`
- Test: `packages/server/tests/app.test.ts`

- [ ] **Step 1: Write the failing test** (end-to-end via `app.request`, fake `AiPort`, real libsql db + real skill/template dirs from bundled assets)

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createTestDb, replies, type Db } from '@hynote/database';
import type { AiPort } from '../src/agent/ai-port';
import type { RunResponse, SkillManifest } from '@hynote/shared';
import { createApp } from '../src/app';

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets');
const templatesDir = join(assets, 'templates');
const skillsDir = join(assets, 'skills');

function fakeAi(overrides: Partial<AiPort> = {}): AiPort {
  return {
    async routeSkill(_input: string, skills: SkillManifest[]) {
      return skills[0]!.name;
    },
    async runSkill(skill): Promise<RunResponse> {
      if (skill.output === 'reply') {
        return { type: 'reply', skill: skill.name, template: 'kol-media-support', reply: 'Hi Alex!', metadata: { platform: 'YouTube' }, email_name: 'Alex' };
      }
      return { type: 'text', skill: skill.name, text: 'ok' };
    },
    ...overrides,
  };
}

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

describe('GET /api/skills', () => {
  it('lists bundled skills', async () => {
    const app = createApp({ db, templatesDir, skillsDir, ai: fakeAi() });
    const res = await app.request('/api/skills');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string }[];
    expect(body.map((s) => s.name).sort()).toEqual(['reply', 'stats']);
  });
});

describe('POST /api/run', () => {
  it('runs an explicit skill and returns its output', async () => {
    const app = createApp({ db, templatesDir, skillsDir, ai: fakeAi() });
    const res = await app.request('/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'promote on youtube', skill: 'reply' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as RunResponse;
    expect(body).toMatchObject({ type: 'reply', template: 'kol-media-support' });
  });
  it('returns 502 with fallback:manual when AI throws', async () => {
    const app = createApp({
      db, templatesDir, skillsDir,
      ai: fakeAi({ runSkill: async () => { throw new Error('AI down'); } }),
    });
    const res = await app.request('/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'x', skill: 'reply' }),
    });
    expect(res.status).toBe(502);
    expect((await res.json()).fallback).toBe('manual');
  });
});

describe('POST /api/reply then GET /api/stats', () => {
  it('persists a reply and reflects it in stats', async () => {
    const app = createApp({ db, templatesDir, skillsDir, ai: fakeAi() });
    const save = await app.request('/api/reply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ template: 'kol-media-support', reply_content: 'Hi', metadata: { platform: 'YouTube' }, confirmed: true }),
    });
    expect(save.status).toBe(200);
    const stats = await app.request('/api/stats?dimension=platform');
    const body = (await stats.json()) as { panels: { rows: { label: string; count: number }[] }[] };
    expect(body.panels[0]!.rows.find((r) => r.label === 'YouTube')!.count).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test packages/server/tests/app.test.ts`
Expected: FAIL — cannot find `./app`.

- [ ] **Step 3: Write `packages/server/src/app.ts`**

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { RunRequestSchema, ReplyRecordSchema } from '@hynote/shared';
import { replies, type Db } from '@hynote/database';
import type { AiPort } from './agent/ai-port';
import { loadSkills } from './agent/skill';
import { buildToolRegistry, pickTools } from './agent/tools/index';
import { queryStats } from './services/stats';

export interface AppDeps {
  db: Db;
  templatesDir: string;
  skillsDir: string;
  ai: AiPort;
}

export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.get('/api/skills', async (c) => {
    const skills = await loadSkills(deps.skillsDir);
    return c.json(skills.map((s) => ({ name: s.name, description: s.description, output: s.output })));
  });

  app.post('/api/run', zValidator('json', RunRequestSchema), async (c) => {
    const { input, skill: skillName } = c.req.valid('json');
    const skills = await loadSkills(deps.skillsDir);
    try {
      let chosen = skillName ? skills.find((s) => s.name === skillName) : undefined;
      if (!chosen && !skillName) {
        const name = await deps.ai.routeSkill(input, skills);
        chosen = skills.find((s) => s.name === name);
      }
      if (!chosen) return c.json({ error: `Unknown skill: ${skillName ?? '?'}`, fallback: 'manual' }, 400);
      const registry = buildToolRegistry({ templatesDir: deps.templatesDir, db: deps.db });
      const tools = pickTools(registry, chosen.allowedTools);
      const out = await deps.ai.runSkill(chosen, input, tools);
      return c.json(out);
    } catch (e) {
      return c.json({ error: (e as Error).message, fallback: 'manual' }, 502);
    }
  });

  app.post('/api/reply', zValidator('json', ReplyRecordSchema), async (c) => {
    const r = c.req.valid('json');
    const id = crypto.randomUUID();
    await deps.db.insert(replies).values({
      id,
      template: r.template,
      emailFrom: r.email_from,
      emailName: r.email_name,
      emailContent: r.email_content,
      replyContent: r.reply_content,
      metadata: JSON.stringify(r.metadata),
      confirmed: r.confirmed ? 1 : 0,
    });
    return c.json({ id });
  });

  app.get('/api/stats', async (c) => {
    const dimension = c.req.query('dimension');
    try {
      const panels = await queryStats(deps.db, dimension);
      return c.json({ type: 'stats', panels });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  return app;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test packages/server/tests/app.test.ts`
Expected: PASS (all four describe blocks).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(server): Hono app + routes with e2e tests"
```

### Task 7.2: config bootstrap + server entry

**Files:**
- Create: `packages/server/src/config.ts`
- Create: `packages/server/src/index.ts`
- Test: `packages/server/tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureConfigDir, loadConfig } from '../src/config';

describe('ensureConfigDir', () => {
  it('seeds templates, skills, and config.json into an empty dir', async () => {
    const home = await mkdtemp(join(tmpdir(), 'home-'));
    await ensureConfigDir(home);
    const templates = await readdir(join(home, 'templates'));
    expect(templates).toContain('kol-media-support.md');
    const skills = await readdir(join(home, 'skills'));
    expect(skills.sort()).toEqual(['reply', 'stats']);
    const cfg = await loadConfig(home);
    expect(cfg.providers.default).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test packages/server/tests/config.test.ts`
Expected: FAIL — cannot find `./config`.

- [ ] **Step 3: Write `packages/server/src/config.ts`**

```ts
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, cp, readFile, writeFile, access } from 'node:fs/promises';
import { AppConfigSchema, type AppConfig } from '@hynote/shared';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), 'assets');

const DEFAULT_CONFIG: AppConfig = {
  providers: {
    default: 'deepseek',
    deepseek: { base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    openai: { base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  },
};

export function defaultConfigDir(): string {
  return join(homedir(), '.bao-auto-mail');
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function ensureConfigDir(base = defaultConfigDir()): Promise<void> {
  await mkdir(base, { recursive: true });
  const templatesDir = join(base, 'templates');
  const skillsDir = join(base, 'skills');
  if (!(await exists(templatesDir))) {
    await cp(join(ASSETS, 'templates'), templatesDir, { recursive: true });
  }
  if (!(await exists(skillsDir))) {
    await cp(join(ASSETS, 'skills'), skillsDir, { recursive: true });
  }
  const cfgPath = join(base, 'config.json');
  if (!(await exists(cfgPath))) {
    await writeFile(cfgPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
  }
}

export async function loadConfig(base = defaultConfigDir()): Promise<AppConfig> {
  const raw = await readFile(join(base, 'config.json'), 'utf8');
  return AppConfigSchema.parse(JSON.parse(raw));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test packages/server/tests/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `packages/server/src/index.ts`**

```ts
import 'dotenv/config';
import { join } from 'node:path';
import { createD1Client } from '@hynote/database';
import { createApp } from './app';
import { createAiService } from './services/ai';
import { ensureConfigDir, loadConfig, defaultConfigDir } from './config';

const base = defaultConfigDir();
await ensureConfigDir(base);
const config = await loadConfig(base);

const db = createD1Client({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
  token: process.env.CLOUDFLARE_D1_TOKEN!,
});

const app = createApp({
  db,
  templatesDir: join(base, 'templates'),
  skillsDir: join(base, 'skills'),
  ai: createAiService(config),
});

export default {
  port: Number(process.env.HYNOTE_PORT ?? 3000),
  fetch: app.fetch,
};
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(server): config bootstrap + server entry"
```

---

## Phase 8 — `cli` package (REPL)

### Task 8.1: cli skeleton + slash parser (TDD)

**Files:**
- Create: `packages/cli/package.json`, `packages/cli/tsconfig.json`
- Create: `packages/cli/src/slash.ts`
- Test: `packages/cli/tests/slash.test.ts`

- [ ] **Step 1: Create `packages/cli/package.json`**

```json
{
  "name": "@hynote/cli",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "bin": { "hynote": "./src/index.tsx" },
  "dependencies": {
    "@hynote/shared": "workspace:*",
    "@opentui/react": "^0.1.0",
    "clipboardy": "^4.0.0",
    "react": "^19.2.0"
  }
}
```

- [ ] **Step 2: Create `packages/cli/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 3: Write the failing test `packages/cli/tests/slash.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parseInput } from '../src/slash';

describe('parseInput', () => {
  it('parses a slash command with trailing text', () => {
    expect(parseInput('/reply Hi Joanna')).toEqual({ skill: 'reply', text: 'Hi Joanna' });
  });
  it('parses a bare slash command', () => {
    expect(parseInput('/stats')).toEqual({ skill: 'stats', text: '' });
  });
  it('returns text only when no slash', () => {
    expect(parseInput('just some email text')).toEqual({ text: 'just some email text' });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `bun run test packages/cli/tests/slash.test.ts`
Expected: FAIL — cannot find `./slash`.

- [ ] **Step 5: Write `packages/cli/src/slash.ts`**

```ts
export interface ParsedInput {
  skill?: string;
  text: string;
}

export function parseInput(raw: string): ParsedInput {
  const t = raw.trim();
  if (t.startsWith('/')) {
    const [cmd, ...rest] = t.slice(1).split(/\s+/);
    return { skill: cmd, text: rest.join(' ').trim() };
  }
  return { text: t };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bun run test packages/cli/tests/slash.test.ts`
Expected: PASS.

### Task 8.2: server client (TDD with mocked fetch)

**Files:**
- Create: `packages/cli/src/client.ts`
- Test: `packages/cli/tests/client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { runSkill, saveReply, listSkills, getStats } from '../src/client';

afterEach(() => vi.restoreAllMocks());

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

describe('client', () => {
  it('runSkill posts input and skill', async () => {
    const f = mockFetch({ type: 'text', skill: 'x', text: 'ok' });
    const out = await runSkill('hi', 'reply');
    expect(out).toMatchObject({ type: 'text' });
    const call = f.mock.calls[0]!;
    expect(String(call[0])).toContain('/api/run');
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({ input: 'hi', skill: 'reply' });
  });
  it('listSkills GETs /api/skills', async () => {
    mockFetch([{ name: 'reply', description: 'd', output: 'reply' }]);
    expect(await listSkills()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test packages/cli/tests/client.test.ts`
Expected: FAIL — cannot find `./client`.

- [ ] **Step 3: Write `packages/cli/src/client.ts`**

```ts
import type { RunResponse, ReplyRecord, SkillSummary, StatsPanel } from '@hynote/shared';

const BASE = process.env.HYNOTE_SERVER ?? `http://localhost:${process.env.HYNOTE_PORT ?? 3000}`;

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function runSkill(input: string, skill?: string): Promise<RunResponse> {
  const res = await fetch(`${BASE}/api/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(skill ? { input, skill } : { input }),
  });
  return json<RunResponse>(res);
}

export async function listSkills(): Promise<SkillSummary[]> {
  return json<SkillSummary[]>(await fetch(`${BASE}/api/skills`));
}

export async function saveReply(record: ReplyRecord): Promise<{ id: string }> {
  const res = await fetch(`${BASE}/api/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(record),
  });
  return json<{ id: string }>(res);
}

export async function getStats(dimension?: string): Promise<{ panels: StatsPanel[] }> {
  const q = dimension ? `?dimension=${encodeURIComponent(dimension)}` : '';
  return json<{ panels: StatsPanel[] }>(await fetch(`${BASE}/api/stats${q}`));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test packages/cli/tests/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(cli): slash parser + server client"
```

### Task 8.3: renderers + REPL wiring (manual verification)

**Files:**
- Create: `packages/cli/src/renderers/stats.tsx`
- Create: `packages/cli/src/renderers/reply.tsx`
- Create: `packages/cli/src/repl.tsx`
- Create: `packages/cli/src/index.tsx`

> The @opentui/react terminal UI is verified manually (per the testing decision, only the API/interfaces are e2e-tested). Keep components thin; all logic lives in the tested `slash.ts` / `client.ts`.

- [ ] **Step 1: Write `packages/cli/src/renderers/stats.tsx`**

```tsx
import type { StatsPanel } from '@hynote/shared';

function bar(count: number, max: number): string {
  const width = max > 0 ? Math.round((count / max) * 20) : 0;
  return '█'.repeat(width);
}

export function StatsView({ panels }: { panels: StatsPanel[] }) {
  return (
    <box flexDirection="column">
      {panels.map((p) => {
        const max = Math.max(1, ...p.rows.map((r) => r.count));
        return (
          <box key={p.title} flexDirection="column" marginTop={1}>
            <text>{p.title}:</text>
            {p.rows.map((r) => (
              <text key={r.label}>{`  ${r.label.padEnd(20)} ${bar(r.count, max)} ${r.count}`}</text>
            ))}
          </box>
        );
      })}
    </box>
  );
}
```

- [ ] **Step 2: Write `packages/cli/src/renderers/reply.tsx`**

```tsx
import type { RunResponse } from '@hynote/shared';

type ReplyOut = Extract<RunResponse, { type: 'reply' }>;

export function ReplyView({ data }: { data: ReplyOut }) {
  return (
    <box flexDirection="column">
      <text>{`匹配模板: ${data.template}`}</text>
      <box borderStyle="single" flexDirection="column" marginTop={1}>
        <text>{data.reply}</text>
      </box>
      <box flexDirection="column" marginTop={1}>
        <text>统计标签:</text>
        {Object.entries(data.metadata).map(([k, v]) => (
          <text key={k}>{`  ✓ ${k}: ${v}`}</text>
        ))}
      </box>
      <text>[Enter 确认并复制]  [e 编辑]  [Esc 取消]</text>
    </box>
  );
}
```

- [ ] **Step 3: Write `packages/cli/src/repl.tsx`**

```tsx
import { useState } from 'react';
import clipboard from 'clipboardy';
import type { RunResponse } from '@hynote/shared';
import { parseInput } from './slash';
import { runSkill, saveReply, getStats } from './client';
import { StatsView } from './renderers/stats';
import { ReplyView } from './renderers/reply';

export function Repl() {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('输入 /reply 粘贴邮件, /stats 看统计');
  const [result, setResult] = useState<RunResponse | { panels: unknown } | null>(null);

  async function submit(raw: string) {
    const parsed = parseInput(raw);
    setInput('');
    try {
      if (parsed.skill === 'stats' && !parsed.text) {
        setStatus('查询统计...');
        setResult(await getStats());
        setStatus('');
        return;
      }
      setStatus('agent 处理中...');
      const out = await runSkill(parsed.text || raw.trim(), parsed.skill);
      setResult(out);
      setStatus('');
    } catch (e) {
      setStatus(`⚠ 失败: ${(e as Error).message} — 重试或改用 /reply 手动选模板`);
    }
  }

  async function confirmReply(data: Extract<RunResponse, { type: 'reply' }>) {
    await saveReply({
      template: data.template,
      email_name: data.email_name,
      email_from: data.email_from,
      reply_content: data.reply,
      metadata: data.metadata,
      confirmed: true,
    });
    await clipboard.write(data.reply);
    setStatus('已复制到剪贴板并保存');
    setResult(null);
  }

  return (
    <box flexDirection="column">
      <text>HyNote Email Agent</text>
      <text>{status}</text>
      {result && 'type' in result && result.type === 'reply' && (
        <ReplyView data={result} />
      )}
      {result && 'type' in result && result.type === 'text' && <text>{result.text}</text>}
      {result && 'panels' in result && <StatsView panels={result.panels as never} />}
      {result && 'type' in result && result.type === 'stats' && (
        <StatsView panels={result.panels} />
      )}
      <input
        value={input}
        onInput={setInput}
        onSubmit={(v: string) => {
          if (result && 'type' in result && result.type === 'reply' && v.trim() === '') {
            void confirmReply(result);
          } else {
            void submit(v);
          }
        }}
      />
    </box>
  );
}
```

> Note: confirm exact `@opentui/react` element/prop names (`<box>`, `<text>`, `<input>`, `onInput`, `onSubmit`, `borderStyle`) against the installed version and the baocode CLI package; adjust prop names if the API differs. Behavior contract: Enter on empty input while a reply is shown = confirm+copy; otherwise Enter submits the typed line.

- [ ] **Step 4: Write `packages/cli/src/index.tsx`**

```tsx
import { render } from '@opentui/react';
import { Repl } from './repl';

render(<Repl />);
```

> Confirm the render entrypoint name against baocode's `packages/cli/src/index.tsx` and the installed `@opentui/react`; match its bootstrap pattern.

- [ ] **Step 5: Manual smoke test**

Run (two terminals or `bun run dev`):
```bash
bun run dev:server   # terminal 1
bun run dev:cli      # terminal 2
```
Expected: REPL renders; `/stats` shows empty panels; `/reply <paste an email>` calls the server (requires real `.env` + D1 for live AI, or expect the fallback message without credentials).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(cli): REPL, renderers, wiring"
```

---

## Phase 9 — Install + docs + full verification

### Task 9.1: bun link + README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

````markdown
# HyNote Email Agent

Persistent-REPL CLI to reply to HyNote Affiliate emails and view stats. Skill-driven agent over a local Hono server backed by Cloudflare D1.

## Setup

```bash
bun install
cp .env.example .env   # fill Cloudflare D1 + provider API keys
bun run db:generate
bun run db:push        # applies schema to remote D1 (needs .env)
```

## Develop

```bash
bun run dev            # runs server + cli via mprocs
```

## Install globally

```bash
bun link               # from repo root, exposes `hynote`
# then run the server (bun run dev:server) and use `hynote`
```

## Config

- Secrets: `.env` (`CLOUDFLARE_*`, `<PROVIDER>_API_KEY`)
- Non-secret: `~/.bao-auto-mail/config.json` (default provider, model, base_url)
- Templates: `~/.bao-auto-mail/templates/*.md` (variables use `{{firstName}}`)
- Skills: `~/.bao-auto-mail/skills/<name>/SKILL.md`

## Usage

In the REPL: `/reply` + paste an email, `/stats [dimension]`, or type plain text to let the agent route intent.
````

- [ ] **Step 2: Link the CLI**

Run: `bun link`
Expected: `hynote` registered. (Making `src/index.tsx` executable via Bun shebang may be needed; add `#!/usr/bin/env bun` as line 1 of `packages/cli/src/index.tsx` if `bun link` requires it.)

### Task 9.2: Full test + typecheck gate

- [ ] **Step 1: Run the whole test suite**

Run: `bun run test`
Expected: PASS — shared (schemas), database (test-db), server (template, stats, tools, skill, app, config), cli (slash, client).

- [ ] **Step 2: Typecheck every package**

Run:
```bash
bunx tsc -p packages/shared/tsconfig.json --noEmit
bunx tsc -p packages/database/tsconfig.json --noEmit
bunx tsc -p packages/server/tsconfig.json --noEmit
bunx tsc -p packages/cli/tsconfig.json --noEmit
```
Expected: no errors.

- [ ] **Step 3: Final commit**

```bash
git add -A && git commit -m "docs: README + install; green test/typecheck gate"
```

---

## Self-Review Notes (author checklist — already applied)

- **Spec coverage:** REPL + slash + AI routing (Task 7.1 `/api/run` routing branch, Task 8.1/8.3); SKILL.md format + loader (Phase 5); tool registry + `allowed_tools` permission boundary (Phase 4, `pickTools`); built-in reply/stats skills (Task 3.1); template `{{firstName}}` + 4 templates + hardcoded signature (Task 3.1/3.2); D1 sqlite-proxy runtime + drizzle-kit d1-http migration (Phase 2); secrets in `.env`, non-secret config.json (Task 7.2); `email_content` column + store original (Task 2.1 schema, Task 7.1 reply route); 3 preset + dynamic dimension stats with whitelist (Task 3.3); AI-failure → 502 `fallback:manual` + manual template selection (Task 7.1 test, Task 8.3 status); Vitest e2e for every API with AI faked + libsql db isolation (Phase 7); `bun link` + mprocs (Phase 0, 9); history command intentionally absent.
- **Placeholder scan:** none — every code step is complete; three explicit "confirm against installed version" notes are for the external `@opentui/react` / `@ai-sdk/openai-compatible` APIs, not deferred work.
- **Type consistency:** `Db`, `SkillManifest`, `RunResponse`, `ReplyRecord`, `AppConfig` defined once in shared/database and reused; tool keys underscored consistently (`template_list/get/fill`, `db_query_stats`) across tools, SKILL.md assets, and `allowed_tools`.
