import { generateText, generateObject, stepCountIs, type ToolSet } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { z } from 'zod';
import type { AppConfig, SkillManifest, RunResponse } from '@hynote/shared';
import type { AiPort } from '../agent/ai-port';

function resolveModel(config: AppConfig) {
  const name = config.providers.default;
  const p = config.providers[name];
  if (!p || typeof p === 'string') throw new Error(`Missing provider config: ${name}`);
  const apiKey = process.env[`${name.toUpperCase()}_API_KEY`];
  if (!apiKey) throw new Error(`Missing ${name.toUpperCase()}_API_KEY in environment`);
  const provider = createOpenAICompatible({ name, baseURL: p.base_url, apiKey });
  return provider(p.model);
}

const replyOutputSchema = z.object({
  template: z.string(),
  reply: z.string(),
  metadata: z.record(z.string(), z.string()),
  email_name: z.string().optional(),
  email_from: z.string().optional(),
});

const statsOutputSchema = z.object({
  panels: z.array(
    z.object({
      title: z.string(),
      rows: z.array(z.object({ label: z.string(), count: z.number() })),
    }),
  ),
});

export function createAiService(config: AppConfig): AiPort {
  const model = resolveModel(config);
  return {
    async routeSkill(input, skills) {
      const names = skills.map((s) => s.name) as [string, ...string[]];
      const { object } = await generateObject({
        model,
        schema: z.object({ skill: z.enum(names) }),
        prompt:
          `Available skills:\n` +
          skills.map((s) => `- ${s.name}: ${s.description}`).join('\n') +
          `\n\nUser input:\n${input}\n\nChoose the single best skill.`,
      });
      return object.skill;
    },
    async runSkill(skill, input, tools) {
      const gen = await generateText({
        model,
        system: skill.body,
        prompt: input,
        tools,
        stopWhen: stepCountIs(6),
      });
      if (skill.output === 'text') {
        return { type: 'text', skill: skill.name, text: gen.text };
      }
      const schema = skill.output === 'reply' ? replyOutputSchema : statsOutputSchema;
      const { object } = await generateObject({
        model,
        schema,
        messages: [
          ...gen.response.messages,
          { role: 'user', content: 'Produce the final structured result as JSON.' },
        ],
      });
      return { type: skill.output, skill: skill.name, ...object } as RunResponse;
    },
  };
}
