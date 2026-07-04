# Auto Email CLI UI Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `packages/cli` TUI to match baocode's look exactly — theme system, provider stack (theme/keyboard-layer/toast/dialog), react-router shell, ascii-font header, parts-grouped message rendering (Thinking/tool/markdown), left-accent InputBar with command menu, bottom status row — with Auto Email branding. Server unchanged.

**Architecture:** Port baocode's generic UI infrastructure verbatim (with namespace + `MODE`/mentions removed), then wire Auto Email's existing streaming/reply/stats/manual-pick logic into the new SessionShell + BotMessage. `client.ts`/`slash.ts`/server untouched.

**Tech Stack:** Bun, TypeScript, `@opentui/core`+`@opentui/react` 0.2.16 (SyntaxStyle, Markdown, ASCIIFont, spinner), `opentui-spinner`, `react-router`, Zod, Vitest.

**Spec:** `docs/2026-07-04-auto-email-ui-design.md`. **Reference source (copy from):** `/Users/bao/data/code/baocode/packages/cli/src/`. **Verify UI via** tsc + `bun build packages/cli/src/index.tsx` + live `hynote` run (no automated UI tests). Existing 40 tests (slash/client/client-stream) must stay green throughout.

> **Porting convention:** "Copy baocode `<src>` → `<dst>`, apply edits" means: read the baocode file, write it to the hynote path with ONLY the listed edits. baocode is the chosen visual standard; verbatim copy is the goal. After each task run `bunx tsc -p packages/cli/tsconfig.json --noEmit`.

> **Drafts already on disk (uncommitted, validated against @opentui 0.2.16 API):** `theme.ts`, `providers/theme/index.tsx`, `components/bot-message.tsx`, `components/header.tsx`, `components/status-bar.tsx`. Tasks below finalize/keep them.

---

## Phase A — Dependencies + verbatim infra ports

### Task A1: Add dependencies

**Files:** Modify `packages/cli/package.json`

- [ ] **Step 1:** Add to `dependencies`: `"@opentui/core": "^0.2.16"` (if not pinned there already — currently `^0.2.10`, bump to `^0.2.16`), `"opentui-spinner": "^0.0.6"`, `"react-router": "^7.15.1"`. Keep existing (`@hynote/shared`, `@opentui/react`, `clipboardy`, `eventsource-parser`, `react`).
- [ ] **Step 2:** Run `bun install`. Expected: installs opentui-spinner + react-router.
- [ ] **Step 3:** Run `bun run test` → 40 pass (unaffected). Commit: `chore(cli): add opentui-spinner + react-router`.

### Task A2: border + use-content-fill (verbatim)

**Files:** Create `packages/cli/src/components/border.tsx`, `packages/cli/src/lib/use-content-fill.ts`

- [ ] **Step 1:** Copy baocode `components/border.tsx` → `packages/cli/src/components/border.tsx` verbatim (exports `EmptyBorder`, `SplitBorderChars`). No edits.
- [ ] **Step 2:** Copy baocode `lib/use-content-fill.ts` → `packages/cli/src/lib/use-content-fill.ts` verbatim (no baocode deps). No edits.
- [ ] **Step 3:** `bunx tsc -p packages/cli/tsconfig.json --noEmit` → clean. Commit: `feat(cli): port border + use-content-fill`.

### Task A3: theme + ThemeProvider + ThemeRoot

**Files:** Keep `packages/cli/src/theme.ts` (draft), `packages/cli/src/providers/theme/index.tsx` (draft); Create `packages/cli/src/layouts/theme-root.tsx`

- [ ] **Step 1:** Verify the drafted `theme.ts` exports `THEMES` (4 themes), `ThemeColors`, `Theme`, `DEFAULT_THEME` — matches spec §4. Keep as-is.
- [ ] **Step 2:** Verify the drafted `providers/theme/index.tsx` — `ThemeProvider`/`useTheme` reading/persisting `~/.bao-auto-mail/preferences.json`, exposes `{colors, currentTheme, setTheme, allThemes}`. Keep as-is.
- [ ] **Step 3:** Copy baocode `layouts/theme-root.tsx` → `packages/cli/src/layouts/theme-root.tsx` verbatim (imports `../providers/theme` `useTheme`). No edits.
- [ ] **Step 4:** `bunx tsc` clean. Commit: `feat(cli): theme system + ThemeRoot`.

