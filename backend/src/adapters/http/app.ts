import express from 'express';
import cors from 'cors';
import { pool } from '../db/pool.js';
import { redis } from '../redis/redis.js';
import { config } from '../../config/env.js';
import { errorHandler } from './middleware/errors.js';
import { webhookRouter } from './routes/webhook.js';
import { authRouter } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { cartRouter } from './routes/cart.js';
import { ordersRouter } from './routes/orders.js';
import { merchantRouter } from './routes/merchant.js';
import { observabilityRouter } from './routes/observability.js';

export function createApp() {
  const app = express();
  app.use(cors());

  // Webhook FIRST — it needs the raw body for signature verification,
  // so it must run before the JSON body parser consumes the stream.
  app.use('/', webhookRouter);

  app.use(express.json());

  app.get('/health', async (_req, res) => {
    const health: Record<string, string> = { status: 'ok', razorpay: config.razorpay.isConfigured() ? 'configured' : 'not-configured' };
    try {
      await pool.query('SELECT 1');
      health.db = 'up';
    } catch {
      health.db = 'down';
      health.status = 'degraded';
    }
    try {
      await redis.ping();
      health.redis = 'up';
    } catch {
      health.redis = 'down';
      health.status = 'degraded';
    }
    res.status(health.status === 'ok' ? 200 : 503).json(health);
  });

  app.use('/', authRouter);
  app.use('/', catalogRouter);
  app.use('/', cartRouter);
  app.use('/', ordersRouter);
  app.use('/', merchantRouter);
  app.use('/', observabilityRouter);

  app.use(errorHandler);
  return app;
}
