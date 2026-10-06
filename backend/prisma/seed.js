const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding updated Sherish B2B & B2C Manufacturer data...');

  const passwordHash = await bcrypt.hash('Sherish123!', 10);

  // 1. Create Users
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@sherish.co.id' },
    update: {},
    create: {
      email: 'superadmin@sherish.co.id',
      passwordHash,
      fullName: 'Bambang S. (Super Admin)',
      phoneNumber: '0811000001',
      role: 'SUPER_ADMIN',
      avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=150&q=80'
    }
  });

  const catalogAdmin = await prisma.user.upsert({
    where: { email: 'catalog@sherish.co.id' },
    update: {},
    create: {
      email: 'catalog@sherish.co.id',
      passwordHash,
      fullName: 'Rian Arsitek (Catalog Admin)',
      phoneNumber: '0811000002',
      role: 'ADMIN_CATALOG'
    }
  });

  const financeAdmin = await prisma.user.upsert({
    where: { email: 'finance@sherish.co.id' },
    update: {},
    create: {
      email: 'finance@sherish.co.id',
      passwordHash,
      fullName: 'Siti Finance (Finance Admin)',
      phoneNumber: '0811000003',
      role: 'ADMIN_FINANCE'
    }
  });

    // Mitra Toko / Sales Partner
  const salesCanvaserUser = await prisma.user.upsert({
    where: { email: 'budi.sales@sherish.co.id' },
    update: {},
    create: {
      email: 'budi.sales@sherish.co.id',
      passwordHash,
      fullName: 'Budi Cahyadi (Sales Canvaser Bandung)',
      phoneNumber: '08122334455',
      role: 'MITRA',
      avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80'
    }
  });

  const salesProfile = await prisma.mitraProfile.upsert({
    where: { userId: salesCanvaserUser.id },
    update: {},
    create: {
      userId: salesCanvaserUser.id,
      storeName: 'Sherish Canvaser Bandung Raya',
      partnerType: 'INDEPENDENT_SALES',
      mitraType: 'SALES_CANVASER',
      storeCity: 'Bandung',
      storeAddress: 'Jl. Pasirkaliki No. 45, Bandung',
      workArea: 'Bandung',
      description: 'Sales Canvaser & Field Representative Resmi Area Bandung Raya',
      status: 'VERIFIED',
      discountTier: 0.25,
      bankName: 'BCA',
      bankAccountNo: '8830998811',
      bankAccountName: 'Budi Cahyadi'
    }
  });

  // Mitra Toko / Toko Rekanan
  const mitraUser = await prisma.user.upsert({
    where: { email: 'mitra.toko@interiorhub.id' },
    update: {},
    create: {
      email: 'mitra.toko@interiorhub.id',
      passwordHash,
      fullName: 'Hendra Saputra (Toko Mitra)',
      phoneNumber: '081298765432',
      role: 'MITRA',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80'
    }
  });

  // Retail Customer User
  const customerUser = await prisma.user.upsert({
    where: { email: 'zul.customer@gmail.com' },
    update: {},
    create: {
      email: 'zul.customer@gmail.com',
      passwordHash,
      fullName: 'Zul Yatman',
      phoneNumber: '081123123123',
      role: 'CUSTOMER',
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'
    }
  });

  // 2. Create Mitra Profile (Toko Rekanan Resmi)
  const mitraProfile = await prisma.mitraProfile.upsert({
    where: { userId: mitraUser.id },
    update: {
      workArea: 'Bandung',
      mitraType: 'MITRA_TOKO',
      referralSalesId: salesCanvaserUser.id
    },
    create: {
      userId: mitraUser.id,
      storeName: 'Living Sanctuary Gallery (Toko Rekanan Bandung)',
      partnerType: 'TOKO_FURNITUR',
      mitraType: 'MITRA_TOKO',
      referralSalesId: salesCanvaserUser.id,
      storeCity: 'Bandung',
      storeAddress: 'Jl. R.E. Martadinata No. 128, Riau, Bandung',
      workArea: 'Bandung',
      description: 'Showroom interior & toko furnitur rekanan resmi Sherish di kota Bandung.',
      status: 'VERIFIED',
      discountTier: 0.25, // Diskon B2B 25% dari Harga Retail
      bankName: 'BCA',
      bankAccountNo: '8830192831',
      bankAccountName: 'Hendra Saputra'
    }
  });

  // Sample Referral Commission
  const existingCommission = await prisma.referralCommission.findFirst({
    where: { salesId: salesCanvaserUser.id, referredMitraId: mitraProfile.id }
  });
  if (!existingCommission) {
    await prisma.referralCommission.create({
      data: {
        salesId: salesCanvaserUser.id,
        referredMitraId: mitraProfile.id,
        commissionAmount: 667500, // 5% dari order perdana Rp 13.350.000
        commissionRate: 0.05,
        status: 'APPROVED',
        notes: 'Komisi onboarding dan transaksi perdana Toko Mitra Bandung'
      }
    });
  }

  // 3. Create Categories
  const categories = [
    {
      name: 'Living Room',
      slug: 'living-room',
      description: 'Furnitur ruang keluarga berestetika Zen dan material kayu hangat.',
      imageUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Dining & Kitchen',
      slug: 'dining-kitchen',
      description: 'Meja makan solid wood dan kursi ergonomis untuk momen kebersamaan.',
      imageUrl: 'https://images.unsplash.com/photo-1617806118233-18e1de247200?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Bedroom Sanctuary',
      slug: 'bedroom',
      description: 'Ranjang kayu minimalis dan nakas penunjang tidur berkualitas.',
      imageUrl: 'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=600&q=80'
    },
    {
      name: 'Workspace & Studio',
      slug: 'workspace',
      description: 'Meja kerja hening dan rak buku modular bebas distraksi.',
      imageUrl: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=600&q=80'
    }
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat
    });
  }

  // 4. Create Products Diproduksi oleh Pabrik Sherish (Dual Price: Retail & Mitra B2B)
  const products = [
    {
      title: 'Sanctuary Teak Lounge Chair',
      slug: 'sanctuary-teak-lounge-chair',
      description: 'Kursi santai berbalut kayu jati grade A dengan bantalan linen organik bernapas. Dirancang ergonomis untuk waktu relaksasi dan membaca hening.',
      basePrice: 4250000,   // Harga Retail B2C
      mitraPrice: 3187500,  // Harga Khusus Mitra (Margin Untung Mitra: Rp 1.062.500)
      categorySlug: 'living-room',
      isSherishOfficial: true,
      status: 'PUBLISHED',
      materials: ['Jati Solid Perhutani', 'Sungkai Alami', 'Walnut Wood'],
      finishings: ['Natural Matte Oil', 'Dark Walnut Stain', 'Bleached Teak'],
      defaultLength: 85,
      defaultWidth: 78,
      defaultHeight: 82,
      allowCustomDim: true,
      stock: 25,
      rating: 4.95,
      reviewCount: 28,
      images: [
        'https://images.unsplash.com/photo-1580481077195-c3a8a63ea389?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&w=800&q=80'
      ]
    },
    {
      title: 'Hening Minimalist Coffee Table',
      slug: 'hening-minimalist-coffee-table',
      description: 'Meja kopi bergaya Japandi dengan tepian melengkung lembut (soft curved edges) yang aman untuk anak dan menghadirkan aliran energi yang tenang di ruang keluarga.',
      basePrice: 3100000,   // Retail
      mitraPrice: 2325000,  // Mitra (Margin: Rp 775.000)
      categorySlug: 'living-room',
      isSherishOfficial: true,
      status: 'PUBLISHED',
      materials: ['Kayu Jati Solid', 'Kayu Sungkai'],
      finishings: ['Natural Matte', 'Warm Oak'],
      defaultLength: 120,
      defaultWidth: 60,
      defaultHeight: 42,
      allowCustomDim: true,
      stock: 15,
      rating: 4.88,
      reviewCount: 19,
      images: [
        'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80'
      ]
    },
    {
      title: 'Komorebi Solid Dining Table 6-Seater',
      slug: 'komorebi-solid-dining-table',
      description: 'Meja makan kayu utuh dengan ketebalan 4cm yang menampilkan urat kayu alami unik pada setiap unitnya. Cocok untuk ruang makan hangat bernuansa natural.',
      basePrice: 8900000,   // Retail
      mitraPrice: 6675000,  // Mitra (Margin: Rp 2.225.000)
      categorySlug: 'dining-kitchen',
      isSherishOfficial: true,
      status: 'PUBLISHED',
      materials: ['Kayu Jati Utuh', 'Kayu Trembesi Pilihan'],
      finishings: ['Natural Doff Coat', 'Smoked Black'],
      defaultLength: 200,
      defaultWidth: 90,
      defaultHeight: 75,
      allowCustomDim: true,
      stock: 10,
      rating: 5.0,
      reviewCount: 14,
      images: [
        'https://images.unsplash.com/photo-1617806118233-18e1de247200?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1615066390971-03e4e1c36ddf?auto=format&fit=crop&w=800&q=80'
      ]
    },
    {
      title: 'Zen Low-Profile Bed Frame (King Size)',
      slug: 'zen-low-profile-bed-frame',
      description: 'Ranjang platform rendah dengan tatami slat support terintegrasi dan headboard kayu miring yang nyaman untuk bersandar. Memberikan kesan lapang pada kamar tidur.',
      basePrice: 9500000,   // Retail
      mitraPrice: 7125000,  // Mitra (Margin: Rp 2.375.000)
      categorySlug: 'bedroom',
      isSherishOfficial: true,
      status: 'PUBLISHED',
      materials: ['Kayu Jati Solid', 'Kayu Mahoni Oven'],
      finishings: ['Natural Warm', 'Charcoal Doff'],
      defaultLength: 210,
      defaultWidth: 190,
      defaultHeight: 65,
      allowCustomDim: true,
      stock: 8,
      rating: 4.92,
      reviewCount: 31,
      images: [
        'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80'
      ]
    }
  ];

  for (const prod of products) {
    await prisma.product.upsert({
      where: { slug: prod.slug },
      update: {},
      create: prod
    });
  }

  // 5. Create Sample Mitra B2B Order with Down Payment (DP 50%)
  const firstProd = await prisma.product.findFirst({ where: { slug: 'komorebi-solid-dining-table' } });

  const b2bOrder = await prisma.order.upsert({
    where: { orderNumber: 'SHR-B2B-20261001' },
    update: {},
    create: {
      orderNumber: 'SHR-B2B-20261001',
      userId: mitraUser.id,
      mitraId: mitraProfile.id,
      orderType: 'MITRA_B2B',
      paymentScheme: 'DOWN_PAYMENT_50',
      paymentStatus: 'DP_PAID',
      status: 'IN_PRODUCTION',
      totalAmount: 13350000,      // 2x Meja Makan Harga Mitra (6.675.000 x 2)
      dpAmount: 6675000,          // DP 50%
      remainingAmount: 6675000,   // Sisa Pelunasan Sebelum Kirim
      dpPaidAt: new Date('2026-10-04T08:00:00Z'),
      shippingAddress: 'Showroom Living Sanctuary, Jl. R.E. Martadinata No. 128',
      shippingCity: 'Bandung',
      recipientName: 'Hendra Saputra (Toko Mitra)',
      recipientPhone: '081298765432',
      notes: 'Order B2B Toko Mitra - 2 Unit Meja Komorebi Finishing Smoked Black untuk Display Showroom.',
      items: {
        create: [
          {
            productId: firstProd.id,
            quantity: 2,
            unitPrice: 6675000,
            selectedMaterial: 'Kayu Jati Utuh',
            selectedFinishing: 'Smoked Black',
            subtotal: 13350000
          }
        ]
      }
    }
  });

  // Sample DP Invoice for B2B Order
  await prisma.invoice.upsert({
    where: { invoiceNumber: 'INV-DP-B2B-1001' },
    update: {},
    create: {
      orderId: b2bOrder.id,
      invoiceNumber: 'INV-DP-B2B-1001',
      type: 'DP_PAYMENT',
      amount: 6675000,
      dueDate: new Date('2026-10-07T00:00:00Z'),
      status: 'PAID',
      paidDate: new Date('2026-10-04T08:00:00Z'),
      paymentMethod: 'Bank Transfer BCA',
      notes: 'Faktur Uang Muka DP 50% Produksi Meja Komorebi'
    }
  });

  // 6. Create Sample Retail Customer Order (Full Payment 100%)
  const loungeProd = await prisma.product.findFirst({ where: { slug: 'sanctuary-teak-lounge-chair' } });

  const retOrder = await prisma.order.upsert({
    where: { orderNumber: 'SHR-RET-20261002' },
    update: {},
    create: {
      orderNumber: 'SHR-RET-20261002',
      userId: customerUser.id,
      orderType: 'RETAIL',
      paymentScheme: 'FULL_PAYMENT',
      paymentStatus: 'FULLY_PAID',
      status: 'READY_FOR_SHIPMENT',
      totalAmount: 4250000,       // Full Retail Price
      dpAmount: 4250000,
      remainingAmount: 0.0,
      dpPaidAt: new Date('2026-10-03T11:00:00Z'),
      finalPaidAt: new Date('2026-10-03T11:00:00Z'),
      shippingAddress: 'Jl. Dago Asri No. 12, Coblong',
      shippingCity: 'Bandung',
      recipientName: 'Zul Yatman',
      recipientPhone: '081123123123',
      notes: 'Finishing Natural Matte Oil',
      items: {
        create: [
          {
            productId: loungeProd.id,
            quantity: 1,
            unitPrice: 4250000,
            selectedMaterial: 'Jati Solid Perhutani',
            selectedFinishing: 'Natural Matte Oil',
            subtotal: 4250000
          }
        ]
      }
    }
  });

  await prisma.invoice.upsert({
    where: { invoiceNumber: 'INV-FULL-RET-1002' },
    update: {},
    create: {
      orderId: retOrder.id,
      invoiceNumber: 'INV-FULL-RET-1002',
      type: 'FULL_PAYMENT',
      amount: 4250000,
      dueDate: new Date('2026-10-05T00:00:00Z'),
      status: 'PAID',
      paidDate: new Date('2026-10-03T11:00:00Z'),
      paymentMethod: 'BCA Virtual Account',
      notes: 'Lunas 100% Pesanan Retail Sanctuary Teak Lounge Chair'
    }
  });

  console.log('✅ Seeding updated business model completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
