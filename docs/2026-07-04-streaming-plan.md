# HyNote Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SSE streaming to the reply/run flow — live reasoning + tool-call progress ending in a structured `result` event — and switch the provider layer to deepseek-only so DeepSeek "thinking" reasoning can stream.

**Architecture:** New `POST /api/run/stream` (Hono `streamSSE`) drives a new `AiPort.streamSkill` that consumes `streamText().fullStream`, maps each part to a shared `RunStreamEvent`, then runs the existing structured JSON step and emits a final `result` event. The CLI consumes the SSE with `eventsource-parser`, renders a live progress area, and supports Esc cancel via `AbortController`. `POST /api/run` (non-streaming) stays for tests/programmatic/fallback.

**Tech Stack:** Bun, TypeScript, Hono `streamSSE`, `ai` v6 `streamText`, `@ai-sdk/deepseek` (replaces `@ai-sdk/openai-compatible`), `eventsource-parser`, Zod v4, `@opentui/react`, Vitest.

**Spec:** `docs/2026-07-04-streaming-design.md`. **Test layout:** per-package `tests/` (flat), imports via `../src/...`. **Run from repo root** unless noted.

**AI SDK v6 fullStream part fields (verified against `ai@6.0.219`):** `text-delta` → `.text`; `reasoning-delta` → `.text`; `tool-call` → `.toolCallId/.toolName/.input`; `tool-result` → `.toolCallId/.toolName/.output`; `error` → `.error`; `abort` → `.reason?`.

---

