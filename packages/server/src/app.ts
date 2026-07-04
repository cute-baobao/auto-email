import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { RunRequestSchema, ReplyRecordSchema } from '@hynote/shared';
import { replies, type Db } from '@hynote/database';
import type { AiPort } from './agent/ai-port';
import { loadSkills } from './agent/skill';
import { buildToolRegistry, pickTools } from './agent/tools/index';
import { queryStats, UnknownDimensionError } from './services/stats';

export interface AppDeps {
  db: Db;
  templatesDir: string;
  skillsDir: string;
  ai: AiPort;
}

export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.get('/api/skills', async (c) => {
    const skills = await loadSkills(deps.skillsDir);
    return c.json(skills.map((s) => ({ name: s.name, description: s.description, output: s.output })));
  });

  app.post('/api/run', zValidator('json', RunRequestSchema), async (c) => {
    const { input, skill: skillName } = c.req.valid('json');
    // Error policy: filesystem/skill-loading failures (loadSkills, outside the
    // try) surface as 500. AI routing/run failures inside the try return 502
    // with { fallback: 'manual' } so the CLI can offer manual template selection.
    const skills = await loadSkills(deps.skillsDir);
    try {
      let chosen = skillName ? skills.find((s) => s.name === skillName) : undefined;
      if (!chosen && !skillName) {
        const name = await deps.ai.routeSkill(input, skills);
        chosen = skills.find((s) => s.name === name);
      }
      if (!chosen) return c.json({ error: `Unknown skill: ${skillName ?? '?'}`, fallback: 'manual' }, 400);
      const registry = buildToolRegistry({ templatesDir: deps.templatesDir, db: deps.db });
      const tools = pickTools(registry, chosen.allowedTools);
      const out = await deps.ai.runSkill(chosen, input, tools);
      return c.json(out);
    } catch (e) {
      return c.json({ error: (e as Error).message, fallback: 'manual' }, 502);
    }
  });

  app.post('/api/reply', zValidator('json', ReplyRecordSchema), async (c) => {
    const r = c.req.valid('json');
    const id = crypto.randomUUID();
    await deps.db.insert(replies).values({
      id,
      template: r.template,
      emailFrom: r.email_from,
      emailName: r.email_name,
      emailContent: r.email_content,
      replyContent: r.reply_content,
      metadata: JSON.stringify(r.metadata),
      confirmed: r.confirmed ? 1 : 0,
    });
    return c.json({ id });
  });

  app.get('/api/stats', async (c) => {
    const dimension = c.req.query('dimension');
    try {
      const panels = await queryStats(deps.db, dimension);
      return c.json({ type: 'stats', panels });
    } catch (e) {
      if (e instanceof UnknownDimensionError) {
        return c.json({ error: e.message }, 400);
      }
      throw e;
    }
  });

  return app;
}
