import { describe, it, expect } from 'vitest';
import { parseInput } from '../src/slash';

describe('parseInput', () => {
  it('parses a slash command with trailing text', () => {
    expect(parseInput('/reply Hi Joanna')).toEqual({ skill: 'reply', text: 'Hi Joanna' });
  });
  it('parses a bare slash command', () => {
    expect(parseInput('/stats')).toEqual({ skill: 'stats', text: '' });
  });
  it('returns text only when no slash', () => {
    expect(parseInput('just some email text')).toEqual({ text: 'just some email text' });
  });
});
