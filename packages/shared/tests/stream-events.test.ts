import { describe, it, expect } from 'vitest';
import { RunStreamEventSchema } from '../src/schemas';

describe('RunStreamEventSchema', () => {
  it('parses a tool-call event', () => {
    const e = RunStreamEventSchema.parse({
      type: 'tool-call',
      toolCallId: 'c1',
      toolName: 'template_fill',
      args: { name: 'kol-media-support' },
    });
    expect(e.type).toBe('tool-call');
  });
  it('parses a result event carrying a RunResponse', () => {
    const e = RunStreamEventSchema.parse({
      type: 'result',
      result: { type: 'text', skill: 'reply', text: 'hi' },
    });
    expect(e.type).toBe('result');
  });
  it('rejects an unknown event type', () => {
    expect(() => RunStreamEventSchema.parse({ type: 'nope' })).toThrow();
  });
});
