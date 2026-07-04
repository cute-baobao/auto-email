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
