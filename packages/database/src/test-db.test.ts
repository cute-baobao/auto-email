import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-db';
import { replies } from './schema';

describe('createTestDb', () => {
  it('creates an in-memory db with the replies table', async () => {
    const db = await createTestDb();
    await db.insert(replies).values({ id: '1', template: 't', replyContent: 'hi' });
    const rows = await db.select().from(replies);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.template).toBe('t');
  });
});