## Task 1: Shared `RunStreamEvent` schema + type (TDD)

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/schemas.ts`
- Test: `packages/shared/tests/stream-events.test.ts`

- [ ] **Step 1: Add the type to `packages/shared/src/types.ts`** (append)

```ts
export type RunStreamEvent =
  | { type: 'skill-selected'; skill: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool-result'; toolCallId: string; result: unknown }
  | { type: 'result'; result: RunResponse }
  | { type: 'error'; message: string; fallback?: 'manual' }
  | { type: 'done'; durationMs: number };
```

- [ ] **Step 2: Write the failing test `packages/shared/tests/stream-events.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { RunStreamEventSchema } from '../src/schemas';

describe('RunStreamEventSchema', () => {
  it('parses a tool-call event', () => {
    const e = RunStreamEventSchema.parse({
      type: 'tool-call',
      toolCallId: 'c1',
      toolName: 'template_fill',
      args: { name: 'kol-media-support' },
    });
    expect(e.type).toBe('tool-call');
  });
  it('parses a result event carrying a RunResponse', () => {
    const e = RunStreamEventSchema.parse({
      type: 'result',
      result: { type: 'text', skill: 'reply', text: 'hi' },
    });
    expect(e.type).toBe('result');
  });
  it('rejects an unknown event type', () => {
    expect(() => RunStreamEventSchema.parse({ type: 'nope' })).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test packages/shared/tests/stream-events.test.ts`
Expected: FAIL — `RunStreamEventSchema` not exported.

- [ ] **Step 4: Add the schema to `packages/shared/src/schemas.ts`** (append; `z` is already imported)

```ts
const RunResponseSchema = z.union([
  z.object({
    type: z.literal('reply'),
    skill: z.string(),
    template: z.string(),
    reply: z.string(),
    metadata: z.record(z.string(), z.string()),
    email_name: z.string().optional(),
    email_from: z.string().optional(),
  }),
  z.object({
    type: z.literal('stats'),
    skill: z.string(),
    panels: z.array(
      z.object({
        title: z.string(),
        rows: z.array(z.object({ label: z.string(), count: z.number() })),
      }),
    ),
  }),
  z.object({ type: z.literal('text'), skill: z.string(), text: z.string() }),
]);

export const RunStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('skill-selected'), skill: z.string() }),
  z.object({ type: z.literal('reasoning-delta'), text: z.string() }),
  z.object({ type: z.literal('text-delta'), text: z.string() }),
  z.object({
    type: z.literal('tool-call'),
    toolCallId: z.string(),
    toolName: z.string(),
    args: z.unknown(),
  }),
  z.object({ type: z.literal('tool-result'), toolCallId: z.string(), result: z.unknown() }),
  z.object({ type: z.literal('result'), result: RunResponseSchema }),
  z.object({ type: z.literal('error'), message: z.string(), fallback: z.literal('manual').optional() }),
  z.object({ type: z.literal('done'), durationMs: z.number() }),
]);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test packages/shared/tests/stream-events.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared && git commit -m "feat(shared): RunStreamEvent schema + type"
```

---

## Task 2: Provider refactor to deepseek-only

**Files:**
- Modify: `packages/server/package.json`
- Modify: `packages/server/src/services/ai.ts`
- Modify: `packages/server/src/config.ts`

- [ ] **Step 1: Swap the dependency in `packages/server/package.json`**

Remove `"@ai-sdk/openai-compatible": "^1.0.0"`. Add `"@ai-sdk/deepseek": "^2.0.35"`. Then:

Run: `bun install`
Expected: `@ai-sdk/deepseek` installed, `@ai-sdk/openai-compatible` removed.

- [ ] **Step 2: Rewrite `resolveModel` + provider options in `packages/server/src/services/ai.ts`**

Replace the import and `resolveModel`:

```ts
import { createDeepSeek, type DeepSeekLanguageModelOptions } from '@ai-sdk/deepseek';
```

```ts
const DEEPSEEK_PROVIDER_OPTIONS = {
  deepseek: {
    thinking: { type: 'enabled' },
    reasoningEffort: 'high',
  } satisfies DeepSeekLanguageModelOptions,
};

function resolveModel(config: AppConfig) {
  const name = config.providers.default;
  if (name !== 'deepseek') {
    throw new Error(`Only the 'deepseek' provider is supported (got '${name}')`);
  }
  const p = config.providers[name];
  if (!p || typeof p === 'string') throw new Error(`Missing provider config: ${name}`);
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('Missing DEEPSEEK_API_KEY in environment');
  const ds = createDeepSeek({ apiKey });
  return ds(p.model);
}
```

- [ ] **Step 3: Thread `providerOptions` into the existing `generateText` calls in `ai.ts`**

In `runSkill`, add `providerOptions: DEEPSEEK_PROVIDER_OPTIONS` to the `generateText({ model, system, prompt, tools, stopWhen })` call, and to the `generateJson` helper's internal `generateText` call. (The `generateJson` signature stays the same; just add `providerOptions: DEEPSEEK_PROVIDER_OPTIONS` inside its `generateText(...)`.)

- [ ] **Step 4: Drop the openai entry in `packages/server/src/config.ts` `DEFAULT_CONFIG`**

```ts
const DEFAULT_CONFIG = {
  providers: {
    default: 'deepseek',
    deepseek: { base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  },
};
```

- [ ] **Step 5: Typecheck + existing tests**

Run: `bunx tsc -p packages/server/tsconfig.json --noEmit`
Expected: exit 0. If `DeepSeekLanguageModelOptions` or `thinking`/`reasoningEffort` field names differ in the installed `@ai-sdk/deepseek@2.x`, inspect `node_modules/.bun/@ai-sdk+deepseek@*/node_modules/@ai-sdk/deepseek/dist/index.d.ts` and adjust the option keys minimally; keep the `providerOptions.deepseek` shape.

Run: `bun run test`
Expected: all pass (34) — the route tests fake `AiPort`, so this refactor doesn't change them.

- [ ] **Step 6: Commit**

```bash
git add packages/server && git commit -m "refactor(server): deepseek-only provider with thinking enabled"
```

---

## Task 3: `AiPort.streamSkill` + implementation

**Files:**
- Modify: `packages/server/src/agent/ai-port.ts`
- Modify: `packages/server/src/services/ai.ts`

> No unit test (LLM boundary; exercised via the faked route test in Task 4 and live in Task 7).

- [ ] **Step 1: Extend the interface in `packages/server/src/agent/ai-port.ts`**

```ts
import type { ToolSet } from 'ai';
import type { SkillManifest, RunResponse, RunStreamEvent } from '@hynote/shared';

export interface AiPort {
  routeSkill(input: string, skills: SkillManifest[]): Promise<string>;
  runSkill(skill: SkillManifest, input: string, tools: ToolSet): Promise<RunResponse>;
  streamSkill(
    skill: SkillManifest,
    input: string,
    tools: ToolSet,
    signal: AbortSignal,
  ): AsyncIterable<RunStreamEvent>;
}
```

- [ ] **Step 2: Implement `streamSkill` in `packages/server/src/services/ai.ts`**

Add `streamText` to the `ai` import (`import { generateText, streamText, stepCountIs, type ModelMessage } from 'ai';`). Add `RunStreamEvent` to the shared type import. Inside `createAiService`'s returned object, add:

```ts
async *streamSkill(skill, input, tools, signal) {
  const result = streamText({
    model,
    system: skill.body,
    prompt: input,
    tools,
    stopWhen: stepCountIs(6),
    abortSignal: signal,
    providerOptions: DEEPSEEK_PROVIDER_OPTIONS,
  });

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-delta') {
      yield { type: 'reasoning-delta', text: part.text };
    } else if (part.type === 'text-delta') {
      yield { type: 'text-delta', text: part.text };
    } else if (part.type === 'tool-call') {
      yield { type: 'tool-call', toolCallId: part.toolCallId, toolName: part.toolName, args: part.input };
    } else if (part.type === 'tool-result') {
      yield { type: 'tool-result', toolCallId: part.toolCallId, result: part.output };
    } else if (part.type === 'error') {
      throw part.error;
    }
  }

  const messages = (await result.response).messages;
  const fullText = await result.text;

  if (skill.output === 'text') {
    yield { type: 'result', result: { type: 'text', skill: skill.name, text: fullText } };
    return;
  }
  if (skill.output === 'reply') {
    const parsed = await generateJson(model, replyOutputSchema, {
      system: skill.body,
      messages: [...messages, { role: 'user', content: REPLY_SHAPE + JSON_INSTRUCTION }],
    });
    const metadata: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.metadata ?? {})) {
      if (v !== null && v !== undefined) metadata[k] = String(v);
    }
    yield {
      type: 'result',
      result: {
        type: 'reply',
        skill: skill.name,
        template: parsed.template,
        reply: parsed.reply,
        metadata,
        email_name: parsed.email_name ?? undefined,
        email_from: parsed.email_from ?? undefined,
      },
    };
    return;
  }
  const parsed = await generateJson(model, statsOutputSchema, {
    system: skill.body,
    messages: [...messages, { role: 'user', content: STATS_SHAPE + JSON_INSTRUCTION }],
  });
  yield { type: 'result', result: { type: 'stats', skill: skill.name, panels: parsed.panels } };
},
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc -p packages/server/tsconfig.json --noEmit`
Expected: exit 0. If `result.response`/`result.text` accessors differ in `ai@6.0.219` (they are Promises on `StreamTextResult`), inspect the d.ts and adjust; the intent is "await the final messages + text after the stream drains."

- [ ] **Step 4: Commit**

```bash
git add packages/server && git commit -m "feat(server): AiPort.streamSkill via streamText fullStream"
```

---

## Task 4: `POST /api/run/stream` route (TDD, faked streamSkill)

**Files:**
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/tests/app.test.ts`

