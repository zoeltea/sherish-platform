const express = require('express');
const paymentService = require('../services/paymentService');

const router = express.Router();

/**
 * POST /api/payment/webhook/midtrans
 * Receive HTTP Notification webhook from Midtrans
 */
router.post('/webhook/midtrans', async (req, res) => {
  try {
    const notification = req.body;

    console.log('[Midtrans Webhook Received]:', {
      order_id: notification.order_id,
      status: notification.transaction_status,
      gross_amount: notification.gross_amount,
      fraud_status: notification.fraud_status,
      payment_type: notification.payment_type
    });

    if (!notification || !notification.order_id) {
      return res.status(400).json({ error: 'Invalid notification payload: order_id is missing.' });
    }

    const result = await paymentService.handleNotification(notification);

    res.status(200).json({
      status: 'success',
      ...result
    });
  } catch (err) {
    console.error('[Midtrans Webhook Error]:', err);
    res.status(500).json({
      status: 'error',
      message: err.message || 'Error processing webhook'
    });
  }
});

/**
 * GET /api/payment/finish (Callback redirect from Snap payment)
 */
router.get('/finish', (req, res) => {
  const { order_id, transaction_status } = req.query;
  res.json({
    status: 'ok',
    message: 'Pembayaran selesai atau sedang diproses oleh Midtrans.',
    order_id,
    transaction_status
  });
});

module.exports = router;
