export interface ParsedInput {
  skill?: string;
  text: string;
}

export function parseInput(raw: string): ParsedInput {
  const t = raw.trim();
  if (t.startsWith('/')) {
    const [cmd, ...rest] = t.slice(1).split(/\s+/);
    return { skill: cmd, text: rest.join(' ').trim() };
  }
  return { text: t };
}
