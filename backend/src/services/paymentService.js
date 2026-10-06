const midtransClient = require('midtrans-client');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const emailService = require('./emailService');

const prisma = new PrismaClient();

const SERVER_KEY = process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-placeholder-key-xxxx';
const CLIENT_KEY = process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-client-placeholder-key-xxxx';
const IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === 'true';

// Initialize Snap Client
const snap = new midtransClient.Snap({
  isProduction: IS_PRODUCTION,
  serverKey: SERVER_KEY,
  clientKey: CLIENT_KEY
});

// Initialize CoreApi Client for direct verification or status checks
const coreApi = new midtransClient.CoreApi({
  isProduction: IS_PRODUCTION,
  serverKey: SERVER_KEY,
  clientKey: CLIENT_KEY
});

/**
 * Create Midtrans Snap Payment Transaction for an Order
 * @param {Object} order - Order model instance with user and items
 * @param {String} paymentType - 'DP' | 'FINAL' | 'FULL'
 * @returns {Promise<Object>} Snap transaction response (token & redirect_url)
 */
async function createSnapTransaction(order, paymentType = 'FULL') {
  let grossAmount = Math.round(order.totalAmount);
  let transactionSuffix = 'FULL';

  if (paymentType === 'DP') {
    grossAmount = Math.round(order.dpAmount > 0 ? order.dpAmount : order.totalAmount);
    transactionSuffix = 'DP';
  } else if (paymentType === 'FINAL') {
    grossAmount = Math.round(order.remainingAmount > 0 ? order.remainingAmount : order.totalAmount);
    transactionSuffix = 'FINAL';
  } else if (order.paymentScheme === 'DOWN_PAYMENT_30' || order.paymentScheme === 'DOWN_PAYMENT_50') {
    // If not specified, default to DP if unpaid DP exists
    if (order.paymentStatus === 'UNPAID') {
      grossAmount = Math.round(order.dpAmount);
      transactionSuffix = 'DP';
    }
  }

  // Ensure unique transaction order_id for Midtrans
  const midtransOrderId = `${order.orderNumber}-${transactionSuffix}-${Date.now().toString().slice(-6)}`;

  // Build item details
  const itemDetails = (order.items && order.items.length > 0)
    ? order.items.map((item) => ({
        id: item.productId || item.id,
        price: Math.round(item.unitPrice),
        quantity: item.quantity,
        name: (item.product?.title || `Item ${item.productId}`).substring(0, 50)
      }))
    : [{
        id: order.id,
        price: grossAmount,
        quantity: 1,
        name: `Payment ${transactionSuffix} for Order ${order.orderNumber}`
      }];

  // If DP or FINAL amount doesn't equal sum of itemDetails, use summary line item to match gross_amount
  const itemsSum = itemDetails.reduce((acc, curr) => acc + curr.price * curr.quantity, 0);
  let finalItemDetails = itemDetails;
  if (itemsSum !== grossAmount) {
    finalItemDetails = [
      {
        id: `${order.orderNumber}-${transactionSuffix}`,
        price: grossAmount,
        quantity: 1,
        name: `Tagihan ${transactionSuffix} Pesanan #${order.orderNumber}`.substring(0, 50)
      }
    ];
  }

  const customerDetails = {
    first_name: order.recipientName || order.user?.fullName || 'Customer',
    email: order.user?.email || 'customer@sherish.id',
    phone: order.recipientPhone || order.user?.phoneNumber || '08123456789',
    billing_address: {
      first_name: order.recipientName || order.user?.fullName || 'Customer',
      phone: order.recipientPhone || '08123456789',
      address: order.shippingAddress || '-',
      city: order.shippingCity || 'Indonesia'
    },
    shipping_address: {
      first_name: order.recipientName || order.user?.fullName || 'Customer',
      phone: order.recipientPhone || '08123456789',
      address: order.shippingAddress || '-',
      city: order.shippingCity || 'Indonesia'
    }
  };

  const parameter = {
    transaction_details: {
      order_id: midtransOrderId,
      gross_amount: grossAmount
    },
    item_details: finalItemDetails,
    customer_details: customerDetails,
    callbacks: {
      finish: `${process.env.BACKEND_URL || 'http://localhost:8095'}/api/payment/finish`
    },
    custom_field1: order.id,
    custom_field2: transactionSuffix
  };

  try {
    const snapTransaction = await snap.createTransaction(parameter);
    return {
      success: true,
      token: snapTransaction.token,
      redirectUrl: snapTransaction.redirect_url,
      orderId: order.id,
      midtransOrderId,
      grossAmount,
      paymentType: transactionSuffix
    };
  } catch (error) {
    console.error('[PaymentService] Midtrans Snap API Error:', error.message || error);
    // Graceful fallback for sandbox / offline / dummy key mode
    return {
      success: false,
      isSimulation: true,
      error: error.message || 'Midtrans API call failed',
      token: `dummy_snap_token_${Date.now()}`,
      redirectUrl: `https://app.sandbox.midtrans.com/snap/v2/vtweb/dummy_snap_token_${Date.now()}`,
      orderId: order.id,
      midtransOrderId,
      grossAmount,
      paymentType: transactionSuffix
    };
  }
}