### Task A4: keyboard-layer (port, drop Mention)

**Files:** Create `packages/cli/src/providers/keyboard-layer/index.tsx`

- [ ] **Step 1:** Copy baocode `providers/keyboard-layer/index.tsx` → hynote path. Edit: in `enum LayerName` remove the `Mention = "mention"` member (keep `Base`, `Command`, `Dialog`). Everything else verbatim (Ctrl+C responder stack, `push/pop/isTopLayer/setResponder`, `useKeyboardLayer`).
- [ ] **Step 2:** `bunx tsc` clean. Commit: `feat(cli): port keyboard-layer provider`.

### Task A5: toast + dialog providers (verbatim)

**Files:** Create `packages/cli/src/providers/toast/{index.tsx,types.ts}`, `packages/cli/src/providers/dialog/{index.tsx,types.ts}`

- [ ] **Step 1:** Copy baocode `providers/toast/types.ts` and `providers/toast/index.tsx` verbatim (deps: `../../components/border` SplitBorderChars, `../theme`, `../../lib/use-content-fill` — all ported in A2/A3). No edits.
- [ ] **Step 2:** Copy baocode `providers/dialog/types.ts` and `providers/dialog/index.tsx` verbatim (deps: `../keyboard-layer`, `../theme`, `@opentui/*`). No edits.
- [ ] **Step 3:** `bunx tsc` clean. Commit: `feat(cli): port toast + dialog providers`.

---

## Phase B — Presentational components

### Task B1: spinner + header + status-bar

**Files:** Create `packages/cli/src/components/spinner.tsx`; keep drafts `header.tsx`, `status-bar.tsx`

- [ ] **Step 1:** Create `packages/cli/src/components/spinner.tsx`:

```tsx
import { useTheme } from '../providers/theme';
import 'opentui-spinner/react';

export function Spinner() {
  const { colors } = useTheme();
  return <spinner name="aesthetic" color={colors.primary} />;
}
```

- [ ] **Step 2:** Verify drafted `header.tsx` uses `<ascii-font font="tiny" text="Auto" color="orange"/>` + `<ascii-font font="tiny" text="Email"/>` centered. Keep.
- [ ] **Step 3:** Verify drafted `status-bar.tsx` shows `deepseek › deepseek-chat` (primary + DIM `›` + model). Keep.
- [ ] **Step 4:** `bunx tsc` clean. Commit: `feat(cli): spinner + header + status-bar`.

### Task B2: BotMessage (rendering standard) — keep draft, verify

**Files:** Keep `packages/cli/src/components/bot-message.tsx` (draft)

- [ ] **Step 1:** Verify the drafted `bot-message.tsx` matches spec §3 exactly: `HynoteMessagePart` union (reasoning/tool/text), `groupConsecutiveParts`, `formatToolName` (underscore/camel → "Title Case"), reasoning+tool as `│` left-bar DIM boxes (`customBorderChars` vertical `│`), `Thinking:`/tool-name `<em>` in `colors.thinking`/`colors.info`, text via `<markdown syntaxStyle content streaming>`, footer `◉ provider › model`. Also exports `eventsToParts(events)`.
- [ ] **Step 2:** `bunx tsc` clean (SyntaxStyle/markdown/em all resolve). Commit: `feat(cli): BotMessage part-grouped renderer`.

---

## Phase C — Command menu (dynamic skills) + InputBar + SessionShell

### Task C1: command-menu adapted to dynamic skill commands

**Files:** Create `packages/cli/src/components/command-menu/{types.ts,use-command-menu.ts,index.tsx}`

Baocode's `commands.tsx` (static Build/Plan/agents/models) is dropped; commands are the loaded skills (`/reply`, `/stats`, …) passed in.

- [ ] **Step 1:** Create `command-menu/types.ts`:

```ts
export type Command = { name: string; description: string };
```

- [ ] **Step 2:** Create `command-menu/use-command-menu.ts` — copy baocode `use-command-menu.ts` with these edits: import `Command` from `./types`; REMOVE the `getFilteredCommands`/`COMMANDS` import; make the hook accept `commands: Command[]` param and filter locally:

