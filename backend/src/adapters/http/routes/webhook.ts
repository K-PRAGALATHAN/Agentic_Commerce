import { Router, raw } from 'express';
import { verifyWebhookSignature } from '../../razorpay/razorpay.js';
import { query } from '../../db/pool.js';
import { writeAudit } from '../../../application/audit.js';

// Razorpay webhook — the async source of truth. Uses RAW body for signature verify.
export const webhookRouter = Router();

webhookRouter.post('/webhooks/razorpay', raw({ type: '*/*' }), async (req, res) => {
  const signature = req.headers['x-razorpay-signature'] as string | undefined;
  const rawBody = (req.body as Buffer).toString('utf8');

  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    res.status(400).json({ error: 'invalid webhook signature' });
    return;
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    res.status(400).json({ error: 'bad payload' });
    return;
  }

  // Reconcile order state from the event (works even if the browser closed mid-pay).
  const entity = event?.payload?.payment?.entity;
  if (event?.event === 'payment.captured' && entity?.order_id) {
    await query(`UPDATE orders SET status='paid' WHERE razorpay_order_id=$1 AND status <> 'paid'`, [entity.order_id]);
    await writeAudit({ actor: 'webhook', action: 'payment_captured', target: entity.order_id, reason: 'razorpay webhook confirmed', verified: true });
  } else if (event?.event === 'payment.failed' && entity?.order_id) {
    await writeAudit({ actor: 'webhook', action: 'payment_failed', target: entity.order_id, reason: 'razorpay webhook: payment failed', verified: false });
  }

  res.json({ ok: true });
});
