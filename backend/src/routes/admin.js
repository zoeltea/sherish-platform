const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const emailService = require('../services/emailService');

const router = express.Router();
const prisma = new PrismaClient();

// All routes require Admin role
router.use(authenticateToken);
router.use(authorizeRoles('ADMIN_CATALOG', 'ADMIN_FINANCE', 'ADMIN_QUALITY', 'ADMIN_CS', 'SUPER_ADMIN'));

// GET /api/admin/finance/dashboard (Finance overview metrics)
router.get('/finance/dashboard', authorizeRoles('ADMIN_FINANCE', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const invoices = await prisma.invoice.findMany({
      include: { order: { include: { user: true, mitra: true } } }
    });

    const totalPending = invoices.filter(i => i.status === 'PENDING').reduce((sum, i) => sum + i.amount, 0);
    const totalPaid = invoices.filter(i => i.status === 'PAID').reduce((sum, i) => sum + i.amount, 0);
    const totalOverdue = invoices.filter(i => i.status === 'OVERDUE' || (i.status === 'PENDING' && new Date(i.dueDate) < new Date())).reduce((sum, i) => sum + i.amount, 0);

    const pendingCount = invoices.filter(i => i.status === 'PENDING').length;
    const paidCount = invoices.filter(i => i.status === 'PAID').length;
    const overdueCount = invoices.filter(i => i.status === 'OVERDUE' || (i.status === 'PENDING' && new Date(i.dueDate) < new Date())).length;

    res.json({
      totalPending,
      totalPaid,
      totalOverdue,
      pendingCount,
      paidCount,
      overdueCount,
      totalInvoices: invoices.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/finance/invoices (Paginated / Filterable invoice list for finance)
router.get('/finance/invoices', authorizeRoles('ADMIN_FINANCE', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { status, type } = req.query;
    const where = {};
    if (status) where.status = status;
    if (type) where.type = type;

    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          include: {
            user: { select: { fullName: true, email: true, phoneNumber: true } },
            mitra: { select: { storeName: true, workArea: true, storeCity: true } }
          }
        }
      }
    });

    res.json({ count: invoices.length, invoices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/finance/invoices/:id/mark-paid (Reconciliation mark paid)
router.patch('/finance/invoices/:id/mark-paid', authorizeRoles('ADMIN_FINANCE', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { paidDate, paymentMethod = 'Bank Transfer BCA', notes } = req.body;

    const updated = await prisma.invoice.update({
      where: { id: req.params.id },
      data: {
        status: 'PAID',
        paidDate: paidDate ? new Date(paidDate) : new Date(),
        paymentMethod,
        notes: notes || 'Rekonsiliasi pembayaran diverifikasi oleh Admin Finance'
      },
      include: {
        order: {
          include: { user: true, mitra: true }
        }
      }
    });

    // If DP invoice marked paid, update order to DP_CONFIRMED / IN_PRODUCTION
    if (updated.type === 'DP_PAYMENT') {
      await prisma.order.update({
        where: { id: updated.orderId },
        data: {
          paymentStatus: 'DP_PAID',
          status: 'IN_PRODUCTION',
          dpPaidAt: updated.paidDate
        }
      });
    } else if (updated.type === 'FINAL_PAYMENT' || updated.type === 'FULL_PAYMENT') {
      await prisma.order.update({
        where: { id: updated.orderId },
        data: {
          paymentStatus: 'FULLY_PAID',
          status: 'FINAL_PAYMENT_CONFIRMED',
          finalPaidAt: updated.paidDate
        }
      });
    }

    res.json({ message: `Faktur ${updated.invoiceNumber} berhasil ditandai LUNAS`, invoice: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/finance/settlement (Monthly Settlement Report)
router.get('/finance/settlement', authorizeRoles('ADMIN_FINANCE', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const invoices = await prisma.invoice.findMany({
      where: { status: 'PAID' },
      include: { order: true }
    });

    const monthlySettlement = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      monthName: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][i],
      dpCollected: 0,
      finalCollected: 0,
      fullCollected: 0,
      totalCollected: 0,
      invoiceCount: 0
    }));

    invoices.forEach(inv => {
      const d = inv.paidDate ? new Date(inv.paidDate) : new Date(inv.createdAt);
      if (d.getFullYear() === year) {
        const m = d.getMonth();
        if (inv.type === 'DP_PAYMENT') monthlySettlement[m].dpCollected += inv.amount;
        else if (inv.type === 'FINAL_PAYMENT') monthlySettlement[m].finalCollected += inv.amount;
        else if (inv.type === 'FULL_PAYMENT') monthlySettlement[m].fullCollected += inv.amount;

        monthlySettlement[m].totalCollected += inv.amount;
        monthlySettlement[m].invoiceCount += 1;
      }
    });

    const grandTotal = monthlySettlement.reduce((sum, m) => sum + m.totalCollected, 0);

    res.json({
      year,
      grandTotal,
      monthlySettlement
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/stats (Overview dashboard stats)
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await prisma.user.count({ where: { role: 'CUSTOMER' } });
    const totalMitra = await prisma.mitraProfile.count();
    const pendingMitraVerification = await prisma.mitraProfile.count({ where: { status: 'PENDING_VERIFICATION' } });
    const totalProducts = await prisma.product.count();
    const totalOrders = await prisma.order.count();
    const totalBookings = await prisma.serviceBooking.count();

    const revenueResult = await prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: { status: { in: ['DP_CONFIRMED', 'MATERIALS_PREPARATION', 'IN_PRODUCTION', 'QUALITY_CHECK', 'READY_FOR_SHIPMENT', 'FINAL_PAYMENT_CONFIRMED', 'SHIPPED', 'COMPLETED'] } }
    });

    const recentOrders = await prisma.order.findMany({
      take: 6,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { fullName: true, email: true } },
        mitra: { select: { storeName: true } }
      }
    });

    const recentBookings = await prisma.serviceBooking.findMany({
      take: 6,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { fullName: true, email: true, phoneNumber: true } }
      }
    });

    res.json({
      metrics: {
        totalRevenue: revenueResult._sum.totalAmount || 0,
        totalOrders,
        totalBookings,
        totalUsers,
        totalMitra,
        pendingMitraVerification,
        totalProducts
      },
      recentOrders,
      recentBookings
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/mitra (List all mitra & pending verification, supports ?status= and ?workArea=)
router.get('/mitra', async (req, res) => {
  try {
    const { status, workArea } = req.query;
    const where = {};
    if (status) where.status = status;
    if (workArea) where.workArea = { contains: workArea, mode: 'insensitive' };

    const mitras = await prisma.mitraProfile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { fullName: true, email: true, phoneNumber: true, isActive: true } },
        _count: { select: { orders: true } }
      }
    });

    res.json({ count: mitras.length, mitras });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/mitra/by-area/:area (Filter mitra by region / work area)
router.get('/mitra/by-area/:area', async (req, res) => {
  try {
    const { area } = req.params;
    const mitras = await prisma.mitraProfile.findMany({
      where: {
        OR: [
          { workArea: { contains: area, mode: 'insensitive' } },
          { storeCity: { contains: area, mode: 'insensitive' } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { fullName: true, email: true, phoneNumber: true, isActive: true } },
        _count: { select: { orders: true } }
      }
    });

    res.json({ area, count: mitras.length, mitras });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/mitra/:id/status (Approve / Reject / Suspend Mitra)
router.patch('/mitra/:id/status', authorizeRoles('ADMIN_QUALITY', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { status } = req.body; // VERIFIED, REJECTED, SUSPENDED, PENDING_VERIFICATION
    const updated = await prisma.mitraProfile.update({
      where: { id: req.params.id },
      data: { status },
      include: {
        user: { select: { fullName: true, email: true } }
      }
    });

    if (status === 'VERIFIED') {
      try {
        await emailService.sendKYCApprovedEmail(updated, updated.user);
      } catch (e) {
        console.error('Email KYC trigger error:', e.message);
      }
    }

    res.json({ message: `Status verifikasi mitra diperbarui menjadi ${status}`, mitra: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/commissions (List all referral commissions for finance/admin)
router.get('/commissions', async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};

    const commissions = await prisma.referralCommission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        sales: { select: { fullName: true, email: true, phoneNumber: true } },
        referredMitra: { select: { storeName: true, storeCity: true, mitraType: true, workArea: true } }
      }
    });

    const totalPending = commissions.filter(c => c.status === 'PENDING').reduce((sum, c) => sum + c.commissionAmount, 0);
    const totalApproved = commissions.filter(c => c.status === 'APPROVED').reduce((sum, c) => sum + c.commissionAmount, 0);
    const totalPaid = commissions.filter(c => c.status === 'PAID').reduce((sum, c) => sum + c.commissionAmount, 0);

    res.json({
      summary: {
        totalPending,
        totalApproved,
        totalPaid,
        count: commissions.length
      },
      commissions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/commissions/:id/status (Approve/Reject/Mark Paid commission)
router.patch('/commissions/:id/status', authorizeRoles('ADMIN_FINANCE', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { status, notes } = req.body;
    const updateData = { status };
    if (status === 'PAID') updateData.paidAt = new Date();
    if (notes) updateData.notes = notes;

    const updated = await prisma.referralCommission.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        sales: { select: { fullName: true, email: true } },
        referredMitra: { select: { storeName: true } }
      }
    });

    res.json({ message: `Status komisi referral diperbarui menjadi ${status}`, commission: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/emails (View sent email notifications log)
router.get('/emails', async (req, res) => {
  try {
    const logs = emailService.getEmailLogs();
    res.json({ count: logs.length, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users (User management for Super Admin)
router.get('/users', authorizeRoles('SUPER_ADMIN'), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        fullName: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        createdAt: true,
        mitraProfile: { select: { storeName: true, status: true } }
      }
    });
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
