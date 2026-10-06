const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const serviceRoutes = require('./routes/services');
const mitraRoutes = require('./routes/mitra');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 8000;
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, '../../storage/uploads');

// Ensure storage subfolders exist
const subdirs = ['products', 'mitra-products', 'lookbooks', 'projects', 'avatars', 'documents'];
subdirs.forEach(dir => {
  const fullPath = path.join(STORAGE_DIR, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static media files serving
app.use('/storage', express.static(STORAGE_DIR));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Sherish E-Commerce & Service API Engine',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/mitra', mitraRoutes);
app.use('/api/admin', adminRoutes);

// Error Handling
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌿 Sherish Unified API Server running on port ${PORT}`);
  console.log(`📁 Media storage located at: ${STORAGE_DIR}`);
});
