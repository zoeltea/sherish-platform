const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/mitra/profile (Mitra gets own store/sales profile)
router.get('/profile', authenticateToken, authorizeRoles('MITRA', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const profile = await prisma.mitraProfile.findUnique({
      where: { userId: req.user.id },
      include: {
        user: { select: { fullName: true, email: true, phoneNumber: true, avatarUrl: true } },
        _count: { select: { orders: true } }
      }
    });

    if (!profile) return res.status(404).json({ error: 'Profil mitra tidak ditemukan.' });
    res.json({ profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mitra/catalog (B2B Wholesale Catalog with Margin Calculator for Mitra)
router.get('/catalog', authenticateToken, authorizeRoles('MITRA', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { category, search } = req.query;
    const where = { status: 'PUBLISHED' };

    if (category && category !== 'all') {
      where.categorySlug = category;
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { category: true }
    });

    // Map margin calculation
    const b2bProducts = products.map(p => {
      const margin = p.basePrice - p.mitraPrice;
      const marginPercent = Math.round((margin / p.basePrice) * 100);
      return {
        ...p,
        potentialMargin: margin,
        marginPercent
      };
    });

    res.json({ count: b2bProducts.length, products: b2bProducts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mitra/stats (Dashboard analytics for Mitra Toko/Sales)
router.get('/stats', authenticateToken, authorizeRoles('MITRA'), async (req, res) => {
  try {
    const mitra = req.user.mitraProfile;
    if (!mitra) return res.status(404).json({ error: 'Mitra profile not found' });

    const totalOrders = await prisma.order.count({ where: { mitraId: mitra.id } });
    const inProductionOrders = await prisma.order.count({
      where: {
        mitraId: mitra.id,
        status: { in: ['DP_CONFIRMED', 'MATERIALS_PREPARATION', 'IN_PRODUCTION', 'QUALITY_CHECK'] }
      }
    });
    const readyForShipmentOrders = await prisma.order.count({
      where: { mitraId: mitra.id, status: 'READY_FOR_SHIPMENT' }
    });

    const totalSpendResult = await prisma.order.aggregate({
      _sum: { totalAmount: true, dpAmount: true, remainingAmount: true },
      where: { mitraId: mitra.id, paymentStatus: { in: ['DP_PAID', 'FULLY_PAID'] } }
    });

    const recentOrders = await prisma.order.findMany({
      where: { mitraId: mitra.id },
      take: 6,
      orderBy: { createdAt: 'desc' },
      include: { items: { include: { product: true } } }
    });

    res.json({
      stats: {
        storeName: mitra.storeName,
        partnerType: mitra.partnerType,
        discountTierPercent: Math.round(mitra.discountTier * 100),
        totalOrders,
        inProductionOrders,
        readyForShipmentOrders,
        totalProcurementValue: totalSpendResult._sum.totalAmount || 0,
        totalDpPaid: totalSpendResult._sum.dpAmount || 0,
        totalRemainingPayable: totalSpendResult._sum.remainingAmount || 0
      },
      recentOrders
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mitra/sales/dashboard (Sales canvaser / partner dedicated dashboard metrics)
router.get('/sales/dashboard', authenticateToken, authorizeRoles('MITRA', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const salesId = (req.user.role === 'SUPER_ADMIN' && req.query.salesId) ? req.query.salesId : req.user.id;

    const commissions = await prisma.referralCommission.findMany({
      where: { salesId },
      include: {
        referredMitra: {
          include: {
            user: { select: { fullName: true, email: true, phoneNumber: true } },
            orders: { select: { id: true, totalAmount: true, status: true } }
          }
        }
      }
    });

    const totalCommissions = commissions.reduce((sum, c) => sum + (c.status === 'PAID' || c.status === 'APPROVED' ? c.commissionAmount : 0), 0);
    const pendingCommissions = commissions.reduce((sum, c) => sum + (c.status === 'PENDING' ? c.commissionAmount : 0), 0);
    const paidCommissions = commissions.reduce((sum, c) => sum + (c.status === 'PAID' ? c.commissionAmount : 0), 0);

    const referralCount = commissions.length;
    const activeReferrals = commissions.filter(c => c.referredMitra?.orders?.length > 0 || c.referredMitra?.status === 'VERIFIED').length;

    let topReferral = null;
    if (commissions.length > 0) {
      const sorted = [...commissions].sort((a, b) => b.commissionAmount - a.commissionAmount);
      topReferral = {
        name: sorted[0].referredMitra?.storeName || '-',
        commission: sorted[0].commissionAmount,
        status: sorted[0].status
      };
    }

    res.json({
      totalCommissions,
      pendingCommissions,
      paidCommissions,
      referralCount,
      activeReferrals,
      topReferral,
      commissions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mitra/sales/referrals (List referred mitra with filter)
router.get('/sales/referrals', authenticateToken, authorizeRoles('MITRA', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const salesId = (req.user.role === 'SUPER_ADMIN' && req.query.salesId) ? req.query.salesId : req.user.id;
    const { status } = req.query;

    const where = { referralSalesId: salesId };
    if (status) where.status = status;

    const referrals = await prisma.mitraProfile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { fullName: true, email: true, phoneNumber: true } },
        commissions: { where: { salesId } },
        orders: { select: { id: true, orderNumber: true, totalAmount: true, status: true } }
      }
    });

    res.json({ count: referrals.length, referrals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mitra/sales/performance (Monthly performance trend for sales partner)
router.get('/sales/performance', authenticateToken, authorizeRoles('MITRA', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const salesId = (req.user.role === 'SUPER_ADMIN' && req.query.salesId) ? req.query.salesId : req.user.id;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const commissions = await prisma.referralCommission.findMany({
      where: { salesId }
    });

    const monthlyStats = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      monthName: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][i],
      commissions: 0,
      referralCount: 0
    }));

    commissions.forEach(c => {
      const d = new Date(c.createdAt);
      if (d.getFullYear() === year) {
        const m = d.getMonth();
        monthlyStats[m].commissions += c.commissionAmount;
        monthlyStats[m].referralCount += 1;
      }
    });

    res.json({ year, monthlyStats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mitra/sales/commissions (Get commissions for sales partner)
router.get('/sales/commissions', authenticateToken, authorizeRoles('MITRA', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const salesId = (req.user.role === 'SUPER_ADMIN' && req.query.salesId) ? req.query.salesId : req.user.id;
    
    const commissions = await prisma.referralCommission.findMany({
      where: { salesId },
      orderBy: { createdAt: 'desc' },
      include: {
        referredMitra: {
          include: {
            user: { select: { fullName: true, email: true, phoneNumber: true } }
          }
        }
      }
    });

    const totalCommissions = commissions.reduce((sum, c) => sum + (c.status === 'PAID' || c.status === 'APPROVED' ? c.commissionAmount : 0), 0);
    const pendingCommissions = commissions.reduce((sum, c) => sum + (c.status === 'PENDING' ? c.commissionAmount : 0), 0);
    const paidCommissions = commissions.reduce((sum, c) => sum + (c.status === 'PAID' ? c.commissionAmount : 0), 0);

    res.json({
      summary: {
        totalCommissions,
        pendingCommissions,
        paidCommissions,
        totalReferrals: commissions.length
      },
      commissions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/mitra/sales/commission/:id/approve (Admin/Sales supervisor approves commission)
router.patch('/sales/commission/:id/approve', authenticateToken, authorizeRoles('ADMIN_FINANCE', 'SUPER_ADMIN', 'MITRA'), async (req, res) => {
  try {
    const { status = 'APPROVED', notes } = req.body;
    const updateData = { status };
    if (status === 'PAID') {
      updateData.paidAt = new Date();
    }
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

// PATCH /api/mitra/profile (Update mitra profile data)
router.patch('/profile', authenticateToken, authorizeRoles('MITRA', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { storeName, partnerType, storeCity, storeAddress, workArea, description, bankName, bankAccountNo, bankAccountName } = req.body;
    
    const targetUserId = req.user.role === 'SUPER_ADMIN' && req.body.userId ? req.body.userId : req.user.id;
    
    const updateData = {};
    if (storeName) updateData.storeName = storeName;
    if (partnerType) updateData.partnerType = partnerType;
    if (storeCity) updateData.storeCity = storeCity;
    if (storeAddress) updateData.storeAddress = storeAddress;
    if (workArea) updateData.workArea = workArea;
    if (description !== undefined) updateData.description = description;
    if (bankName) updateData.bankName = bankName;
    if (bankAccountNo) updateData.bankAccountNo = bankAccountNo;
    if (bankAccountName) updateData.bankAccountName = bankAccountName;

    const updated = await prisma.mitraProfile.update({
      where: { userId: targetUserId },
      data: updateData,
      include: {
        user: { select: { fullName: true, email: true, phoneNumber: true } }
      }
    });

    res.json({ message: 'Profil mitra berhasil diperbarui', profile: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