/**
 * Verify Midtrans Webhook Notification Signature Key
 * SHA512(order_id + status_code + gross_amount + ServerKey)
 */
function verifySignatureKey(orderId, statusCode, grossAmount, signatureKey) {
  if (!signatureKey) return false;
  // If using placeholder key, permit verification for testing/dummy requests
  if (SERVER_KEY.includes('placeholder')) return true;

  const hash = crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${SERVER_KEY}`)
    .digest('hex');

  return hash === signatureKey;
}

/**
 * Handle Midtrans Webhook Notification
 * Updates Order and Invoice status automatically
 * @param {Object} notification - Midtrans payload notification
 */
async function handleNotification(notification) {
  const {
    order_id: midtransOrderId,
    transaction_status: transactionStatus,
    fraud_status: fraudStatus,
    status_code: statusCode,
    gross_amount: grossAmount,
    signature_key: signatureKey,
    payment_type: paymentChannel
  } = notification;

  console.log(`[PaymentService] Processing webhook for Midtrans Order ID: ${midtransOrderId}, Status: ${transactionStatus}`);

  // 1. Parse Order ID and Payment Type from Midtrans Order ID format: {orderNumber}-{DP|FINAL|FULL}-{timestamp}
  // Or extract order from custom fields / orderNumber search
  let order = null;
  let paymentType = 'FULL';

  // Check if custom_field1 was passed
  if (notification.custom_field1) {
    order = await prisma.order.findUnique({
      where: { id: notification.custom_field1 },
      include: { user: true, invoices: true, items: { include: { product: true } } }
    });
    if (notification.custom_field2) {
      paymentType = notification.custom_field2;
    }
  }

  // Fallback: Parse from midtransOrderId
  if (!order && midtransOrderId) {
    const parts = midtransOrderId.split('-');
    // Pattern: SHR-(RET|B2B)-123456-(DP|FINAL|FULL)-123456
    let orderNumberCandidate = '';
    if (parts.length >= 3) {
      orderNumberCandidate = `${parts[0]}-${parts[1]}-${parts[2]}`;
    }

    if (parts.includes('DP')) paymentType = 'DP';
    else if (parts.includes('FINAL')) paymentType = 'FINAL';
    else if (parts.includes('FULL')) paymentType = 'FULL';

    order = await prisma.order.findFirst({
      where: {
        OR: [
          { orderNumber: orderNumberCandidate },
          { id: parts[0] }
        ]
      },
      include: { user: true, invoices: true, items: { include: { product: true } } }
    });
  }

  if (!order) {
    console.warn(`[PaymentService] Order not found for webhook notification: ${midtransOrderId}`);
    return { success: false, message: 'Order not found' };
  }

  let isPaid = false;
  let isCancelled = false;

  // Midtrans status handling logic
  if (transactionStatus === 'capture') {
    if (fraudStatus === 'accept') {
      isPaid = true;
    }
  } else if (transactionStatus === 'settlement') {
    isPaid = true;
  } else if (['cancel', 'deny', 'expire'].includes(transactionStatus)) {
    isCancelled = true;
  } else if (transactionStatus === 'pending') {
    console.log(`[PaymentService] Order ${order.orderNumber} payment is pending.`);
  }

  if (isPaid) {
    const now = new Date();
    const isDp = paymentType === 'DP';
    const isFinal = paymentType === 'FINAL';
    const isFull = paymentType === 'FULL' || order.paymentScheme === 'FULL_PAYMENT';

    let orderUpdateData = {};
    if (isDp) {
      orderUpdateData = {
        paymentStatus: 'DP_PAID',
        status: 'IN_PRODUCTION',
        dpPaidAt: now,
        dpProofUrl: `midtrans://${midtransOrderId}`
      };
    } else if (isFinal) {
      orderUpdateData = {
        paymentStatus: 'FULLY_PAID',
        status: 'FINAL_PAYMENT_CONFIRMED',
        finalPaidAt: now,
        finalProofUrl: `midtrans://${midtransOrderId}`
      };
    } else {
      orderUpdateData = {
        paymentStatus: 'FULLY_PAID',
        status: 'IN_PRODUCTION',
        dpPaidAt: now,
        finalPaidAt: now,
        dpProofUrl: `midtrans://${midtransOrderId}`,
        finalProofUrl: `midtrans://${midtransOrderId}`
      };
    }

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: orderUpdateData,
      include: { user: true, items: { include: { product: true } } }
    });

    // Update or mark related Invoices as PAID
    const targetInvoiceType = isDp ? 'DP_PAYMENT' : (isFinal ? 'FINAL_PAYMENT' : 'FULL_PAYMENT');
    const matchingInvoice = await prisma.invoice.findFirst({
      where: {
        orderId: order.id,
        type: targetInvoiceType,
        status: { in: ['PENDING', 'OVERDUE'] }
      }
    });

    if (matchingInvoice) {
      await prisma.invoice.update({
        where: { id: matchingInvoice.id },
        data: {
          status: 'PAID',
          paidDate: now,
          paymentMethod: `Midtrans (${paymentChannel || 'Gateway'})`,
          notes: `Lunas via Midtrans Webhook: ${midtransOrderId}`
        }
      });
    } else {
      // If invoice doesn't exist, create an auto invoice or update latest pending invoice
      const pendingInvoice = await prisma.invoice.findFirst({
        where: { orderId: order.id, status: 'PENDING' }
      });
      if (pendingInvoice) {
        await prisma.invoice.update({
          where: { id: pendingInvoice.id },
          data: {
            status: 'PAID',
            paidDate: now,
            paymentMethod: `Midtrans (${paymentChannel || 'Gateway'})`,
            notes: `Lunas via Midtrans Webhook: ${midtransOrderId}`
          }
        });
      }
    }

    // Send Email notification to customer
    try {
      if (isDp || isFull) {
        await emailService.sendDpPaymentReceivedEmail(updatedOrder, updatedOrder.user);
      }
    } catch (e) {
      console.error('[PaymentService] Email notification error:', e.message);
    }

    return { success: true, message: 'Order and invoice marked as PAID', orderId: order.id, status: updatedOrder.status };
  } else if (isCancelled) {
    console.log(`[PaymentService] Payment cancelled or expired for Order ${order.orderNumber}`);
    return { success: true, message: 'Payment cancelled/expired' };
  }

  return { success: true, message: `Notification received for status: ${transactionStatus}` };
}

module.exports = {
  createSnapTransaction,
  handleNotification,
  verifySignatureKey,
  snap,
  coreApi
};
