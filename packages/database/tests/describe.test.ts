import { describe, it, expect } from 'vitest';
import { describeSchema, WRITABLE_TABLES } from '../src/describe';

describe('describeSchema', () => {
  it('lists the replies table with its TS-named columns', () => {
    const s = describeSchema();
    expect(s).toContain('Table replies:');
    expect(s).toContain('template');
    expect(s).toContain('emailName');
    expect(s).toContain('createdAt');
  });
  it('exposes replies in the writable whitelist', () => {
    expect(Object.keys(WRITABLE_TABLES)).toContain('replies');
  });
});
