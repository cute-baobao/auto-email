import { describe, it, expect, vi, afterEach } from 'vitest';
import { probeServer } from '../src/server-boot';

afterEach(() => vi.restoreAllMocks());

describe('probeServer', () => {
  it('returns true when the server responds 2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    expect(await probeServer(3999)).toBe(true);
  });
  it('returns false when fetch rejects (nothing listening)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await probeServer(3999)).toBe(false);
  });
  it('returns false on a non-ok status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));
    expect(await probeServer(3999)).toBe(false);
  });
});
