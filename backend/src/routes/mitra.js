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

module.exports = router;
