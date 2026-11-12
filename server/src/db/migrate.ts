import { db, migrate } from './index.js';

await migrate();
const driver = await db.driverName();
console.log(`Migrations applied on ${driver}.`);
await db.close();
