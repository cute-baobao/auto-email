import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import { RunRequestSchema, ReplyRecordSchema } from '@auto-email/shared';
import { replies, type Db } from '@auto-email/database';
import type { AiPort } from './agent/ai-port';
import { loadSkills } from './agent/skill';
import { buildToolRegistry, pickTools } from './agent/tools/index';
import { insertRow, queryRows } from './agent/tools/db';
import { queryStats, UnknownDimensionError } from './services/stats';
import { listTemplates, getTemplate } from './services/template';

export interface AppDeps {
  db: Db;
  templatesDir: string;
  skillsDir: string;
  ai: AiPort;
}

export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.get('/api/skills', async (c) => {
    const skills = await loadSkills(deps.skillsDir);
    return c.json(skills.map((s) => ({ name: s.name, description: s.description, output: s.output })));
  });

  app.get('/api/templates', async (c) => {
    const infos = await listTemplates(deps.templatesDir);
    const templates = await Promise.all(
      infos.map(async (t) => ({ name: t.name, body: await getTemplate(deps.templatesDir, t.name) })),
    );
    return c.json({ templates });
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

  app.post('/api/run/stream', zValidator('json', RunRequestSchema), async (c) => {
    const { input, skill: skillName } = c.req.valid('json');
    const skills = await loadSkills(deps.skillsDir);
    return streamSSE(c, async (stream) => {
      const ac = new AbortController();
      stream.onAbort(() => ac.abort());
      const started = Date.now();
      try {
        let chosen = skillName ? skills.find((s) => s.name === skillName) : undefined;
        if (!chosen && !skillName) {
          const name = await deps.ai.routeSkill(input, skills);
          chosen = skills.find((s) => s.name === name);
        }
        if (!chosen) {
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({ type: 'error', message: `Unknown skill: ${skillName ?? '?'}`, fallback: 'manual' }),
          });
          return;
        }
        await stream.writeSSE({
          event: 'skill-selected',
          data: JSON.stringify({ type: 'skill-selected', skill: chosen.name }),
        });
        const registry = buildToolRegistry({ templatesDir: deps.templatesDir, db: deps.db });
        const tools = pickTools(registry, chosen.allowedTools);
        for await (const ev of deps.ai.streamSkill(chosen, input, tools, ac.signal)) {
          await stream.writeSSE({ event: ev.type, data: JSON.stringify(ev) });
        }
        await stream.writeSSE({
          event: 'done',
          data: JSON.stringify({ type: 'done', durationMs: Date.now() - started }),
        });
      } catch (e) {
        if (ac.signal.aborted) return;
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ type: 'error', message: e instanceof Error ? e.message : String(e), fallback: 'manual' }),
        });
      }
    });
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

  app.post('/api/execute', async (c) => {
    const body = await c.req.json<{ action: string; table: string; values?: Record<string, string | number | null>; query?: Record<string, unknown> }>();
    try {
      if (body.action === 'db-insert') {
        const out = await insertRow(deps.db, body.table!, body.values ?? {});
        return c.json(out);
      }
      if (body.action === 'db-query') {
        const out = await queryRows(deps.db, body.table!, body.query as any ?? {});
        return c.json(out);
      }
      return c.json({ error: `Unknown action: ${body.action}` }, 400);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  return app;
}
