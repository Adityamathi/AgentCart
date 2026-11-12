import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './env.js';
import { attachUser, sameOriginOnly } from './middleware/auth.js';
import { errorHandler } from './lib/http.js';
import { authRouter } from './routes/auth.js';
import { productsRouter } from './routes/products.js';
import { cartRouter } from './routes/cart.js';
import { policiesRouter } from './routes/policies.js';
import { agentRouter } from './routes/agent.js';
import { ordersRouter } from './routes/orders.js';
import { paypalRouter, paypalWebhookRouter } from './routes/paypal.js';
import { settingsRouter } from './routes/settings.js';
import { healthRouter } from './routes/health.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  const allowedOrigins = [env.appOrigin, `http://localhost:${env.port}`, `http://127.0.0.1:${env.port}`];
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
    }),
  );

  // Raw body for PayPal webhook signature verification, before the JSON parser.
  app.use('/api/paypal/webhook', express.raw({ type: '*/*', limit: '1mb' }), paypalWebhookRouter);

  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.use(attachUser);
  app.use('/api', sameOriginOnly);

  const globalLimiter = rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: 'draft-7', legacyHeaders: false });
  const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false });
  const agentLimiter = rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false });
  const paymentLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });

  app.use('/api', globalLimiter);
  app.use('/api/auth', authLimiter, authRouter);
  app.use('/api/health', healthRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/cart', cartRouter);
  app.use('/api/policies', policiesRouter);
  app.use('/api/agent', agentLimiter, agentRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/paypal', paymentLimiter, paypalRouter);
  app.use('/api/settings', settingsRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Unknown API route', code: 'not_found' });
  });

  // Single-service deployment: serve the built client when it exists.
  const clientDist = path.resolve(process.cwd(), '../client/dist');
  if (env.isProd && existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
