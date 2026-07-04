import { describe, it, expect } from 'vitest';
import { createTestDb } from '@hynote/database/test';
import { replies } from '@hynote/database';
import { insertRow } from '../src/agent/tools/db';

describe('insertRow', () => {
  it('inserts a partner row into replies with an auto id', async () => {
    const db = await createTestDb();
    const out = await insertRow(db, 'replies', {
      template: 'partner', emailName: '787598579', metadata: '{"status":"applied"}',
    });
    expect(out.inserted).toBe(1);
    expect(out.id).toMatch(/[0-9a-f-]{36}/);
    const rows = await db.select().from(replies);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.emailName).toBe('787598579');
    expect(rows[0]!.template).toBe('partner');
  });
  it('rejects a non-whitelisted table', async () => {
    const db = await createTestDb();
    await expect(insertRow(db, 'secrets', { a: '1' })).rejects.toThrow();
  });
  it('rejects an unknown column', async () => {
    const db = await createTestDb();
    await expect(insertRow(db, 'replies', { template: 't', bogus: 'x' })).rejects.toThrow(/column/i);
  });
  it('rejects a missing NOT NULL column (template)', async () => {
    const db = await createTestDb();
    await expect(insertRow(db, 'replies', { emailName: 'x' })).rejects.toThrow(/template/);
  });
});
