const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const emailService = require('../services/emailService');
const invoiceService = require('../services/invoiceService');
const paymentService = require('../services/paymentService');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/orders (Create Order - Retail B2C or Mitra B2B)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      items,
      shippingAddress,
      shippingCity,
      recipientName,
      recipientPhone,
      notes,
      paymentScheme = 'FULL_PAYMENT'
    } = req.body;

    if (!items || items.length === 0 || !shippingAddress || !recipientName || !recipientPhone) {
      return res.status(400).json({ error: 'Data pesanan dan informasi pengiriman tidak lengkap.' });
    }

    const isMitra = req.user.role === 'MITRA';
    const orderType = isMitra ? 'MITRA_B2B' : 'RETAIL';
    
    let selectedScheme = 'FULL_PAYMENT';
    if (isMitra && ['DOWN_PAYMENT_30', 'DOWN_PAYMENT_50', 'FULL_PAYMENT'].includes(paymentScheme)) {
      selectedScheme = paymentScheme;
    }

    let totalAmount = 0;
    const orderItemsData = [];

    for (const item of items) {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      if (!product) {
        return res.status(404).json({ error: `Produk ID ${item.productId} tidak ditemukan.` });
      }

      const qty = item.quantity || 1;
      const unitPrice = isMitra ? product.mitraPrice : product.basePrice;
      const subtotal = unitPrice * qty;
      totalAmount += subtotal;

      orderItemsData.push({
        productId: product.id,
        quantity: qty,
        unitPrice,
        selectedMaterial: item.selectedMaterial || product.materials[0] || 'Jati Solid Perhutani',
        selectedFinishing: item.selectedFinishing || product.finishings[0] || 'Natural Matte',
        customDimLength: item.customDimLength || product.defaultLength,
        customDimWidth: item.customDimWidth || product.defaultWidth,
        customDimHeight: item.customDimHeight || product.defaultHeight,
        subtotal
      });
    }

    let dpAmount = totalAmount;
    let remainingAmount = 0.0;

    if (selectedScheme === 'DOWN_PAYMENT_30') {
      dpAmount = Math.round(totalAmount * 0.3);
      remainingAmount = totalAmount - dpAmount;
    } else if (selectedScheme === 'DOWN_PAYMENT_50') {
      dpAmount = Math.round(totalAmount * 0.5);
      remainingAmount = totalAmount - dpAmount;
    }

    const prefix = isMitra ? 'SHR-B2B' : 'SHR-RET';
    const orderNumber = `${prefix}-${Date.now().toString().slice(-6)}`;

    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: req.user.id,
        mitraId: isMitra ? req.user.mitraProfile?.id : null,
        orderType,
        paymentScheme: selectedScheme,
        paymentStatus: 'UNPAID',
        status: 'PENDING_PAYMENT',
        totalAmount,
        dpAmount,
        remainingAmount,
        shippingAddress,
        shippingCity: shippingCity || 'Indonesia',
        recipientName,
        recipientPhone,
        notes: notes || (isMitra ? 'Pesanan Kulakan Toko Mitra B2B' : 'Pesanan Retail Storefront B2C'),
        items: {
          create: orderItemsData
        }
      },
      include: {
        items: {
          include: { product: true }
        },
        user: true
      }
    });

    // Automatically generate initial invoice (DP or Full Payment)
    try {
      const invType = selectedScheme === 'FULL_PAYMENT' ? 'FULL_PAYMENT' : 'DP_PAYMENT';
      const invAmount = selectedScheme === 'FULL_PAYMENT' ? totalAmount : dpAmount;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 3); // 3 days due date

      const invoiceNumber = `INV-${invType === 'DP_PAYMENT' ? 'DP' : 'FULL'}-${orderNumber.slice(-6)}`;
      await prisma.invoice.create({
        data: {
          orderId: order.id,
          invoiceNumber,
          type: invType,
          amount: invAmount,
          dueDate,
          status: 'PENDING',
          notes: `Tagihan ${invType.replace('_', ' ')} untuk pesanan ${orderNumber}`
        }
      });
    } catch (e) {
      console.error('Initial invoice generation error:', e.message);
    }

    // Trigger Email Notification: Order Confirmation & DP Instructions
    try {
      await emailService.sendOrderConfirmedEmail(order, order.user || req.user);
    } catch (e) {
      console.error('Email trigger error:', e.message);
    }

    res.status(201).json({
      message: isMitra
        ? `Pesanan B2B Mitra berhasil dibuat dengan skema ${selectedScheme}.`
        : 'Pesanan Retail berhasil dibuat.',
      order
    });
  } catch (err) {
    res.status(500).json({ error: `Gagal membuat order: ${err.message}` });
  }
});

