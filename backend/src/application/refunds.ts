import { query, withTransaction } from '../adapters/db/pool.js';
import * as razorpay from '../adapters/razorpay/razorpay.js';
import { writeAudit } from './audit.js';
import { writeCheckoutLedger } from './ledger.js';
import { HttpError } from './auth.js';

// Money-OUT is GATED. A customer (or agent) REQUESTS a refund; a merchant/admin
// must APPROVE before the Razorpay refund actually executes.

export async function requestRefund(userId: string, orderId: string, reason: string): Promise<any> {
  const order = await query<any>('SELECT * FROM orders WHERE id=$1 AND user_id=$2', [orderId, userId]);
  if (!order.rowCount) throw new HttpError(404, 'order not found');
  if (order.rows[0].status !== 'paid') throw new HttpError(400, 'only paid orders can be refunded');

  const { rows } = await query<any>(
    `INSERT INTO refund_requests(order_id, requested_by, amount_paise, reason)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [orderId, userId, order.rows[0].total_paise, reason],
  );
  await writeAudit({
    actor: 'user',
    action: 'refund_requested',
    target: orderId,
    amountPaise: Number(order.rows[0].total_paise),
    reason: `refund requested: ${reason || 'no reason given'} — awaiting approval (GATED)`,
  });
  return rows[0];
}

export async function listRefundRequests(status = 'pending'): Promise<any[]> {
  const { rows } = await query(
    `SELECT rr.*, u.email AS requester_email
       FROM refund_requests rr JOIN users u ON u.id = rr.requested_by
      WHERE rr.status = $1 ORDER BY rr.created_at DESC`,
    [status],
  );
  return rows;
}

export async function approveRefund(approverId: string, requestId: string): Promise<any> {
  const reqRow = await query<any>('SELECT * FROM refund_requests WHERE id=$1', [requestId]);
  if (!reqRow.rowCount) throw new HttpError(404, 'refund request not found');
  const rr = reqRow.rows[0];
  if (rr.status !== 'pending') throw new HttpError(400, `request already ${rr.status}`);

  // Find the captured payment for this order.
  const pay = await query<any>(
    `SELECT razorpay_payment_id FROM payments WHERE order_id=$1 AND verified=true ORDER BY created_at DESC LIMIT 1`,
    [rr.order_id],
  );
  if (!pay.rowCount || !pay.rows[0].razorpay_payment_id) {
    throw new HttpError(400, 'no captured payment to refund for this order');
  }

  // Money-out executes ONLY now, after approval.
  const refund = await razorpay.refund(pay.rows[0].razorpay_payment_id, Number(rr.amount_paise));

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE refund_requests SET status='approved', decided_by=$1, razorpay_refund_id=$2, decided_at=now() WHERE id=$3`,
      [approverId, refund.id, requestId],
    );
    await client.query(`UPDATE orders SET status='refunded' WHERE id=$1`, [rr.order_id]);
  });

  await writeCheckoutLedger(rr.requested_by, { event: 'refund_approved', order_id: rr.order_id, amount_paise: Number(rr.amount_paise), refund_id: refund.id });
  await writeAudit({
    actor: 'merchant',
    action: 'refund_approved',
    target: rr.order_id,
    amountPaise: Number(rr.amount_paise),
    reason: `refund approved by ${approverId} and executed (${refund.id})`,
    verified: true,
  });
  return { ok: true, refund };
}

export async function rejectRefund(approverId: string, requestId: string): Promise<any> {
  const res = await query(
    `UPDATE refund_requests SET status='rejected', decided_by=$1, decided_at=now()
      WHERE id=$2 AND status='pending' RETURNING order_id, amount_paise`,
    [approverId, requestId],
  );
  if (!res.rowCount) throw new HttpError(400, 'request not found or not pending');
  await writeAudit({
    actor: 'merchant',
    action: 'refund_rejected',
    target: (res.rows[0] as any).order_id,
    reason: `refund rejected by ${approverId}`,
  });
  return { ok: true };
}
