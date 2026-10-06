const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const { JWT_SECRET } = require('../middlewares/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Rate limiting middleware for Auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per windowMs
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  message: {
    error: 'Terlalu banyak percobaan request dari IP ini. Silakan coba lagi setelah 15 menit.'
  }
});

// Stricter limiter for Login to prevent brute-force attacks
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login attempts per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Terlalu banyak percobaan login gagal. Silakan coba lagi setelah 15 menit.'
  }
});

// Helper for validating email format
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return typeof email === 'string' && re.test(email.trim());
}

// POST /api/auth/register (Customer & Mitra)
router.post('/register', authLimiter, async (req, res) => {
  try {
    const {
      email,
      password,
      fullName,
      phoneNumber,
      role,
      storeName,
      partnerType,
      mitraType,
      referralSalesId,
      storeCity,
      storeAddress,
      workArea,
      workAreaRegions,
      description
    } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'Email, password, dan nama lengkap wajib diisi.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) {
      return res.status(400).json({ error: 'Format email tidak valid.' });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password minimal harus 6 karakter.' });
    }

    const cleanFullName = String(fullName).trim();
    if (cleanFullName.length < 2) {
      return res.status(400).json({ error: 'Nama lengkap minimal 2 karakter.' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email sudah terdaftar dalam sistem.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const assignedRole = role === 'MITRA' ? 'MITRA' : 'CUSTOMER';

    const validMitraTypes = ['OUTLET_INTERNAL', 'MITRA_TOKO', 'RESELLER', 'SALES_CANVASER', 'DIGITAL_MARKETING'];
    const resolvedMitraType = validMitraTypes.includes(mitraType) ? mitraType : 'MITRA_TOKO';

    const user = await prisma.user.create({
      data: {
        email: cleanEmail,
        passwordHash,
        fullName: cleanFullName,
        phoneNumber: phoneNumber ? String(phoneNumber).trim() : null,
        role: assignedRole,
        mitraProfile: assignedRole === 'MITRA' ? {
          create: {
            storeName: storeName ? String(storeName).trim() : `${cleanFullName} Store`,
            partnerType: partnerType ? String(partnerType).trim() : 'TOKO_FURNITUR',
            mitraType: resolvedMitraType,
            referralSalesId: referralSalesId || null,
            storeCity: storeCity ? String(storeCity).trim() : 'Indonesia',
            storeAddress: storeAddress ? String(storeAddress).trim() : '-',
            workArea: workArea ? String(workArea).trim() : (storeCity ? String(storeCity).trim() : 'Bandung'),
            workAreaRegions: typeof workAreaRegions === 'object' ? JSON.stringify(workAreaRegions) : (workAreaRegions || null),
            description: description ? String(description).trim() : null,
            status: 'PENDING_VERIFICATION'
          }
        } : undefined
      },
      include: {
        mitraProfile: {
          include: { referralSales: { select: { fullName: true, email: true, phoneNumber: true } } }
        }
      }
    });

    // If referralSalesId is provided and valid, auto-create a referral commission entry (reward on onboarding/first order)
    if (assignedRole === 'MITRA' && user.mitraProfile && referralSalesId) {
      await prisma.referralCommission.create({
        data: {
          salesId: referralSalesId,
          referredMitraId: user.mitraProfile.id,
          commissionAmount: 500000, // IDR 500.000 standard referral onboarding bonus
          commissionRate: 0.05,
          status: 'PENDING',
          notes: `Referral bonus pendaftaran mitra baru: ${user.mitraProfile.storeName}`
        }
      });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Registrasi berhasil',
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        mitraProfile: user.mitraProfile
      }
    });
  } catch (err) {
    res.status(500).json({ error: `Gagal mendaftar: ${err.message}` });
  }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: { mitraProfile: true }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Email tidak ditemukan atau akun dinonaktifkan.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Password yang dimasukkan salah.' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login berhasil',
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        avatarUrl: user.avatarUrl,
        mitraProfile: user.mitraProfile
      }
    });
  } catch (err) {
    res.status(500).json({ error: `Gagal login: ${err.message}` });
  }
});

// GET /api/auth/sales (Get available sales/canvasers by work area or all)
router.get('/sales', async (req, res) => {
  try {
    const { workArea } = req.query;
    const where = {
      role: 'MITRA',
      isActive: true,
      mitraProfile: {
        mitraType: 'SALES_CANVASER'
      }
    };

    if (workArea) {
      where.mitraProfile.workArea = { contains: String(workArea).trim(), mode: 'insensitive' };
    }

    const salesList = await prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        mitraProfile: {
          select: {
            id: true,
            storeName: true,
            workArea: true,
            storeCity: true
          }
        }
      }
    });

    res.json({ count: salesList.length, sales: salesList });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { mitraProfile: true }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch {
    res.status(403).json({ error: 'Invalid token' });
  }
});

module.exports = router;
