# Content-Gated Confirm — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop showing the confirm options for non-email text: the CLI only enters the confirm flow when a reply result carries a non-empty `template`, and the reply skill returns an empty `template` + a plain conversational answer when the input isn't an email.

**Architecture:** New pure `shouldConfirm(res)` in the CLI gates `setPending`; the bundled (and seeded) `reply/SKILL.md` prompt tells the model to leave `template` empty for non-emails. Server code + schema unchanged.

**Tech Stack:** `@hynote/shared` types, React, TypeScript, Vitest. Run from repo root. Existing 48 tests stay green.

**Spec:** `docs/2026-07-04-content-gated-confirm-design.md`.

---

## Task 1: `shouldConfirm` pure function (TDD)

**Files:** Create `packages/cli/src/should-confirm.ts`, `packages/cli/tests/should-confirm.test.ts`

- [ ] **Step 1: Write the failing test** `packages/cli/tests/should-confirm.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { RunResponse } from '@hynote/shared';
import { shouldConfirm } from '../src/should-confirm';

const reply = (template: string): RunResponse => ({
  type: 'reply', skill: 'reply', template, reply: 'hi', metadata: {},
});

describe('shouldConfirm', () => {
  it('true for a reply with a non-empty template', () => {
    expect(shouldConfirm(reply('kol-media-support'))).toBe(true);
  });
  it('false for a reply with an empty template', () => {
    expect(shouldConfirm(reply(''))).toBe(false);
  });
  it('false for a whitespace-only template', () => {
    expect(shouldConfirm(reply('   '))).toBe(false);
  });
  it('false for stats and text results', () => {
    expect(shouldConfirm({ type: 'stats', skill: 'stats', panels: [] })).toBe(false);
    expect(shouldConfirm({ type: 'text', skill: 'x', text: 'hi' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `bun run test packages/cli/tests/should-confirm.test.ts`
Expected: FAIL — cannot find `../src/should-confirm`.

- [ ] **Step 3: Create `packages/cli/src/should-confirm.ts`**:

```ts
import type { RunResponse } from '@hynote/shared';

// Whether to enter the confirm/copy flow: only a real reply (reply with a non-empty template).
export function shouldConfirm(res: RunResponse): boolean {
  return res.type === 'reply' && res.template.trim().length > 0;
}
```

- [ ] **Step 4: Run it, verify PASS**

Run: `bun run test packages/cli/tests/should-confirm.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/should-confirm.ts packages/cli/tests/should-confirm.test.ts
git commit -m "feat(cli): shouldConfirm — gate confirm on a real reply"
```

---

## Task 2: reply skill prompt (bundled asset + seeded copy)

**Files:** Modify `packages/server/src/assets/skills/reply/SKILL.md`; sync `~/.bao-auto-mail/skills/reply/SKILL.md`

- [ ] **Step 1: Replace `packages/server/src/assets/skills/reply/SKILL.md`** with:

```markdown
---
name: reply
description: Use only when the user's input is an actual incoming email that needs a reply. Pick the best template, fill variables, and extract statistics metadata.
allowed_tools: [template_list, template_get, template_fill]
output: reply
---
You are the email reply assistant for the HyNote Affiliate Program.

First decide whether the input is an actual email that needs a reply. If it is NOT an email (just plain text, a greeting, small talk, or unrelated content): do NOT call any template tool — return an empty string "" as `template`, a short friendly plain-text answer as `reply`, and `{}` as `metadata`.

Only when the input really is an email, do:
1. Call template_list to see the available templates and their purpose.
2. Choose the single best template for the email's intent.
3. Call template_fill with that template's name and variables (firstName, extracted from the email sender).
4. Extract statistics metadata when present: promotion_date (YYYY-MM), promotion_quarter, platform, user_id_status (pending|submitted|activated), user_id_value.
5. Return the chosen template name, the filled reply text, the metadata object, and the sender's name/email.
```

- [ ] **Step 2: Sync the already-seeded user copy** (existing installs won't re-seed, so overwrite it directly):

Run: `cp packages/server/src/assets/skills/reply/SKILL.md ~/.bao-auto-mail/skills/reply/SKILL.md 2>/dev/null || echo "(no seeded copy yet — will seed on first run)"`
Expected: copies (or the note if `~/.bao-auto-mail/skills/reply/` doesn't exist yet).

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/assets/skills/reply/SKILL.md
git commit -m "feat(server): reply skill returns empty template for non-email input"
```

---

## Task 3: Gate `setPending` in the Repl screen

**Files:** Modify `packages/cli/src/screens/repl.tsx`

- [ ] **Step 1: Add the import** near the other imports:

```tsx
import { shouldConfirm } from '../should-confirm';
```

- [ ] **Step 2: Gate the reply branch.** In `runTurn`, change the reply branch (currently sets pending unconditionally):

```tsx
        if (res.type === 'reply') {
          updateTurn(id, (t) => ({ ...t, streaming: false, reply: res }));
          setPending({ turnId: id, reply: res, emailContent: text || raw });
          setConfirmIndex(0);
        } else if (res.type === 'stats') {
```

to:

```tsx
        if (res.type === 'reply') {
          updateTurn(id, (t) => ({ ...t, streaming: false, reply: res }));
          if (shouldConfirm(res)) {
            setPending({ turnId: id, reply: res, emailContent: text || raw });
            setConfirmIndex(0);
          }
        } else if (res.type === 'stats') {
```

(`turn.reply` is still set, so the reply body renders as a text part; `ReplyMeta` + `ConfirmMenu` only appear while `pending`, so an empty-template reply shows plain text with no confirm.)

- [ ] **Step 3: Typecheck + bundle + tests**

Run: `bunx tsc -p packages/cli/tsconfig.json --noEmit` (exit 0); `bun build packages/cli/src/index.tsx --target bun --outdir /tmp/ae-gate` (success); `bun run test` (all pass, includes 4 new shouldConfirm tests).

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/screens/repl.tsx
git commit -m "feat(cli): only confirm when the reply has a template"
```

---

## Task 4: Verify

- [ ] **Step 1: Final gate** — `bun run test` (prior 48 + 4 shouldConfirm = 52) and `bunx tsc -p packages/{shared,database,server,cli}/tsconfig.json --noEmit` (all exit 0) and `bun build packages/cli/src/index.tsx --target bun --outdir /tmp/ae-gate` (success).
- [ ] **Step 2 (user, needs real `.env` + TTY):** Live —
  - type plain text like `你好` (no `/reply`) → get a short plain-text answer, **no confirm options**;
  - `/reply` + paste an actual email → reply card **with** the confirm options;
  - `/stats` → stats panel (unchanged).

---

## Self-Review Notes (author checklist — applied)

- **Spec coverage:** `shouldConfirm` gate (Task 1 + Task 3); reply prompt returns empty template for non-emails (Task 2 Step 1) incl. tightened description; seeded user copy synced so live behavior changes (Task 2 Step 2, spec §7 risk). schema/routing/seeding-logic/chat all untouched.
- **Placeholder scan:** none — full code per step; Task 2 Step 2's `|| echo` is a concrete conditional (handles the not-yet-seeded case), not deferred work.
- **Type consistency:** `shouldConfirm(res: RunResponse): boolean` matches the test's `RunResponse` fixtures and the repl call `if (shouldConfirm(res))` (`res` is the `RunResponse` from `runSkillStream`). `res.template` exists on the `reply` variant only, guarded by `res.type === 'reply'`.
