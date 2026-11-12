import { db, migrate } from './index.js';
import { products } from '../catalog/products.js';
import { nowIso } from '../lib/util.js';

export async function seedProducts(): Promise<number> {
  const timestamp = nowIso();
  await db.transaction(async (q) => {
    for (const product of products) {
      await q(
        `INSERT INTO products (id, sku, name, brand, category, description, price_cents, currency, stock, rating, specs, tags, pros, cons, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           sku = excluded.sku,
           name = excluded.name,
           brand = excluded.brand,
           category = excluded.category,
           description = excluded.description,
           price_cents = excluded.price_cents,
           currency = excluded.currency,
           stock = excluded.stock,
           rating = excluded.rating,
           specs = excluded.specs,
           tags = excluded.tags,
           pros = excluded.pros,
           cons = excluded.cons,
           updated_at = excluded.updated_at`,
        [
          product.id,
          product.sku,
          product.name,
          product.brand,
          product.category,
          product.description,
          product.priceCents,
          product.currency,
          product.stock,
          product.rating,
          JSON.stringify(product.specs),
          JSON.stringify(product.tags),
          JSON.stringify(product.pros),
          JSON.stringify(product.cons),
          timestamp,
          timestamp,
        ],
      );
    }
  });
  return products.length;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('seed.ts')) {
  await migrate();
  const count = await seedProducts();
  const { seedDemoAccount } = await import('../services/users.js');
  await seedDemoAccount();
  console.log(`Seeded ${count} catalogue products.`);
  await db.close();
}
