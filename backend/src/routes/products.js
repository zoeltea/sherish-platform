const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/products (Public catalog with filters - Shows Retail basePrice for public)
router.get('/', async (req, res) => {
  try {
    const { category, search, minPrice, maxPrice, sort } = req.query;

    const where = { status: 'PUBLISHED' };

    if (category && category !== 'all') {
      where.categorySlug = category;
    }

    if (minPrice || maxPrice) {
      where.basePrice = {};
      if (minPrice) where.basePrice.gte = parseFloat(minPrice);
      if (maxPrice) where.basePrice.lte = parseFloat(maxPrice);
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    let orderBy = { createdAt: 'desc' };
    if (sort === 'price_asc') orderBy = { basePrice: 'asc' };
    if (sort === 'price_desc') orderBy = { basePrice: 'desc' };
    if (sort === 'rating') orderBy = { rating: 'desc' };

    const products = await prisma.product.findMany({
      where,
      orderBy,
      include: { category: true }
    });

    res.json({ count: products.length, products });
  } catch (err) {
    res.status(500).json({ error: `Gagal memuat produk: ${err.message}` });
  }
});

// GET /api/products/categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: { select: { products: true } }
      }
    });
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/:slugOrId
router.get('/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { slug: identifier },
          { id: identifier }
        ]
      },
      include: {
        category: true,
        reviews: {
          include: {
            user: { select: { fullName: true, avatarUrl: true } }
          }
        }
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Produk tidak ditemukan.' });
    }

    res.json({ product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products (Admin creates new product with Dual Price: Retail & Mitra)
router.post('/', authenticateToken, authorizeRoles('ADMIN_CATALOG', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const {
      title,
      description,
      basePrice,
      mitraPrice,
      categorySlug,
      materials,
      finishings,
      defaultLength,
      defaultWidth,
      defaultHeight,
      allowCustomDim,
      images,
      stock
    } = req.body;

    if (!title || !basePrice || !categorySlug) {
      return res.status(400).json({ error: 'Judul produk, harga retail, dan kategori wajib diisi.' });
    }

    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString().slice(-4);
    const retail = parseFloat(basePrice);
    // Default mitra price is 25% discount if not specified
    const wholesale = mitraPrice ? parseFloat(mitraPrice) : Math.round(retail * 0.75);

    const product = await prisma.product.create({
      data: {
        title,
        slug,
        description: description || '',
        basePrice: retail,
        mitraPrice: wholesale,
        categorySlug,
        isSherishOfficial: true,
        status: 'PUBLISHED',
        materials: materials || ['Jati Solid Perhutani', 'Sungkai Alami', 'Walnut Wood'],
        finishings: finishings || ['Natural Matte Oil', 'Dark Walnut Stain'],
        defaultLength: defaultLength ? parseFloat(defaultLength) : 100,
        defaultWidth: defaultWidth ? parseFloat(defaultWidth) : 60,
        defaultHeight: defaultHeight ? parseFloat(defaultHeight) : 75,
        allowCustomDim: allowCustomDim !== undefined ? allowCustomDim : true,
        images: images && images.length > 0 ? images : ['https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80'],
        stock: stock ? parseInt(stock) : 10
      }
    });

    res.status(201).json({
      message: 'Produk resmi pabrik Sherish berhasil ditambahkan.',
      product
    });
  } catch (err) {
    res.status(500).json({ error: `Gagal membuat produk: ${err.message}` });
  }
});

// PATCH /api/products/:id (Update product details & dual prices)
router.patch('/:id', authenticateToken, authorizeRoles('ADMIN_CATALOG', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, basePrice, mitraPrice, stock, status, description } = req.body;

    const data = {};
    if (title) data.title = title;
    if (basePrice) data.basePrice = parseFloat(basePrice);
    if (mitraPrice) data.mitraPrice = parseFloat(mitraPrice);
    if (stock !== undefined) data.stock = parseInt(stock);
    if (status) data.status = status;
    if (description !== undefined) data.description = description;

    const updated = await prisma.product.update({
      where: { id },
      data
    });

    res.json({ message: 'Produk berhasil diperbarui.', product: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
