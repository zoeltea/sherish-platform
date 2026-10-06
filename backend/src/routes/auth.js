const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { JWT_SECRET } = require('../middlewares/auth');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/auth/register (Customer & Mitra)
router.post('/register', async (req, res) => {
  try {
    const {
      email,
      password,
      fullName,
      phoneNumber,
      role,
      storeName,
      partnerType,
      storeCity,
      storeAddress,
      workArea,
      workAreaRegions,
      description
    } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'Email, password, dan nama lengkap wajib diisi.' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email sudah terdaftar dalam sistem.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const assignedRole = role === 'MITRA' ? 'MITRA' : 'CUSTOMER';

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        phoneNumber,
        role: assignedRole,
        mitraProfile: assignedRole === 'MITRA' ? {
          create: {
            storeName: storeName || `${fullName} Store`,
            partnerType: partnerType || 'TOKO_FURNITUR',
            storeCity: storeCity || 'Indonesia',
            storeAddress: storeAddress || '-',
            workArea: workArea || storeCity || 'Bandung',
            workAreaRegions: typeof workAreaRegions === 'object' ? JSON.stringify(workAreaRegions) : (workAreaRegions || null),
            description: description || null,
            status: 'PENDING_VERIFICATION'
          }
        } : undefined
      },
      include: { mitraProfile: true }
    });

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
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi.' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
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
