const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const emailService = require('../services/emailService');

const router = express.Router();
const prisma = new PrismaClient();

// All routes require Admin role
router.use(authenticateToken);
router.use(authorizeRoles('ADMIN_CATALOG', 'ADMIN_FINANCE', 'ADMIN_QUALITY', 'ADMIN_CS', 'SUPER_ADMIN'));

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
