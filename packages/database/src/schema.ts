import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

export const replies = sqliteTable('replies', {
  id: text('id').primaryKey(),
  template: text('template').notNull(),
  emailFrom: text('email_from'),
  emailName: text('email_name'),
  emailContent: text('email_content'),
  replyContent: text('reply_content'),
  metadata: text('metadata').default('{}'),
  confirmed: integer('confirmed').default(0),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const schema = { replies };

export type Db = BaseSQLiteDatabase<'async', unknown, typeof schema>;

export const CREATE_REPLIES_SQL = sql`
  CREATE TABLE IF NOT EXISTS replies (
    id            TEXT PRIMARY KEY,
    template      TEXT NOT NULL,
    email_from    TEXT,
    email_name    TEXT,
    email_content TEXT,
    reply_content TEXT,
    metadata      TEXT DEFAULT '{}',
    confirmed     INTEGER DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;
