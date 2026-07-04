import type { ToolSet } from 'ai';
import type { SkillManifest, RunResponse, RunStreamEvent } from '@hynote/shared';

export interface AiPort {
  routeSkill(input: string, skills: SkillManifest[]): Promise<string>;
  runSkill(skill: SkillManifest, input: string, tools: ToolSet): Promise<RunResponse>;
  streamSkill(
    skill: SkillManifest,
    input: string,
    tools: ToolSet,
    signal: AbortSignal,
  ): AsyncIterable<RunStreamEvent>;
}
