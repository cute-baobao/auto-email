import { tool } from 'ai';
import { z } from 'zod';
import { listTemplates, getTemplate, fillTemplate } from '../../services/template';

export function templateTools(dir: string) {
  return {
    template_list: tool({
      description: 'List available reply templates with a short preview.',
      inputSchema: z.object({}),
      execute: async () => listTemplates(dir),
    }),
    template_get: tool({
      description: 'Get the raw content of a template by name.',
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => getTemplate(dir, name),
    }),
    template_fill: tool({
      description: 'Fill a template with variables (e.g. firstName).',
      inputSchema: z.object({
        name: z.string(),
        vars: z.record(z.string(), z.string()),
      }),
      execute: async ({ name, vars }) => fillTemplate(await getTemplate(dir, name), vars),
    }),
  };
}
