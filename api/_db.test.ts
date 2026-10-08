import { Client, type Pool } from 'pg';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getPool } from './_db.js';

function parsedSsl(activePool: Pool): unknown {
  // Exercise pg's actual connection-string parser without opening a socket.
  return (new Client(activePool.options) as unknown as {
    connectionParameters: { ssl: unknown };
  }).connectionParameters.ssl;
}

let pool: Pool | undefined;
beforeEach(() => {
  vi.stubEnv('PGSSLMODE', '');
  vi.stubEnv('DATABASE_SSL', '');
  vi.stubEnv('PG_POOL_MAX', '12');
  delete globalThis.__haulz_pg_pool;
});
afterEach(async () => {
  await pool?.end();
  pool = undefined;
  delete globalThis.__haulz_pg_pool;
  vi.unstubAllEnvs();
});

it('preserves explicit TLS options when the database URL includes sslmode', () => {
  vi.stubEnv('DATABASE_URL', 'postgres://user:pass@db.example/app?sslmode=require&application_name=haulz');
  vi.stubEnv('PGSSLMODE', 'require');
  pool = getPool();
  expect(parsedSsl(pool)).toEqual({ rejectUnauthorized: false });
  expect(new URL(pool.options.connectionString!).searchParams.get('application_name')).toBe('haulz');
  expect(getPool()).toBe(pool);
});

it('keeps TLS enabled for cloud databases without URL options', () => {
  vi.stubEnv('DATABASE_URL', 'postgres://user:pass@db.example/app');
  pool = getPool();
  expect(parsedSsl(pool)).toEqual({ rejectUnauthorized: false });
});

it('keeps plain local database connections', () => {
  vi.stubEnv('DATABASE_URL', 'postgres://user:pass@localhost/app');
  pool = getPool();
  expect(parsedSsl(pool)).toBe(false);
});
