import { rmSync } from 'node:fs';
import path from 'node:path';
import { db, migrate } from './index.js';
import { seedProducts } from './seed.js';
import { seedDemoAccount } from '../services/users.js';
import { env } from '../env.js';

if (env.databaseUrl) {
  console.error('Refusing to reset a Postgres database. Drop the tables manually if you really mean it.');
  process.exit(1);
}

const file = env.sqlitePath || path.resolve(process.cwd(), 'data/agentcart.db');
for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${file}${suffix}`, { force: true });
}

await migrate();
const count = await seedProducts();
await seedDemoAccount();
console.log(`Reset local database, seeded ${count} products.`);
await db.close();