```ts
import type { ScrollBoxRenderable } from '@opentui/core';
import { useMemo, useRef, useState, type RefObject } from 'react';
import type { Command } from './types';
import { useKeyboard } from '@opentui/react';
import { LayerName, useKeyboardLayer } from '../../providers/keyboard-layer';

type UseCommandMenuReturn = {
  showCommandMenu: boolean;
  filteredCommands: Command[];
  selectedIndex: number;
  scrollRef: RefObject<ScrollBoxRenderable | null>;
  handleContentChange: (text: string) => void;
  resolveCommand: (index: number) => Command | undefined;
  setSelectedIndex: (index: number) => void;
};

export function useCommandMenu(commands: Command[]): UseCommandMenuReturn {
  const [textValue, setTextValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const { pop, push, isTopLayer } = useKeyboardLayer();

  const query = showCommandMenu && textValue.startsWith('/') ? textValue.slice(1) : '';
  const filteredCommands = useMemo(
    () =>
      query.length === 0
        ? commands
        : commands.filter((c) => c.name.toLowerCase().startsWith(query.toLowerCase())),
    [commands, query],
  );

  const closeCommandMenu = () => {
    setShowCommandMenu(false);
    pop(LayerName.Command);
  };

  const handleContentChange = (text: string) => {
    setTextValue(text);
    setSelectedIndex(0);
    scrollRef.current?.scrollTo(0);
    const prefix = text.startsWith('/') ? text.slice(1) : null;
    if (prefix !== null && !prefix.includes(' ')) {
      setShowCommandMenu(true);
      push(LayerName.Command, () => {
        closeCommandMenu();
        return true;
      });
    } else {
      closeCommandMenu();
    }
  };

  const resolveCommand = (index: number): Command | undefined => {
    const command = filteredCommands[index];
    if (command) closeCommandMenu();
    return command;
  };

  useKeyboard((key) => {
    if (!showCommandMenu || !isTopLayer(LayerName.Command)) return;
    if (key.name === 'escape') {
      key.preventDefault();
      closeCommandMenu();
    } else if (key.name === 'up') {
      key.preventDefault();
      setSelectedIndex((prev) => {
        const ni = Math.max(prev - 1, 0);
        const sb = scrollRef.current;
        if (sb && ni < sb.scrollTop) sb.scrollTo(ni);
        return ni;
      });
    } else if (key.name === 'down') {
      key.preventDefault();
      setSelectedIndex((prev) => {
        const ni = Math.min(prev + 1, filteredCommands.length - 1);
        const sb = scrollRef.current;
        if (sb) {
          const visibleEnd = sb.scrollTop + sb.viewport.height - 1;
          if (ni > visibleEnd) sb.scrollTo(ni - sb.viewport.height + 1);
        }
        return ni;
      });
    }
  });

  return { showCommandMenu, filteredCommands, selectedIndex, scrollRef, handleContentChange, resolveCommand, setSelectedIndex };
}
```

- [ ] **Step 3:** Create `command-menu/index.tsx` — the menu list (copy baocode `command-menu/index.tsx` structure: a `<scrollbox>` of rows, each `/name` + dim description, selected row bg `colors.selection`). Adapt props to `{ commands: Command[]; selectedIndex; scrollRef; onSelect; onExecute }`. Row render:

```tsx
import type { ScrollBoxRenderable } from '@opentui/core';
import type { RefObject } from 'react';
import { useTheme } from '../../providers/theme';
import type { Command } from './types';

export function CommandMenu({
  commands, selectedIndex, scrollRef, onSelect, onExecute,
}: {
  commands: Command[];
  selectedIndex: number;
  scrollRef: RefObject<ScrollBoxRenderable | null>;
  onSelect: (i: number) => void;
  onExecute: (i: number) => void;
}) {
  const { colors } = useTheme();
  if (commands.length === 0) return null;
  const height = Math.min(commands.length, 6);
  return (
    <scrollbox ref={scrollRef} height={height}>
      {commands.map((cmd, i) => {
        const selected = i === selectedIndex;
        return (
          <box key={cmd.name} flexDirection="row" paddingX={1} height={1}
            backgroundColor={selected ? colors.selection : undefined}
            onMouseMove={() => onSelect(i)} onMouseDown={() => onExecute(i)}>
            <box flexGrow={1}><text fg={selected ? 'black' : undefined}>{`/${cmd.name}`}</text></box>
            <text fg={selected ? 'black' : colors.dimSeparator}>{cmd.description}</text>
          </box>
        );
      })}
    </scrollbox>
  );
}
```

