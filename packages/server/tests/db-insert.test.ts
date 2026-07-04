import { describe, it, expect } from 'vitest';
import { createTestDb } from '@hynote/database/test';
import { replies } from '@hynote/database';
import { insertRow, queryRows } from '../src/agent/tools/db';

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

describe('queryRows', () => {
  it('selects all rows with default limit 20', async () => {
    const db = await createTestDb();
    await db.insert(replies).values([
      { id: 'a', template: 'partner', replyContent: '.' },
      { id: 'b', template: 'partner', replyContent: '.' },
    ]);
    const { rows } = await queryRows(db, 'replies', {});
    expect(rows).toHaveLength(2);
  });
  it('filters by template with an eq where clause', async () => {
    const db = await createTestDb();
    await db.insert(replies).values([
      { id: 'a', template: 'partner', replyContent: '.' },
      { id: 'b', template: 'kol-media-support', replyContent: '.' },
    ]);
    const { rows } = await queryRows(db, 'replies', {
      where: [{ column: 'template', op: '=', value: 'partner' }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.template).toBe('partner');
  });
  it('selects specific columns', async () => {
    const db = await createTestDb();
    await db.insert(replies).values({ id: 'a', template: 't', replyContent: '.' });
    const { rows } = await queryRows(db, 'replies', { columns: ['template'] });
    expect(rows[0]!).toHaveProperty('template');
    expect(rows[0]!).not.toHaveProperty('replyContent');
  });
  it('rejects a non-whitelisted table', async () => {
    const db = await createTestDb();
    await expect(queryRows(db, 'secrets', {})).rejects.toThrow();
  });
  it('rejects an unknown column', async () => {
    const db = await createTestDb();
    await expect(queryRows(db, 'replies', { columns: ['bogus'] })).rejects.toThrow(/column/i);
  });
  it('rejects a forbidden op', async () => {
    const db = await createTestDb();
    await expect(queryRows(db, 'replies', {
      where: [{ column: 'template', op: 'DROP', value: 'x' }],
    })).rejects.toThrow(/op/i);
  });
});
