# CLI Confirm-Gate + Auto-Scroll — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) Only show the confirm options for a real reply (reply with a non-empty `template`); non-email text renders as plain text. (B) Auto-scroll the history to the bottom on new/streamed content.

**Architecture:** (A) new pure `shouldConfirm` gates `setPending`; reply skill prompt returns empty `template` for non-emails. (B) `SessionShell` gets a scrollbox ref + `scrollKey` prop and scrolls to bottom in an effect; `Repl` bumps `scrollKey` on every turn change.

**Tech Stack:** `@hynote/shared`, `@opentui`, React, TypeScript, Vitest. Run from repo root. Existing 48 tests stay green.

**Spec:** `docs/2026-07-04-cli-confirm-autoscroll-design.md`.

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
  it('false for an empty template', () => {
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

- [ ] **Step 2: Run it, verify FAIL** — `bun run test packages/cli/tests/should-confirm.test.ts` → FAIL (module missing).

- [ ] **Step 3: Create `packages/cli/src/should-confirm.ts`**:

```ts
import type { RunResponse } from '@hynote/shared';

// Whether to enter the confirm/copy flow: only a real reply (reply with a non-empty template).
export function shouldConfirm(res: RunResponse): boolean {
  return res.type === 'reply' && res.template.trim().length > 0;
}
```

- [ ] **Step 4: Run it, verify PASS** — 4 tests pass.

- [ ] **Step 5: Commit** — `git add packages/cli/src/should-confirm.ts packages/cli/tests/should-confirm.test.ts && git commit -m "feat(cli): shouldConfirm — gate confirm on a real reply"`

---

## Task 2: reply skill prompt (bundled + seeded)

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

- [ ] **Step 2: Sync the seeded copy** — `cp packages/server/src/assets/skills/reply/SKILL.md ~/.bao-auto-mail/skills/reply/SKILL.md 2>/dev/null || echo "(not seeded yet)"`

- [ ] **Step 3: Commit** — `git add packages/server/src/assets/skills/reply/SKILL.md && git commit -m "feat(server): reply skill returns empty template for non-email input"`

---

## Task 3: Gate `setPending` + add `scrollKey` in Repl

**Files:** Modify `packages/cli/src/screens/repl.tsx`

- [ ] **Step 1: Imports** — add `import { shouldConfirm } from '../should-confirm';`

- [ ] **Step 2: scrollKey state** — add after the other `useState` hooks (near `const [confirmIndex, setConfirmIndex] = useState(0);`):

```tsx
  const [scrollKey, setScrollKey] = useState(0);
```

- [ ] **Step 3: Bump scrollKey in addTurn + updateTurn.** Change:

```tsx
  const addTurn = useCallback((turn: Turn) => {
    setTurns((prev) => [...prev, turn]);
  }, []);

  const updateTurn = useCallback((id: number, fn: (t: Turn) => Turn) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
  }, []);
```

to:

```tsx
  const addTurn = useCallback((turn: Turn) => {
    setTurns((prev) => [...prev, turn]);
    setScrollKey((k) => k + 1);
  }, []);

  const updateTurn = useCallback((id: number, fn: (t: Turn) => Turn) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
    setScrollKey((k) => k + 1);
  }, []);
```

- [ ] **Step 4: Gate the reply branch** in `runTurn`:

```tsx
        if (res.type === 'reply') {
          updateTurn(id, (t) => ({ ...t, streaming: false, reply: res }));
          if (shouldConfirm(res)) {
            setPending({ turnId: id, reply: res, emailContent: text || raw });
            setConfirmIndex(0);
          }
        } else if (res.type === 'stats') {
```

- [ ] **Step 5: Pass `scrollKey` to SessionShell** — change the `<SessionShell …>` open tag to include `scrollKey={scrollKey}`:

```tsx
    <SessionShell
      onSubmit={submit}
      loading={streaming}
      interruptible
      inputSlot={inputSlot}
      commands={commands}
      scrollKey={scrollKey}
    >
```

- [ ] **Step 6: Typecheck** — `bunx tsc -p packages/cli/tsconfig.json --noEmit` → exit 0.

- [ ] **Step 7: Commit** — `git add packages/cli/src/screens/repl.tsx && git commit -m "feat(cli): content-gated confirm + scrollKey signal"`

---

## Task 4: SessionShell auto-scroll

**Files:** Modify `packages/cli/src/components/session-shell.tsx`

- [ ] **Step 1: Imports** — change the top imports to add `ScrollBoxRenderable` + react hooks:

```tsx
import { TextAttributes, type ScrollBoxRenderable } from '@opentui/core';
import { useEffect, useRef } from 'react';
import { InputBar } from './input-bar';
import { Spinner } from './spinner';
import type { Command } from './command-menu/types';
```

- [ ] **Step 2: Add `scrollKey` to Props** and destructure it:

```tsx
type Props = {
  children?: React.ReactNode;
  onSubmit: (text: string) => void;
  inputDisabled?: boolean;
  loading?: boolean;
  interruptible?: boolean;
  commands: Command[];
  scrollKey?: number;
};
```
(add `scrollKey,` to the destructured params in `SessionShell({ … })`.)

- [ ] **Step 3: Add the ref + effect** at the top of the component body (before `return`):

```tsx
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  useEffect(() => {
    const sb = scrollRef.current;
    if (sb) sb.scrollTop = sb.scrollHeight;
  }, [scrollKey]);
```

- [ ] **Step 4: Attach the ref** to the scrollbox (keep stickyScroll):

```tsx
      <scrollbox ref={scrollRef} flexGrow={1} width="100%" stickyScroll stickyStart="bottom">
        <box gap={1}>{children}</box>
      </scrollbox>
```

- [ ] **Step 5: Typecheck + bundle + tests** — `bunx tsc -p packages/cli/tsconfig.json --noEmit` (exit 0); `bun build packages/cli/src/index.tsx --target bun --outdir /tmp/ae-scroll` (success); `bun run test` (52 pass).

- [ ] **Step 6: Commit** — `git add packages/cli/src/components/session-shell.tsx && git commit -m "feat(cli): auto-scroll history to bottom on content change"`

---

## Task 5: Verify

- [ ] **Step 1: Final gate** — `bun run test` (52) + `bunx tsc -p packages/{shared,database,server,cli}/tsconfig.json --noEmit` (all exit 0) + `bun build packages/cli/src/index.tsx --target bun --outdir /tmp/ae-scroll` (success).
- [ ] **Step 2 (user, needs real `.env` + TTY):** Live —
  - plain text `你好` (no `/reply`) → short plain-text answer, **no confirm options**; `/reply` + real email → reply card **with** confirm; `/stats` unchanged.
  - long conversation / streaming → history auto-scrolls to the bottom.

---

## Self-Review Notes (author checklist — applied)

- **Spec coverage (A):** shouldConfirm + test (Task 1), reply prompt empty-template + seeded sync (Task 2), repl gate (Task 3 Step 4). **(B):** SessionShell ref+scrollKey+effect (Task 4), repl scrollKey state + addTurn/updateTurn bump + pass-through (Task 3 Steps 2/3/5). schema/routing untouched.
- **Placeholder scan:** none — full code per step; Task 2 Step 2 `|| echo` handles the not-yet-seeded case concretely.
- **Type consistency:** `shouldConfirm(res: RunResponse): boolean` matches test fixtures + repl call. `scrollKey?: number` (SessionShell Props) matches `scrollKey={scrollKey}` (number state) and the effect dep. `ScrollBoxRenderable` ref matches `<scrollbox ref={scrollRef}>`. `addTurn`/`updateTurn` keep their signatures; only a `setScrollKey` bump is added.
