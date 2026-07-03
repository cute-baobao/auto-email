import { tool } from 'ai';
import { z } from 'zod';
import type { Db } from '@hynote/database';
import { queryStats } from '../../services/stats';

export function dbTools(db: Db) {
  return {
    db_query_stats: tool({
      description:
        'Aggregate reply statistics. Omit dimension for the 3 preset panels; pass a metadata key to group by it.',
      inputSchema: z.object({ dimension: z.string().optional() }),
      execute: async ({ dimension }) => queryStats(db, dimension),
    }),
  };
}
