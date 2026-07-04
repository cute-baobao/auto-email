import { describe, it, expect } from 'vitest';
import { createTestDb } from '@hynote/database/test';
import { replies } from '@hynote/database';
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