- [ ] **Step 1: Extend the `fakeAi` helper in `packages/server/tests/app.test.ts`**

Add a `streamSkill` to the fake so it satisfies `AiPort`:

```ts
async *streamSkill(skill) {
  yield { type: 'skill-selected', skill: skill.name };
  yield { type: 'tool-call', toolCallId: 't1', toolName: 'template_list', args: {} };
  yield { type: 'tool-result', toolCallId: 't1', result: [{ name: 'kol-media-support' }] };
  if (skill.output === 'reply') {
    yield { type: 'result', result: { type: 'reply', skill: skill.name, template: 'kol-media-support', reply: 'Hi Alex!', metadata: { platform: 'YouTube' }, email_name: 'Alex' } };
  } else {
    yield { type: 'result', result: { type: 'text', skill: skill.name, text: 'ok' } };
  }
},
```

- [ ] **Step 2: Write the failing test** (append to `packages/server/tests/app.test.ts`)

```ts
describe('POST /api/run/stream', () => {
  it('streams progress events and a final result as SSE', async () => {
    const app = createApp({ db, templatesDir, skillsDir, ai: fakeAi() });
    const res = await app.request('/api/run/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'promote on youtube', skill: 'reply' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('event: skill-selected');
    expect(text).toContain('event: tool-call');
    expect(text).toContain('event: result');
    expect(text).toContain('event: done');
    expect(text).toContain('kol-media-support');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test packages/server/tests/app.test.ts`
