import type { RunResponse, ReplyRecord, SkillSummary, StatsPanel } from '@hynote/shared';

const BASE = process.env.HYNOTE_SERVER ?? `http://localhost:${process.env.HYNOTE_PORT ?? 3000}`;

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function runSkill(input: string, skill?: string): Promise<RunResponse> {
  const res = await fetch(`${BASE}/api/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(skill ? { input, skill } : { input }),
  });
  return json<RunResponse>(res);
}

export async function listSkills(): Promise<SkillSummary[]> {
  return json<SkillSummary[]>(await fetch(`${BASE}/api/skills`));
}

export async function saveReply(record: ReplyRecord): Promise<{ id: string }> {
  const res = await fetch(`${BASE}/api/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(record),
  });
  return json<{ id: string }>(res);
}

export async function getStats(dimension?: string): Promise<{ panels: StatsPanel[] }> {
  const q = dimension ? `?dimension=${encodeURIComponent(dimension)}` : '';
  return json<{ panels: StatsPanel[] }>(await fetch(`${BASE}/api/stats${q}`));
}
