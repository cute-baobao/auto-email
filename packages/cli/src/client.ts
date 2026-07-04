import type { RunResponse, ReplyRecord, SkillSummary, StatsPanel, RunStreamEvent } from '@auto-email/shared';
import { RunStreamEventSchema } from '@auto-email/shared';
import { EventSourceParserStream } from 'eventsource-parser/stream';

const BASE = process.env.AUTO_EMAIL_SERVER ?? `http://localhost:${process.env.AUTO_EMAIL_PORT ?? 45678}`;

export class ManualFallbackError extends Error {}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function runSkill(input: string, skill?: string): Promise<RunResponse> {
  const res = await fetch(`${BASE}/api/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(skill ? { input, skill } : { input }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; fallback?: string };
    if (body.fallback === 'manual') throw new ManualFallbackError(body.error ?? 'AI unavailable');
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<RunResponse>;
}

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

export async function listTemplates(): Promise<{ name: string; body: string }[]> {
  const { templates } = await json<{ templates: { name: string; body: string }[] }>(
    await fetch(`${BASE}/api/templates`),
  );
  return templates;
}
