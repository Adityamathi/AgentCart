import { Router } from 'express';
import { integrationStatus } from '../env.js';
import { db } from '../db/index.js';
import { asyncHandler } from '../lib/http.js';

export const healthRouter = Router();

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    let databaseOk = true;
    let productCount = 0;
    try {
      const row = await db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM products`);
      productCount = Number(row?.n ?? 0);
    } catch {
      databaseOk = false;
    }
    res.json({
      ok: databaseOk,
      time: new Date().toISOString(),
      catalogueProducts: productCount,
      ...integrationStatus(),
      database: { ...integrationStatus().database, ok: databaseOk },
    });
  }),
);
