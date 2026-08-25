// Single config path — nothing else in the app reads process.env directly.
import 'dotenv/config';

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.BACKEND_PORT ?? 4000),

  databaseUrl: req('DATABASE_URL', 'postgres://agentic:agentic@localhost:5432/agentic'),
  redisUrl: req('REDIS_URL', 'redis://localhost:6379'),

  jwt: {
    secret: req('JWT_SECRET', 'dev-secret'),
    refreshSecret: req('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
    accessTtl: Number(process.env.JWT_ACCESS_TTL ?? 900),
    refreshTtl: Number(process.env.JWT_REFRESH_TTL ?? 1209600),
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID ?? '',
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
    // TEST MODE ONLY — this app never uses live keys.
    isConfigured(): boolean {
      return this.keyId.startsWith('rzp_test_') && this.keySecret.length > 0;
    },
  },

  catalog: {
    sourceUrl: process.env.CATALOG_SOURCE_URL ?? 'https://dummyjson.com/products?limit=30',
  },

  guardrail: {
    // Merchant-wide ceiling per order (a bound no single purchase may exceed). ₹50,000 default.
    merchantMaxOrderPaise: Number(process.env.MERCHANT_MAX_ORDER_PAISE ?? 5000000),
  },

  agent: {
    // Agent-service base URL (for anything the backend needs to reach it).
    url: process.env.AGENT_URL ?? 'http://localhost:8000',
  },
} as const;
