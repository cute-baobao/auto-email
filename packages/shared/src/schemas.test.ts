import { describe, it, expect } from 'vitest';
import { RunRequestSchema, ReplyRecordSchema } from './schemas';

describe('RunRequestSchema', () => {
  it('accepts input with optional skill', () => {
    expect(RunRequestSchema.parse({ input: 'hi' })).toEqual({ input: 'hi' });
    expect(RunRequestSchema.parse({ input: 'hi', skill: 'reply' }).skill).toBe('reply');
  });
  it('rejects empty input', () => {
    expect(() => RunRequestSchema.parse({ input: '' })).toThrow();
  });
});

describe('ReplyRecordSchema', () => {
  it('defaults metadata and confirmed', () => {
    const r = ReplyRecordSchema.parse({ template: 't', reply_content: 'x' });
    expect(r.metadata).toEqual({});
    expect(r.confirmed).toBe(false);
  });
});