// GET /api/orders (List orders for current user or all for admin)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    let where = {};

    if (user.role === 'CUSTOMER') {
      where.userId = user.id;
    } else if (user.role === 'MITRA') {
      where.userId = user.id;
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { fullName: true, email: true, phoneNumber: true } },
        mitra: { select: { storeName: true, storeCity: true } },
        items: { include: { product: true } }
      }
    });

    res.json({ count: orders.length, orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/:identifier/invoices (List all invoices for an order)
router.get('/:identifier/invoices', authenticateToken, async (req, res) => {
  try {
    const { identifier } = req.params;
    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { id: identifier },
          { orderNumber: identifier }
        ]
      },
      include: {
        invoices: { orderBy: { createdAt: 'asc' } }
      }
    });

    if (!order) return res.status(404).json({ error: 'Order tidak ditemukan' });
    res.json({ count: order.invoices.length, invoices: order.invoices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:identifier/generate-invoice (Generate DP, FINAL, or FULL invoice)
router.post('/:identifier/generate-invoice', authenticateToken, authorizeRoles('ADMIN_FINANCE', 'SUPER_ADMIN', 'MITRA'), async (req, res) => {
  try {
    const { identifier } = req.params;
    const { type = 'FINAL_PAYMENT', amount, dueDate } = req.body;

    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { id: identifier },
          { orderNumber: identifier }
        ]
      }
    });

    if (!order) return res.status(404).json({ error: 'Order tidak ditemukan' });

    let invoiceAmount = amount;
    if (!invoiceAmount) {
      if (type === 'DP_PAYMENT') invoiceAmount = order.dpAmount;
      else if (type === 'FINAL_PAYMENT') invoiceAmount = order.remainingAmount;
      else invoiceAmount = order.totalAmount;
    }

    const due = dueDate ? new Date(dueDate) : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const typeCode = type === 'DP_PAYMENT' ? 'DP' : type === 'FINAL_PAYMENT' ? 'FINAL' : 'FULL';
    const invoiceNumber = `INV-${typeCode}-${order.orderNumber.slice(-6)}-${Date.now().toString().slice(-4)}`;

    const invoice = await prisma.invoice.create({
      data: {
        orderId: order.id,
        invoiceNumber,
        type,
        amount: invoiceAmount,
        dueDate: due,
        status: 'PENDING',
        notes: `Official ${type.replace('_', ' ')} Invoice for Order #${order.orderNumber}`
      }
    });

    res.status(201).json({ message: 'Invoice berhasil diterbitkan', invoice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/:identifier (Search by UUID id or OrderNumber)
router.get('/:identifier', authenticateToken, async (req, res) => {
  try {
    const { identifier } = req.params;
    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { id: identifier },
          { orderNumber: identifier }
        ]
      },
      include: {
        user: { select: { fullName: true, email: true, phoneNumber: true } },
        mitra: true,
        items: { include: { product: true } }
      }
    });

    if (!order) return res.status(404).json({ error: 'Order tidak ditemukan' });

    if (req.user.role === 'CUSTOMER' && order.userId !== req.user.id) {
      return res.status(403).json({ error: 'Akses ditolak.' });
    }
    if (req.user.role === 'MITRA' && order.userId !== req.user.id) {
      return res.status(403).json({ error: 'Akses ditolak.' });
    }

    res.json({ order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:identifier/payment (Midtrans Snap Token Generator)
router.post('/:identifier/payment', authenticateToken, async (req, res) => {
  try {
    const { identifier } = req.params;
    const { paymentType = 'FULL' } = req.body; // 'DP' | 'FINAL' | 'FULL'

    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { id: identifier },
          { orderNumber: identifier }
        ]
      },
      include: {
        user: true,
        items: {
          include: { product: true }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order tidak ditemukan' });
    }

    if (req.user.role === 'CUSTOMER' && order.userId !== req.user.id) {
      return res.status(403).json({ error: 'Akses ditolak.' });
    }
    if (req.user.role === 'MITRA' && order.userId !== req.user.id && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Akses ditolak.' });
    }

    const snapResult = await paymentService.createSnapTransaction(order, paymentType);

    res.status(200).json({
      message: 'Payment token/link berhasil dibuat.',
      ...snapResult
    });
  } catch (err) {
    res.status(500).json({ error: `Gagal membuat payment link: ${err.message}` });
  }
});

// PATCH /api/orders/:identifier/payment (Submit payment & Auto-verify simulation)
router.patch('/:identifier/payment', authenticateToken, async (req, res) => {
  try {
    const { identifier } = req.params;
    const { type, proofUrl, autoVerify = true } = req.body; // type: "DP" | "FINAL" | "FULL"
    
    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { id: identifier },
          { orderNumber: identifier }
        ]
      }
    });

    if (!order) return res.status(404).json({ error: 'Order tidak ditemukan' });

    let updateData = {};
    if (type === 'DP' || order.paymentScheme === 'FULL_PAYMENT' || type === 'FULL') {
      const isFull = order.paymentScheme === 'FULL_PAYMENT' || type === 'FULL';
      updateData = {
        paymentStatus: isFull ? 'FULLY_PAID' : (autoVerify ? 'DP_PAID' : 'DP_PENDING_VERIFICATION'),
        status: isFull ? 'IN_PRODUCTION' : (autoVerify ? 'DP_CONFIRMED' : 'PENDING_PAYMENT'),
        dpProofUrl: proofUrl || 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80',
        dpPaidAt: new Date()
      };
      if (isFull) {
        updateData.finalPaidAt = new Date();
      }
    } else if (type === 'FINAL') {
      updateData = {
        paymentStatus: autoVerify ? 'FULLY_PAID' : 'FINAL_PENDING_VERIFICATION',
        status: autoVerify ? 'FINAL_PAYMENT_CONFIRMED' : order.status,
        finalProofUrl: proofUrl || 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80',
        finalPaidAt: new Date()
      };
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: updateData,
      include: {
        items: { include: { product: true } },
        user: true
      }
    });

    // Trigger Email: DP Payment confirmation
    if (type === 'DP' || order.paymentScheme === 'FULL_PAYMENT' || type === 'FULL') {
      try {
        await emailService.sendDpPaymentReceivedEmail(updated, updated.user);
      } catch (e) {
        console.error('Email trigger error:', e.message);
      }
    }

    res.json({
      message: 'Pembayaran berhasil dikonfirmasi dan diverifikasi.',
      order: updated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/orders/:identifier/status (Admin updates order & payment status)
router.patch('/:identifier/status', authenticateToken, authorizeRoles('ADMIN_FINANCE', 'ADMIN_CATALOG', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { identifier } = req.params;
    const { status, paymentStatus, trackingNumber } = req.body;

    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { id: identifier },
          { orderNumber: identifier }
        ]
      }
    });
    if (!order) return res.status(404).json({ error: 'Order tidak ditemukan' });

    const data = {};
    if (status) data.status = status;
    if (paymentStatus) data.paymentStatus = paymentStatus;
    if (trackingNumber) data.trackingNumber = trackingNumber;

    const updated = await prisma.order.update({
      where: { id: order.id },
      data,
      include: {
        items: { include: { product: true } },
        user: true
      }
    });

    // Trigger Email: Shipping or Status change
    if (status === 'SHIPPED') {
      try {
        await emailService.sendOrderShippedEmail(updated, updated.user);
      } catch (e) {
        console.error('Email trigger error:', e.message);
      }
    }

    res.json({ message: 'Status order berhasil diperbarui.', order: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
