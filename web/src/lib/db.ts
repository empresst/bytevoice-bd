import "server-only";
import postgres from "postgres";

// One small pool per server instance. `prepare: false` is required behind
// Supabase's connection pooler. Only used in server code (API routes).
const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

export const sql =
  globalForDb.sql ??
  postgres(process.env.DATABASE_URL!, { prepare: false, max: 3, idle_timeout: 20 });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
