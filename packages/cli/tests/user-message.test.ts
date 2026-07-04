import { describe, it, expect } from 'vitest';
import { previewInput } from '../src/components/user-message';

describe('previewInput', () => {
  it('returns short single-line input unchanged', () => {
    expect(previewInput('Hi Joanna')).toBe('Hi Joanna');
  });
  it('keeps first 6 lines and appends … when longer', () => {
    const input = Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join('\n');
    const out = previewInput(input);
    expect(out.startsWith('line1\nline2\nline3\nline4\nline5\nline6')).toBe(true);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toContain('line7');
  });
  it('caps a long single line at 300 chars + …', () => {
    const input = 'a'.repeat(500);
    const out = previewInput(input);
    expect(out.length).toBe(301); // 300 chars + …
    expect(out.endsWith('…')).toBe(true);
  });
  it('normalizes CRLF', () => {
    expect(previewInput('a\r\nb')).toBe('a\nb');
  });
});
