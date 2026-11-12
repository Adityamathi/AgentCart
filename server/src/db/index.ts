import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../env.js';

const requireModule = createRequire(import.meta.url);

export type Row = Record<string, any>;
export type Q = <T = Row>(sql: string, params?: unknown[]) => Promise<T[]>;

const here = path.dirname(fileURLToPath(import.meta.url));

export const schemaPath = path.join(here, 'schema.sql');

interface Driver {
  name: 'sqlite' | 'postgres';
  exec(sql: string): Promise<void>;
  all(sql: string, params: unknown[]): Promise<Row[]>;
  transaction<T>(fn: (q: Q) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function toPgPlaceholders(sql: string): string {
  let index = 0;
  let out = '';
  let inString = false;
  for (const char of sql) {
    if (char === "'") inString = !inString;
    out += char === '?' && !inString ? `$${++index}` : char;
  }
  return out;
}

async function makePostgres(): Promise<Driver> {
  const pgModule: any = requireModule('pg');
  const Pool = pgModule.Pool ?? pgModule.default?.Pool;
  const pool = new Pool({
    connectionString: env.databaseUrl,
    ssl: /supabase|render|neon|sslmode=require/.test(env.databaseUrl) ? { rejectUnauthorized: false } : undefined,
    max: 8,
  });

  return {
    name: 'postgres',
    async exec(sql) {
      await pool.query(sql);
    },
    async all(sql, params) {
      const result = await pool.query(toPgPlaceholders(sql), params as any[]);
      return result.rows as Row[];
    },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const q: Q = async <T,>(sql: string, params: unknown[] = []) => {
          const result = await client.query(toPgPlaceholders(sql), params as any[]);
          return result.rows as T[];
        };
        const value = await fn(q);
        await client.query('COMMIT');
        return value;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

async function makeSqlite(): Promise<Driver> {
  const sqliteModule: any = requireModule('node:sqlite');
  const DatabaseSync = sqliteModule.DatabaseSync;
  const file = env.sqlitePath || path.resolve(process.cwd(), env.nodeEnv === 'test' ? ':memory:' : 'data/agentcart.db');
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  return {
    name: 'sqlite',
    async exec(sql) {
      db.exec(sql);
    },
    async all(sql, params) {
      const statement = db.prepare(sql);
      return statement.all(...(params as any[])) as Row[];
    },
    async transaction(fn) {
      db.exec('BEGIN');
      try {
        const value = await fn(async <T,>(sql: string, params: unknown[] = []) =>
          db.prepare(sql).all(...(params as any[])) as T[],
        );
        db.exec('COMMIT');
        return value;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async close() {
      db.close();
    },
  };
}

let driverPromise: Promise<Driver> | null = null;

export function getDriver(): Promise<Driver> {
  if (!driverPromise) {
    driverPromise = env.databaseUrl ? makePostgres() : makeSqlite();
  }
  return driverPromise;
}

export const db = {
  async query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    const driver = await getDriver();
    return (await driver.all(sql, params)) as T[];
  },
  async one<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await db.query<T>(sql, params);
    return rows[0] ?? null;
  },
  async exec(sql: string): Promise<void> {
    const driver = await getDriver();
    await driver.exec(sql);
  },
  async transaction<T>(fn: (q: Q) => Promise<T>): Promise<T> {
    const driver = await getDriver();
    return driver.transaction(fn);
  },
  async driverName(): Promise<'sqlite' | 'postgres'> {
    return (await getDriver()).name;
  },
  async close(): Promise<void> {
    if (driverPromise) await (await driverPromise).close();
    driverPromise = null;
  },
};

export async function migrate(): Promise<void> {
  const sql = readFileSync(schemaPath, 'utf8');
  const driver = await getDriver();
  for (const statement of sql.split(';')) {
    if (statement.trim()) await driver.exec(statement);
  }
}

export function resetDriver(): void {
  driverPromise = null;
}
