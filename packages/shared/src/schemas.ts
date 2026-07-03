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
