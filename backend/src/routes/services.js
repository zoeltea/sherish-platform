const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/services/bookings (Customer books a service / on-site survey)
router.post('/bookings', authenticateToken, async (req, res) => {
  try {
    const { serviceType, projectAddress, preferredDate, budgetRange, notes } = req.body;

    if (!serviceType || !projectAddress || !preferredDate) {
      return res.status(400).json({ error: 'Tipe layanan, alamat proyek, dan tanggal kunjungan wajib diisi.' });
    }

    const bookingNumber = `SHR-SRV-${Date.now().toString().slice(-6)}`;

    const booking = await prisma.serviceBooking.create({
      data: {
        bookingNumber,
        userId: req.user.id,
        serviceType,
        projectAddress,
        preferredDate: new Date(preferredDate),
        budgetRange: budgetRange || 'Belum Ditentukan',
        notes: notes || '',
        status: 'PENDING'
      }
    });

    res.status(201).json({
      message: 'Permintaan booking layanan berhasil diajukan. Tim arsitek Sherish akan menghubungi Anda.',
      booking
    });
  } catch (err) {
    res.status(500).json({ error: `Gagal membuat booking: ${err.message}` });
  }
});

// GET /api/services/bookings (List bookings by role)
router.get('/bookings', authenticateToken, async (req, res) => {
  try {
    let where = {};
    if (req.user.role === 'CUSTOMER') {
      where.userId = req.user.id;
    }

    const bookings = await prisma.serviceBooking.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { fullName: true, email: true, phoneNumber: true }
        }
      }
    });

    res.json({ count: bookings.length, bookings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/services/bookings/:id/status (Admin assigns architect or updates status)
router.patch('/bookings/:id/status', authenticateToken, authorizeRoles('ADMIN_CATALOG', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { status, assignedArchitect } = req.body;

    const updated = await prisma.serviceBooking.update({
      where: { id: req.params.id },
      data: {
        status,
        assignedArchitect: assignedArchitect !== undefined ? assignedArchitect : undefined
      }
    });

    res.json({ message: 'Status booking berhasil diperbarui', booking: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
