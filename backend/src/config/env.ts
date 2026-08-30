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
    // 2 hours of active use, renewed silently from the refresh token, which is
    // good for 30 days. That is the shape most storefronts use: a short-lived
    // credential on every request, and a long-lived one that quietly renews it,
    // so nobody is thrown out mid-checkout.
    accessTtl: Number(process.env.JWT_ACCESS_TTL ?? 7200),      // 2 h
    refreshTtl: Number(process.env.JWT_REFRESH_TTL ?? 2592000), // 30 d
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


  uploads: {
    // Product images. Written to a Docker volume so they survive a rebuild.
    dir: process.env.UPLOAD_DIR ?? '/app/uploads',
    maxBytes: Number(process.env.UPLOAD_MAX_BYTES ?? 2_000_000), // 2 MB
  },

  guardrail: {
    // Merchant-wide ceiling per order (a bound no single purchase may exceed). ₹50,000 default.
    merchantMaxOrderPaise: Number(process.env.MERCHANT_MAX_ORDER_PAISE ?? 5000000),
  },

  agent: {
    // Agent-service base URL (for anything the backend needs to reach it).
    url: process.env.AGENT_URL ?? 'http://localhost:8010',
  },
} as const;
