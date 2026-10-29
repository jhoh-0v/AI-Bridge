import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const profiles = sqliteTable('profiles', {
  userId: text('user_id').primaryKey(), data: text('data').notNull(), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull()
});
export const attempts = sqliteTable('attempts', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), taskId: text('task_id').notNull(),
  data: text('data').notNull(), step: integer('step').notNull().default(0), revision: integer('revision').notNull().default(0),
  completed: integer('completed').notNull().default(0), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull()
}, t => [index('attempt_owner').on(t.userId)]);
export const generations = sqliteTable('generations', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), attemptId: text('attempt_id').notNull(),
  requestId: text('request_id').notNull(), phase: text('phase').notNull(), parentId: text('parent_id'),
  status: text('status').notNull(), data: text('data').notNull(), createdAt: text('created_at').notNull()
}, t => [uniqueIndex('request_once').on(t.userId,t.requestId),index('generation_attempt').on(t.attemptId),index('generation_owner').on(t.userId,t.createdAt)]);

export const coachRecords = sqliteTable('coach_records', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), recordId: text('record_id').notNull(),
  data: text('data').notNull(), contentHash: text('content_hash').notNull(), createdAt: text('created_at').notNull()
}, t => [uniqueIndex('coach_record_owner').on(t.userId,t.recordId)]);
export const coachRagUsage = sqliteTable('coach_rag_usage', {
  id: text('id').primaryKey(), calls: integer('calls').notNull().default(0)
});
