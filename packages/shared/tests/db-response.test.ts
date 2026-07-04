import { describe, it, expect } from 'vitest';
import { RunResponseSchema } from '../src/schemas';

describe('RunResponse db variants', () => {
  it('parses a db-insert response', () => {
    const r = RunResponseSchema.parse({
      type: 'db-insert', table: 'replies', values: { template: 'partner' },
    });
    expect(r.type).toBe('db-insert');
  });
  it('parses a db-query response with a result', () => {
    const r = RunResponseSchema.parse({
      type: 'db-query', table: 'replies', query: { columns: ['template'] },
      result: [{ template: 'partner' }],
    });
    expect(r.type).toBe('db-query');
  });
});
