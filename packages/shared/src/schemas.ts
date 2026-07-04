import { z } from 'zod';

export const RunRequestSchema = z.object({
  input: z.string().min(1),
  skill: z.string().optional(),
});

export const ReplyRecordSchema = z.object({
  template: z.string().min(1),
  email_from: z.string().optional(),
  email_name: z.string().optional(),
  email_content: z.string().optional(),
  reply_content: z.string().min(1),
  metadata: z.record(z.string(), z.string()).default({}),
  confirmed: z.boolean().default(false),
});

export const ProviderConfigSchema = z.object({
  base_url: z.string().url(),
  model: z.string().min(1),
});

export const AppConfigSchema = z.object({
  providers: z
    .object({ default: z.string().min(1) })
    .catchall(ProviderConfigSchema),
});

export const RunResponseSchema = z.union([
  z.object({
    type: z.literal('reply'),
    skill: z.string(),
    template: z.string(),
    reply: z.string(),
    metadata: z.record(z.string(), z.string()),
    email_name: z.string().optional(),
    email_from: z.string().optional(),
  }),
  z.object({
    type: z.literal('stats'),
    skill: z.string(),
    panels: z.array(
      z.object({
        title: z.string(),
        rows: z.array(z.object({ label: z.string(), count: z.number() })),
      }),
    ),
  }),
  z.object({ type: z.literal('text'), skill: z.string(), text: z.string() }),
  z.object({
    type: z.literal('db-insert'),
    table: z.string(),
    values: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal('db-query'),
    table: z.string(),
    query: z.object({
      columns: z.array(z.string()).optional(),
      where: z.array(z.object({
        column: z.string(), op: z.string(), value: z.unknown(),
      })).optional(),
      orderBy: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    result: z.array(z.record(z.string(), z.unknown())).optional(),
  }),
]);

export const RunStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('skill-selected'), skill: z.string() }),
  z.object({ type: z.literal('reasoning-delta'), text: z.string() }),
  z.object({ type: z.literal('text-delta'), text: z.string() }),
  z.object({
    type: z.literal('tool-call'),
    toolCallId: z.string(),
    toolName: z.string(),
    args: z.unknown(),
  }),
  z.object({ type: z.literal('tool-result'), toolCallId: z.string(), result: z.unknown() }),
  z.object({ type: z.literal('result'), result: RunResponseSchema }),
  z.object({ type: z.literal('error'), message: z.string(), fallback: z.literal('manual').optional() }),
  z.object({ type: z.literal('done'), durationMs: z.number() }),
]);
