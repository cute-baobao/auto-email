import { describe, it, expect } from 'vitest';
import type { RunResponse } from '@hynote/shared';
import { shouldConfirm } from '../src/should-confirm';

const reply = (template: string): RunResponse => ({
  type: 'reply', skill: 'reply', template, reply: 'hi', metadata: {},
});

describe('shouldConfirm', () => {
  it('true for a reply with a non-empty template', () => {
    expect(shouldConfirm(reply('kol-media-support'))).toBe(true);
  });
  it('false for an empty template', () => {
    expect(shouldConfirm(reply(''))).toBe(false);
  });
  it('false for a whitespace-only template', () => {
    expect(shouldConfirm(reply('   '))).toBe(false);
  });
  it('false for stats and text results', () => {
    expect(shouldConfirm({ type: 'stats', skill: 'stats', panels: [] })).toBe(false);
    expect(shouldConfirm({ type: 'text', skill: 'x', text: 'hi' })).toBe(false);
  });
});
