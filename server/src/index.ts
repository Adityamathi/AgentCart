import { createApp } from './app.js';
import { env, integrationStatus } from './env.js';
import { db, migrate } from './db/index.js';
import { seedProducts } from './db/seed.js';
import { seedDemoAccount } from './services/users.js';

async function main() {
  await migrate();
  const count = await db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM products`);
  if (!count || Number(count.n) === 0) {
    const seeded = await seedProducts();
    console.log(`[agentcart] catalogue was empty, seeded ${seeded} products`);
  }
  await seedDemoAccount();

  const app = createApp();
  const server = app.listen(env.port, () => {
    const status = integrationStatus();
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : env.port;
    console.log(`[agentcart] API on http://localhost:${port}`);
    console.log(`[agentcart] database: ${status.database.driver}`);
    const fallbacks = status.ai.chain.filter((name) => name !== status.ai.provider);
    console.log(
      `[agentcart] agent: ${status.ai.provider} (${status.ai.model})${status.ai.live ? '' : ' — local planner, no model key set'}${
        fallbacks.length ? ` · fallback: ${fallbacks.join(' → ')}` : ''
      }`,
    );
    console.log(
      `[agentcart] paypal: ${status.paypal.configured ? `${status.paypal.environment} sandbox` : 'not configured — checkout will ask for keys'}`,
    );
  });

  const shutdown = async () => {
    server.close();
    await db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[agentcart] failed to start', error);
  process.exit(1);
});
