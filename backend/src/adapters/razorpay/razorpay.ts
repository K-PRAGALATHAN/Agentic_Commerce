import { createHmac, timingSafeEqual } from 'node:crypto';
import Razorpay from 'razorpay';
import { config } from '../../config/env.js';
import { HttpError } from '../../application/auth.js';

// TEST MODE ONLY. All amounts are in paise. The agent never calls this directly —
// only the backend does, after guardrails pass.

let client: Razorpay | null = null;
function rp(): Razorpay {
  if (!config.razorpay.isConfigured()) {
    throw new HttpError(503, 'Razorpay test keys not configured (set RAZORPAY_KEY_ID=rzp_test_... in .env)');
  }
  if (!client) client = new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret });
  return client;
}

export async function createOrder(amountPaise: number, receipt: string): Promise<{ id: string }> {
  const order = await rp().orders.create({ amount: amountPaise, currency: 'INR', receipt });
  return { id: order.id };
}

export async function createPaymentLink(amountPaise: number, description: string): Promise<{ id: string; short_url: string }> {
  // SDK's payment-link types are over-strict; cast the request. Used by agent flows (Phase 3+).
  const link: any = await (rp().paymentLink.create as any)({
    amount: amountPaise,
    currency: 'INR',
    description,
    accept_partial: false,
  });
  return { id: link.id, short_url: link.short_url };
}

// Verify a checkout callback signature server-side. NEVER trust the client's "paid".
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const expected = createHmac('sha256', config.razorpay.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(expected, signature);
}

// Verify a Razorpay webhook payload signature.
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  if (!config.razorpay.webhookSecret) return false;
  const expected = createHmac('sha256', config.razorpay.webhookSecret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

export async function refund(paymentId: string, amountPaise: number): Promise<{ id: string; status: string }> {
  const r = await rp().payments.refund(paymentId, { amount: amountPaise });
  return { id: r.id, status: r.status };
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}