- [ ] **Step 4:** `bunx tsc` clean. Commit: `feat(cli): dynamic skill command menu`.

### Task C2: InputBar (baocode, mentions removed)

**Files:** Create `packages/cli/src/components/input-bar.tsx`

- [ ] **Step 1:** Copy baocode `components/input-bar.tsx` → hynote path, then DELETE all mention machinery: the `MentionMatch`/`MentionCandidate` types, `isWithinCurrentDirectory`/`isMentionQueryCharacter`/`findActiveMention`/`getMentionCandidates`/`FileMentionMenu`, all `activeMention*`/`mention*` state/refs/effects, the `LayerName.Mention` usage, `handleTextareaCursorChange`, and the mention `useKeyboard` block. Keep: the `<textarea>` (ref, `onContentChange`, `placeholder`, `keyBindings` submit/newline), the command-menu integration (`useCommandMenu(commands)` — new signature takes commands), the split-border `┃` left accent (`border={['left']}` + `customBorderChars` vertical `┃` from `SplitBorderChars`), `<StatusBar/>`, and `onSubmit` via `textarea.plainText`.
- [ ] **Step 2:** Change signature to `InputBar({ onSubmit, disabled, commands }: { onSubmit: (text: string) => void; disabled?: boolean; commands: Command[] })`. Remove all `usePromptConfig`/`MODE`/`toggleMode`/tab-mode bits. The command execute path: on selecting a command, `textarea.insertText('/' + cmd.name + ' ')` (or set text) so the user then types/pastes the arg — do NOT execute a mode action (baocode's `handleCommand` action machinery is dropped). Keep `useKeyboardLayer` `LayerName.Base` responder that clears the textarea on Ctrl+C.
- [ ] **Step 3:** `bunx tsc` clean. Commit: `feat(cli): InputBar (baocode style, no mentions)`.

> Note: InputBar is the largest port. If tsc surfaces @opentui prop drift (e.g. `keyBindings`, `customBorderChars`, `onContentChange`), align to baocode's exact usage (same @opentui version). No `any`.

### Task C3: SessionShell

**Files:** Create `packages/cli/src/components/session-shell.tsx`

- [ ] **Step 1:** Copy baocode `components/session-shell.tsx`, edits: drop `usePromptConfig`/`MODE`; `Spinner` takes no mode; bottom-right hint text `/ commands · Ctrl+T theme` (instead of `tab agents`); pass `commands` through to `<InputBar>`. Signature: `SessionShell({ children, onSubmit, inputDisabled, loading, interruptible, commands })`. Layout unchanged (column, paddingY/X, gap; `<scrollbox flexGrow stickyScroll stickyStart="bottom">` for children; `<InputBar>`; bottom status row with `<Spinner/>` + "esc to interrupt" when loading, right-side hint).
- [ ] **Step 2:** `bunx tsc` clean. Commit: `feat(cli): SessionShell layout`.

---

## Phase D — Dialogs

### Task D1: dialog-search-list + theme dialog

**Files:** Create `packages/cli/src/components/dialog-search-list.tsx`, `packages/cli/src/components/dialogs/theme-dialog.tsx`

- [ ] **Step 1:** Copy baocode `components/dialog-search-list.tsx` verbatim (generic searchable select list; deps: theme, keyboard-layer, @opentui). If it imports anything baocode-specific, minimize; else verbatim.
- [ ] **Step 2:** Copy baocode `components/dialogs/theme-dialog.tsx`, adapt to hynote: use `useTheme().allThemes` + `setTheme`, render each theme name (with a swatch of its `primary`), on select `setTheme(theme)` + `dialog.close()`.
- [ ] **Step 3:** `bunx tsc` clean. Commit: `feat(cli): dialog-search-list + theme dialog`.

### Task D2: template picker dialog

**Files:** Create `packages/cli/src/components/dialogs/template-dialog.tsx`

- [ ] **Step 1:** Create a dialog that takes `{ templates: { name: string; body: string }[]; onPick: (t) => void }` and renders them via `DialogSearchList` (searchable by name). On pick → `onPick(template)` + close. (Used by the manual-fallback flow.)
- [ ] **Step 2:** `bunx tsc` clean. Commit: `feat(cli): template picker dialog`.

---

## Phase E — Renderers + screen + router wiring

### Task E1: reply + stats renderers (themed, Option A)

**Files:** Replace `packages/cli/src/renderers/reply.tsx`, `packages/cli/src/renderers/stats.tsx`

- [ ] **Step 1:** Rewrite `renderers/reply.tsx` to render ONLY the pill tags + DIM confirm hint (the reply BODY is rendered by BotMessage as a markdown text part — see E2). Props `{ metadata: Record<string,string> }`:

```tsx
import { TextAttributes } from '@opentui/core';
import { useTheme } from '../providers/theme';

export function ReplyMeta({ metadata }: { metadata: Record<string, string> }) {
  const { colors } = useTheme();
  const entries = Object.entries(metadata);
  return (
    <box flexDirection="column" paddingX={3} gap={0}>
      {entries.length > 0 && (
        <box flexDirection="row" gap={1}>
          {entries.map(([k, v]) => (
            <text key={k} fg={colors.selection}>{`${k}: ${v}`}</text>
          ))}
        </box>
      )}
      <text attributes={TextAttributes.DIM}>Ctrl+E 编辑 · Ctrl+Y 确认并复制 · Ctrl+N 取消</text>
    </box>
  );
}
```

- [ ] **Step 2:** Rewrite `renderers/stats.tsx` to use theme colors (bars in `colors.primary`, labels default, counts DIM). Keep the panel/bar structure but swap hardcoded colors for `useTheme().colors`.
- [ ] **Step 3:** `bunx tsc` clean. Commit: `feat(cli): themed reply meta + stats renderers`.

### Task E2: Repl screen (integration)

**Files:** Create `packages/cli/src/screens/repl.tsx` (replaces the old `repl.tsx` logic)

Wire everything. Structure:
- Load skills on mount (`listSkills()`) → build `commands: Command[]` (`{ name, description }`) for the command menu.
- `messages` state: an array where each entry is `{ parts: HynoteMessagePart[]; reply?: ReplyResult; kind: 'stream' }`. During streaming, accumulate `events[]` → `eventsToParts` for the live message; on `result`: for `reply`, append the reply body as a `text` part AND stash the reply for `ReplyMeta` + confirm; for `stats` render `<StatsView>`; for `text`, the text part already streamed.
- Submit via `runSkillStream(input, skill, onEvent, signal)`; `onEvent` pushes to the current message's events and re-renders `<BotMessage parts streaming>`.
- `Ctrl+Y` confirm → `saveReply` + `clipboard.write` → `toast.show({ message: '已复制并保存', variant: 'success' })`.
- `Ctrl+E` edit / `Ctrl+N` cancel (existing logic).
- `ManualFallbackError` → `dialog.open({ title: '选择模板', children: <TemplatePicker templates onPick=… /> })`.
- `Ctrl+T` → `dialog.open({ title: '主题', children: <ThemeDialog/> })`.
- `Esc` while streaming → `abortRef.current?.abort()`.
- Layout: `<SessionShell onSubmit={submit} loading={streaming} interruptible commands={commands}>` wrapping `<Header/>` + the message list (`<BotMessage>` per message, `<ReplyMeta>`/`<StatsView>` as needed).

- [ ] **Step 1:** Write `screens/repl.tsx` implementing the above, reusing `runSkillStream`/`saveReply`/`listSkills`/`listTemplates`/`ManualFallbackError` from `../client`, `parseInput` from `../slash`, `eventsToParts`+`BotMessage` from `../components/bot-message`, `useToast`/`useDialog`/`useTheme` from providers, `ReplyMeta`/`StatsView`/`TemplatePicker`/`ThemeDialog`. (Full code authored in this step; mirror the current `repl.tsx` control flow for edit/confirm/manual-pick, swapping ProgressView→BotMessage, inline picker→dialog, status-line confirm→toast.)
- [ ] **Step 2:** `bunx tsc -p packages/cli/tsconfig.json --noEmit` → clean.
- [ ] **Step 3:** Commit: `feat(cli): Repl screen wired to new UI`.

### Task E3: RootLayout + router entry; delete old files

**Files:** Create `packages/cli/src/layouts/root-layout.tsx`; rewrite `packages/cli/src/index.tsx`; delete old `packages/cli/src/repl.tsx`, `packages/cli/src/renderers/progress.tsx`, `packages/cli/src/renderers/templates.tsx`

- [ ] **Step 1:** Create `layouts/root-layout.tsx`:

```tsx
import { Outlet } from 'react-router';
import { ThemeProvider } from '../providers/theme';
import { KeyboardLayerProvider } from '../providers/keyboard-layer';
import { ToastProvider } from '../providers/toast';
import { DialogProvider } from '../providers/dialog';
import { ThemeRoot } from './theme-root';

export function RootLayout() {
  return (
    <ThemeProvider>
      <KeyboardLayerProvider>
        <ToastProvider>
          <DialogProvider>
            <ThemeRoot>
              <Outlet />
            </ThemeRoot>
          </DialogProvider>
        </ToastProvider>
      </KeyboardLayerProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 2:** Rewrite `index.tsx` (shebang preserved):

```tsx
#!/usr/bin/env bun
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { RootLayout } from './layouts/root-layout';
import { Repl } from './screens/repl';

const router = createMemoryRouter([
  { path: '/', element: <RootLayout />, children: [{ index: true, element: <Repl /> }] },
]);

const renderer = await createCliRenderer({ targetFps: 60, exitOnCtrlC: false });
createRoot(renderer).render(<RouterProvider router={router} />);
```

- [ ] **Step 3:** Delete `packages/cli/src/repl.tsx`, `packages/cli/src/renderers/progress.tsx`, `packages/cli/src/renderers/templates.tsx` (superseded by BotMessage / dialogs). Keep `client.ts`, `slash.ts`, `client.test.ts`, `slash.test.ts`, `client-stream.test.ts`.
- [ ] **Step 4:** `bunx tsc -p packages/cli/tsconfig.json --noEmit` → clean. `bun build packages/cli/src/index.tsx --target bun --outdir /tmp/ae-cli` → success. `bun run test` → 40 pass.
- [ ] **Step 5:** Commit: `feat(cli): router shell + wire Repl; remove old REPL`.

---

## Phase F — Verify + commit drafts

### Task F1: live verification + finalize

- [ ] **Step 1:** Live run (real `.env`): `bun run dev:server` in one shell; in another `bun packages/cli/src/index.tsx`. Verify: ascii "Auto Email" header; `/` opens the skill command menu; `/reply` + paste email streams with `│ Thinking:` + `│ Template Fill:` lines then markdown reply + pill tags + DIM hint + `◉ deepseek › deepseek-chat`; `Ctrl+Y` shows a success toast; `Ctrl+T` opens the theme dialog and switching persists; `Esc` cancels mid-stream; a forced AI failure opens the template picker dialog.
- [ ] **Step 2:** If any @opentui element/prop drift is found, fix minimally (align to baocode usage). Re-run tsc + bundle.
- [ ] **Step 3:** Final gate: `bun run test` (40) + `bunx tsc -p packages/{shared,database,server,cli}/tsconfig.json --noEmit` (all exit 0).
- [ ] **Step 4:** Commit any remaining drafts (`theme.ts`, `providers/theme`, `bot-message.tsx`, `header.tsx`, `status-bar.tsx`) if not already committed in their phase tasks. Final commit: `feat(cli): Auto Email baocode-style UI complete`.

---

## Self-Review Notes (author checklist — applied)

- **Spec coverage:** theme system + persistence (A3); providers theme/keyboard-layer/toast/dialog (A3–A5); ascii-font "Auto Email" tiny (B1, spec §6); BotMessage exact rendering standard §3 (B2); InputBar no-mentions + command menu from skills (C1–C2); SessionShell + status row (C3, B1 status-bar); dialogs for theme + template (D1–D2); reply=markdown text part + pills + DIM hint / stats themed / Option A (E1–E2); toast on confirm, Esc cancel, manual-pick→dialog, Ctrl+T theme (E2); router skeleton single screen (E3); server untouched; existing 40 tests preserved (all phases).
- **Placeholder scan:** none — full code for new logic; ports specify exact source path + exact edits. "Copy baocode X, apply edits" is the deliberate porting method (baocode is the chosen standard), not deferred work.
- **Type consistency:** `Command` = `{name, description}` used identically in command-menu types/hook/index/input-bar. `HynoteMessagePart` + `eventsToParts` (bot-message) consumed by Repl. `LayerName` (Base/Command/Dialog, no Mention) consistent across keyboard-layer/dialog/command-menu/input-bar. `useTheme()` `{colors, allThemes, setTheme}` consistent. `ReplyMeta({metadata})` / `StatsView({panels})` signatures match Repl call sites.
