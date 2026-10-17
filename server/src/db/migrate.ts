/* Simple, dependency-free migration runner.
 * Applies every *.sql file in ./migrations in filename order, once, inside a transaction. */
import fs from 'fs';
import path from 'path';
import { pool } from './pool';

export async function migrate(log = true) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
      await client.query('COMMIT');
      if (log) console.log(`[migrate] applied ${f}`);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`[migrate] failed on ${f}`);
      throw e;
    } finally {
      client.release();
    }
  }
  if (log) console.log('[migrate] database is up to date');
}

if (require.main === module) {
  migrate()
    .then(() => pool.end())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
