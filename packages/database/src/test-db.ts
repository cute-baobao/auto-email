import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { CREATE_REPLIES_SQL, schema, type Db } from './schema';

export async function createTestDb(): Promise<Db> {
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema }) as unknown as Db;
  await db.run(CREATE_REPLIES_SQL);
  return db;
}