Expected: FAIL — 404 (route missing).

- [ ] **Step 4: Add the route to `packages/server/src/app.ts`**

Add import at top: `import { streamSSE } from 'hono/streaming';`. Add the route (after `/api/run`):

```ts
app.post('/api/run/stream', zValidator('json', RunRequestSchema), async (c) => {
  const { input, skill: skillName } = c.req.valid('json');
  const skills = await loadSkills(deps.skillsDir);
  return streamSSE(c, async (stream) => {
    const ac = new AbortController();
    stream.onAbort(() => ac.abort());
    const started = Date.now();
    try {
      let chosen = skillName ? skills.find((s) => s.name === skillName) : undefined;
      if (!chosen && !skillName) {
        const name = await deps.ai.routeSkill(input, skills);
        chosen = skills.find((s) => s.name === name);
      }
      if (!chosen) {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ type: 'error', message: `Unknown skill: ${skillName ?? '?'}`, fallback: 'manual' }),
        });
        return;
      }
      await stream.writeSSE({
        event: 'skill-selected',
        data: JSON.stringify({ type: 'skill-selected', skill: chosen.name }),
      });
      const registry = buildToolRegistry({ templatesDir: deps.templatesDir, db: deps.db });
      const tools = pickTools(registry, chosen.allowedTools);
      for await (const ev of deps.ai.streamSkill(chosen, input, tools, ac.signal)) {
        await stream.writeSSE({ event: ev.type, data: JSON.stringify(ev) });
      }
      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({ type: 'done', durationMs: Date.now() - started }),
      });
    } catch (e) {
      if (ac.signal.aborted) return;
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ type: 'error', message: (e as Error).message, fallback: 'manual' }),
      });
    }
  });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test packages/server/tests/app.test.ts`
Expected: PASS (the new stream test + all prior app tests).

- [ ] **Step 6: Full suite + typecheck**

Run: `bun run test` (all pass) and `bunx tsc -p packages/server/tsconfig.json --noEmit` (exit 0).

- [ ] **Step 7: Commit**

```bash
git add packages/server && git commit -m "feat(server): POST /api/run/stream SSE route with abort"
```

---

