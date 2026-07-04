# Partner Status Stats Dimension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `status` to the stats dimension whitelist so `/api/stats?dimension=status` shows partner application status counts.

**Spec:** `docs/2026-07-04-partner-status-dimension-design.md`. 3 tasks, 58→59 tests. Execute all, final gate, then live verify.

---

## Task 1: Whitelist + test

**Files:** Modify `packages/server/src/services/stats.ts`, `packages/server/tests/stats.test.ts`

- [ ] **Step 1: Add the test case** in `stats.test.ts` (append to the `describe('queryStats')` block):

```ts
  it('groups by status', async () => {
    const db = await createTestDb();
    await db.insert(replies).values([
      { id: 'a', template: 'partner', replyContent: '.', metadata: '{"status":"applied"}' },
      { id: 'b', template: 'partner', replyContent: '.', metadata: '{"status":"applied"}' },
      { id: 'c', template: 'partner', replyContent: '.', metadata: '{"status":"notified"}' },
    ]);
    const panels = await queryStats(db, 'status');
    expect(panels[0]!.title).toBe('status');
    const applied = panels[0]!.rows.find((r) => r.label === 'applied');
    const notified = panels[0]!.rows.find((r) => r.label === 'notified');
    expect(applied!.count).toBe(2);
    expect(notified!.count).toBe(1);
  });
```

- [ ] **Step 2: Run it, verify FAIL** — `bun run test packages/server/tests/stats.test.ts` → FAIL because `status` is not whitelisted → `UnknownDimensionError`.

- [ ] **Step 3: Add `'status'`** to `DIMENSION_WHITELIST` in `stats.ts` (insert before closing `];`):

```ts
  'status',
```

- [ ] **Step 4: Run it, verify PASS** — 4 stats tests pass (3 existing + 1 new).

- [ ] **Step 5: Commit** — `git add packages/server && git commit -m "feat(server): add status to stats dimension whitelist"`

---

## Task 2: Update stats SKILL.md

**Files:** Modify `packages/server/src/assets/skills/stats/SKILL.md`; sync `~/.bao-auto-mail/skills/stats/SKILL.md`

- [ ] **Step 1: Edit** — find the line with example dimensions (like `platform, promotion_date, user_id_status`) and add `status` — e.g.:
  ```
  If the user names a specific dimension (e.g. platform, promotion_date, user_id_status, status), call db_query_stats with that dimension.
  ```
  (Exact current line: `sed -n '/dimension/ s/.*/"&"/p'`; edit it in-place.)

- [ ] **Step 2: Sync** — `cp packages/server/src/assets/skills/stats/SKILL.md ~/.bao-auto-mail/skills/stats/SKILL.md`

- [ ] **Step 3: Commit** — `git add packages/server/src/assets/skills/stats/SKILL.md && git commit -m "feat(server): mention status dimension in stats skill prompt"`

---

## Task 3: Verify (final gate + live)

- [ ] **Step 1: Final gate** — `bun run test` (59 pass) and `bunx tsc -p packages/server/tsconfig.json --noEmit` (exit 0).
- [ ] **Step 2: Live** (user or me with the running server) — `GET /api/stats?dimension=status` → `applied: 7` (the 7 partners just inserted).
