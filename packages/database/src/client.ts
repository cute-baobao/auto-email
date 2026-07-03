import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { schema, type Db } from './schema';

export interface D1Env {
  accountId: string;
  databaseId: string;
  token: string;
}

export function createD1Client(env: D1Env): Db {
  return drizzle(
    async (sqlText, params, method) => {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.accountId}/d1/database/${env.databaseId}/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sql: sqlText, params }),
        },
      );
      if (!res.ok) throw new Error(`D1 error ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as {
        result: { results: Record<string, unknown>[] }[];
      };
      const rows = data.result[0]!.results.map((r) => Object.values(r));
      return { rows: method === 'get' ? rows[0]! : rows };
    },
    { schema },
  ) as unknown as Db;
}