## Task 5: CLI `runSkillStream` client (TDD, mocked SSE stream)

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/src/client.ts`
- Test: `packages/cli/tests/client-stream.test.ts`

- [ ] **Step 1: Add the dependency to `packages/cli/package.json`**

Add `"eventsource-parser": "^3.1.0"` to dependencies. Then:

Run: `bun install`
Expected: installed.

- [ ] **Step 2: Write the failing test `packages/cli/tests/client-stream.test.ts`**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { runSkillStream } from '../src/client';
import type { RunStreamEvent } from '@hynote/shared';

afterEach(() => vi.restoreAllMocks());

function sseResponse(lines: string[]): Response {
  const body = lines.join('');
  return new Response(new Blob([body]).stream(), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('runSkillStream', () => {
  it('emits parsed events and resolves the final RunResponse', async () => {
    const sse = sseResponse([
      `event: skill-selected\ndata: ${JSON.stringify({ type: 'skill-selected', skill: 'reply' })}\n\n`,
      `event: text-delta\ndata: ${JSON.stringify({ type: 'text-delta', text: 'hi' })}\n\n`,
      `event: result\ndata: ${JSON.stringify({ type: 'result', result: { type: 'text', skill: 'reply', text: 'done' } })}\n\n`,
      `event: done\ndata: ${JSON.stringify({ type: 'done', durationMs: 5 })}\n\n`,
    ]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(sse);
    const seen: RunStreamEvent[] = [];
    const result = await runSkillStream('hi', 'reply', (e) => seen.push(e), new AbortController().signal);
    expect(seen.map((e) => e.type)).toEqual(['skill-selected', 'text-delta', 'result', 'done']);
    expect(result).toEqual({ type: 'text', skill: 'reply', text: 'done' });
  });

  it('throws ManualFallbackError on an error event with fallback', async () => {
    const sse = sseResponse([
      `event: error\ndata: ${JSON.stringify({ type: 'error', message: 'AI down', fallback: 'manual' })}\n\n`,
    ]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(sse);
    await expect(
      runSkillStream('x', 'reply', () => {}, new AbortController().signal),
    ).rejects.toThrow('AI down');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test packages/cli/tests/client-stream.test.ts`
Expected: FAIL — `runSkillStream` not exported.

- [ ] **Step 4: Add `runSkillStream` to `packages/cli/src/client.ts`**

Add imports at top: `import { EventSourceParserStream } from 'eventsource-parser/stream';` and add `RunStreamEvent`, `RunStreamEventSchema` to the shared imports (`RunStreamEventSchema` is a value, import from `@hynote/shared`). Then:

```ts
export async function runSkillStream(
  input: string,
  skill: string | undefined,
  onEvent: (e: RunStreamEvent) => void,
  signal: AbortSignal,
): Promise<RunResponse> {
  const res = await fetch(`${BASE}/api/run/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(skill ? { input, skill } : { input }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

  const stream = res.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream());

  let final: RunResponse | undefined;
  for await (const chunk of stream) {
    const ev = RunStreamEventSchema.parse(JSON.parse(chunk.data));
    onEvent(ev);
    if (ev.type === 'result') final = ev.result;
    if (ev.type === 'error') {
      if (ev.fallback === 'manual') throw new ManualFallbackError(ev.message);
      throw new Error(ev.message);
    }
  }
  if (!final) throw new Error('Stream ended without a result');
  return final;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test packages/cli/tests/client-stream.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck + full suite**

