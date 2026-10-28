import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
const shared = globalThis as typeof globalThis & { smcPool?: Pool };
export const pool = shared.smcPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 12, connectionTimeoutMillis: 5000 });
if (process.env.NODE_ENV !== 'production') shared.smcPool = pool;
export async function tenant<T>(userId: string, fn: (db: PoolClient) => Promise<T>): Promise<T> {
 const db = await pool.connect();
 try {
  await db.query('BEGIN');
  await db.query('SET LOCAL ROLE smc_tenant');
  await db.query("SELECT set_config('app.user_id',$1,true)",[userId]);
  const result = await fn(db);
  await db.query('COMMIT');
  return result;
 } catch (error) { await db.query('ROLLBACK'); throw error; }
 finally { db.release(); }
}
export async function event(userId: string, kind: string, summary: string) {
 await tenant(userId, db => db.query('INSERT INTO events(id,user_id,kind,summary) VALUES($1,$2,$3,$4)',[randomUUID(),userId,kind,summary]));
}
