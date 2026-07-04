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
