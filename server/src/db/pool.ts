import { Pool, PoolClient, QueryResultRow, types } from 'pg';

// Return NUMERIC columns (e.g. service hours) as JS numbers instead of strings.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)) as any);
import { env } from '../config/env';

export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: 15,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => console.error('[db] idle client error', err));

export type Db = Pick<PoolClient, 'query'>;

/** Run a query and return all rows. */
export async function q<T extends QueryResultRow = any>(text: string, params: any[] = [], db: Db = pool): Promise<T[]> {
  const res = await db.query<T>(text, params);
  return res.rows;
}

/** Run a query and return the first row (or null). */
export async function one<T extends QueryResultRow = any>(text: string, params: any[] = [], db: Db = pool): Promise<T | null> {
  const res = await db.query<T>(text, params);
  return res.rows[0] ?? null;
}

/** Run `fn` inside a transaction. Rolls back on any thrown error. */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
