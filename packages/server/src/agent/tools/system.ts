import { tool } from 'ai';
import { z } from 'zod';

export function systemTools() {
  return {
    get_current_date: tool({
      description: 'Return the current date/time in UTC (today). Use this to know the current date for date-related queries or calculations.',
      inputSchema: z.object({}),
      execute: async () => {
        const d = new Date();
        return {
          date: d.toISOString().slice(0, 10),
          iso: d.toISOString(),
          timestamp: d.getTime(),
          dayOfWeek: d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
        };
      },
    }),
  };
}
