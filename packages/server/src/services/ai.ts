import { generateText, streamText, stepCountIs, type ModelMessage } from 'ai';
import { createDeepSeek, type DeepSeekLanguageModelOptions } from '@ai-sdk/deepseek';
import { z, type ZodType } from 'zod';
import type { AppConfig, SkillManifest, RunResponse, RunStreamEvent } from '@hynote/shared';
import type { AiPort } from '../agent/ai-port';

const DEEPSEEK_PROVIDER_OPTIONS = {
  deepseek: {
    thinking: { type: 'enabled' },
    reasoningEffort: 'high',
  } satisfies DeepSeekLanguageModelOptions,
};

function resolveModel(config: AppConfig) {
  const name = config.providers.default;
  if (name !== 'deepseek') {
    throw new Error(`Only the 'deepseek' provider is supported (got '${name}')`);
  }
  const p = config.providers[name];
  if (!p || typeof p === 'string') throw new Error(`Missing provider config: ${name}`);
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('Missing DEEPSEEK_API_KEY in environment');
  const ds = createDeepSeek({ apiKey });
  return ds(p.model);
}

const replyOutputSchema = z.object({
  template: z.string(),
  reply: z.string(),
  metadata: z.record(z.string(), z.any()).nullish(),
  email_name: z.string().nullish(),
  email_from: z.string().nullish(),
});

const statsOutputSchema = z.object({
  panels: z.array(
    z.object({
      title: z.string(),
      rows: z.array(z.object({ label: z.string(), count: z.coerce.number() })),
    }),
  ),
});

const REPLY_SHAPE =
  'Return ONLY this JSON shape: {"template":"<the template name you chose>","reply":"<the full filled-in reply text>","metadata":{"<key>":"<string value>"},"email_name":"<sender first name, optional>","email_from":"<sender email, optional>"}. metadata values MUST be strings; omit any field you cannot determine.';

const STATS_SHAPE =
  'Return ONLY this JSON shape using the db_query_stats results: {"panels":[{"title":"<dimension>","rows":[{"label":"<value>","count":<number>}]}]}.';

const JSON_INSTRUCTION =
  '\n\nRespond with ONLY a single valid JSON object. No prose, no explanations, no markdown code fences.';

// Extract the first {...} JSON object from a model response (tolerates ```json fences / prose).
function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1]! : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Model did not return a JSON object');
  }
  return JSON.parse(body.slice(start, end + 1));
}

// DeepSeek (and many OpenAI-compatible endpoints) do not support generateObject's
// json-schema response format, so we prompt for JSON and parse+validate ourselves.
async function generateJson<T>(
  model: ReturnType<typeof resolveModel>,
  schema: ZodType<T>,
  opts: { system?: string; prompt?: string; messages?: ModelMessage[] },
): Promise<T> {
  const { text } = await generateText(
    opts.messages
      ? { model, system: opts.system, messages: opts.messages, providerOptions: DEEPSEEK_PROVIDER_OPTIONS }
      : { model, system: opts.system, prompt: opts.prompt ?? '', providerOptions: DEEPSEEK_PROVIDER_OPTIONS },
  );
  return schema.parse(extractJsonObject(text));
}

export function createAiService(config: AppConfig): AiPort {
  const model = resolveModel(config);
  return {
    async routeSkill(input, skills) {
      const names = skills.map((s) => s.name);
      const { skill } = await generateJson(model, z.object({ skill: z.string() }), {
        system: 'You route a user message to the single best skill.',
        prompt:
          `Available skills:\n` +
          skills.map((s) => `- ${s.name}: ${s.description}`).join('\n') +
          `\n\nUser input:\n${input}\n\nReturn {"skill":"<one of: ${names.join(', ')}>"}.` +
          JSON_INSTRUCTION,
      });
      return names.includes(skill) ? skill : names[0]!;
    },
    async runSkill(skill, input, tools) {
      const gen = await generateText({
        model,
        system: skill.body,
        prompt: input,
        tools,
        stopWhen: stepCountIs(6),
        providerOptions: DEEPSEEK_PROVIDER_OPTIONS,
      });
      if (skill.output === 'text') {
        return { type: 'text', skill: skill.name, text: gen.text };
      }
      const finalMessages = (shape: string): ModelMessage[] => [
        ...gen.response.messages,
        { role: 'user', content: `${shape}${JSON_INSTRUCTION}` },
      ];
      if (skill.output === 'reply') {
        const parsed = await generateJson(model, replyOutputSchema, {
          system: skill.body,
          messages: finalMessages(REPLY_SHAPE),
        });
        const metadata: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed.metadata ?? {})) {
          if (v !== null && v !== undefined) metadata[k] = String(v);
        }
        return {
          type: 'reply',
          skill: skill.name,
          template: parsed.template,
          reply: parsed.reply,
          metadata,
          email_name: parsed.email_name ?? undefined,
          email_from: parsed.email_from ?? undefined,
        };
      }
      const parsed = await generateJson(model, statsOutputSchema, {
        system: skill.body,
        messages: finalMessages(STATS_SHAPE),
      });
      return { type: 'stats', skill: skill.name, panels: parsed.panels };
    },
    async *streamSkill(skill, input, tools, signal) {
      const result = streamText({
        model,
        system: skill.body,
        prompt: input,
        tools,
        stopWhen: stepCountIs(6),
        abortSignal: signal,
        providerOptions: DEEPSEEK_PROVIDER_OPTIONS,
      });

      for await (const part of result.fullStream) {
        if (part.type === 'reasoning-delta') {
          yield { type: 'reasoning-delta', text: part.text };
        } else if (part.type === 'text-delta') {
          yield { type: 'text-delta', text: part.text };
        } else if (part.type === 'tool-call') {
          yield {
            type: 'tool-call',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: part.input,
          };
        } else if (part.type === 'tool-result') {
          yield { type: 'tool-result', toolCallId: part.toolCallId, result: part.output };
        } else if (part.type === 'error') {
          throw part.error;
        }
      }

      const messages = (await result.response).messages;
      const fullText = await result.text;

      if (skill.output === 'text') {
        yield { type: 'result', result: { type: 'text', skill: skill.name, text: fullText } };
        return;
      }
      if (skill.output === 'reply') {
        const parsed = await generateJson(model, replyOutputSchema, {
          system: skill.body,
          messages: [...messages, { role: 'user', content: REPLY_SHAPE + JSON_INSTRUCTION }],
        });
        const metadata: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed.metadata ?? {})) {
          if (v !== null && v !== undefined) metadata[k] = String(v);
        }
        yield {
          type: 'result',
          result: {
            type: 'reply',
            skill: skill.name,
            template: parsed.template,
            reply: parsed.reply,
            metadata,
            email_name: parsed.email_name ?? undefined,
            email_from: parsed.email_from ?? undefined,
          },
        };
        return;
      }
      const parsed = await generateJson(model, statsOutputSchema, {
        system: skill.body,
        messages: [...messages, { role: 'user', content: STATS_SHAPE + JSON_INSTRUCTION }],
      });
      yield { type: 'result', result: { type: 'stats', skill: skill.name, panels: parsed.panels } };
    },
  };
}
