import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = await pool.connect();
try {
 await db.query('BEGIN');
 await db.query("SELECT pg_advisory_xact_lock(hashtext('smc-migrations'))");
 await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
 for(const [version,file] of [['001','001_initial.sql'],['002','002_analysis_modes.sql']]) {
  const { rows } = await db.query('SELECT version FROM schema_migrations WHERE version=$1',[version]);
  if (!rows.length) {
   await db.query(await readFile(new URL(`../db/${file}`,import.meta.url),'utf8'));
   await db.query('INSERT INTO schema_migrations(version) VALUES($1)',[version]);
  }
 }
 await db.query('COMMIT');
 console.log('Datenbankschema ist aktuell.');
} catch (error) { await db.query('ROLLBACK'); throw error; }
finally { db.release(); await pool.end(); }