Run: `bunx tsc -p packages/cli/tsconfig.json --noEmit` (exit 0; iterating `EventSourceParserStream` output — if TS complains about async iteration of the web stream, add `for await (const chunk of stream as any)` is NOT allowed; instead confirm `lib`/types — the repo's `@types/node` provides `ReadableStream` async iteration. If needed, read via a reader loop. Keep behavior identical.) and `bun run test` (all pass).

- [ ] **Step 7: Commit**

```bash
git add packages/cli && git commit -m "feat(cli): runSkillStream SSE client"
```

---

## Task 6: CLI REPL streaming UI + cancel (manual verification)

**Files:**
- Create: `packages/cli/src/renderers/progress.tsx`
- Modify: `packages/cli/src/repl.tsx`

> Terminal UI — verified by typecheck + bundle (no TTY). Keep logic thin.

- [ ] **Step 1: Create `packages/cli/src/renderers/progress.tsx`**

```tsx
import { TextAttributes } from '@opentui/core';

export interface ProgressState {
  reasoning: string;
  text: string;
  tools: { name: string; done: boolean }[];
}

export function ProgressView({ state }: { state: ProgressState }) {
  const hasAny = state.reasoning || state.text || state.tools.length > 0;
  if (!hasAny) return null;
  return (
    <box flexDirection="column" paddingX={1}>
      {state.reasoning ? (
        <box borderStyle="single" borderColor="gray" paddingX={1}>
          <text fg="gray" attributes={TextAttributes.DIM}>{`Thinking: ${state.reasoning}`}</text>
        </box>
      ) : null}
      {state.tools.map((t, i) => (
        <text key={`${i}-${t.name}`} fg="cyan">{`▸ ${t.name}${t.done ? ' ✓' : ' …'}`}</text>
      ))}
      {state.text ? <text fg="white">{state.text}</text> : null}
    </box>
  );
}
```

- [ ] **Step 2: Wire streaming into `packages/cli/src/repl.tsx`**

Changes (keep all existing edit/confirm/manual-pick logic):
1. Imports: add `runSkillStream` to the `./client` import; `import { ProgressView, type ProgressState } from './renderers/progress';`; add `RunStreamEvent` to the `@hynote/shared` type import.
2. State + refs:

```ts
const [progress, setProgress] = useState<ProgressState>({ reasoning: '', text: '', tools: [] });
const abortRef = useRef<AbortController | null>(null);
const [streaming, setStreaming] = useState(false);
```

3. Replace the `runSkill(...)` call inside `submitRaw`'s non-stats branch with a streaming version:

```ts
setStatus('agent 处理中…（Esc 取消）');
setProgress({ reasoning: '', text: '', tools: [] });
setStreaming(true);
const ac = new AbortController();
abortRef.current = ac;
try {
  const res = await runSkillStream(text || trimmed, skill, (ev: RunStreamEvent) => {
    setProgress((p) => {
      if (ev.type === 'reasoning-delta') return { ...p, reasoning: p.reasoning + ev.text };
      if (ev.type === 'text-delta') return { ...p, text: p.text + ev.text };
      if (ev.type === 'tool-call') return { ...p, tools: [...p.tools, { name: ev.toolName, done: false }] };
      if (ev.type === 'tool-result') {
        const tools = [...p.tools];
        for (let i = tools.length - 1; i >= 0; i--) if (!tools[i]!.done) { tools[i] = { ...tools[i]!, done: true }; break; }
        return { ...p, tools };
      }
      return p;
    });
  }, ac.signal);
  setStreaming(false);
  setProgress({ reasoning: '', text: '', tools: [] });
  setResult(res);
  if (res.type === 'reply') { lastInputRef.current = text || trimmed; setStatus(CONFIRM_HINT); }
  else setStatus(HINT);
} catch (err) {
  setStreaming(false);
  setProgress({ reasoning: '', text: '', tools: [] });
  if ((err as Error).name === 'AbortError') { setStatus('已取消'); return; }
  throw err;   // let the existing catch below handle ManualFallbackError / errors
}
```

Note: wrap so the existing `catch (err)` (ManualFallbackError → manual pick, else error status) still applies. Simplest: keep the outer `try/catch` in `submitRaw`; put the streaming block inside it and `throw err` for non-abort errors so the outer catch runs. Ensure `AbortError` is swallowed before re-throw.

4. Esc cancel — extend the `useKeyboard` handler: at the top, if `streaming` and `key.name === 'escape'`, `abortRef.current?.abort()` and return.
5. Render `<ProgressView state={progress} />` inside the `<scrollbox>` (below the log, above the result panels), shown while `streaming`.

- [ ] **Step 3: Typecheck + bundle smoke**

Run: `bunx tsc -p packages/cli/tsconfig.json --noEmit`
Expected: exit 0 (no `any`; if `@opentui` prop types differ, adjust minimally).

Run: `bun build packages/cli/src/index.tsx --target bun --outdir /tmp/hynote-cli-build`
Expected: success.

- [ ] **Step 4: Full suite (unchanged)**

Run: `bun run test`
Expected: all pass (CLI has no new UI tests; must not break).

- [ ] **Step 5: Commit**

```bash
git add packages/cli && git commit -m "feat(cli): streaming progress area + Esc cancel"
```

---

## Task 7: Live verification (deepseek thinking + tools) + docs

**Files:**
- Modify: `.env.example`
- Modify: `docs/2026-07-03-hynote-email-agent-design.md` (provider note)

- [ ] **Step 1: Live-test the stream endpoint (requires real `.env`)**

```bash
(bun packages/server/src/index.ts >/tmp/hynote-srv.log 2>&1 &) && sleep 3 && \
curl -sN --max-time 120 -X POST localhost:3000/api/run/stream \
  -H 'content-type: application/json' \
  -d '{"skill":"reply","input":"Hi Joanna, I am Alex, I want to promote HyNote on my YouTube channel next month."}' ; \
pkill -f "packages/server/src/index.ts"
```
Expected: a sequence of SSE lines — `event: skill-selected`, ideally `event: reasoning-delta` (thinking), `event: tool-call` (template_list/template_fill), `event: tool-result`, then `event: result` with the filled reply, then `event: done`.

- [ ] **Step 2: Branch on the result**

- If reasoning-delta AND tool-call both appear and `result` is correct → thinking+tools coexist. Done.
- If it ERRORS (thinking incompatible with tools) → in `packages/server/src/services/ai.ts`, gate thinking off for tool-using runs: pass `providerOptions: DEEPSEEK_PROVIDER_OPTIONS` only when `Object.keys(tools).length === 0`, else omit it (no reasoning, tools work). Re-run Step 1 to confirm `tool-call` + `result` now succeed (reasoning simply absent). Document the outcome in the design doc's provider note.

- [ ] **Step 3: Update `.env.example`** — mark `OPENAI_API_KEY` as unused:

```
# OPENAI_API_KEY is unused (provider is deepseek-only)
```
(delete the `OPENAI_API_KEY=` line or comment it.)

- [ ] **Step 4: Add a provider note to `docs/2026-07-03-hynote-email-agent-design.md`** §9 — one line: provider is deepseek-only via `@ai-sdk/deepseek` with thinking; streaming uses `/api/run/stream`. Record whether thinking+tools coexisted (from Step 2).

- [ ] **Step 5: Final gate + commit**

Run: `bun run test` (all pass) and `bunx tsc -p packages/{shared,database,server,cli}/tsconfig.json --noEmit` (each exit 0).

```bash
git add -A && git commit -m "docs: deepseek-only provider note; live-verify streaming"
```

---

## Self-Review Notes (author checklist — applied)

- **Spec coverage:** RunStreamEvent protocol (Task 1); deepseek-only provider + thinking (Task 2); streamSkill via fullStream + final result (Task 3); `/api/run/stream` SSE + abort (Task 4); client `runSkillStream` + eventsource-parser + ManualFallbackError (Task 5); REPL progress area + Esc cancel + progress renderer (Task 6); live reasoning+tools verification with documented fallback, `.env`/docs (Task 7). `/api/run` untouched → 34 existing tests preserved.
- **Placeholder scan:** none — all steps carry real code; the "verify against installed d.ts / adjust minimally" notes target external SDK field-name drift (`@ai-sdk/deepseek` options, `StreamTextResult` accessors, web-stream async iteration), not deferred work.
- **Type consistency:** `RunStreamEvent` fields identical across schema (Task 1), streamSkill emit (Task 3), fake + route (Task 4), client parse (Task 5), REPL handler (Task 6): `tool-call` uses `args`, `tool-result` uses `result`, deltas use `text`. `AiPort.streamSkill(skill, input, tools, signal)` signature matches its impl, the fake, and the route call site.
